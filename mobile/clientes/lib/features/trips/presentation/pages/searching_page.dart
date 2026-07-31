import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../../../../core/network/socket_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/datasources/trips_api.dart';
import '../../domain/entities/active_trip.dart';
import '../providers/active_trip_provider.dart';

// ── Map helpers ───────────────────────────────────────────────────────────────

Future<Uint8List> _buildTearDropPin(Color color, {double w = 56, double h = 78}) async {
  final cx    = w / 2;
  final headR = w * 0.36;
  final headCY = headR + 4;
  final rec    = ui.PictureRecorder();
  final canvas = Canvas(rec, Rect.fromLTWH(0, 0, w, h));

  canvas.drawOval(
    Rect.fromCenter(center: Offset(cx, h - 4), width: 18, height: 6),
    Paint()..color = Colors.black.withValues(alpha: 0.22),
  );

  final path = Path()
    ..addOval(Rect.fromCircle(center: Offset(cx, headCY), radius: headR))
    ..moveTo(cx - headR * 0.55, headCY + headR - 5)
    ..lineTo(cx, h - 6)
    ..lineTo(cx + headR * 0.55, headCY + headR - 5)
    ..close();
  canvas.drawPath(path, Paint()..color = color);

  canvas.drawCircle(Offset(cx, headCY), headR,
      Paint()
        ..color       = Colors.white
        ..style       = PaintingStyle.stroke
        ..strokeWidth = 2.5);

  canvas.drawCircle(Offset(cx, headCY), headR * 0.34, Paint()..color = Colors.white);

  final img   = await rec.endRecording().toImage(w.toInt(), h.toInt());
  final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
  return bytes!.buffer.asUint8List();
}

// (provider de polling eliminado — reemplazado por socket)

// ── Página ────────────────────────────────────────────────────────────────────

class SearchingPage extends ConsumerStatefulWidget {
  const SearchingPage({super.key, required this.initialTrip});
  final ActiveTrip initialTrip;

  @override
  ConsumerState<SearchingPage> createState() => _SearchingPageState();
}

