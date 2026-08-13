import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart' as geo;
import 'package:go_router/go_router.dart';
import 'package:google_navigation_flutter/google_navigation_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/network/socket_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/models/trip_model.dart';
import '../../data/providers/trip_provider.dart';
import '../../data/repositories/trip_repository.dart';
import '../../data/services/safety_check_service.dart';
import '../../../../core/network/dio_client.dart';
import '../../../ratings/presentation/rating_sheet.dart';

class TripActivePage extends ConsumerStatefulWidget {
  const TripActivePage({super.key, required this.tripId});

  final String tripId;

  @override
  ConsumerState<TripActivePage> createState() => _TripActivePageState();
}

class _TripActivePageState extends ConsumerState<TripActivePage> {
  bool _loading = false;
  bool _socketActive = false;

  void Function(dynamic)? _onCancelled;
  StreamSubscription<geo.Position>? _locationSub;

  @override
  void initState() {
    super.initState();

    debugPrint('🔵 [TripActivePage] initState');

    _socketActive = true;

    _listenStatusChanges();
    _listenCancelled();
    _listenPaymentUpdates();
    _startLocationTracking();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GPS: sigue transmitiendo ubicación durante todo el viaje activo.
  // home_page.dart también transmite, pero SOLO mientras esa pantalla está
  // montada — al navegar acá con context.go() se destruye y deja de mandar.
  // Sin esto el taxímetro nunca avanza (depende de location.update para
  // calcularlo) y el cliente deja de ver moverse al conductor en su mapa.
  // ───────────────────────────────────────────────────────────────────────────

  void _startLocationTracking() {
    _locationSub = geo.Geolocator.getPositionStream(
      locationSettings: const geo.LocationSettings(
        accuracy: geo.LocationAccuracy.high,
        distanceFilter: 10,
      ),
    ).listen((pos) {
      if (!_socketActive || !mounted) return;
      ref.read(socketClientProvider).emit('location.update', {
        'lat': pos.latitude,
        'lng': pos.longitude,
        'speed_kmh': pos.speed > 0 ? pos.speed * 3.6 : 0.0,
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SOCKET: CAMBIOS DE ESTADO
  // ───────────────────────────────────────────────────────────────────────────

  void _listenStatusChanges() {
    final socket = ref.read(socketClientProvider);

    debugPrint('🔵 [TripActivePage] _listenStatusChanges');

    Future<void> refetch([dynamic _]) async {
      if (!_socketActive || !mounted) return;

      debugPrint('🔵 [TripActivePage] refetch llamado');

      try {
        final updated = await ref.read(tripRepositoryProvider).getActiveTrip();

        if (!_socketActive || !mounted) return;

        if (updated != null) {
          ref.read(activeTripProvider.notifier).setTrip(updated);
        }
      } catch (e) {
        debugPrint('❌ [TripActivePage] Error actualizando viaje: $e');
      }
    }

    for (final event in [
      'trip.offer_accepted',
      'trip.started',
      'trip.arrived',
      'trip.status_changed',
    ]) {
      debugPrint('🔵 [TripActivePage] Registrando listener: $event');

      socket.on(event, refetch);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SOCKET: CANCELACIÓN
  // ───────────────────────────────────────────────────────────────────────────

  void _listenCancelled() {
    final socket = ref.read(socketClientProvider);

    debugPrint('🔵 [TripActivePage] _listenCancelled');

    _onCancelled = (data) async {
      if (!_socketActive || !mounted) return;

      debugPrint('🔵 [TripActivePage] _onCancelled recibido: $data');

      final map = data is Map
          ? Map<String, dynamic>.from(data)
          : <String, dynamic>{};

      final reason = map['reason'] as String?;
      final cancelledBy = map['cancelled_by'] as String?;

      // Si fue el conductor quien canceló, no mostrar
      // el diálogo de cancelación del pasajero.
      if (cancelledBy == 'driver') {
        return;
      }

      if (reason != null && reason.isNotEmpty && mounted) {
        final who = cancelledBy == 'client'
            ? 'El cliente canceló el viaje'
            : 'El viaje fue cancelado';

        await showDialog<void>(
          context: context,
          barrierDismissible: false,
          builder: (ctx) {
            return AlertDialog(
              title: const Text('Viaje cancelado'),
              content: Text('$who:\n$reason'),
              actions: [
                ElevatedButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                  },
                  child: const Text('Entendido'),
                ),
              ],
            );
          },
        );
      }

      if (!_socketActive || !mounted) return;

      ref.read(activeTripProvider.notifier).clear();

      context.go('/home');
    };

    socket.on('trip.cancelled', _onCancelled!);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SOCKET: PAGO CON TARJETA — si tiene esta pantalla abierta, avisar al
  // instante. El push FCM (siempre se manda desde el backend) es el canal
  // que garantiza que se entere igual si no tiene la app abierta.
  // ───────────────────────────────────────────────────────────────────────────

  void _listenPaymentUpdates() {
    final socket = ref.read(socketClientProvider);

    socket.on('payment.completed', (data) {
      if (!_socketActive || !mounted) return;
      final share = data is Map ? (data['driver_share'] as num?)?.toDouble() : null;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
          share != null && share > 0
              ? 'Pago con tarjeta confirmado. Se acreditaron \$${share.toStringAsFixed(2)} a tu saldo por tarjeta.'
              : 'Pago con tarjeta confirmado.',
        ),
        backgroundColor: AppColors.success,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 5),
      ));
    });

    socket.on('payment.failed', (_) {
      if (!_socketActive || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('El pago con tarjeta del pasajero falló. Coordina el cobro directo.'),
        backgroundColor: AppColors.error,
        behavior: SnackBarBehavior.floating,
        duration: Duration(seconds: 5),
      ));
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DEACTIVATE
  // ───────────────────────────────────────────────────────────────────────────

  @override
  void deactivate() {
    debugPrint('🔵 [TripActivePage] deactivate');

    _socketActive = false;

    super.deactivate();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DISPOSE
  // ───────────────────────────────────────────────────────────────────────────

  @override
  void dispose() {
    debugPrint('🔵 [TripActivePage] dispose');

    _socketActive = false;
    _locationSub?.cancel();

    final socket = ref.read(socketClientProvider);

    for (final event in [
      'trip.offer_accepted',
      'trip.started',
      'trip.arrived',
      'trip.status_changed',
      'trip.cancelled',
      'payment.completed',
      'payment.failed',
    ]) {
      debugPrint('🔵 [TripActivePage] Eliminando listener: $event');

      socket.off(event);
    }

    super.dispose();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ACTION WRAPPER
  // ───────────────────────────────────────────────────────────────────────────

  Future<void> _performAction(Future Function() action) async {
    debugPrint('🔵 [TripActivePage] _performAction');

    if (mounted) {
      setState(() {
        _loading = true;
      });
    }

    try {
      await action();
    } catch (e) {
      debugPrint('❌ [TripActivePage] Error en acción: $e');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BUILD
  // ───────────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    debugPrint('🔵 [TripActivePage] build');

    final tripAsync = ref.watch(activeTripProvider);

    return tripAsync.when(
      // true (default): en un refresh (markArrived, startTrip, sockets, etc.)
      // se mantiene la última data en pantalla en vez de pasar por loading.
      // Con false, cada refresh destruía y volvía a montar todo _TripView
      // -incluyendo el PlatformView de navegación en pleno vuelo- causando
      // el assertion "_dependents.isEmpty" y reiniciando la navegación.
      loading: () {
        debugPrint('🔵 [TripActivePage] loading...');

        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      },
      error: (e, _) {
        return Scaffold(body: Center(child: Text('Error: $e')));
      },
      data: (trip) {
        if (trip == null) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        return _TripView(
          trip: trip,
          loading: _loading,
          onAction: _performAction,
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP
// ─────────────────────────────────────────────────────────────────────────────

Future<String?> _showOtpDialog(BuildContext context) {
  // El controller vive en un StatefulWidget propio para que Flutter lo
  // destruya cuando el Element del diálogo realmente se desmonta (después
  // de la animación de salida), no apenas showDialog() resuelve. Hacerlo
  // antes deja el TextField usando un controller ya destruido durante la
  // transición, lo que dispara "TextEditingController used after being
  // disposed" y en cascada corrompe el árbol de elementos.
  return showDialog<String>(
    context: context,
    builder: (ctx) => const _OtpDialog(),
  );
}

class _OtpDialog extends StatefulWidget {
  const _OtpDialog();

  @override
  State<_OtpDialog> createState() => _OtpDialogState();
}

class _OtpDialogState extends State<_OtpDialog> {
  final _ctrl = TextEditingController();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Código del pasajero'),
      content: TextField(
        controller: _ctrl,
        keyboardType: TextInputType.number,
        maxLength: 4,
        autofocus: true,
        decoration: const InputDecoration(
          hintText: 'Ingresa el código de 4 dígitos',
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(context, _ctrl.text.trim()),
          child: const Text('Confirmar'),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FINALIZAR VIAJE
// ─────────────────────────────────────────────────────────────────────────────

Future<double?> _showCompleteFareDialog(
  BuildContext context,
  double? suggestedFare,
) {
  return showDialog<double>(
    context: context,
    builder: (ctx) => _CompleteFareDialog(suggestedFare: suggestedFare),
  );
}

class _CompleteFareDialog extends StatefulWidget {
  const _CompleteFareDialog({this.suggestedFare});

  final double? suggestedFare;

  @override
  State<_CompleteFareDialog> createState() => _CompleteFareDialogState();
}

class _CompleteFareDialogState extends State<_CompleteFareDialog> {
  late final _ctrl = TextEditingController(
    text: widget.suggestedFare != null
        ? widget.suggestedFare!.toStringAsFixed(2)
        : '',
  );

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Finalizar viaje'),
      content: TextField(
        controller: _ctrl,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        autofocus: true,
        decoration: const InputDecoration(
          prefixText: r'$ ',
          hintText: 'Monto cobrado',
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        ElevatedButton(
          onPressed: () {
            final amount = double.tryParse(
              _ctrl.text.trim().replaceAll(',', '.'),
            );

            Navigator.pop(context, amount);
          },
          child: const Text('Finalizar'),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIP VIEW
// ─────────────────────────────────────────────────────────────────────────────

class _TripView extends ConsumerStatefulWidget {
  const _TripView({
    required this.trip,
    required this.loading,
    required this.onAction,
  });

  final TripModel trip;
  final bool loading;

  final Future Function(Future Function()) onAction;

  @override
  ConsumerState<_TripView> createState() => _TripViewState();
}

class _TripViewState extends ConsumerState<_TripView> {
  bool _disposed = false;

  bool _isNavigationSessionInitialized = false;

  bool _navReady = false;
  bool _navFailed = false;

  LatLng? _currentNavigationTarget;

  GoogleNavigationViewController? _navController;

  late final SafetyCheckService _safetyCheckService =
      SafetyCheckService(ref.read(dioProvider));

  @override
  void initState() {
    super.initState();

    debugPrint('🔵 [_TripViewState] initState');

    _initializeNavigation();

    if (widget.trip.status == 'in_progress') {
      _safetyCheckService.start(
        tripId: widget.trip.id,
        estimatedDurationMin: widget.trip.durationMinutes,
      );
    }
  }

  @override
  void didUpdateWidget(covariant _TripView oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.trip.status != widget.trip.status) {
      debugPrint(
        '🔵 [_TripViewState] Estado de viaje cambió: '
        '${oldWidget.trip.status} → ${widget.trip.status}',
      );

      // Dos navegaciones independientes: 'driver_arrived' no requiere
      // acción (se espera al pasajero); al pasar a 'in_progress' se
      // calcula una ruta nueva hacia el destino final.
      if (widget.trip.status == 'in_progress') {
        _navigateToDestination();
        _safetyCheckService.start(
          tripId: widget.trip.id,
          estimatedDurationMin: widget.trip.durationMinutes,
        );
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DISPOSE
  // ───────────────────────────────────────────────────────────────────────────

  @override
  void dispose() {
    debugPrint('🔵 [_TripViewState] dispose');

    _disposed = true;
    _safetyCheckService.stop();

    if (_isNavigationSessionInitialized) {
      debugPrint('🔵 [_TripViewState] llamando a cleanup()');

      GoogleMapsNavigator.cleanup().catchError((error) {
        debugPrint('⚠️ [_TripViewState] Error en cleanup(): $error');
      });
    }

    _navController = null;

    super.dispose();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // INICIALIZACIÓN GOOGLE NAVIGATION SDK
  // ───────────────────────────────────────────────────────────────────────────

  Future<void> _initializeNavigation() async {
    debugPrint(
      '🔵 ════════════════════════════════════════════════════════════',
    );

    debugPrint('🔵 INICIALIZANDO NAVIGATION SDK - FLUJO ÚNICO');

    debugPrint(
      '🔵 ════════════════════════════════════════════════════════════',
    );

    try {
      // PRUEBA MÍNIMA SIN PARCHES: flujo estándar (ENABLED), igual que el
      // ejemplo oficial de Google. Log de cada respuesta cruda del SDK, sin
      // enmascarar nada, para ver qué está devolviendo realmente.
      final bool acceptedBefore = await GoogleMapsNavigator.areTermsAccepted();
      debugPrint('📡 areTermsAccepted() ANTES del diálogo: $acceptedBefore');

      bool termsAccepted = acceptedBefore;
      if (!acceptedBefore) {
        termsAccepted = await GoogleMapsNavigator.showTermsAndConditionsDialog(
          'Pana Taxista',
          'Pana Taxi',
        );
        debugPrint(
          '📡 showTermsAndConditionsDialog() resultado: $termsAccepted',
        );

        final acceptedAfter = await GoogleMapsNavigator.areTermsAccepted();
        debugPrint('📡 areTermsAccepted() DESPUÉS del diálogo: $acceptedAfter');
      }

      if (!termsAccepted) {
        debugPrint('🔴 Términos rechazados');
        if (!_disposed && mounted)
          setState(() {
            _navReady = true;
            _navFailed = true;
          });
        return;
      }

      debugPrint('🚀 Inicializando Navigation Session...');

      await GoogleMapsNavigator.initializeNavigationSession();

      _isNavigationSessionInitialized = true;

      debugPrint('✅ Navigation Session inicializada correctamente');

      // ───────────────────────────────────────────────────────────────────────
      // PASO 4: COMPROBAR ESTADO
      // ───────────────────────────────────────────────────────────────────────

      final isInit = await GoogleMapsNavigator.isInitialized();

      debugPrint('📡 isInitialized(): $isInit');

      if (!_disposed && mounted) {
        setState(() {
          _navReady = true;
        });
      }

      debugPrint('✅ [_initializeNavigation] COMPLETADO');
    } on SessionInitializationException catch (e) {
      debugPrint('❌ SESSION INITIALIZATION ERROR: ${e.code}');
      if (!_disposed && mounted) {
        setState(() {
          _navReady = true;
          _navFailed = true;
        });
      }
    } catch (e, stackTrace) {
      debugPrint('❌ ERROR INESPERADO: $e\n$stackTrace');
      if (!_disposed && mounted) {
        setState(() {
          _navReady = true;
          _navFailed = true;
        });
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // MAPA LISTO
  // ───────────────────────────────────────────────────────────────────────────

  Future<void> _onNavigationViewCreated(
    GoogleNavigationViewController controller,
  ) async {
    debugPrint('🔵 [_TripViewState] _onNavigationViewCreated');

    _navController = controller;

    if (!_isNavigationSessionInitialized) {
      debugPrint('❌ Sesión no inicializada, no se pueden ejecutar comandos');

      return;
    }

    try {
      // ───────────────────────────────────────────────────────────────────────
      // ACTIVAR UBICACIÓN
      // ───────────────────────────────────────────────────────────────────────

      await controller.setMyLocationEnabled(true);

      debugPrint('✅ MyLocationEnabled activado');

      // El botón nativo de "reportar incidente" queda tapado por nuestro
      // panel arrastrable y no aplica a un flujo de taxi con conductor.
      await controller.setReportIncidentButtonEnabled(false);

      // El footer nativo (distancia/hora + barra de progreso) duplica y
      // choca visualmente con nuestro panel personalizado. Se mantiene
      // solo el header superior (instrucciones de giro), que sí aporta.
      await controller.setNavigationFooterEnabled(false);
      await controller.setNavigationTripProgressBarEnabled(false);

      await _startTripNavigation();
    } catch (e, stackTrace) {
      debugPrint('❌ Error en _onNavigationViewCreated: $e');

      debugPrint('❌ StackTrace: $stackTrace');
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RUTA DE NAVEGACIÓN: DOS TRAMOS INDEPENDIENTES
  // ───────────────────────────────────────────────────────────────────────────
  //
  // Cada tramo es una navegación propia (setDestinations con un solo
  // waypoint), no una ruta multi-parada: primero hacia el punto de
  // recogida, y al confirmar 'in_progress' se calcula una ruta nueva
  // hacia el destino final.

  Future<void> _startTripNavigation() {
    return _navigateTo(
      title: 'Punto de recogida',
      target: LatLng(
        latitude: widget.trip.originLat,
        longitude: widget.trip.originLng,
      ),
    );
  }

  Future<void> _navigateToDestination() {
    return _navigateTo(
      title: 'Destino',
      target: LatLng(
        latitude: widget.trip.destinationLat,
        longitude: widget.trip.destinationLng,
      ),
    );
  }

  Future<void> _navigateTo({
    required String title,
    required LatLng target,
  }) async {
    if (!_isNavigationSessionInitialized ||
        _navController == null ||
        _currentNavigationTarget == target) {
      return;
    }

    try {
      debugPrint('🚗 Calculando ruta hacia $title: $target');

      final routeStatus = await GoogleMapsNavigator.setDestinations(
        Destinations(
          waypoints: [
            NavigationWaypoint.withLatLngTarget(title: title, target: target),
          ],
          displayOptions: NavigationDisplayOptions(
            showDestinationMarkers: true,
          ),
        ),
      );

      if (routeStatus != NavigationRouteStatus.statusOk) {
        debugPrint('❌ setDestinations() falló: $routeStatus');
        return;
      }

      _currentNavigationTarget = target;

      debugPrint('✅ Ruta calculada hacia $title');

      await GoogleMapsNavigator.startGuidance();

      debugPrint('✅ Guidance iniciado');

      if (_disposed || !mounted) return;

      await _navController!.setNavigationUIEnabled(true);

      // Vista general con el punto marcado antes de pasar a la cámara de
      // seguimiento cercana, para que el taxista vea la ruta completa.
      await _navController!.showRouteOverview();

      debugPrint('✅ Navigation UI habilitada, mostrando overview de la ruta');
    } catch (e, stackTrace) {
      debugPrint('❌ Error fijando destino de navegación: $e\n$stackTrace');
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CONFIRMAR RECOGIDA (OTP) E INICIAR VIAJE
  // ───────────────────────────────────────────────────────────────────────────

  Future<void> _confirmPickupOtp(BuildContext context, TripModel trip) async {
    final otp = await _showOtpDialog(context);

    if (otp == null || otp.isEmpty || !mounted) return;

    await widget.onAction(
      () => ref
          .read(activeTripProvider.notifier)
          .confirmArrivalAndStart(
            trip.id,
            otp,
            needsMarkArrived: trip.status == 'accepted',
          ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FINALIZAR VIAJE
  // ───────────────────────────────────────────────────────────────────────────

  Future<void> _finishTrip(BuildContext context, TripModel trip) async {
    final amount = await _showCompleteFareDialog(context, trip.fare);

    if (amount == null || !mounted) return;

    await widget.onAction(
      () => ref.read(activeTripProvider.notifier).completeTrip(trip.id, amount),
    );

    // completeTrip() deja el viaje activo en null; sin esto la pantalla se
    // quedaba en un spinner infinito (TripActivePage.build() no navega solo
    // cuando trip == null).
    if (!mounted) return;

    await showRatingSheet(
      context: context,
      ref: ref,
      title: 'Califica a ${trip.clientName}',
      subtitle: '¿Cómo fue tu experiencia con el pasajero?',
      direction: 'driver_to_client',
      tripId: trip.id,
    );

    if (!mounted) return;

    context.go('/home');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CANCELAR VIAJE
  // ───────────────────────────────────────────────────────────────────────────

  Future<void> _showCancelSheet(BuildContext ctx, TripModel trip) async {
    final reason = await showModalBottomSheet<String>(
      context: ctx,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _CancelReasonSheet(),
    );

    if (reason == null || !mounted) return;

    if (reason.length < 3) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Debes indicar un motivo válido.')),
        );
      }

      return;
    }

    try {
      await ref.read(tripRepositoryProvider).cancelTrip(trip.id, reason);

      if (!mounted) return;

      ref.read(activeTripProvider.notifier).clear();

      context.go('/home');
    } catch (e) {
      debugPrint('❌ Error cancelando viaje: $e');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BUILD
  // ───────────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    debugPrint('🔵 [_TripViewState] build: _navReady = $_navReady');

    // ─────────────────────────────────────────────────────────────────────────
    // ESPERAR A QUE EL SDK ESTÉ LISTO
    // ─────────────────────────────────────────────────────────────────────────

    if (!_navReady) {
      return const Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Inicializando navegación...'),
            ],
          ),
        ),
      );
    }

    final trip = widget.trip;

    return Scaffold(
      body: Stack(
        children: [
          // ───────────────────────────────────────────────────────────────────
          // GOOGLE MAPS NAVIGATION VIEW
          //
          // Borde a borde arriba (para que se vea bien detrás de la status
          // bar), pero con el fondo recortado por la barra de navegación del
          // sistema (3 botones o gesto): el SDK dibuja controles nativos
          // propios (botón "Centrar", etc.) anclados al borde inferior de
          // ESTE view, y si el view se extiende detrás de la barra, esos
          // controles quedan tapados/semi-inaccesibles ahí.
          // ───────────────────────────────────────────────────────────────────
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            bottom: MediaQuery.of(context).padding.bottom,
            child: _navFailed
                ? Container(color: const Color(0xFFE8E8E8))
                : GoogleMapsNavigationView(
                    onViewCreated: _onNavigationViewCreated,
                    initialNavigationUIEnabledPreference:
                        NavigationUIEnabledPreference.disabled,
                    initialCameraPosition: CameraPosition(
                      target: LatLng(
                        latitude: trip.originLat,
                        longitude: trip.originLng,
                      ),
                      zoom: 15,
                    ),
                  ),
          ),

          // ───────────────────────────────────────────────────────────────────
          // PANEL INFERIOR (arrastrable: colapsado solo muestra el botón
          // principal; se desliza hacia arriba para ver el detalle completo)
          // ───────────────────────────────────────────────────────────────────
          Positioned.fill(
            child: SafeArea(
              top: false,
              // El SafeArea excluye la barra de navegación de 3 botones (o
              // el gesto inferior) del alto disponible, para que el 16%/46%
              // del sheet se calcule sobre el área realmente visible y
              // nada quede tapado detrás de esos botones del sistema.
              child: DraggableScrollableSheet(
                initialChildSize: _panelCollapsedSize,
                minChildSize: _panelCollapsedSize,
                maxChildSize: _panelExpandedSize,
                snap: true,
                snapSizes: [_panelCollapsedSize, _panelExpandedSize],
                builder: (context, scrollController) {
                  return Container(
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.vertical(
                        top: Radius.circular(24),
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Color(0x18000000),
                          blurRadius: 24,
                          offset: Offset(0, -4),
                        ),
                      ],
                    ),
                    child: ListView(
                      controller: scrollController,
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                      children: [
                        // Handle
                        Center(
                          child: Container(
                            width: 36,
                            height: 4,
                            margin: const EdgeInsets.only(bottom: 16),
                            decoration: BoxDecoration(
                              color: AppColors.gray200,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ),

                        // ─────────────────────────────────────────────────────────
                        // BOTÓN PRINCIPAL (único visible cuando el panel está
                        // colapsado; el resto del detalle queda debajo)
                        // ─────────────────────────────────────────────────────────
                        _buildPrimaryActionButton(context, trip),

                        const SizedBox(height: 20),

                        // Status
                        _StatusBadge(status: trip.status),

                        const SizedBox(height: 12),

                        // ─────────────────────────────────────────────────────────
                        // PASAJERO
                        // ─────────────────────────────────────────────────────────
                        Row(
                          children: [
                            const CircleAvatar(
                              radius: 24,
                              backgroundColor: AppColors.primaryLight,
                              child: Icon(
                                Icons.person,
                                color: AppColors.secondary,
                              ),
                            ),

                            const SizedBox(width: 12),

                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    trip.clientName,
                                    style: AppTextStyles.labelLg,
                                  ),

                                  if (trip.fare != null)
                                    Text(
                                      '\$${trip.fare!.toStringAsFixed(2)}',
                                      style: AppTextStyles.h3.copyWith(
                                        color: AppColors.primaryText,
                                      ),
                                    ),
                                ],
                              ),
                            ),

                            // Llamar al pasajero
                            IconButton(
                              onPressed: () async {
                                final uri = Uri.parse(
                                  'tel:${trip.clientPhone}',
                                );

                                if (await canLaunchUrl(uri)) {
                                  await launchUrl(uri);
                                }
                              },
                              icon: const Icon(Icons.phone_outlined),
                              style: IconButton.styleFrom(
                                backgroundColor: AppColors.primaryLight,
                              ),
                            ),
                          ],
                        ),

                        const SizedBox(height: 16),

                        // ─────────────────────────────────────────────────────────
                        // RUTA
                        // ─────────────────────────────────────────────────────────
                        _RouteCard(
                          origin: trip.originAddress,
                          destination: trip.destinationAddress,
                        ),

                        // ─────────────────────────────────────────────────────────
                        // CANCELAR
                        // ─────────────────────────────────────────────────────────
                        if (trip.status == 'accepted' ||
                            trip.status == 'driver_arrived') ...[
                          const SizedBox(height: 16),

                          SizedBox(
                            width: double.infinity,
                            child: TextButton(
                              onPressed: widget.loading
                                  ? null
                                  : () => _showCancelSheet(context, trip),
                              style: TextButton.styleFrom(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 6,
                                ),
                              ),
                              child: Text(
                                'Cancelar viaje',
                                style: AppTextStyles.label.copyWith(
                                  color: AppColors.error,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  // Fracción de la pantalla que ocupa el panel colapsado: apenas el handle
  // y el botón principal.
  static const double _panelCollapsedSize = 0.16;

  // Fracción al expandirlo: ajustada al contenido real (handle + botón +
  // estado + pasajero + ruta + cancelar), sin dejar espacio en blanco.
  static const double _panelExpandedSize = 0.46;

  Widget _buildPrimaryActionButton(BuildContext context, TripModel trip) {
    final (
      String label,
      VoidCallback? onPressed,
      Color color,
    ) = switch (trip.status) {
      'accepted' => (
        'Llegué al punto de recogida',
        widget.loading ? null : () => _confirmPickupOtp(context, trip),
        Colors.blue,
      ),
      'driver_arrived' => (
        'Ingresar código y empezar viaje',
        widget.loading ? null : () => _confirmPickupOtp(context, trip),
        Colors.blue,
      ),
      'in_progress' => (
        'Finalizar viaje',
        widget.loading ? null : () => _finishTrip(context, trip),
        Colors.green,
      ),
      _ => ('', null, Colors.blue),
    };

    if (label.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          elevation: 0,
        ),
        child: widget.loading
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Text(label, style: AppTextStyles.btnLg),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────────────────────

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      'accepted' => ('En camino al punto de recogida', Colors.blue),
      'driver_arrived' => ('Esperando al pasajero', AppColors.warningText),
      'in_progress' => ('Viaje en progreso', Colors.green),
      'completed' => ('Viaje completado', AppColors.gray400),
      _ => ('Viaje', AppColors.gray400),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color),
      ),
      child: Text(label, style: AppTextStyles.label.copyWith(color: color)),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE CARD
// ─────────────────────────────────────────────────────────────────────────────

class _RouteCard extends StatelessWidget {
  const _RouteCard({required this.origin, required this.destination});

  final String origin;
  final String destination;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.gray50,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          // ORIGEN
          Row(
            children: [
              const Icon(
                Icons.radio_button_checked,
                size: 16,
                color: Colors.green,
              ),

              const SizedBox(width: 10),

              Expanded(
                child: Text(
                  origin,
                  style: AppTextStyles.body,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),

          // Línea
          Padding(
            padding: const EdgeInsets.only(left: 7),
            child: Container(width: 2, height: 20, color: AppColors.gray300),
          ),

          // DESTINO
          Row(
            children: [
              const Icon(Icons.location_on, size: 16, color: AppColors.error),

              const SizedBox(width: 10),

              Expanded(
                child: Text(
                  destination,
                  style: AppTextStyles.body,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HOJA DE MOTIVO DE CANCELACIÓN
// ─────────────────────────────────────────────────────────────────────────────

class _CancelReasonSheet extends StatefulWidget {
  const _CancelReasonSheet();

  @override
  State<_CancelReasonSheet> createState() => _CancelReasonSheetState();
}

class _CancelReasonSheetState extends State<_CancelReasonSheet> {
  static const _reasons = [
    'El pasajero no se presentó',
    'El pasajero solicitó la cancelación',
    'Problemas con el vehículo',
    'Emergencia personal',
    'Otro motivo',
  ];

  String? _selected;
  final _otherCtrl = TextEditingController();

  @override
  void dispose() {
    _otherCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        20,
        20,
        MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle
          Center(
            child: Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: AppColors.gray200,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          Text('Motivo de cancelación', style: AppTextStyles.h3),

          const SizedBox(height: 4),

          Text(
            'Selecciona el motivo por el que cancelas el viaje',
            style: AppTextStyles.body.copyWith(color: AppColors.gray400),
          ),

          const SizedBox(height: 16),

          ..._reasons.map(
            (r) => RadioListTile<String>(
              value: r,
              groupValue: _selected,
              contentPadding: EdgeInsets.zero,
              title: Text(r, style: AppTextStyles.body),
              activeColor: AppColors.error,
              onChanged: (v) => setState(() => _selected = v),
            ),
          ),

          if (_selected == 'Otro motivo') ...[
            const SizedBox(height: 8),

            TextField(
              controller: _otherCtrl,
              autofocus: true,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'Describe el motivo...',
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ],

          const SizedBox(height: 20),

          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed: _selected == null
                  ? null
                  : () {
                      final reason = _selected == 'Otro motivo'
                          ? _otherCtrl.text.trim()
                          : _selected!;

                      Navigator.pop(context, reason);
                    },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.error,
                foregroundColor: Colors.white,
                disabledBackgroundColor: AppColors.gray200,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                elevation: 0,
              ),
              child: const Text('Confirmar cancelación'),
            ),
          ),
        ],
      ),
    );
  }
}
