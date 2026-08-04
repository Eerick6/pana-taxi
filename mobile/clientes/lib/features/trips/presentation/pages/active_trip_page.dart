import 'dart:async';
import 'dart:math';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/network/socket_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/datasources/trips_api.dart';
import '../../domain/entities/active_trip.dart';
import '../providers/active_trip_provider.dart';
import '../widgets/trip_rating_sheet.dart';
import '../../../chat/data/repositories/chat_repository.dart';

// ── Canvas: taxi marker (circle con ícono de taxi) ───────────────────────────

Uint8List? _taxiDotCache;
Future<Uint8List> _getTaxiDot() async => _taxiDotCache ??= await _buildTaxiDot();

Future<Uint8List> _buildTaxiDot() async {
  const size = 48.0;
  final rec    = ui.PictureRecorder();
  final canvas = Canvas(rec, const Rect.fromLTWH(0, 0, size, size));
  final cx = size / 2;

  // Sombra
  canvas.drawCircle(Offset(cx, cx + 3), 16, Paint()..color = Colors.black.withValues(alpha: 0.18));
  // Fondo amarillo
  canvas.drawCircle(Offset(cx, cx), 16, Paint()..color = const Color(0xFFFFC107));
  // Borde blanco
  canvas.drawCircle(Offset(cx, cx), 16, Paint()
    ..color = Colors.white
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2.5);

  // Dibujar emoji 🚕 con TextPainter
  final tp = TextPainter(textDirection: TextDirection.ltr)
    ..text = const TextSpan(text: '🚕', style: TextStyle(fontSize: 16))
    ..layout();
  tp.paint(canvas, Offset(cx - tp.width / 2, cx - tp.height / 2));

  final img  = await rec.endRecording().toImage(size.toInt(), size.toInt());
  final data = await img.toByteData(format: ui.ImageByteFormat.png);
  return data!.buffer.asUint8List();
}

// ── Page ──────────────────────────────────────────────────────────────────────

class ActiveTripPage extends ConsumerStatefulWidget {
  const ActiveTripPage({super.key, required this.tripId});
  final String tripId;

  @override
  ConsumerState<ActiveTripPage> createState() => _ActiveTripPageState();
}

class _ActiveTripPageState extends ConsumerState<ActiveTripPage> {
  ActiveTrip? _trip;
  Timer?  _waitTimer;
  int     _waitSecondsLeft = 0;

  MapLibreMapController? _mapController;
  Symbol?  _driverSymbol;
  Line?    _approachLine1;
  Line?    _approachLine2;
  bool     _mapReady = false;
  bool     _routeDrawn = false;
  bool     _approachDrawn = false;
  final    _routeDio = Dio();

  // Taxímetro en tiempo real (solo fareMode == 'meter' + in_progress)
  double   _meterAmount = 0;
  double   _meterIncPerSec = 0;
  Timer?   _meterTimer;
  bool     _clientReadySent = false;

  @override
  void initState() {
    super.initState();
    _loadTrip();
    _initSocket();
  }

  @override
  void dispose() {
    _waitTimer?.cancel();
    _meterTimer?.cancel();
    _routeDio.close(force: true);
    final socket = ref.read(socketClientProvider);
    socket.leaveTripRoom(widget.tripId);
    socket.off('trip.driver_arrived');
    socket.off('trip.started');
    socket.off('trip.completed');
    socket.off('trip.cancelled');
    socket.off('driver.location');
    socket.off('trip.meter_update');
    socket.off('trip.rerouted');
    super.dispose();
  }