class _SearchingPageState extends ConsumerState<SearchingPage>
    with TickerProviderStateMixin {
  // Mapa
  MapLibreMapController? _ctrl;
  bool _mapReady = false;

  // Flag para desactivar handlers sin borrar listeners de otras páginas
  bool _socketActive = false;

  // Estado
  late ActiveTrip    _trip;
  List<NearbyDriver> _drivers = [];
  List<DriverOffer>           _offers        = [];
  final Map<String, DateTime> _offerArrivals = {};
  Timer? _driverTimer;

  // Timer de espera
  Duration _elapsed = Duration.zero;
  Timer?   _elapsedTimer;

  // Círculo pulsante
  late AnimationController _pulseCtrl;
  late Animation<double>   _pulseAnim;
  double _lastPulseOpacity = 0.08;

  bool get _isNegotiated => _trip.isNegotiated;

  @override
  void initState() {
    super.initState();
    _trip = widget.initialTrip;

    // Timer de espera desde creación del viaje
    final createdAt = widget.initialTrip.createdAt;
    if (createdAt != null) {
      _elapsed = DateTime.now().difference(createdAt);
    }
    _elapsedTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _elapsed += const Duration(seconds: 1));
    });

    // Conductores cercanos cada 5 s (solo mapa, no crítico)
    _driverTimer = Timer.periodic(const Duration(seconds: 5), (_) => _refreshDrivers());

    // Socket en tiempo real para ofertas y cambios de estado
    _initSocket();

    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2000),
    )..repeat(reverse: true);
    _pulseAnim = CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut);
    _pulseAnim.addListener(_onPulseTick);
  }

  Future<void> _initSocket() async {
    final socket = ref.read(socketClientProvider);
    await socket.connect();
    if (!mounted) return;

    _socketActive = true;

    socket.on('trip.new_offer', (data) {
      if (!_socketActive || !mounted || data is! Map) return;
      final offer = DriverOffer.fromSocketEvent(Map<String, dynamic>.from(data));
      setState(() {
        _offerArrivals.putIfAbsent(offer.offerId, () => DateTime.now());
        final idx = _offers.indexWhere((o) => o.offerId == offer.offerId);
        if (idx >= 0) {
          _offers[idx] = offer;
        } else {
          _offers = [..._offers, offer];
        }
      });
    });

    // Viaje aceptado (modo taxímetro) o conductor seleccionado ya asignado
    socket.on('trip.accepted', (data) {
      if (!_socketActive || !mounted) return;
      final tripId = (data is Map ? data['trip_id'] : null) as String?;
      context.go('/trip/${tripId ?? _trip.id}');
    });

    // Viaje cancelado desde el backend (expirado, etc.)
    socket.on('trip.cancelled', (_) {
      if (!_socketActive || !mounted) return;
      context.go('/home');
    });
  }

  @override
  void dispose() {
    _socketActive = false;
    _elapsedTimer?.cancel();
    _driverTimer?.cancel();
    _pulseAnim.removeListener(_onPulseTick);
    _pulseCtrl.dispose();
    super.dispose();
  }

  // ── Mapa ──────────────────────────────────────────────────────────────────

  Future<void> _onMapCreated(MapLibreMapController c) async => _ctrl = c;

  Future<void> _onStyleLoaded() async {
    final c = _ctrl;
    if (c == null) return;
    _mapReady = true;

    // Construir imágenes en paralelo antes de tocar el mapa
    final results = await Future.wait([
      _buildTearDropPin(const Color(0xFF34A853)),
      _buildTearDropPin(const Color(0xFFEA4335), w: 64, h: 90),
      _buildTaxiIconBytes(),
    ]);
    await c.addImage('origin-pin', results[0]);
    await c.addImage('dest-pin',   results[1]);
    await c.addImage('taxi-icon',  results[2]);

    final lat    = _trip.originLat;
    final lng    = _trip.originLng;
    final dLat   = _trip.destinationLat;
    final dLng   = _trip.destinationLng;
    final radius = (_trip.searchRadiusKm ?? 3.0).clamp(1.0, 20.0);

    // 1. Ruta (capa más baja)
    final geom = _trip.routeGeometry;
    if (geom != null) {
      await c.addGeoJsonSource('route-src', {
        'type': 'FeatureCollection',
        'features': [
          {'type': 'Feature', 'geometry': geom, 'properties': <String, dynamic>{}}
        ],
      });
      await c.addLineLayer('route-src', 'route-line',
          const LineLayerProperties(
            lineColor: '#4285F4', lineWidth: 5.0,
            lineCap: 'round', lineJoin: 'round',
          ));
    }

    // 2. Círculo de radio de búsqueda (pulsante)
    if (lat != null && lng != null) {
      await c.addGeoJsonSource('circle-src', _circleGeoJson(lat, lng, radius));
      await c.addFillLayer('circle-src', 'circle-fill',
          const FillLayerProperties(fillColor: '#34A853', fillOpacity: 0.15));
      await c.addLineLayer('circle-src', 'circle-line',
          const LineLayerProperties(lineColor: '#34A853', lineWidth: 2.5, lineOpacity: 0.85));
    }

    // 3. Taxis cercanos (encima del círculo)
    await c.addGeoJsonSource('drivers-src', _driversGeoJson([]));
    await c.addSymbolLayer('drivers-src', 'drivers-layer',
        const SymbolLayerProperties(
          iconImage: 'taxi-icon',
          iconSize: 0.85,
          iconAllowOverlap: true,
          iconAnchor: 'center',
        ));

    // 4. Pin origen — capa encima de los taxis
    if (lat != null && lng != null) {
      await c.addGeoJsonSource('origin-src', {
        'type': 'FeatureCollection',
        'features': [{
          'type': 'Feature',
          'geometry': {'type': 'Point', 'coordinates': [lng, lat]},
          'properties': <String, dynamic>{},
        }],
      });
      await c.addSymbolLayer('origin-src', 'origin-layer',
          const SymbolLayerProperties(
            iconImage: 'origin-pin',
            iconAnchor: 'bottom',
            iconSize: 1.0,
            iconAllowOverlap: true,
          ));
    }

    // 5. Pin destino — encima de todo
    if (dLat != null && dLng != null) {
      await c.addGeoJsonSource('dest-src', {
        'type': 'FeatureCollection',
        'features': [{
          'type': 'Feature',
          'geometry': {'type': 'Point', 'coordinates': [dLng, dLat]},
          'properties': <String, dynamic>{},
        }],
      });
      await c.addSymbolLayer('dest-src', 'dest-layer',
          const SymbolLayerProperties(
            iconImage: 'dest-pin',
            iconAnchor: 'bottom',
            iconSize: 1.0,
            iconAllowOverlap: true,
          ));
    }

    _refreshDrivers();
    if (_isNegotiated) _refreshOffers();
    _syncTripRadius();
  }

  void _onPulseTick() {
    if (!_mapReady || _trip.originLat == null) return;
    final opacity = 0.08 + _pulseAnim.value * 0.22;
    if ((opacity - _lastPulseOpacity).abs() < 0.015) return;
    _lastPulseOpacity = opacity;
    _ctrl?.setLayerProperties('circle-fill', FillLayerProperties(fillOpacity: opacity));
  }

  // Refresca el viaje inmediatamente y actualiza el círculo si el radio cambió
  Future<void> _syncTripRadius() async {
    if (!mounted) return;
    final latest = await ref.read(tripsApiProvider).getActiveTrip();
    if (!mounted || latest == null) return;
    final prevRadius = _trip.searchRadiusKm;
    setState(() => _trip = latest);
    if (latest.searchRadiusKm != prevRadius &&
        latest.originLat != null && latest.originLng != null &&
        _mapReady) {
      final r = (latest.searchRadiusKm ?? 1.0).clamp(1.0, 20.0);
      _ctrl?.setGeoJsonSource('circle-src', _circleGeoJson(latest.originLat!, latest.originLng!, r));
    }
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  Future<void> _refreshDrivers() async {
    if (!_mapReady || !mounted) return;
    final lat = _trip.originLat;
    final lng = _trip.originLng;
    if (lat == null || lng == null) return;

    final radius  = (_trip.searchRadiusKm ?? 3.0).clamp(1.0, 20.0);
    final drivers = await ref.read(tripsApiProvider).getNearbyDrivers(lat, lng, radius);
    if (!mounted) return;
    setState(() => _drivers = drivers);
    _ctrl?.setGeoJsonSource('drivers-src', _driversGeoJson(drivers));
  }

  Future<void> _refreshOffers() async {
    if (!mounted) return;
    final offers = await ref.read(tripsApiProvider).getOffers(_trip.id);
    if (!mounted) return;
    setState(() => _offers = offers);
  }

  void _removeOffer(String offerId) {
    if (!mounted) return;
    setState(() {
      _offers = _offers.where((o) => o.offerId != offerId).toList();
      _offerArrivals.remove(offerId);
    });
  }

  Future<void> _selectOffer(DriverOffer offer) async {
    try {
      await ref.read(tripsApiProvider).selectOffer(_trip.id, offer.offerId);
      if (mounted) context.go('/trip/${_trip.id}');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('No se pudo confirmar la oferta. Intenta de nuevo.'),
          backgroundColor: Colors.red,
        ));
      }
    }
  }

  // ── GeoJSON helpers ───────────────────────────────────────────────────────

  Map<String, dynamic> _circleGeoJson(double lat, double lng, double radiusKm) {
    const steps = 64;
    final coords = <List<double>>[];
    for (var i = 0; i <= steps; i++) {
      final angle = (i / steps) * 2 * math.pi;
      final dLat  = (radiusKm / 111.32) * math.cos(angle);
      final dLng  = (radiusKm / (111.32 * math.cos(lat * math.pi / 180))) * math.sin(angle);
      coords.add([lng + dLng, lat + dLat]);
    }
    return {
      'type': 'FeatureCollection',
      'features': [{'type': 'Feature',
        'geometry': {'type': 'Polygon', 'coordinates': [coords]},
        'properties': {},
      }],
    };
  }

  Map<String, dynamic> _driversGeoJson(List<NearbyDriver> drivers) => {
    'type': 'FeatureCollection',
    'features': drivers.map((d) => {
      'type': 'Feature',
      'geometry': {'type': 'Point', 'coordinates': [d.lng, d.lat]},
      'properties': {'id': d.id},
    }).toList(),
  };

  // ── Canvas images ─────────────────────────────────────────────────────────

  Future<Uint8List> _buildTaxiIconBytes() async {
    // Cargar el WebP del logo (fondo transparente, solo el amarillo)
    final data = await rootBundle.load('assets/images/logo.webp');
    final codec = await ui.instantiateImageCodec(
      data.buffer.asUint8List(),
      targetWidth: 56,
      targetHeight: 56,
    );
    final frame = await codec.getNextFrame();
    final bd = await frame.image.toByteData(format: ui.ImageByteFormat.png);
    return bd!.buffer.asUint8List();
  }

  String get _elapsedLabel {
    final m = _elapsed.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = _elapsed.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final trip      = _trip;
    final lat       = trip.originLat;
    final lng       = trip.originLng;
    final bottomPad = MediaQuery.of(context).padding.bottom;

    return Scaffold(
      body: Stack(
        children: [
          // ── Mapa ─────────────────────────────────────────────────────────
          MapLibreMap(
            onMapCreated:          _onMapCreated,
            onStyleLoadedCallback: _onStyleLoaded,
            styleString:           'https://tiles.openfreemap.org/styles/liberty',
            initialCameraPosition: CameraPosition(
              target: lat != null && lng != null
                  ? LatLng(lat, lng)
                  : const LatLng(-0.2295, -78.5243),
              zoom: 13.5,
            ),
            myLocationEnabled:    false,
            trackCameraPosition:  false,
          ),

          // ── Top bar ───────────────────────────────────────────────────────
          Positioned(
            top:   MediaQuery.of(context).padding.top + 12,
            left:  16, right: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(28),
                boxShadow: [BoxShadow(
                  color: Colors.black.withValues(alpha: 0.12),
                  blurRadius: 10, offset: const Offset(0, 3),
                )],
              ),
              child: Row(children: [
                const SizedBox(
                  width: 18, height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.2, color: AppColors.primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _isNegotiated ? 'Esperando ofertas…' : 'Buscando conductor…',
                        style: AppTextStyles.label,
                      ),
                      Text(
                        'Tiempo de espera: $_elapsedLabel',
                        style: AppTextStyles.caption.copyWith(color: AppColors.gray400),
                      ),
                    ],
                  ),
                ),
                if (_drivers.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '${_drivers.length} taxis',
                      style: AppTextStyles.caption
                          .copyWith(color: AppColors.secondary),
                    ),
                  ),
              ]),
            ),
          ),

          // ── Panel inferior ────────────────────────────────────────────────
          Positioned(
            left: 0, right: 0, bottom: 0,
            child: _isNegotiated
                ? _NegotiatedPanel(
                    trip:          trip,
                    offers:        _offers,
                    offerArrivals: _offerArrivals,
                    bottomPad:     bottomPad,
                    onSelect:      _selectOffer,
                    onExpire:      _removeOffer,
                  )
                : _MeterPanel(trip: trip, bottomPad: bottomPad),
          ),
        ],
      ),
    );
  }
}

