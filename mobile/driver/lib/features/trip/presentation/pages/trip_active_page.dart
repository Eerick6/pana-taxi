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
import '../../../ratings/presentation/rating_sheet.dart';

class TripActivePage extends ConsumerStatefulWidget {
  const TripActivePage({super.key, required this.tripId});
  final String tripId;

  @override
  ConsumerState<TripActivePage> createState() => _TripActivePageState();
}

class _TripActivePageState extends ConsumerState<TripActivePage> {
  bool _loading      = false;
  bool _socketActive = false;
  void Function(dynamic)? _onCancelled;

  @override
  void initState() {
    super.initState();
    _socketActive = true;
    _listenStatusChanges();
    _listenCancelled();
  }

  void _listenStatusChanges() {
    final socket = ref.read(socketClientProvider);

    // Cualquier evento que cambia el estado del viaje → refetch
    Future<void> refetch([dynamic _]) async {
      if (!_socketActive || !mounted) return;
      final updated = await ref.read(tripRepositoryProvider).getActiveTrip();
      if (_socketActive && mounted && updated != null) {
        ref.read(activeTripProvider.notifier).setTrip(updated);
      }
    }

    for (final event in ['trip.offer_accepted', 'trip.started', 'trip.arrived', 'trip.status_changed']) {
      socket.on(event, refetch);
    }
  }

  void _listenCancelled() {
    final socket = ref.read(socketClientProvider);
    _onCancelled = (data) async {
      if (!_socketActive || !mounted) return;
      final map         = data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
      final reason      = map['reason']       as String?;
      final cancelledBy = map['cancelled_by'] as String?;

      // Si el driver canceló él mismo, _showCancelSheet ya manejó la navegación — ignorar
      if (cancelledBy == 'driver') return;

      // Mostrar dialog ANTES de clear() para que build() no navegue mientras el dialog está abierto
      if (reason != null && reason.isNotEmpty && mounted) {
        final who = cancelledBy == 'client'
            ? 'El cliente canceló el viaje'
            : 'El viaje fue cancelado';
        await showDialog<void>(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            title: const Text('Viaje cancelado'),
            content: Text('$who:\n$reason'),
            actions: [
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Entendido'),
              ),
            ],
          ),
        );
      }

      if (!_socketActive || !mounted) return;
      context.go('/home');
      ref.read(activeTripProvider.notifier).clear();
    };
    socket.on('trip.cancelled', _onCancelled!);
  }

  @override
  void deactivate() {
    _socketActive = false;
    super.deactivate();
  }

  @override
  void dispose() {
    final socket = ref.read(socketClientProvider);
    for (final event in ['trip.offer_accepted', 'trip.started', 'trip.arrived', 'trip.status_changed', 'trip.cancelled']) {
      socket.off(event);
    }
    super.dispose();
  }

  Future<void> _performAction(Future<void> Function() action) async {
    setState(() => _loading = true);
    try {
      await action();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tripAsync = ref.watch(activeTripProvider);

    return tripAsync.when(
      skipLoadingOnRefresh: false,
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text('Error: $e'))),
      data: (trip) {
        if (trip == null) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        return _TripView(trip: trip, loading: _loading, onAction: _performAction);
      },
    );
  }
}

Future<String?> _showOtpDialog(BuildContext context) async {
  final ctrl = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Código del pasajero'),
      content: TextField(
        controller: ctrl,
        keyboardType: TextInputType.number,
        maxLength: 6,
        autofocus: true,
        decoration: const InputDecoration(hintText: 'Ingresa el código de 6 dígitos'),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
        ElevatedButton(
          onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
          child: const Text('Confirmar'),
        ),
      ],
    ),
  );
}

// ── Trip view ─────────────────────────────────────────────────────────────────

class _TripView extends ConsumerStatefulWidget {
  const _TripView({required this.trip, required this.loading, required this.onAction});
  final TripModel trip;
  final bool loading;
  final Future<void> Function(Future<void> Function()) onAction;

  @override
  ConsumerState<_TripView> createState() => _TripViewState();
}

class _TripViewState extends ConsumerState<_TripView> {
  bool _disposed = false;

  // Google Navigation — true cuando sesión lista para mostrar el widget
  bool _navReady = false;
  GoogleNavigationViewController? _navCtrl;

  // Taxímetro en vivo
  double _meterDisplay   = 0;
  double _meterIncPerSec = 0;
  Timer? _meterTimer;