  void _startWaitCountdown(String? isoExpires) {
    _waitTimer?.cancel();
    final expires = isoExpires != null
        ? DateTime.tryParse(isoExpires)?.toLocal()
        : null;
    final end = expires ?? DateTime.now().add(const Duration(minutes: 5));
    final initial = end.difference(DateTime.now()).inSeconds;
    if (!mounted) return;
    setState(() => _waitSecondsLeft = initial < 0 ? 0 : initial);
    _waitTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final left = end.difference(DateTime.now()).inSeconds;
      setState(() => _waitSecondsLeft = left < 0 ? 0 : left);
      if (left <= 0) _waitTimer?.cancel();
    });
  }

  Future<void> _loadTrip() async {
    // Usar dato ya cacheado en el provider — evita request duplicado al arrancar
    final cached = ref.read(activeTripProvider).valueOrNull;
    if (cached != null) {
      setState(() => _trip = cached);
      if (_mapReady) _drawRoute();
      return;
    }
    // Fallback: fetch directo si el provider aún no tiene datos
    final trip = await ref.read(tripsApiProvider).getActiveTrip();
    if (mounted && trip != null) {
      setState(() => _trip = trip);
      if (_mapReady) _drawRoute();
    }
  }

  Future<void> _initSocket() async {
    final socket = ref.read(socketClientProvider);
    await socket.connect();
    socket.joinTripRoom(widget.tripId);

    socket.on('driver.location', (data) async {
      if (data is! Map || !mounted) return;
      final lat = (data['lat'] as num?)?.toDouble();
      final lng = (data['lng'] as num?)?.toDouble();
      if (lat == null || lng == null) return;
      final ctrl = _mapController;
      if (ctrl == null) return;

      final pos = LatLng(lat, lng);
      if (_driverSymbol == null) {
        _driverSymbol = await ctrl.addSymbol(SymbolOptions(
          geometry: pos,
          iconImage: 'taxi-dot',
          iconSize: 1.0,
          iconAnchor: 'center',
        ));
        // Dibujar ruta conductor→punto de recogida (solo la primera vez)
        if (!_approachDrawn) _drawApproachRoute(ctrl, pos);
      } else {
        await ctrl.updateSymbol(_driverSymbol!, SymbolOptions(geometry: pos));
      }
      // Seguimiento suave del conductor cuando está en camino
      if (_trip?.status == 'accepted') {
        await ctrl.animateCamera(CameraUpdate.newLatLng(pos));
      }
    });

    socket.on('trip.driver_arrived', (data) async {
      if (!mounted) return;
      final waitExpires = data is Map ? data['wait_expires_at'] as String? : null;
      setState(() => _trip = _trip != null ? _rebuildTrip(_trip!, 'driver_arrived') : _trip);
      _startWaitCountdown(waitExpires);
      // Limpiar ruta de acercamiento — el conductor ya llegó
      final ctrl = _mapController;
      if (ctrl != null) {
        if (_approachLine1 != null) await ctrl.removeLine(_approachLine1!);
        if (_approachLine2 != null) await ctrl.removeLine(_approachLine2!);
        _approachLine1 = null;
        _approachLine2 = null;
      }
    });

    socket.on('trip.started', (_) {
      if (!mounted) return;
      setState(() {
        _trip = _trip != null ? _rebuildTrip(_trip!, 'in_progress') : _trip;
        _routeDrawn = false; // permitir redibujar con la ruta al destino
      });
      if (_mapReady) _drawRoute();
    });

    socket.on('trip.completed', (_) async {
      if (!mounted) return;
      final tripId = _trip?.id ?? widget.tripId;
      await showTripRatingSheet(context, ref, tripId);
      if (mounted) context.go('/home');
    });

    socket.on('trip.cancelled', (_) {
      if (mounted) context.go('/home');
    });

    socket.on('trip.rerouted', (data) async {
      if (data is! Map || !mounted) return;
      final geomRaw = data['route_geometry'];
      if (geomRaw is! Map) return;
      final geom = geomRaw as Map<String, dynamic>;
      final ctrl = _mapController;
      if (ctrl == null) return;
      await ctrl.clearLines();
      _routeDrawn = false;
      final rawCoords = (geom['type'] == 'LineString')
          ? geom['coordinates'] as List?
          : (geom['geometry'] as Map?)?['coordinates'] as List?;
      if (rawCoords == null || rawCoords.isEmpty) return;
      final latLngs = rawCoords
          .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
          .toList();
      await ctrl.addLine(LineOptions(geometry: latLngs, lineColor: '#ffffff', lineWidth: 10.0, lineOpacity: 1.0, lineJoin: 'round'));
      await ctrl.addLine(LineOptions(geometry: latLngs, lineColor: '#4264fb', lineWidth: 6.0, lineOpacity: 1.0, lineJoin: 'round'));
      _routeDrawn = true;
    });

    socket.on('trip.meter_update', (data) {
      if (data is! Map || !mounted) return;
      final amount = (data['meter_amount'] as num?)?.toDouble();
      final inc    = (data['increment_per_second'] as num?)?.toDouble() ?? 0.0;
      if (amount == null) return;
      setState(() {
        _meterAmount    = amount;
        _meterIncPerSec = inc;
      });
      _meterTimer?.cancel();
      _meterTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) { _meterTimer?.cancel(); return; }
        setState(() => _meterAmount += _meterIncPerSec);
      });
    });
  }

  Future<void> _drawApproachRoute(MapLibreMapController ctrl, LatLng driverPos) async {
    final trip = _trip;
    if (trip?.originLat == null || trip?.originLng == null) return;
    _approachDrawn = true;
    try {
      final res = await _routeDio.get<Map<String, dynamic>>(
        'https://router.project-osrm.org/route/v1/driving/'
        '${driverPos.longitude},${driverPos.latitude};'
        '${trip!.originLng},${trip.originLat}'
        '?overview=full&geometries=geojson',
      );
      final routes = res.data?['routes'] as List?;
      if (routes == null || routes.isEmpty || !mounted) return;
      final coords = routes[0]['geometry']['coordinates'] as List;
      final latLngs = coords
          .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
          .toList();
      if (latLngs.length < 2) return;
      _approachLine1 = await ctrl.addLine(LineOptions(
        geometry: latLngs, lineColor: '#ffffff', lineWidth: 8.0, lineOpacity: 0.85, lineJoin: 'round',
      ));
      _approachLine2 = await ctrl.addLine(LineOptions(
        geometry: latLngs, lineColor: '#4264fb', lineWidth: 5.0, lineOpacity: 1.0, lineJoin: 'round',
      ));
    } catch (_) {
      // Si falla el routing, el marcador del taxi sigue visible
      _approachDrawn = false;
    }
  }

  Future<void> _onMapCreated(MapLibreMapController ctrl) async {
    _mapController = ctrl;
    // Registrar imagen del taxi
    final taxiBytes = await _getTaxiDot();
    await ctrl.addImage('taxi-dot', taxiBytes);
    _mapReady = true;
    if (_trip != null) _drawRoute();
  }

  Future<void> _drawRoute() async {
    final ctrl = _mapController;
    final trip = _trip;
    if (ctrl == null || trip == null || _routeDrawn) return;

    // Pines de origen y destino — siempre visibles en accepted e in_progress
    if (trip.originLat != null && trip.originLng != null) {
      await ctrl.addCircle(CircleOptions(
        geometry: LatLng(trip.originLat!, trip.originLng!),
        circleRadius: 8, circleColor: '#16a34a', circleStrokeWidth: 2, circleStrokeColor: '#ffffff',
      ));
    }
    if (trip.destinationLat != null && trip.destinationLng != null) {
      await ctrl.addCircle(CircleOptions(
        geometry: LatLng(trip.destinationLat!, trip.destinationLng!),
        circleRadius: 8, circleColor: '#ef4444', circleStrokeWidth: 2, circleStrokeColor: '#ffffff',
      ));
    }

    // Ruta origen→destino solo cuando el viaje está en curso
    if (trip.status != 'in_progress') {
      _routeDrawn = true;
      // Centrar mapa en el punto de recogida para que el cliente vea al conductor llegar
      if (trip.originLat != null && trip.originLng != null) {
        await ctrl.animateCamera(
          CameraUpdate.newLatLngZoom(LatLng(trip.originLat!, trip.originLng!), 15),
        );
      }
      return;
    }

    final geom = trip.routeGeometry;
    if (geom == null) { _routeDrawn = true; return; }

    List? rawCoords;
    if (geom['type'] == 'LineString') {
      rawCoords = geom['coordinates'] as List?;
    } else if (geom['type'] == 'Feature') {
      final g = geom['geometry'] as Map?;
      rawCoords = g?['coordinates'] as List?;
    }
    if (rawCoords == null || rawCoords.isEmpty) { _routeDrawn = true; return; }

    final latLngs = rawCoords
        .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
        .toList();

    // Borde blanco + línea azul estilo navegación
    await ctrl.addLine(LineOptions(
      geometry: latLngs, lineColor: '#ffffff', lineWidth: 10.0, lineOpacity: 1.0, lineJoin: 'round',
    ));
    await ctrl.addLine(LineOptions(
      geometry: latLngs, lineColor: '#4264fb', lineWidth: 6.0, lineOpacity: 1.0, lineJoin: 'round',
    ));

    _routeDrawn = true;

    // Ajustar cámara para mostrar toda la ruta
    final lats = latLngs.map((p) => p.latitude);
    final lngs = latLngs.map((p) => p.longitude);
    await ctrl.animateCamera(CameraUpdate.newLatLngBounds(
      LatLngBounds(
        southwest: LatLng(lats.reduce(min), lngs.reduce(min)),
        northeast: LatLng(lats.reduce(max), lngs.reduce(max)),
      ),
      left: 40, top: 100, right: 40, bottom: 320,
    ));
  }

  ActiveTrip _rebuildTrip(ActiveTrip t, String status) => ActiveTrip(
    id: t.id, status: status, fareMode: t.fareMode,
    originAddress: t.originAddress, destinationAddress: t.destinationAddress,
    originLat: t.originLat, originLng: t.originLng,
    destinationLat: t.destinationLat, destinationLng: t.destinationLng,
    routeGeometry: t.routeGeometry, searchRadiusKm: t.searchRadiusKm,
    createdAt: t.createdAt, pendingOfferAmount: t.pendingOfferAmount,
    clientOffer: t.clientOffer, otpCode: t.otpCode,
    driverName: t.driverName, driverPhone: t.driverPhone,
    driverPhoto: t.driverPhoto, driverRating: t.driverRating,
    vehiclePlate: t.vehiclePlate, vehicleModel: t.vehicleModel,
  );

  @override
  Widget build(BuildContext context) {
    final trip    = _trip;
    final topPad  = MediaQuery.of(context).padding.top;
    final botPad  = MediaQuery.of(context).padding.bottom;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // ── Mapa completo ────────────────────────────────────────────────
          MaplibreMap(
            styleString: 'https://tiles.openfreemap.org/styles/liberty',
            initialCameraPosition: CameraPosition(
              target: trip?.originLat != null
                  ? LatLng(trip!.originLat!, trip.originLng!)
                  : const LatLng(-1.8, -78.2),
              zoom: trip?.originLat != null ? 14 : 6,
            ),
            onMapCreated: _onMapCreated,
            myLocationEnabled: false,
            compassEnabled: false,
            attributionButtonPosition: AttributionButtonPosition.bottomLeft,
          ),

          // ── Status banner (top overlay) ──────────────────────────────────
          Positioned(
            top: 0, left: 0, right: 0,
            child: _StatusBanner(trip: trip, topPad: topPad),
          ),

          // ── Wait timer (bajo el banner) ──────────────────────────────────
          if (trip != null && trip.status == 'driver_arrived')
            Positioned(
              top: topPad + 58, left: 0, right: 0,
              child: _ClientWaitTimer(secondsLeft: _waitSecondsLeft),
            ),

          // ── Panel inferior ───────────────────────────────────────────────
          Positioned(
            bottom: 0, left: 0, right: 0,
            child: trip == null
                ? const SizedBox.shrink()
                : _BottomPanel(
                    trip: trip,
                    bottomPad: botPad,
                    meterAmount: _meterAmount,
                    onClientReady: _clientReadySent ? null : () async {
                      setState(() => _clientReadySent = true);
                      try {
                        await ref.read(tripsApiProvider).clientReady(widget.tripId);
                      } catch (_) {}
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

// ── Status Banner ─────────────────────────────────────────────────────────────

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.trip, required this.topPad});
  final ActiveTrip? trip;
  final double topPad;

  @override
  Widget build(BuildContext context) {
    final (label, icon, color) = _statusInfo(trip?.status);
    return Container(
      color: color,
      padding: EdgeInsets.fromLTRB(20, topPad + 12, 20, 12),
      child: Row(children: [
        Icon(icon, color: Colors.white, size: 20),
        const SizedBox(width: 10),
        Expanded(child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700))),
      ]),
    );
  }

  (String, IconData, Color) _statusInfo(String? status) => switch (status) {
    'accepted'       => ('Conductor en camino…',      Icons.directions_car, AppColors.info),
    'driver_arrived' => ('¡El conductor llegó!',      Icons.location_on,    AppColors.success),
    'in_progress'    => ('Viaje en curso…',            Icons.navigation_rounded, AppColors.secondary),
    _                => ('Conectando…',                Icons.access_time,    AppColors.gray500),
  };
}