// ── Panel modo taxímetro (espera automática) ──────────────────────────────────

class _MeterPanel extends ConsumerStatefulWidget {
  const _MeterPanel({required this.trip, required this.bottomPad});
  final ActiveTrip trip;
  final double     bottomPad;
  @override
  ConsumerState<_MeterPanel> createState() => _MeterPanelState();
}

class _MeterPanelState extends ConsumerState<_MeterPanel> {
  bool _cancelling = false;

  Future<void> _doCancel(BuildContext ctx) async {
    setState(() => _cancelling = true);
    final router = GoRouter.of(ctx);
    try {
      await ref.read(tripsApiProvider).cancelTrip(widget.trip.id);
      ref.invalidate(activeTripProvider);
      if (mounted) router.go('/home');
    } on DioException catch (e) {
      if (!mounted) return;
      final status = e.response?.statusCode;
      if (status == 400 || status == 404) {
        router.go('/home');
      } else {
        setState(() => _cancelling = false);
        ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(
          content: Text('No se pudo cancelar. Intenta de nuevo.'),
          backgroundColor: Colors.red,
        ));
      }
    } catch (_) {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  @override
  Widget build(BuildContext context) => _PanelShell(
    bottomPad: widget.bottomPad,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _RouteRow(trip: widget.trip),
        const SizedBox(height: 16),
        const Divider(height: 1, color: AppColors.gray100),
        const SizedBox(height: 16),
        _CancelButton(
          cancelling: _cancelling,
          onCancel: () => _doCancel(context),
        ),
      ],
    ),
  );
}