  // Countdown de espera
  Timer? _waitTimer;
  int   _waitSecondsLeft = 0;

  // Ubicación
  StreamSubscription<geo.Position>? _locationSub;

  @override
  void initState() {
    super.initState();
    _startLocationTracking();
    _initNavigation(widget.trip);
    if (widget.trip.status == 'driver_arrived') {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _startWaitCountdown(widget.trip.waitTimerExpiresAt),
      );
    }
    if (widget.trip.isMeterMode) {
      _meterDisplay = widget.trip.fare ?? 0;
    }
  }

  @override
  void deactivate() {
    _disposed = true;
    super.deactivate();
  }

  @override
  void dispose() {
    _locationSub?.cancel();
    _waitTimer?.cancel();
    _meterTimer?.cancel();
    GoogleMapsNavigator.cleanup().catchError((_) {});
    super.dispose();
  }

  @override
  void didUpdateWidget(_TripView old) {
    super.didUpdateWidget(old);
    if (old.trip.status != widget.trip.status) {
      _updateNavigation(widget.trip);
      if (widget.trip.status == 'driver_arrived') {
        _startWaitCountdown(widget.trip.waitTimerExpiresAt);
      }
      if (widget.trip.status == 'accepted') {
        _emitCurrentLocation();
      }
    }
  }

  // Inicializa sesión de navegación ANTES de mostrar el widget (según doc oficial)
  Future<void> _initNavigation(TripModel trip) async {
    try {
      // 1. Términos Google Navigation.
      //    El dialog se muestra preferentemente en HomePage (_preAcceptNavigationTerms)
      //    para que al llegar aquí ya estén persistidos. Si por alguna razón no lo están,
      //    los mostramos aquí y esperamos hasta que el SDK los escriba en disco.
      if (!await GoogleMapsNavigator.areTermsAccepted()) {
        final accepted = await GoogleMapsNavigator.showTermsAndConditionsDialog(
          'Pana Taxista',
          'Pana Taxista',
        );
        if (!accepted) {
          if (!_disposed && mounted) setState(() => _navReady = true);
          return;
        }
        // Android persiste en hilo secundario: polling hasta confirmar la escritura
        if (defaultTargetPlatform == TargetPlatform.android) {
          for (var i = 0; i < 20 && !await GoogleMapsNavigator.areTermsAccepted(); i++) {
            await Future.delayed(const Duration(milliseconds: 250));
          }
        }
      }

      // 2. Permiso de ubicación requerido antes de initializeNavigationSession
      final perm = await geo.Geolocator.checkPermission();
      if (perm != geo.LocationPermission.always && perm != geo.LocationPermission.whileInUse) {
        if (!_disposed && mounted) setState(() => _navReady = true);
        return;
      }

      // 3. Inicializar sesión con reintentos — la aceptación reciente puede tardar
      //    un poco más en propagarse internamente dentro del SDK.
      for (var attempt = 0; attempt < 3; attempt++) {
        try {
          await GoogleMapsNavigator.initializeNavigationSession(
            taskRemovedBehavior: TaskRemovedBehavior.continueService,
          );
          break;
        } on SessionInitializationException catch (e) {
          if (e.code == SessionInitializationError.termsNotAccepted && attempt < 2) {
            await Future.delayed(Duration(seconds: attempt + 1));
            continue;
          }
          rethrow;
        }
      }

      // 4. En emulador (debug), proveer ubicación simulada para que el SDK calcule ruta
      if (kDebugMode) {
        try {
          await GoogleMapsNavigator.simulator.setUserLocation(
            LatLng(latitude: trip.originLat - 0.003, longitude: trip.originLng),
          );
        } catch (_) {}
      }

      // 5. Establecer destinos
      await GoogleMapsNavigator.setDestinations(Destinations(
        waypoints: [
          NavigationWaypoint.withLatLngTarget(
            title: 'Punto de recogida',
            target: LatLng(latitude: trip.originLat, longitude: trip.originLng),
          ),
          NavigationWaypoint.withLatLngTarget(
            title: trip.destinationAddress,
            target: LatLng(latitude: trip.destinationLat, longitude: trip.destinationLng),
          ),
        ],
        displayOptions: NavigationDisplayOptions(showStopSigns: true, showTrafficLights: true),
        routingOptions: RoutingOptions(travelMode: NavigationTravelMode.driving),
      ));

      // Si ya pasamos el pickup, avanzar al segundo waypoint
      if (trip.status == 'in_progress') {
        await GoogleMapsNavigator.continueToNextDestination();
      }

      // 6. Solo cuando todo esté listo, mostrar el widget
      if (!_disposed && mounted) {
        setState(() => _navReady = true);
      }
    } catch (e) {
      debugPrint('[Navigation] Error: $e');
      if (!_disposed && mounted) {
        setState(() => _navReady = true);
      }
    }
  }

  Future<void> _onNavViewCreated(GoogleNavigationViewController ctrl) async {
    _navCtrl = ctrl;

    final perm = await geo.Geolocator.checkPermission();
    if (perm == geo.LocationPermission.always || perm == geo.LocationPermission.whileInUse) {
      await ctrl.setMyLocationEnabled(true);
    }

    if (widget.trip.status == 'driver_arrived') {
      await ctrl.moveCamera(CameraUpdate.newCameraPosition(CameraPosition(
        target: LatLng(latitude: widget.trip.originLat, longitude: widget.trip.originLng),
        zoom: 16,
      )));
    } else {
      try {
        await GoogleMapsNavigator.startGuidance();
        await ctrl.setNavigationUIEnabled(true);
        await ctrl.followMyLocation(CameraPerspective.tilted, zoomLevel: 17);
      } catch (e) {
        debugPrint('[Navigation] startGuidance error: $e');
        // Sesión no inicializada (emulador) — centrar en origen del viaje
        await ctrl.moveCamera(CameraUpdate.newCameraPosition(CameraPosition(
          target: LatLng(latitude: widget.trip.originLat, longitude: widget.trip.originLng),
          zoom: 15,
        )));
      }
    }
  }

  Future<void> _updateNavigation(TripModel trip) async {
    if (_navCtrl == null) return;

    switch (trip.status) {
      case 'driver_arrived':
        // Llegó al pickup — pausa guía mientras espera OTP
        await GoogleMapsNavigator.stopGuidance();
        await _navCtrl?.moveCamera(CameraUpdate.newCameraPosition(CameraPosition(
          target: LatLng(latitude: trip.originLat, longitude: trip.originLng),
          zoom: 16,
        )));
      case 'in_progress':
        // Pasajero a bordo — avanza al segundo waypoint (destino)
        await GoogleMapsNavigator.continueToNextDestination();
        await GoogleMapsNavigator.startGuidance();
        await _navCtrl?.setNavigationUIEnabled(true);
        await _navCtrl?.followMyLocation(CameraPerspective.tilted, zoomLevel: 17);
    }
  }

  void _startLocationTracking() {
    final socket = ref.read(socketClientProvider);

    _locationSub = geo.Geolocator.getPositionStream(
      locationSettings: const geo.LocationSettings(
        accuracy: geo.LocationAccuracy.high,
        distanceFilter: 15,
      ),
    ).listen((pos) {
      if (!mounted) return;
      socket.emit('location.update', {
        'lat': pos.latitude,
        'lng': pos.longitude,
        'speed_kmh': pos.speed > 0 ? pos.speed * 3.6 : 0.0,
      });
    });
  }

  Future<void> _emitCurrentLocation() async {
    try {
      final pos = await geo.Geolocator.getCurrentPosition(
        locationSettings: const geo.LocationSettings(accuracy: geo.LocationAccuracy.high),
      );
      if (!mounted) return;
      ref.read(socketClientProvider).emit('location.update', {
        'lat': pos.latitude,
        'lng': pos.longitude,
        'speed_kmh': 0.0,
      });
    } catch (_) {}
  }

  void _startWaitCountdown(DateTime? expiresAt) {
    _waitTimer?.cancel();
    final expires = expiresAt ?? DateTime.now().add(const Duration(minutes: 5));
    final initial = expires.difference(DateTime.now()).inSeconds;
    if (_disposed || !mounted) return;
    setState(() => _waitSecondsLeft = initial < 0 ? 0 : initial);
    _waitTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_disposed || !mounted) return;
      final left = expires.difference(DateTime.now()).inSeconds;
      setState(() => _waitSecondsLeft = left < 0 ? 0 : left);
      if (left <= 0) _waitTimer?.cancel();
    });
  }

  Future<void> _showCancelSheet(BuildContext ctx, TripModel trip) async {
    const reasons = [
      'El pasajero no se presentó',
      'El pasajero solicitó la cancelación',
      'Problemas con el vehículo',
      'Emergencia personal',
      'Otro motivo',
    ];
    String? selected;
    final otherCtrl = TextEditingController();

    final confirmed = await showModalBottomSheet<bool>(
      context: ctx,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => StatefulBuilder(
        builder: (_, setState) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(sheetCtx).viewInsets.bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(child: Container(width: 36, height: 4, margin: const EdgeInsets.only(bottom: 16), decoration: BoxDecoration(color: AppColors.gray200, borderRadius: BorderRadius.circular(2)))),
              Text('Motivo de cancelación', style: AppTextStyles.h3),
              const SizedBox(height: 4),
              Text('Selecciona el motivo por el que cancelas el viaje', style: AppTextStyles.body.copyWith(color: AppColors.gray400)),
              const SizedBox(height: 16),
              ...reasons.map((r) => RadioListTile<String>(
                value: r,
                groupValue: selected,
                contentPadding: EdgeInsets.zero,
                title: Text(r, style: AppTextStyles.body),
                activeColor: AppColors.error,
                onChanged: (v) => setState(() => selected = v),
              )),
              if (selected == 'Otro motivo') ...[
                const SizedBox(height: 8),
                TextField(
                  controller: otherCtrl,
                  autofocus: true,
                  decoration: InputDecoration(
                    hintText: 'Describe el motivo...',
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ],
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: selected == null ? null : () => Navigator.pop(sheetCtx, true),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.error,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: AppColors.gray200,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 0,
                  ),
                  child: const Text('Confirmar cancelación'),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    if (confirmed != true || !mounted) return;
    final reason = selected == 'Otro motivo' ? otherCtrl.text.trim() : selected!;
    if (reason.length < 3) return;

    try {
      await ref.read(tripRepositoryProvider).cancelTrip(trip.id, reason);
      if (!mounted) return;
      context.go('/home');
      ref.read(activeTripProvider.notifier).clear();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final trip = widget.trip;

    // Taxímetro en vivo — ref.listen debe ser incondicional en build()
    ref.listen<({double amount, double incPerSec})>(liveMeterProvider, (_, next) {
      if (_disposed || !mounted) return;
      if (widget.trip.status != 'in_progress' || !widget.trip.isMeterMode) return;
      _meterTimer?.cancel();
      setState(() {
        _meterDisplay   = next.amount;
        _meterIncPerSec = next.incPerSec;
      });
      _meterTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (_disposed || !mounted) { _meterTimer?.cancel(); return; }
        setState(() => _meterDisplay += _meterIncPerSec);
      });
    });

    final (actionLabel, actionColor, action) = switch (trip.status) {
      'accepted' => (
          'Llegué al punto de recogida',
          Colors.blue,
          () => ref.read(activeTripProvider.notifier).markArrived(trip.id),
        ),
      'driver_arrived' => (
          'Iniciar viaje',
          Colors.green,
          () async {
            final otp = await _showOtpDialog(context);
            if (otp == null) return;
            await ref.read(activeTripProvider.notifier).startTrip(trip.id, otp);
          },
        ),
      'in_progress' => (
          'Finalizar viaje',
          AppColors.primary,
          () async {
            final fare = trip.isMeterMode ? _meterDisplay : (trip.fare ?? 0.0);
            await ref.read(activeTripProvider.notifier).completeTrip(trip.id, fare);
            if (!context.mounted) return;
            await showRatingSheet(
              context: context,
              ref: ref,
              title: '¿Cómo fue el pasajero?',
              subtitle: 'Tu calificación ayuda a mejorar el servicio',
              direction: 'driver_to_client',
              tripId: trip.id,
            );
            if (context.mounted) context.go('/home');
          },
        ),
      _ => ('', Colors.grey, () async {}),
    };

    return Scaffold(
      body: Stack(
        children: [
          // Mapa de navegación Google — solo se muestra cuando la sesión está lista
          if (_navReady)
            GoogleMapsNavigationView(
              onViewCreated: _onNavViewCreated,
              initialNavigationUIEnabledPreference: NavigationUIEnabledPreference.disabled,
              initialCameraPosition: CameraPosition(
                target: LatLng(latitude: trip.originLat, longitude: trip.originLng),
                zoom: 15,
              ),
            )
          else
            const Center(child: CircularProgressIndicator()),

          // Panel inferior con info del cliente y acciones
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              decoration: const BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                boxShadow: [BoxShadow(color: Color(0x18000000), blurRadius: 24, offset: Offset(0, -4))],
              ),
              padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewPadding.bottom + 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(width: 36, height: 4, margin: const EdgeInsets.only(bottom: 16), decoration: BoxDecoration(color: AppColors.gray200, borderRadius: BorderRadius.circular(2))),

                  _StatusBadge(status: trip.status),
                  const SizedBox(height: 10),

                  if (trip.status == 'driver_arrived')
                    _WaitTimer(secondsLeft: _waitSecondsLeft),

                  const SizedBox(height: 12),

                  // Info del cliente
                  Row(
                    children: [
                      const CircleAvatar(
                        radius: 24,
                        backgroundColor: AppColors.primaryLight,
                        child: Icon(Icons.person, color: AppColors.secondary),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(trip.clientName, style: AppTextStyles.labelLg),
                            if (trip.status == 'in_progress' && trip.isMeterMode)
                              _LiveMeterDisplay(amount: _meterDisplay)
                            else if (trip.fare != null)
                              Text('\$${trip.fare!.toStringAsFixed(2)}', style: AppTextStyles.h3.copyWith(color: AppColors.primaryText)),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: () async {
                          final uri = Uri.parse('tel:${trip.clientPhone}');
                          if (await canLaunchUrl(uri)) launchUrl(uri);
                        },
                        icon: const Icon(Icons.phone_outlined),
                        style: IconButton.styleFrom(backgroundColor: AppColors.primaryLight),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  _RouteCard(origin: trip.originAddress, destination: trip.destinationAddress),
                  const SizedBox(height: 16),

                  if (trip.status == 'accepted' || trip.status == 'driver_arrived') ...[
                    const SizedBox(height: 4),
                    SizedBox(
                      width: double.infinity,
                      child: TextButton(
                        onPressed: widget.loading ? null : () => _showCancelSheet(context, trip),
                        style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 6)),
                        child: Text('Cancelar viaje', style: AppTextStyles.label.copyWith(color: AppColors.error)),
                      ),
                    ),
                    const SizedBox(height: 4),
                  ],

                  if (actionLabel.isNotEmpty)
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton(
                        onPressed: widget.loading ? null : () => widget.onAction(action),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: actionColor,
                          foregroundColor: AppColors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          elevation: 0,
                        ),
                        child: widget.loading
                            ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.white))
                            : Text(actionLabel, style: AppTextStyles.btnLg),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Reusable widgets ──────────────────────────────────────────────────────────

class _LiveMeterDisplay extends StatelessWidget {
  const _LiveMeterDisplay({required this.amount});
  final double amount;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text(
          '\$${amount.toStringAsFixed(2)}',
          style: AppTextStyles.h2.copyWith(
            color: Colors.green.shade700,
            fontWeight: FontWeight.w800,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        const SizedBox(width: 4),
        Text('taxímetro', style: AppTextStyles.caption.copyWith(color: AppColors.gray400)),
      ],
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      'accepted'       => ('Yendo al cliente', Colors.blue),
      'driver_arrived' => ('Esperando al cliente', AppColors.warningText),
      'in_progress'    => ('Viaje en progreso', Colors.green),
      _                => ('Completado', AppColors.gray400),
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

class _WaitTimer extends StatelessWidget {
  const _WaitTimer({required this.secondsLeft});
  final int secondsLeft;

  @override
  Widget build(BuildContext context) {
    final mins    = secondsLeft ~/ 60;
    final secs    = secondsLeft % 60;
    final expired = secondsLeft <= 0;
    final color   = expired ? AppColors.errorText : AppColors.warningText;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.timer_outlined, size: 16, color: color),
          const SizedBox(width: 6),
          Text(
            expired
                ? 'Tiempo de espera agotado'
                : 'Espera al pasajero: ${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}',
            style: AppTextStyles.label.copyWith(color: color),
          ),
        ],
      ),
    );
  }
}

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
          Row(
            children: [
              const Icon(Icons.radio_button_checked, size: 16, color: Colors.green),
              const SizedBox(width: 10),
              Expanded(child: Text(origin, style: AppTextStyles.body, maxLines: 2)),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(left: 7),
            child: Container(width: 2, height: 20, color: AppColors.gray300),
          ),
          Row(
            children: [
              const Icon(Icons.location_on, size: 16, color: AppColors.error),
              const SizedBox(width: 10),
              Expanded(child: Text(destination, style: AppTextStyles.body, maxLines: 2)),
            ],
          ),
        ],
      ),
    );
  }
}