// ── Bottom Panel ──────────────────────────────────────────────────────────────

class _BottomPanel extends ConsumerStatefulWidget {
  const _BottomPanel({
    required this.trip,
    required this.bottomPad,
    required this.meterAmount,
    this.onClientReady,
  });
  final ActiveTrip trip;
  final double bottomPad;
  final double meterAmount;
  final VoidCallback? onClientReady;

  @override
  ConsumerState<_BottomPanel> createState() => _BottomPanelState();
}

class _BottomPanelState extends ConsumerState<_BottomPanel> {
  bool _cancelling = false;

  @override
  Widget build(BuildContext context) {
    final trip = widget.trip;
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 16, offset: Offset(0, -4))],
      ),
      padding: EdgeInsets.fromLTRB(20, 16, 20, widget.bottomPad + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Center(child: Container(width: 36, height: 4, decoration: BoxDecoration(color: AppColors.gray200, borderRadius: BorderRadius.circular(2)))),
          const SizedBox(height: 14),

          // Driver info
          _DriverCard(trip: trip),
          const SizedBox(height: 12),

          // Taxímetro en tiempo real (solo meter + in_progress)
          if (trip.status == 'in_progress' && trip.fareMode == 'meter' && widget.meterAmount > 0) ...[
            _MeterDisplay(amount: widget.meterAmount),
            const SizedBox(height: 12),
          ],

          // Route
          _RouteRow(trip: trip),

          // OTP
          if (trip.otpCode != null && trip.status == 'accepted') ...[
            const SizedBox(height: 12),
            _OtpCard(otp: trip.otpCode!),
          ],

          // Ya voy button (driver_arrived)
          if (trip.status == 'driver_arrived' && widget.onClientReady != null) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity, height: 44,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.success,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 0,
                ),
                onPressed: widget.onClientReady,
                icon: const Icon(Icons.directions_walk, size: 18),
                label: const Text('Ya voy al taxi'),
              ),
            ),
          ],

          // Cancel button (solo en accepted)
          if (trip.status == 'accepted') ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity, height: 44,
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: AppColors.error),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: _cancelling ? null : _cancel,
                child: _cancelling
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.error))
                    : Text('Cancelar viaje', style: AppTextStyles.label.copyWith(color: AppColors.error)),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _cancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('¿Cancelar viaje?'),
        content: const Text('El conductor ya está en camino. ¿Estás seguro?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('No')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sí, cancelar', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _cancelling = true);
    try {
      await ref.read(tripsApiProvider).cancelTrip(widget.trip.id);
      if (mounted) context.go('/home');
    } catch (_) {
      if (mounted) setState(() => _cancelling = false);
    }
  }
}