// ── Panel modo negociado (lista InDrive de ofertas) ───────────────────────────

class _NegotiatedPanel extends ConsumerStatefulWidget {
  const _NegotiatedPanel({
    required this.trip,
    required this.offers,
    required this.offerArrivals,
    required this.bottomPad,
    required this.onSelect,
    required this.onExpire,
  });
  final ActiveTrip                 trip;
  final List<DriverOffer>          offers;
  final Map<String, DateTime>      offerArrivals;
  final double                     bottomPad;
  final void Function(DriverOffer) onSelect;
  final void Function(String)      onExpire;

  @override
  ConsumerState<_NegotiatedPanel> createState() => _NegotiatedPanelState();
}

class _NegotiatedPanelState extends ConsumerState<_NegotiatedPanel> {
  bool _cancelling = false;
  bool _adjusting  = false;
  late double _currentOffer;

  @override
  void initState() {
    super.initState();
    _currentOffer = widget.trip.clientOffer ?? 0;
  }

  Future<void> _doCancel(BuildContext ctx) async {
    setState(() => _cancelling = true);
    final router = GoRouter.of(ctx);
    try {
      await ref.read(tripsApiProvider).cancelTrip(widget.trip.id);
      ref.invalidate(activeTripProvider);
      if (mounted) router.go('/home');
    } on DioException catch (e) {
      if (!mounted) return;
      final status = e.response?.statusCode;
      if (status == 400 || status == 404) {
        router.go('/home');
      } else {
        setState(() => _cancelling = false);
        ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(
          content: Text('No se pudo cancelar. Intenta de nuevo.'),
          backgroundColor: Colors.red,
        ));
      }
    } catch (_) {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  Future<void> _adjust(bool increment) async {
    if (_adjusting) return;
    setState(() => _adjusting = true);
    final api = ref.read(tripsApiProvider);
    try {
      final updated = increment
          ? await api.incrementOffer(widget.trip.id)
          : await api.decrementOffer(widget.trip.id);
      if (mounted) setState(() => _currentOffer = updated);
    } on DioException catch (e) {
      if (mounted) {
        final msg = (e.response?.data as Map?)?['message'] ?? 'Error al ajustar oferta';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg.toString()), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _adjusting = false);
    }
  }

