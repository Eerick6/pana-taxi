import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/services.dart';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_mapbox_navigation/flutter_mapbox_navigation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart' as geo;
import 'package:go_router/go_router.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/config/app_config.dart';
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
    _listenOfferAccepted();
    _listenCancelled();
  }

  void _listenOfferAccepted() {
    final socket = ref.read(socketClientProvider);
    socket.on('trip.offer_accepted', (data) async {
      if (!_socketActive || !mounted) return;
      final repo = ref.read(tripRepositoryProvider);
      final updated = await repo.getActiveTrip();
      if (_socketActive && mounted && updated != null) {
        ref.read(activeTripProvider.notifier).setTrip(updated);
      }
    });
  }

  void _listenCancelled() {
    final socket = ref.read(socketClientProvider);
    _onCancelled = (data) async {
      if (!_socketActive || !mounted) return;
      final map         = data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
      final reason      = map['reason']       as String?;
      final cancelledBy = map['cancelled_by'] as String?;

      // Limpiar viaje del provider antes del dialog para que al volver al home
      // no intente redirigir de nuevo a esta página
      ref.read(activeTripProvider.notifier).clear();

      if (cancelledBy != 'driver' && reason != null && reason.isNotEmpty && mounted) {
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
      if (mounted) context.go('/home');
    };
    socket.on('trip.cancelled', _onCancelled!);
  }

  @override
  void dispose() {
    _socketActive = false;
    final socket = ref.read(socketClientProvider);
    socket.off('trip.cancelled');
    // NO llamar socket.off('trip.offer_accepted') — home_page también tiene ese listener
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
          // El listener _listenCancelled maneja el dialog y la navegación.
          // Si llegamos aquí sin cancelación (ej: viaje completado), ir al home.
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) context.go('/home');
          });
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
  bool    _disposed = false; // guardián para setState tras dispose
  MapLibreMapController? _mapController;
  bool    _mapImageReady = false;
  Symbol? _mySymbol;
  Symbol? _originSymbol;
  double? _etaMinutes;
  Timer?  _waitTimer;
  int     _waitSecondsLeft = 0;
  final   _externalDio = Dio();
  StreamSubscription<geo.Position>? _locationSub;
  bool    _followDriver = false;
  bool    _suppressCameraIdle = false; // true mientras animamos nosotros
  geo.Position? _lastKnownPos;         // para re-centrar desde el botón

  // Taxímetro en vivo
  double _meterDisplay   = 0;
  double _meterIncPerSec = 0;
  Timer? _meterTimer;

  @override
  void initState() {
    super.initState();
    _startLocationTracking();
    if (widget.trip.status == 'driver_arrived') {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _startWaitCountdown(widget.trip.waitTimerExpiresAt),
      );
    }
    // Inicializar display con el valor que ya tiene el viaje (base_fare o último meter_amount)
    if (widget.trip.isMeterMode) {
      _meterDisplay = widget.trip.fare ?? 0;
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _locationSub?.cancel();
    _waitTimer?.cancel();
    _meterTimer?.cancel();
    _externalDio.close(force: true);
    super.dispose();
  }

  Future<Uint8List> _buildNavArrow() async {
    const w = 44.0, h = 56.0;
    final rec    = ui.PictureRecorder();
    final canvas = Canvas(rec, Rect.fromLTWH(0, 0, w, h));
    final cx     = w / 2;

    // Sombra difusa
    canvas.drawOval(
      Rect.fromCenter(center: Offset(cx, h - 6), width: 22, height: 8),
      Paint()..color = Colors.black.withValues(alpha: 0.25),
    );

    // Flecha apuntando al norte (hacia arriba) — rota vía iconRotate en el mapa
    final path = Path()
      ..moveTo(cx, 4)              // punta superior
      ..lineTo(w - 6, h - 12)     // base derecha
      ..lineTo(cx, h - 20)        // muesca central (da forma de carro/flecha)
      ..lineTo(6, h - 12)         // base izquierda
      ..close();

    // Relleno azul navegación
    canvas.drawPath(path, Paint()..color = const Color(0xFF1A73E8));

    // Borde blanco
    canvas.drawPath(path, Paint()
      ..color      = Colors.white
      ..style      = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeJoin  = StrokeJoin.round);

    // Punto blanco central
    canvas.drawCircle(Offset(cx, h / 2 + 4), 4, Paint()..color = Colors.white);

    final img  = await rec.endRecording().toImage(w.toInt(), h.toInt());
    final data = await img.toByteData(format: ui.ImageByteFormat.png);
    return data!.buffer.asUint8List();
  }

  Future<Uint8List> _buildPersonPin() async {
    const w = 48.0, h = 60.0;
    final rec    = ui.PictureRecorder();
    final canvas = Canvas(rec, Rect.fromLTWH(0, 0, w, h));
    final cx     = w / 2;

    // Sombra
    canvas.drawOval(
      Rect.fromCenter(center: Offset(cx, h - 4), width: 18, height: 6),
      Paint()..color = Colors.black.withValues(alpha: 0.22),
    );

    // Pin (teardrop): círculo arriba + triángulo abajo
    final pinRadius = 18.0;
    final pinCenter = Offset(cx, pinRadius + 4);
    final pinPath = Path()
      ..addOval(Rect.fromCircle(center: pinCenter, radius: pinRadius))
      ..moveTo(cx - 10, pinCenter.dy + pinRadius - 4)
      ..lineTo(cx, h - 8)
      ..lineTo(cx + 10, pinCenter.dy + pinRadius - 4)
      ..close();

    // Fondo verde
    canvas.drawPath(pinPath, Paint()..color = const Color(0xFF1DB954));
    // Borde blanco
    canvas.drawPath(pinPath, Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5);

    // Persona: cabeza
    canvas.drawCircle(pinCenter.translate(0, -6), 6, Paint()..color = Colors.white);
    // Persona: cuerpo (semicírculo)
    canvas.drawArc(
      Rect.fromCenter(center: pinCenter.translate(0, 3), width: 18, height: 14),
      3.14, 3.14, false,
      Paint()..color = Colors.white..style = PaintingStyle.fill,
    );

    final img  = await rec.endRecording().toImage(w.toInt(), h.toInt());
    final data = await img.toByteData(format: ui.ImageByteFormat.png);
    return data!.buffer.asUint8List();
  }

  void _moveCamera(CameraUpdate update) {
    _suppressCameraIdle = true;
    _mapController?.animateCamera(update);
    Future.delayed(const Duration(milliseconds: 700), () {
      if (mounted) _suppressCameraIdle = false;
    });
  }

  Future<void> _updateMySymbol(LatLng pos, {double heading = 0}) async {
    final ctrl = _mapController;
    if (ctrl == null || !_mapImageReady) return;
    if (_mySymbol == null) {
      _mySymbol = await ctrl.addSymbol(SymbolOptions(
        geometry: pos,
        iconImage: 'driver-dot',
        iconSize: 1.0,
        iconAnchor: 'center',
        iconRotate: heading,
      ));
    } else {
      await ctrl.updateSymbol(_mySymbol!, SymbolOptions(
        geometry: pos,
        iconRotate: heading,
      ));
    }
  }

  Future<void> _startLocationTracking() async {
    final socket = ref.read(socketClientProvider);

    // Emitir posición actual inmediatamente (para que el cliente vea el taxi enseguida)
    try {
      final pos = await geo.Geolocator.getCurrentPosition(
        locationSettings: const geo.LocationSettings(accuracy: geo.LocationAccuracy.high),
      );
      if (mounted) {
        socket.emit('location.update', {
          'lat': pos.latitude,
          'lng': pos.longitude,
          'speed_kmh': 0.0,
        });
      }
    } catch (_) {}

    // Streaming continuo mientras dure el viaje
    _locationSub = geo.Geolocator.getPositionStream(
      locationSettings: const geo.LocationSettings(
        accuracy: geo.LocationAccuracy.high,
        distanceFilter: 15,
      ),
    ).listen((pos) {
      if (!mounted) return;
      final driverPos = LatLng(pos.latitude, pos.longitude);
      socket.emit('location.update', {
        'lat': pos.latitude,
        'lng': pos.longitude,
        'speed_kmh': pos.speed > 0 ? pos.speed * 3.6 : 0.0,
      });
      _lastKnownPos = pos;
      _updateMySymbol(driverPos, heading: pos.heading >= 0 ? pos.heading : 0);
      if (_followDriver) {
        _moveCamera(CameraUpdate.newCameraPosition(
          CameraPosition(
            target: driverPos,
            bearing: pos.heading >= 0 ? pos.heading : 0,
            zoom: 17,
            tilt: 45,
          ),
        ));
      }
    });
  }

  @override
  void didUpdateWidget(_TripView old) {
    super.didUpdateWidget(old);
    if (old.trip.status != widget.trip.status) {
      _fetchAndDrawRoute(widget.trip);
      if (widget.trip.status == 'driver_arrived') {
        _startWaitCountdown(widget.trip.waitTimerExpiresAt);
      }
      // Cuando el cliente acepta → emitir posición fresca para que vea el taxi de inmediato
      if (widget.trip.status == 'accepted') {
        _emitCurrentLocation();
      }
    }
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

  Future<void> _launchNavigation(TripModel trip) async {
    final pos = _lastKnownPos;

    // Destino según estado del viaje
    final double destLat;
    final double destLng;
    final String destName;

    if (trip.status == 'in_progress') {
      if (trip.destinationLat == null || trip.destinationLng == null) return;
      destLat  = trip.destinationLat!;
      destLng  = trip.destinationLng!;
      destName = trip.destinationAddress;
    } else {
      // accepted / driver_arrived → ir al punto de recogida
      destLat  = trip.originLat;
      destLng  = trip.originLng;
      destName = trip.originAddress;
    }

    final wayPoints = <WayPoint>[
      if (pos != null)
        WayPoint(
          name:      'Mi ubicación',
          latitude:  pos.latitude,
          longitude: pos.longitude,
        ),
      WayPoint(
        name:      destName,
        latitude:  destLat,
        longitude: destLng,
      ),
    ];

    if (wayPoints.length < 2) return;

    final options = MapBoxOptions(
      zoom:                     15.0,
      tilt:                     0.0,
      bearing:                  0.0,
      alternatives:             false,
      voiceInstructionsEnabled: true,
      bannerInstructionsEnabled: true,
      language:                 'es',
      mode:                     MapBoxNavigationMode.drivingWithTraffic,
      isOptimized:              true,
      units:                    VoiceUnits.metric,
      simulateRoute:            false,
      enableRefresh:            true,
      longPressDestinationEnabled: false,
      animateBuildRoute:        true,
      showReportFeedbackButton: false,
      showEndOfRouteFeedback:   false,
    );

    await MapBoxNavigation.instance.startNavigation(
      wayPoints: wayPoints,
      options:   options,
    );
  }

  Future<void> _fetchAndDrawRoute(TripModel trip) async {
    final ctrl = _mapController;
    if (ctrl == null) return;

    if (!_disposed) setState(() => _followDriver = false);
    await ctrl.clearLines();
    if (_originSymbol != null) {
      await ctrl.removeSymbol(_originSymbol!);
      _originSymbol = null;
    }

    double startLat, startLng, endLat, endLng;
    String lineColor;

    switch (trip.status) {
      case 'accepted':
        try {
          final pos = await geo.Geolocator.getCurrentPosition(
            locationSettings: const geo.LocationSettings(accuracy: geo.LocationAccuracy.high),
          );
          startLat = pos.latitude;
          startLng = pos.longitude;
        } catch (_) {
          return;
        }
        endLat = trip.originLat;
        endLng = trip.originLng;
        lineColor = '#FF6B35'; // orange: driver → pickup

      case 'in_progress':
        startLat = trip.originLat;
        startLng = trip.originLng;
        endLat = trip.destinationLat;
        endLng = trip.destinationLng;
        lineColor = '#16a34a'; // green: pickup → destination

      default:
        // driver_arrived: no route needed, just center on pickup
        _moveCamera(CameraUpdate.newLatLngZoom(LatLng(trip.originLat, trip.originLng), 16));
        await Future.delayed(const Duration(seconds: 2));
        if (mounted) setState(() => _followDriver = true);
        return;
    }

    try {
      final dio = _externalDio;
      final url = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic/'
          '$startLng,$startLat;$endLng,$endLat'
          '?geometries=geojson&overview=full&access_token=${AppConfig.mapboxToken}';

      final response = await dio.get<Map<String, dynamic>>(url);
      final routes = response.data?['routes'] as List?;
      if (routes == null || routes.isEmpty) return;

      if (trip.status == 'accepted') {
        final secs = (routes[0]['duration'] as num?)?.toDouble();
        if (secs != null && !_disposed) setState(() => _etaMinutes = secs / 60);
      }

      final coords = routes[0]['geometry']['coordinates'] as List;
      final latLngs = coords
          .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
          .toList();

      if (_disposed || !mounted) return;

      // White border first, colored line on top — Uber/InDrive style
      await ctrl.addLine(LineOptions(
        geometry: latLngs,
        lineColor: '#ffffff',
        lineWidth: 10.0,
        lineOpacity: 1.0,
        lineJoin: 'round',
      ));
      await ctrl.addLine(LineOptions(
        geometry: latLngs,
        lineColor: lineColor,
        lineWidth: 6.0,
        lineOpacity: 1.0,
        lineJoin: 'round',
      ));

      // Pin de recogida (persona) en el punto de origen
      if (_mapImageReady) {
        _originSymbol = await ctrl.addSymbol(SymbolOptions(
          geometry: LatLng(trip.originLat, trip.originLng),
          iconImage: 'pickup-pin',
          iconSize: 1.0,
          iconAnchor: 'bottom',
        ));
      }

      // Show full route for 3 seconds, then switch to navigation follow mode
      final lats = latLngs.map((p) => p.latitude);
      final lngs = latLngs.map((p) => p.longitude);
      _moveCamera(CameraUpdate.newLatLngBounds(
        LatLngBounds(
          southwest: LatLng(
            lats.reduce((a, b) => a < b ? a : b),
            lngs.reduce((a, b) => a < b ? a : b),
          ),
          northeast: LatLng(
            lats.reduce((a, b) => a > b ? a : b),
            lngs.reduce((a, b) => a > b ? a : b),
          ),
        ),
        left: 50,
        top: 80,
        right: 50,
        bottom: 340,
      ));

      await Future.delayed(const Duration(seconds: 3));
      if (!_disposed) setState(() => _followDriver = true);
    } catch (_) {
      if (!_disposed) setState(() => _followDriver = true);
    }
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

    // Taxímetro en vivo — solo registra el listener cuando el viaje está en progreso
    if (trip.status == 'in_progress' && trip.isMeterMode) {
      ref.listen<({double amount, double incPerSec})>(liveMeterProvider, (_, next) {
        if (_disposed || !mounted) return;
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
    }

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
          MapLibreMap(
            styleString: 'https://tiles.openfreemap.org/styles/liberty',
            initialCameraPosition: CameraPosition(
              target: LatLng(trip.originLat, trip.originLng),
              zoom: 14,
            ),
            onMapCreated: (controller) {
              _mapController = controller;
            },
            onStyleLoadedCallback: () async {
              final ctrl = _mapController;
              if (ctrl == null) return;
              final bytes = await _buildNavArrow();
              await ctrl.addImage('driver-dot', bytes);
              final pinBytes = await _buildPersonPin();
              await ctrl.addImage('pickup-pin', pinBytes);
              _mapImageReady = true;
              _fetchAndDrawRoute(trip);
              // Icono inicial en posición actual
              try {
                final pos = await geo.Geolocator.getCurrentPosition(
                  locationSettings: const geo.LocationSettings(accuracy: geo.LocationAccuracy.high),
                );
                if (mounted) await _updateMySymbol(
                  LatLng(pos.latitude, pos.longitude),
                  heading: pos.heading >= 0 ? pos.heading : 0,
                );
              } catch (_) {}
            },
            myLocationEnabled: false,
            trackCameraPosition: true,
            onCameraIdle: () {
              if (!_suppressCameraIdle && _followDriver && !_disposed && mounted) {
                setState(() => _followDriver = false);
              }
            },
          ),

          // Botón Navegar con Mapbox (siempre visible durante el viaje)
          Positioned(
            right: 16,
            top: 64,
            child: GestureDetector(
              onTap: () => _launchNavigation(widget.trip),
              child: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: const Color(0xFF1A73E8),
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.25), blurRadius: 10)],
                ),
                child: const Icon(Icons.turn_right_rounded, color: Colors.white, size: 24),
              ),
            ),
          ),

          // Botón re-centrar (aparece cuando el usuario scrolleó)
          if (!_followDriver)
            Positioned(
              right: 16,
              top: 120,
              child: GestureDetector(
                onTap: () {
                  setState(() => _followDriver = true);
                  final p = _lastKnownPos;
                  if (p != null) {
                    _moveCamera(CameraUpdate.newCameraPosition(CameraPosition(
                      target: LatLng(p.latitude, p.longitude),
                      bearing: p.heading >= 0 ? p.heading : 0,
                      zoom: 17,
                      tilt: 45,
                    )));
                  }
                },
                child: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 10)],
                  ),
                  child: const Icon(Icons.navigation_rounded, color: Color(0xFF1A73E8), size: 24),
                ),
              ),
            ),

          // Back button
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: GestureDetector(
                onTap: () => context.go('/home'),
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.white,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 8)],
                  ),
                  child: const Icon(Icons.arrow_back_ios_new, size: 18),
                ),
              ),
            ),
          ),

          // Bottom sheet
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
              padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).padding.bottom + 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(width: 36, height: 4, margin: const EdgeInsets.only(bottom: 16), decoration: BoxDecoration(color: AppColors.gray200, borderRadius: BorderRadius.circular(2))),

                  // Status badge
                  _StatusBadge(status: trip.status),
                  const SizedBox(height: 10),

                  // ETA cuando va al cliente
                  if (trip.status == 'accepted' && _etaMinutes != null)
                    _InfoChip(
                      icon: Icons.access_time_rounded,
                      color: Colors.blue,
                      label: 'Llegas en ~${_etaMinutes!.round()} min',
                    ),

                  // Countdown de espera cuando llegó
                  if (trip.status == 'driver_arrived')
                    _WaitTimer(secondsLeft: _waitSecondsLeft),

                  const SizedBox(height: 12),

                  // Client info
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

                  // Addresses
                  _RouteCard(origin: trip.originAddress, destination: trip.destinationAddress),
                  const SizedBox(height: 16),

                  // Cancelar — pequeño link encima del botón principal
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
      'accepted' => ('Yendo al cliente', Colors.blue),
      'driver_arrived' => ('Esperando al cliente', AppColors.warningText),
      'in_progress' => ('Viaje en progreso', Colors.green),
      _ => ('Completado', AppColors.gray400),
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

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.color, required this.label});
  final IconData icon;
  final Color    color;
  final String   label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.center,
    children: [
      Icon(icon, size: 15, color: color),
      const SizedBox(width: 5),
      Text(label, style: AppTextStyles.label.copyWith(color: color)),
    ],
  );
}

class _WaitTimer extends StatelessWidget {
  const _WaitTimer({required this.secondsLeft});
  final int secondsLeft;

  @override
  Widget build(BuildContext context) {
    final mins = secondsLeft ~/ 60;
    final secs = secondsLeft % 60;
    final expired = secondsLeft <= 0;
    final color = expired ? AppColors.errorText : AppColors.warningText;
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