// ── Driver Card ───────────────────────────────────────────────────────────────

class _DriverCard extends ConsumerWidget {
  const _DriverCard({required this.trip});
  final ActiveTrip trip;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Row(children: [
    CircleAvatar(
      radius: 28,
      backgroundColor: AppColors.gray100,
      child: trip.driverPhoto != null
          ? ClipOval(child: CachedNetworkImage(
              imageUrl: trip.driverPhoto!, width: 56, height: 56, fit: BoxFit.cover,
              errorWidget: (_, __, ___) => const Icon(Icons.person, size: 28, color: AppColors.gray400),
              placeholder: (_, __) => const SizedBox.shrink(),
            ))
          : const Icon(Icons.person, size: 28, color: AppColors.gray400),
    ),
    const SizedBox(width: 12),
    Expanded(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(trip.driverName ?? 'Conductor', style: AppTextStyles.label),
        if (trip.driverRating != null)
          Row(children: [
            const Icon(Icons.star_rounded, size: 13, color: Color(0xFFFFA000)),
            const SizedBox(width: 2),
            Text(trip.driverRating!.toStringAsFixed(1),
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFFFFA000))),
          ]),
        if (trip.vehiclePlate != null || trip.vehicleModel != null)
          Text(
            [trip.vehicleModel, trip.vehiclePlate].where((s) => s != null && s.isNotEmpty).join(' · '),
            style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
          ),
      ]),
    ),
    // Botón de chat
    if (['accepted', 'driver_arrived', 'in_progress'].contains(trip.status))
      GestureDetector(
        onTap: () async {
          try {
            final convId = await ref.read(chatRepositoryProvider).openTripConversation(trip.id);
            if (context.mounted) {
              context.push('/chat/$convId', extra: {'driverName': trip.driverName ?? 'Conductor'});
            }
          } catch (_) {}
        },
        child: Container(
          margin: const EdgeInsets.only(right: 4),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: AppColors.info.withValues(alpha: 0.15), shape: BoxShape.circle),
          child: const Icon(Icons.chat_bubble_outline_rounded, color: AppColors.info, size: 20),
        ),
      ),
    if (trip.driverPhone != null) _CallButton(phone: trip.driverPhone!),
  ]);
}