  @override
  Widget build(BuildContext context) => _PanelShell(
    bottomPad: widget.bottomPad,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Tu oferta + ajuste de precio
        Row(children: [
          const Icon(Icons.local_offer_outlined, size: 16, color: AppColors.gray500),
          const SizedBox(width: 8),
          Text(
            'Tu oferta: \$${_currentOffer.toStringAsFixed(2)}',
            style: AppTextStyles.label,
          ),
          const Spacer(),
          if (widget.offers.isEmpty) ...[
            _AdjustButton(
              icon: Icons.remove,
              onTap: _adjusting ? null : () => _adjust(false),
            ),
            const SizedBox(width: 6),
            _AdjustButton(
              icon: Icons.add,
              onTap: _adjusting ? null : () => _adjust(true),
            ),
            const SizedBox(width: 8),
          ],
          _RouteChip(trip: widget.trip),
        ]),

        const SizedBox(height: 12),

        // Lista de ofertas o estado vacío
        if (widget.offers.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(children: [
              const SizedBox(
                width: 16, height: 16,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: AppColors.primary),
              ),
              const SizedBox(width: 10),
              Text(
                'Esperando que los conductores respondan…',
                style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
              ),
            ]),
          )
        else ...[
          Text(
            '${widget.offers.length} oferta${widget.offers.length > 1 ? 's' : ''} recibida${widget.offers.length > 1 ? 's' : ''}',
            style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
          ),
          const SizedBox(height: 8),
          ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.40,
            ),
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: widget.offers.length,
              itemBuilder: (_, i) {
                final offer = widget.offers[i];
                return _OfferCard(
                  offer:              offer,
                  originAddress:      widget.trip.originAddress,
                  destinationAddress: widget.trip.destinationAddress,
                  arrivedAt:          widget.offerArrivals[offer.offerId] ?? DateTime.now(),
                  onAccept:           () => widget.onSelect(offer),
                  onIgnore:           () {
                    ref.read(tripsApiProvider).rejectOffer(
                      widget.trip.id, offer.offerId,
                    ).catchError((_) {});
                    widget.onExpire(offer.offerId);
                  },
                  onExpire:           () => widget.onExpire(offer.offerId),
                );
              },
            ),
          ),
        ],

        const SizedBox(height: 14),
        const Divider(height: 1, color: AppColors.gray100),
        const SizedBox(height: 12),

        _CancelButton(
          cancelling: _cancelling,
          onCancel: () => _doCancel(context),
        ),
      ],
    ),
  );
}

// ── Tarjeta de oferta — mismo lenguaje visual que el overlay del taxista ─────

class _OfferCard extends StatefulWidget {
  const _OfferCard({
    required this.offer,
    required this.originAddress,
    required this.destinationAddress,
    required this.arrivedAt,
    required this.onAccept,
    required this.onIgnore,
    required this.onExpire,
  });
  final DriverOffer  offer;
  final String       originAddress;
  final String       destinationAddress;
  final DateTime     arrivedAt;
  final VoidCallback onAccept;
  final VoidCallback onIgnore;
  final VoidCallback onExpire;

  @override
  State<_OfferCard> createState() => _OfferCardState();
}

class _OfferCardState extends State<_OfferCard>
    with SingleTickerProviderStateMixin {
  static const _totalSeconds = 20;

  late AnimationController _ctrl;
  late Animation<double>   _fade;
  late Animation<Offset>   _slide;
  late int  _seconds;
  Timer?    _countdown;
  bool      _loading = false;

  @override
  void initState() {
    super.initState();
    final elapsed = DateTime.now().difference(widget.arrivedAt).inSeconds;
    _seconds = (_totalSeconds - elapsed).clamp(0, _totalSeconds);

    _ctrl  = AnimationController(vsync: this, duration: const Duration(milliseconds: 320));
    _fade  = CurvedAnimation(parent: _ctrl, curve: Curves.easeOut);
    _slide = Tween<Offset>(begin: const Offset(0, 0.12), end: Offset.zero)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    _ctrl.forward();

    if (_seconds > 0) {
      _countdown = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        setState(() => _seconds--);
        if (_seconds <= 0) _exit(widget.onExpire);
      });
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _exit(widget.onExpire));
    }
  }

  @override
  void dispose() {
    _countdown?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _exit(VoidCallback then) async {
    _countdown?.cancel();
    if (mounted) await _ctrl.reverse();
    if (mounted) then();
  }

  @override
  Widget build(BuildContext context) {
    final offer      = widget.offer;
    final isCounter  = offer.isCounter;
    final priceColor = isCounter ? const Color(0xFFF57C00) : AppColors.success;

    return FadeTransition(
      opacity: _fade,
      child: SlideTransition(
        position: _slide,
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            boxShadow: const [
              BoxShadow(color: Colors.black12, blurRadius: 20, offset: Offset(0, -4)),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 12),
              // Handle bar
              Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: AppColors.gray200,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),

              // ── Info del conductor ─────────────────────────────────────
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(children: [
                  // Avatar
                  Container(
                    width: 48, height: 48,
                    decoration: const BoxDecoration(
                      color: AppColors.primaryLight,
                      shape: BoxShape.circle,
                    ),
                    child: offer.driverPhoto != null
                        ? ClipOval(
                            child: CachedNetworkImage(
                              imageUrl: offer.driverPhoto!,
                              width: 48, height: 48, fit: BoxFit.cover,
                              errorWidget: (_, __, ___) => const Icon(
                                  Icons.person, color: AppColors.secondary, size: 26),
                              placeholder: (_, __) => const SizedBox.shrink(),
                            ),
                          )
                        : const Icon(Icons.person, color: AppColors.secondary, size: 26),
                  ),
                  const SizedBox(width: 12),
                  // Nombre + rating + placa
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(offer.driverName, style: AppTextStyles.label),
                        Row(children: [
                          if (offer.driverRating != null) ...[
                            const Icon(Icons.star_rounded, size: 14, color: Color(0xFFF59E0B)),
                            const SizedBox(width: 3),
                            Text(
                              offer.driverRating!.toStringAsFixed(1),
                              style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
                            ),
                            const SizedBox(width: 8),
                          ],
                          if (offer.vehiclePlate != null) ...[
                            const Icon(Icons.directions_car_outlined, size: 13, color: AppColors.gray400),
                            const SizedBox(width: 3),
                            Text(
                              offer.vehiclePlate!,
                              style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
                            ),
                          ],
                        ]),
                      ],
                    ),
                  ),
                  // Precio + countdown
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: priceColor,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '\$${offer.amount.toStringAsFixed(2)}',
                          style: AppTextStyles.label.copyWith(
                            fontWeight: FontWeight.w800,
                            color: isCounter ? Colors.white : AppColors.secondary,
                          ),
                        ),
                      ),
                      if (isCounter)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            'Contraoferta',
                            style: TextStyle(
                              fontSize: 10, color: priceColor,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      const SizedBox(height: 4),
                      _CountdownRing(seconds: _seconds, total: _totalSeconds),
                    ],
                  ),
                ]),
              ),

              const SizedBox(height: 14),
              const Divider(height: 1, color: Color(0xFFEEEEEE)),
              const SizedBox(height: 14),

              // ── Ruta ──────────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(children: [
                  _OfferRouteRow(
                    icon:  Icons.radio_button_checked,
                    color: AppColors.success,
                    text:  widget.originAddress.isEmpty
                               ? 'Tu ubicación'
                               : widget.originAddress,
                  ),
                  Padding(
                    padding: const EdgeInsets.only(left: 7),
                    child: Container(height: 14, width: 2, color: AppColors.gray200),
                  ),
                  _OfferRouteRow(
                    icon:  Icons.location_on,
                    color: AppColors.error,
                    text:  widget.destinationAddress,
                  ),
                ]),
              ),

              // Distancia al origen / ETA
              if (offer.distanceToOriginKm != null || offer.etaMin != null) ...[
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Row(children: [
                    const Icon(Icons.route_outlined, size: 13, color: AppColors.gray400),
                    const SizedBox(width: 6),
                    Text(
                      [
                        if (offer.distanceToOriginKm != null)
                          '${offer.distanceToOriginKm!.toStringAsFixed(1)} km al origen',
                        if (offer.etaMin != null) '~${offer.etaMin} min',
                      ].join(' · '),
                      style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
                    ),
                  ]),
                ),
              ],

              const SizedBox(height: 16),

              // ── Botones ────────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                child: Row(children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _loading ? null : () => _exit(widget.onIgnore),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: AppColors.gray300),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        padding: const EdgeInsets.symmetric(vertical: 13),
                      ),
                      child: Text('Ignorar',
                          style: AppTextStyles.label.copyWith(color: AppColors.gray500)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: _loading ? null : () {
                        setState(() => _loading = true);
                        widget.onAccept();
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        elevation: 0,
                      ),
                      child: _loading
                          ? const SizedBox(width: 18, height: 18,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.black))
                          : Text(
                              'Aceptar \$${offer.amount.toStringAsFixed(2)}',
                              style: AppTextStyles.label.copyWith(fontWeight: FontWeight.w700),
                            ),
                    ),
                  ),
                ]),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Helpers visuales ──────────────────────────────────────────────────────────