class _CallButton extends StatelessWidget {
  const _CallButton({required this.phone});
  final String phone;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: () async {
      final uri = Uri.parse('tel:$phone');
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
      } else {
        // Fallback: copiar al portapapeles
        await Clipboard.setData(ClipboardData(text: phone));
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Número copiado al portapapeles')),
          );
        }
      }
    },
    child: Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.15), shape: BoxShape.circle),
      child: const Icon(Icons.phone_rounded, color: AppColors.secondary, size: 22),
    ),
  );
}

// ── Route Row ─────────────────────────────────────────────────────────────────

class _RouteRow extends StatelessWidget {
  const _RouteRow({required this.trip});
  final ActiveTrip trip;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(color: AppColors.gray50, borderRadius: BorderRadius.circular(12)),
    child: Column(children: [
      Row(children: [
        const Icon(Icons.radio_button_checked, size: 14, color: AppColors.success),
        const SizedBox(width: 8),
        Expanded(child: Text(
          trip.originAddress.isEmpty ? 'Tu ubicación' : trip.originAddress,
          style: AppTextStyles.caption, maxLines: 1, overflow: TextOverflow.ellipsis,
        )),
      ]),
      const SizedBox(height: 4),
      Row(children: [
        const Icon(Icons.location_on, size: 14, color: AppColors.error),
        const SizedBox(width: 8),
        Expanded(child: Text(
          trip.destinationAddress,
          style: AppTextStyles.caption, maxLines: 1, overflow: TextOverflow.ellipsis,
        )),
      ]),
    ]),
  );
}