class _OfferRouteRow extends StatelessWidget {
  const _OfferRouteRow({required this.icon, required this.color, required this.text});
  final IconData icon;
  final Color    color;
  final String   text;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Icon(icon, size: 16, color: color),
      const SizedBox(width: 10),
      Expanded(
        child: Text(
          text,
          style: AppTextStyles.body,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
      ),
    ],
  );
}

class _CountdownRing extends StatelessWidget {
  const _CountdownRing({required this.seconds, required this.total});
  final int seconds;
  final int total;

  @override
  Widget build(BuildContext context) {
    final progress = (seconds / total).clamp(0.0, 1.0);
    return SizedBox(
      width: 38, height: 38,
      child: Stack(alignment: Alignment.center, children: [
        CircularProgressIndicator(
          value: progress,
          strokeWidth: 3,
          backgroundColor: AppColors.gray100,
          valueColor: AlwaysStoppedAnimation(
            progress > 0.4 ? AppColors.primary : AppColors.error,
          ),
        ),
        Text(
          '$seconds',
          style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.w700),
        ),
      ]),
    );
  }
}

// ── Widgets compartidos ───────────────────────────────────────────────────────

class _PanelShell extends StatelessWidget {
  const _PanelShell({required this.child, required this.bottomPad});
  final Widget child;
  final double bottomPad;

  @override
  Widget build(BuildContext context) => Container(
    decoration: const BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      boxShadow: [
        BoxShadow(color: Colors.black12, blurRadius: 20, offset: Offset(0, -4))
      ],
    ),
    padding: EdgeInsets.fromLTRB(20, 12, 20, bottomPad + 16),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Center(
          child: Container(
            width: 36, height: 4,
            decoration: BoxDecoration(
              color: AppColors.gray300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ),
        const SizedBox(height: 14),
        child,
      ],
    ),
  );
}

class _RouteChip extends StatelessWidget {
  const _RouteChip({required this.trip});
  final ActiveTrip trip;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      const Icon(Icons.radio_button_checked, size: 10, color: AppColors.success),
      const SizedBox(width: 4),
      SizedBox(
        width: 80,
        child: Text(
          trip.destinationAddress,
          style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
    ],
  );
}

class _RouteRow extends StatelessWidget {
  const _RouteRow({required this.trip});
  final ActiveTrip trip;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Row(children: [
        const Icon(Icons.radio_button_checked, size: 15, color: AppColors.success),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            trip.originAddress.isEmpty ? 'Tu ubicación' : trip.originAddress,
            style: AppTextStyles.body, maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ]),
      Padding(
        padding: const EdgeInsets.only(left: 6.5),
        child: Container(width: 1, height: 14, color: AppColors.gray200),
      ),
      Row(children: [
        const Icon(Icons.location_on, size: 15, color: AppColors.error),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            trip.destinationAddress,
            style: AppTextStyles.body, maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ]),
    ],
  );
}

class _AdjustButton extends StatelessWidget {
  const _AdjustButton({required this.icon, this.onTap});
  final IconData    icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: 28, height: 28,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: onTap != null ? AppColors.primary : AppColors.gray100,
      ),
      child: Icon(icon, size: 16, color: onTap != null ? Colors.black : AppColors.gray500),
    ),
  );
}

class _CancelButton extends StatelessWidget {
  const _CancelButton({required this.cancelling, required this.onCancel});
  final bool          cancelling;
  final VoidCallback  onCancel;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: double.infinity,
    height: 48,
    child: OutlinedButton(
      style: OutlinedButton.styleFrom(
        side: const BorderSide(color: AppColors.error),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      onPressed: cancelling ? null : onCancel,
      child: cancelling
          ? const SizedBox(width: 18, height: 18,
              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.error))
          : Text('Cancelar solicitud',
              style: AppTextStyles.label.copyWith(color: AppColors.error)),
    ),
  );
}