// ── Meter Display ─────────────────────────────────────────────────────────────

class _MeterDisplay extends StatelessWidget {
  const _MeterDisplay({required this.amount});
  final double amount;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    decoration: BoxDecoration(
      color: AppColors.secondary.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: AppColors.secondary.withValues(alpha: 0.25)),
    ),
    child: Row(children: [
      const Icon(Icons.speed_rounded, color: AppColors.secondary, size: 20),
      const SizedBox(width: 10),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Taxímetro', style: AppTextStyles.caption.copyWith(color: AppColors.secondary)),
          Text(
            '\$${amount.toStringAsFixed(2)}',
            style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: AppColors.secondary),
          ),
        ]),
      ),
    ]),
  );
}

// ── OTP Card ──────────────────────────────────────────────────────────────────

class _OtpCard extends StatelessWidget {
  const _OtpCard({required this.otp});
  final String otp;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    decoration: BoxDecoration(
      color: AppColors.primary.withValues(alpha: 0.10),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: AppColors.primary.withValues(alpha: 0.4)),
    ),
    child: Row(children: [
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Código de verificación', style: AppTextStyles.caption.copyWith(color: AppColors.gray600)),
          const SizedBox(height: 2),
          Text(otp, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 6, color: AppColors.secondary)),
          Text('Dáselo al conductor para iniciar el viaje', style: AppTextStyles.caption.copyWith(color: AppColors.gray500)),
        ]),
      ),
      GestureDetector(
        onTap: () {
          Clipboard.setData(ClipboardData(text: otp));
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Código copiado')));
        },
        child: const Icon(Icons.copy_rounded, size: 20, color: AppColors.gray500),
      ),
    ]),
  );
}

// ── Client Wait Timer ─────────────────────────────────────────────────────────

class _ClientWaitTimer extends StatelessWidget {
  const _ClientWaitTimer({required this.secondsLeft});
  final int secondsLeft;

  @override
  Widget build(BuildContext context) {
    final mins    = secondsLeft ~/ 60;
    final secs    = secondsLeft % 60;
    final expired = secondsLeft <= 0;
    final color   = expired ? AppColors.error : AppColors.success;

    return Container(
      color: color.withValues(alpha: 0.92),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: Row(children: [
        Icon(Icons.timer_outlined, size: 16, color: Colors.white),
        const SizedBox(width: 8),
        Text(
          expired
              ? '¡El tiempo de espera terminó!'
              : 'El conductor te espera: ${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13),
        ),
      ]),
    );
  }
}
