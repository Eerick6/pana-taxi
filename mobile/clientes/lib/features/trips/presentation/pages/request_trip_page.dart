import 'dart:async';
import 'dart:math';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../../../../core/services/geocoding_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/datasources/trips_api.dart';
import '../../domain/entities/fare_estimate.dart';
import '../../domain/entities/place_result.dart';
import '../../domain/entities/search_suggestion.dart';
import '../../../home/domain/entities/saved_location.dart';
import '../../../home/presentation/providers/saved_locations_provider.dart';
import '../providers/fare_estimate_provider.dart';
import '../providers/trip_route_provider.dart';

enum _SearchTarget { none, origin, destination }

// ── Canvas markers ────────────────────────────────────────────────────────────

Future<Uint8List> _buildFlatPin(
  Color color, {
  double w = 56,
  double h = 78,
  bool isOrigin = true,
}) async {
  final cx = w / 2;
  final headR = w * 0.36;
  final headCY = headR + 4;
  final rec = ui.PictureRecorder();
  final canvas = Canvas(rec, Rect.fromLTWH(0, 0, w, h));

  final path = Path()
    ..addOval(Rect.fromCircle(center: Offset(cx, headCY), radius: headR))
    ..moveTo(cx - headR * 0.55, headCY + headR - 5)
    ..lineTo(cx, h - 6)
    ..lineTo(cx + headR * 0.55, headCY + headR - 5)
    ..close();
  canvas.drawPath(path, Paint()..color = color);

  canvas.drawCircle(
    Offset(cx, headCY),
    headR,
    Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0,
  );

  final iconPaint = Paint()
    ..color = Colors.white
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2.5
    ..strokeCap = StrokeCap.round
    ..strokeJoin = StrokeJoin.round;

  final s = headR * 0.38;
  if (isOrigin) {
    canvas.drawPath(
      Path()
        ..moveTo(cx - s, headCY + s * 0.2)
        ..lineTo(cx - s * 0.1, headCY + s * 0.9)
        ..lineTo(cx + s, headCY - s * 0.7),
      iconPaint,
    );
  } else {
    final d = s * 0.7;
    canvas.drawLine(
      Offset(cx - d, headCY - d),
      Offset(cx + d, headCY + d),
      iconPaint,
    );
    canvas.drawLine(
      Offset(cx + d, headCY - d),
      Offset(cx - d, headCY + d),
      iconPaint,
    );
  }

  final img = await rec.endRecording().toImage(w.toInt(), h.toInt());
  final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
  return bytes!.buffer.asUint8List();
}

Future<Uint8List> _buildOriginPinBytes() =>
    _buildFlatPin(const Color(0xFF22C55E), w: 72, h: 100, isOrigin: true);

Future<Uint8List> _buildDestPinBytes() =>
    _buildFlatPin(const Color(0xFFEF4444), w: 80, h: 112, isOrigin: false);

// ── Page ──────────────────────────────────────────────────────────────────────

class RequestTripPage extends ConsumerStatefulWidget {
  const RequestTripPage({super.key});

  @override
  ConsumerState<RequestTripPage> createState() => _RequestTripPageState();
}

class _RequestTripPageState extends ConsumerState<RequestTripPage>
    with SingleTickerProviderStateMixin {
  // Mapa
  MapLibreMapController? _ctrl;
  bool _mapReady = false;
  bool _routeAdded = false;

  // Origen
  bool _loadingOrigin = true;
  ({double lat, double lng, String? address})? _pendingOrigin;

  // Estimado
  bool _loadingEstimate = false;

  // Pin picker inline
  bool _pinPickMode = false;
  bool _pinPickIsOrigin = false;
  bool _pinPickLoading = false;
  String? _pinPickAddress;
  // Lugar original al entrar en modo confirmación desde búsqueda/guardado —
  // si el usuario confirma sin arrastrar, se usa tal cual (conserva
  // shortName real: "Casa", nombre del POI, etc.) en vez de derivarlo
  // del texto de dirección.
  PlaceResult? _pinPickOriginalPlace;
  bool _pinPickMoved = false;
  bool _pinPickSkipNextIdle = false;
  Uint8List? _originPinBytes;
  Uint8List? _destPinBytes;
  late AnimationController _pinFloatCtrl;
  late Animation<double> _pinFloat;

  // Búsqueda inline
  _SearchTarget _target = _SearchTarget.none;
  final _searchCtrl = TextEditingController();
  final _searchFocus = FocusNode();
  List<SearchSuggestion> _suggestions = [];
  bool _suggesting = false;
  Timer? _debounce;
  Timer? _geocodeDebounce;

  @override
  void initState() {
    super.initState();
    _pinFloatCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 850),
    );
    _pinFloat = Tween<double>(
      begin: -5.0,
      end: 5.0,
    ).animate(CurvedAnimation(parent: _pinFloatCtrl, curve: Curves.easeInOut));
    if (ref.read(tripRouteProvider).origin == null) {
      _kickGps(); // arranca en paralelo con la carga del mapa
    } else {
      _loadingOrigin = false;
    }
  }

  @override
  void dispose() {
    _pinFloatCtrl.dispose();
    _searchCtrl.dispose();
    _searchFocus.dispose();
    _debounce?.cancel();
    _geocodeDebounce?.cancel();
    super.dispose();
  }

  // ── Mapa ──────────────────────────────────────────────────────────────────

  Future<void> _onMapCreated(MapLibreMapController c) async {
    _ctrl = c;
    _originPinBytes = await _buildOriginPinBytes();
    _destPinBytes = await _buildDestPinBytes();
    await c.addImage('origin-pin', _originPinBytes!);
    await c.addImage('dest-pin', _destPinBytes!);
    await c.addGeoJsonSource('origin-pin-src', _emptyGeoJson());
    await c.addGeoJsonSource('dest-pin-src', _emptyGeoJson());
    await c.addSymbolLayer(
      'origin-pin-src',
      'origin-pin-layer',
      const SymbolLayerProperties(
        iconImage: 'origin-pin',
        iconAnchor: 'bottom',
        iconSize: 1.0,
        iconAllowOverlap: true,
      ),
    );
    await c.addSymbolLayer(
      'dest-pin-src',
      'dest-pin-layer',
      const SymbolLayerProperties(
        iconImage: 'dest-pin',
        iconAnchor: 'bottom',
        iconSize: 1.0,
        iconAllowOverlap: true,
      ),
    );
    _mapReady = true;

    // Restaurar ruta si ya existe (usuario regresó a esta pantalla)
    final route = ref.read(tripRouteProvider);
    final estimate = ref.read(fareEstimateProvider);
    final dest = route.stops.firstOrNull;

    if (route.origin != null) {
      await _placeOriginMarker(route.origin!.lat, route.origin!.lng);
      if (dest == null) _cam(route.origin!.lat, route.origin!.lng, 15);
      if (mounted) setState(() => _loadingOrigin = false);
    }
    if (dest != null) await _placeDestMarker(dest.lat, dest.lng);
    if (estimate?.routeGeometry != null &&
        route.origin != null &&
        dest != null) {
      await _drawRoute(estimate!.routeGeometry!);
      await _fitBounds(route.origin!, dest);
    }

    // Si el GPS ya resolvió mientras el mapa cargaba, aplicar ahora
    if (_pendingOrigin != null && mounted) {
      final p = _pendingOrigin!;
      _pendingOrigin = null;
      await _applyGpsOrigin(p.lat, p.lng, p.address);
    }
  }

  void _cam(double lat, double lng, double zoom) =>
      _ctrl?.animateCamera(CameraUpdate.newLatLngZoom(LatLng(lat, lng), zoom));

  Future<void> _placeOriginMarker(double lat, double lng) async =>
      _ctrl?.setGeoJsonSource('origin-pin-src', _pinGeoJson(lat, lng));

  Future<void> _placeDestMarker(double lat, double lng) async =>
      _ctrl?.setGeoJsonSource('dest-pin-src', _pinGeoJson(lat, lng));

  Map<String, dynamic> _emptyGeoJson() => {
    'type': 'FeatureCollection',
    'features': <dynamic>[],
  };

  Map<String, dynamic> _pinGeoJson(double lat, double lng) => {
    'type': 'FeatureCollection',
    'features': [
      {
        'type': 'Feature',
        'geometry': {
          'type': 'Point',
          'coordinates': [lng, lat],
        },
        'properties': <String, dynamic>{},
      },
    ],
  };

  Future<void> _drawRoute(Map<String, dynamic> geometry) async {
    if (_ctrl == null) return;
    final geojson = {
      'type': 'FeatureCollection',
      'features': [
        {
          'type': 'Feature',
          'geometry': geometry,
          'properties': <String, dynamic>{},
        },
      ],
    };
    if (_routeAdded) {
      await _ctrl!.setGeoJsonSource('route-src', geojson);
    } else {
      await _ctrl!.addGeoJsonSource('route-src', geojson);
      // Sombra difusa — debajo de los pins
      await _ctrl!.addLineLayer(
        'route-src',
        'route-shadow',
        const LineLayerProperties(
          lineColor: '#000000',
          lineWidth: 18.0,
          lineOpacity: 0.12,
          lineBlur: 5.0,
          lineCap: 'round',
          lineJoin: 'round',
        ),
        belowLayerId: 'origin-pin-layer',
      );
      // Borde/casing oscuro — debajo de los pins
      await _ctrl!.addLineLayer(
        'route-src',
        'route-casing',
        const LineLayerProperties(
          lineColor: '#1A52C4',
          lineWidth: 11.0,
          lineCap: 'round',
          lineJoin: 'round',
        ),
        belowLayerId: 'origin-pin-layer',
      );
      // Línea principal — debajo de los pins
      await _ctrl!.addLineLayer(
        'route-src',
        'route-line',
        const LineLayerProperties(
          lineColor: '#5689FB',
          lineWidth: 7.0,
          lineCap: 'round',
          lineJoin: 'round',
        ),
        belowLayerId: 'origin-pin-layer',
      );
      _routeAdded = true;
    }
  }

  Future<void> _fitBounds(PlaceResult o, PlaceResult d) async {
    if (_ctrl == null) return;
    await _ctrl!.animateCamera(
      CameraUpdate.newLatLngBounds(
        LatLngBounds(
          southwest: LatLng(min(o.lat, d.lat), min(o.lng, d.lng)),
          northeast: LatLng(max(o.lat, d.lat), max(o.lng, d.lng)),
        ),
        left: 60,
        top: 190,
        right: 60,
        bottom: 250,
      ),
    );
  }

  // ── Detección de origen ────────────────────────────────────────────────────

  // Obtiene posición GPS y aplica el origen con su nombre real.
  // Espera hasta 4 s el geocoding antes de mostrar "Ubicación actual".
  Future<void> _kickGps() async {
    // Animar cámara con last known mientras carga la posición real
    try {
      final last = await Geolocator.getLastKnownPosition();
      if (last != null && _mapReady && mounted) {
        _cam(last.latitude, last.longitude, 15);
      }
    } catch (_) {}

    final pos = await _fetchCurrentPos();
    if (pos == null || !mounted) {
      if (mounted) setState(() => _loadingOrigin = false);
      return;
    }

    // Lanzar geocoding en paralelo — esperar hasta 4 s antes de usar placeholder
    final geocodeFuture = ref
        .read(geocodingServiceProvider)
        .reverseGeocode(pos.latitude, pos.longitude);

    String? address;
    try {
      address = await geocodeFuture.timeout(const Duration(seconds: 4));
    } catch (_) {}

    // Aplicar con nombre real si llegó, o placeholder si tardó demasiado
    if (_mapReady) {
      await _applyGpsOrigin(pos.latitude, pos.longitude, address);
    } else {
      _pendingOrigin = (
        lat: pos.latitude,
        lng: pos.longitude,
        address: address,
      );
    }

    // Si el geocoding no llegó a tiempo, actualizar en cuanto llegue
    if (address == null) {
      final late = await geocodeFuture;
      if (!mounted || late == null || late.isEmpty) return;
      if (ref.read(tripRouteProvider).origin == null) return;
      final current = ref.read(tripRouteProvider).origin!;
      ref
          .read(tripRouteProvider.notifier)
          .setOrigin(
            PlaceResult(
              displayName: late,
              shortName: _short(late),
              lat: current.lat,
              lng: current.lng,
            ),
          );
    }
  }

  Future<Position?> _fetchCurrentPos() async {
    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
        ),
      ).timeout(const Duration(seconds: 12));
    } catch (_) {
      return null;
    }
  }

  Future<void> _applyGpsOrigin(double lat, double lng, String? address) async {
    if (!mounted) return;
    final name = (address != null && address.isNotEmpty)
        ? address
        : 'Ubicación actual';
    ref
        .read(tripRouteProvider.notifier)
        .setOrigin(
          PlaceResult(
            displayName: name,
            shortName: _short(name),
            lat: lat,
            lng: lng,
          ),
        );
    await _placeOriginMarker(lat, lng);
    _cam(lat, lng, 15);
    if (mounted) setState(() => _loadingOrigin = false);
  }

  String _short(String full) {
    final parts = full.split(', ');
    return parts.length >= 2 ? '${parts[0]}, ${parts[1]}' : parts[0];
  }

  // ── Búsqueda inline ────────────────────────────────────────────────────────

  void _openSearch(_SearchTarget target) {
    setState(() {
      _target = target;
      _suggestions = [];
      _searchCtrl.clear();
    });
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => _searchFocus.requestFocus(),
    );
  }

  void _closeSearch() {
    _debounce?.cancel();
    _searchFocus.unfocus();
    setState(() {
      _target = _SearchTarget.none;
      _suggestions = [];
    });
  }

  void _onSearchChanged(String v) {
    _debounce?.cancel();
    if (v.trim().length < 2) {
      setState(() {
        _suggestions = [];
        _suggesting = false;
      });
      return;
    }
    setState(() => _suggesting = true);
    _debounce = Timer(const Duration(milliseconds: 200), () async {
      final origin = ref.read(tripRouteProvider).origin;
      final results = await ref
          .read(geocodingServiceProvider)
          .suggest(v, lat: origin?.lat, lng: origin?.lng);
      if (mounted) {
        setState(() {
          _suggestions = results;
          _suggesting = false;
        });
      }
    });
  }

  Future<void> _selectSuggestion(SearchSuggestion s) async {
    final target = _target;
    _searchFocus.unfocus();
    setState(() {
      _target = _SearchTarget.none;
      _suggestions = [];
      _suggesting = true;
    });

    PlaceResult? place = s.resolvedPlace;
    if (place == null && s.placeId != null) {
      place = await ref
          .read(geocodingServiceProvider)
          .getPlaceDetails(s.placeId!);
    }

    if (!mounted) return;
    setState(() => _suggesting = false);
    if (place != null) await _enterConfirmMode(place, target);
  }

  void _selectSaved(SavedLocation loc) {
    final target = _target;
    final place = PlaceResult(
      displayName: loc.address,
      shortName: loc.label,
      lat: loc.lat,
      lng: loc.lng,
    );
    _closeSearch();
    _enterConfirmMode(place, target);
  }

  // Entra en modo confirmación (mismo overlay del pin picker manual) para
  // un lugar recién elegido por búsqueda o guardado — no dispara el
  // estimado/Mapbox hasta que el usuario confirme. Si arrastra el mapa
  // para ajustar, se comporta igual que el pin picker manual.
  Future<void> _enterConfirmMode(PlaceResult place, _SearchTarget target) async {
    final isOrigin = target == _SearchTarget.origin;
    _ctrl?.animateCamera(
      CameraUpdate.newLatLngZoom(LatLng(place.lat, place.lng), 17),
    );
    if (isOrigin) {
      await _ctrl?.setGeoJsonSource('origin-pin-src', _emptyGeoJson());
    } else {
      await _ctrl?.setGeoJsonSource('dest-pin-src', _emptyGeoJson());
    }
    _pinFloatCtrl.repeat(reverse: true);
    setState(() {
      _pinPickMode = true;
      _pinPickIsOrigin = isOrigin;
      _pinPickAddress = place.displayName;
      _pinPickLoading = false;
      _pinPickOriginalPlace = place;
      _pinPickMoved = false;
      // La animación de cámara hacia `place` dispara su propio onCameraIdle;
      // ya tenemos la dirección real de Places/guardados, así que ese primer
      // idle no debe disparar un reverse-geocode que la pise.
      _pinPickSkipNextIdle = true;
    });
  }

  Future<void> _applyPlace(PlaceResult place, _SearchTarget target) async {
    if (target == _SearchTarget.origin) {
      ref.read(tripRouteProvider.notifier).setOrigin(place);
      final dest = ref.read(tripRouteProvider).stops.firstOrNull;
      await Future.wait([
        _placeOriginMarker(
          place.lat,
          place.lng,
        ).then((_) => _cam(place.lat, place.lng, 15)),
        if (dest != null) _fetchEstimate(place, dest),
      ]);
    } else {
      final current = ref.read(tripRouteProvider);
      if (current.stops.isEmpty) {
        ref.read(tripRouteProvider.notifier).addStop(place);
      } else {
        ref.read(tripRouteProvider.notifier).updateStop(0, place);
      }
      final origin = ref.read(tripRouteProvider).origin;
      await Future.wait([
        _placeDestMarker(place.lat, place.lng),
        if (origin != null) _fetchEstimate(origin, place),
      ]);
    }
  }

  // ── Pin picker inline ─────────────────────────────────────────────────────

  Future<void> _enterPinPickMode(bool isOrigin) async {
    final route = ref.read(tripRouteProvider);
    final current = isOrigin ? route.origin : route.stops.firstOrNull;
    if (current != null) {
      _ctrl?.animateCamera(
        CameraUpdate.newLatLngZoom(LatLng(current.lat, current.lng), 17),
      );
    }
    // Oculta el pin del mapa — el overlay fijo lo reemplaza durante el pick
    if (isOrigin)
      await _ctrl?.setGeoJsonSource('origin-pin-src', _emptyGeoJson());
    if (!isOrigin)
      await _ctrl?.setGeoJsonSource('dest-pin-src', _emptyGeoJson());
    _pinFloatCtrl.repeat(reverse: true);
    setState(() {
      _pinPickMode = true;
      _pinPickIsOrigin = isOrigin;
      _pinPickAddress = null;
      _pinPickLoading = false;
      _pinPickOriginalPlace = null;
      _pinPickMoved = false;
      _pinPickSkipNextIdle = false;
    });
  }

  Future<void> _onMapIdle() async {
    if (!_pinPickMode) return;
    if (_pinPickSkipNextIdle) {
      _pinPickSkipNextIdle = false;
      return;
    }
    _pinPickMoved = true;
    _geocodeDebounce?.cancel();
    _geocodeDebounce = Timer(const Duration(milliseconds: 600), _geocodeCamera);
  }

  Future<void> _geocodeCamera() async {
    if (!mounted || !_pinPickMode) return;
    final pos = _ctrl?.cameraPosition?.target;
    if (pos == null) return;
    setState(() => _pinPickLoading = true);
    // Solo reverse geocode — el overlay fijo ya muestra la posición exacta
    final addr = await ref
        .read(geocodingServiceProvider)
        .reverseGeocode(pos.latitude, pos.longitude);
    if (!mounted) return;
    setState(() {
      if (addr != null) _pinPickAddress = addr;
      _pinPickLoading = false;
    });
  }

  Future<void> _confirmPinPick() async {
    // Cancelar geocoding pendiente — no queremos que sobreescriba después
    _geocodeDebounce?.cancel();

    final target = _pinPickIsOrigin ? _SearchTarget.origin : _SearchTarget.destination;

    // Si venimos de búsqueda/guardado y el usuario no arrastró el mapa,
    // usar el lugar original tal cual — conserva shortName real ("Casa",
    // nombre del POI) en vez de derivarlo del texto de dirección.
    final original = _pinPickOriginalPlace;
    if (original != null && !_pinPickMoved) {
      _pinFloatCtrl.stop();
      setState(() {
        _pinPickMode = false;
        _pinPickOriginalPlace = null;
      });
      await _applyPlace(original, target);
      return;
    }

    final pos = _ctrl?.cameraPosition?.target;
    if (pos == null) return;

    // Salir del modo pick y aplicar posición inmediatamente con nombre provisional
    final name = _pinPickAddress ?? '';
    final shortName = name.isNotEmpty ? _short(name) : '';
    _pinFloatCtrl.stop();
    setState(() {
      _pinPickMode = false;
      _pinPickOriginalPlace = null;
    });

    await _applyPlace(
      PlaceResult(
        displayName: name.isNotEmpty ? name : '...',
        shortName: shortName.isNotEmpty ? shortName : '...',
        lat: pos.latitude,
        lng: pos.longitude,
      ),
      target,
    );

    // Geocoding en background para obtener nombre real si no lo tenemos
    if (name.isEmpty) {
      final address = await ref
          .read(geocodingServiceProvider)
          .reverseGeocode(pos.latitude, pos.longitude);
      if (!mounted || address == null || address.isEmpty) return;
      if (_pinPickIsOrigin) {
        final o = ref.read(tripRouteProvider).origin;
        if (o == null) return;
        ref
            .read(tripRouteProvider.notifier)
            .setOrigin(
              PlaceResult(
                displayName: address,
                shortName: _short(address),
                lat: o.lat,
                lng: o.lng,
              ),
            );
      } else {
        final d = ref.read(tripRouteProvider).stops.firstOrNull;
        if (d == null) return;
        ref
            .read(tripRouteProvider.notifier)
            .updateStop(
              0,
              PlaceResult(
                displayName: address,
                shortName: _short(address),
                lat: d.lat,
                lng: d.lng,
              ),
            );
      }
    }
  }

  Future<void> _clearMapDest() async {
    if (_ctrl == null) return;
    await _ctrl!.setGeoJsonSource('dest-pin-src', _emptyGeoJson());
    if (_routeAdded) {
      await _ctrl!.setGeoJsonSource('route-src', {
        'type': 'FeatureCollection',
        'features': <dynamic>[],
      });
    }
  }

  // ── Estimado ───────────────────────────────────────────────────────────────

  // Espera a que _onMapCreated termine de crear sus capas nativas
  // (addImage/addGeoJsonSource/addSymbolLayer) antes de intentar dibujar
  // sobre ellas. Sin esto, _drawRoute podía llamar addLineLayer con un
  // belowLayerId que el mapa todavía no había terminado de crear, lo que
  // MapLibre reporta como excepción — antes esa excepción se disfrazaba de
  // "no se pudo calcular la ruta" porque compartía try/catch con el fetch.
  Future<void> _waitForMapReady({
    Duration timeout = const Duration(seconds: 5),
  }) async {
    final deadline = DateTime.now().add(timeout);
    while (!_mapReady && DateTime.now().isBefore(deadline)) {
      await Future.delayed(const Duration(milliseconds: 50));
    }
  }

  Future<void> _fetchEstimate(PlaceResult origin, PlaceResult dest) async {
    setState(() => _loadingEstimate = true);
    ref.read(fareEstimateProvider.notifier).state = null;
    try {
      final estimate = await ref
          .read(tripsApiProvider)
          .getFareEstimate(
            originLat: origin.lat,
            originLng: origin.lng,
            destLat: dest.lat,
            destLng: dest.lng,
          );
      if (!mounted) return;
      ref.read(fareEstimateProvider.notifier).state = estimate;

      // Dibujar en el mapa es una operación aparte: si falla, no debe
      // mostrarse como un error del cálculo de tarifa, que ya tuvo éxito.
      try {
        await _waitForMapReady();
        if (!mounted) return;
        if (estimate.routeGeometry != null) {
          await _drawRoute(estimate.routeGeometry!);
        }
        await _fitBounds(origin, dest);
      } catch (e) {
        debugPrint('[fetchEstimate] error dibujando ruta en el mapa: $e');
      }
    } catch (e) {
      debugPrint('[fetchEstimate] error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No se pudo calcular la ruta'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingEstimate = false);
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final route = ref.watch(tripRouteProvider);
    final estimate = ref.watch(fareEstimateProvider);
    final dest = route.stops.firstOrNull;
    final saved = ref.watch(savedLocationsProvider).valueOrNull ?? [];

    return Scaffold(
      body: Stack(
        children: [
          // Mapa — GestureDetector cierra la búsqueda al tocar el mapa.
          // El pin de "pick inline" se recorta junto con el mapa en el mismo
          // Padding: si se recortaran por separado, el pin quedaría desalineado
          // del centro real que reporta `cameraPosition.target` en _onMapIdle.
          Padding(
            padding: EdgeInsets.only(bottom: MediaQuery.of(context).padding.bottom),
            child: Stack(
              children: [
                GestureDetector(
                  onTap: _target != _SearchTarget.none ? _closeSearch : null,
                  child: MapLibreMap(
                    onMapCreated: _onMapCreated,
                    onCameraIdle: _onMapIdle,

                    initialCameraPosition: const CameraPosition(
                      target: LatLng(-0.2295, -78.5243),
                      zoom: 13,
                    ),
                    styleString: 'https://tiles.openfreemap.org/styles/liberty',
                    myLocationEnabled: false,
                    trackCameraPosition: true,
                  ),
                ),

                // ── Pin pick inline ──────────────────────────────────────────
                if (_pinPickMode && _originPinBytes != null && _destPinBytes != null)
                  Positioned.fill(
                    child: IgnorePointer(
                      child: AnimatedBuilder(
                        animation: _pinFloat,
                        builder: (ctx, _) {
                          final dpr = MediaQuery.of(ctx).devicePixelRatio;
                          final w = (_pinPickIsOrigin ? 72.0 : 80.0) / dpr;
                          final h = (_pinPickIsOrigin ? 100.0 : 112.0) / dpr;
                          return Center(
                            child: Transform.translate(
                              offset: Offset(0, -h / 2 + _pinFloat.value),
                              child: Image.memory(
                                _pinPickIsOrigin
                                    ? _originPinBytes!
                                    : _destPinBytes!,
                                width: w,
                                height: h,
                                gaplessPlayback: true,
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // ── Overlay pin pick inline (resto de controles) ──────────────────
          if (_pinPickMode) ...[

            // Botón atrás
            Positioned(
              top: MediaQuery.of(context).padding.top + 8,
              left: 12,
              child: SafeArea(
                child: Material(
                  color: Colors.white,
                  shape: const CircleBorder(),
                  elevation: 4,
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () {
                      _pinFloatCtrl.stop();
                      // Si había un punto ya puesto antes de entrar en modo
                      // confirmación (re-pick), restaurar su marcador — lo
                      // ocultamos al entrar y nunca se aplicó nada nuevo.
                      final route = ref.read(tripRouteProvider);
                      final existing = _pinPickIsOrigin
                          ? route.origin
                          : route.stops.firstOrNull;
                      if (existing != null) {
                        if (_pinPickIsOrigin) {
                          _placeOriginMarker(existing.lat, existing.lng);
                        } else {
                          _placeDestMarker(existing.lat, existing.lng);
                        }
                      }
                      setState(() {
                        _pinPickMode = false;
                        _pinPickOriginalPlace = null;
                      });
                    },
                    child: const Padding(
                      padding: EdgeInsets.all(10),
                      child: Icon(Icons.arrow_back_ios_new, size: 18),
                    ),
                  ),
                ),
              ),
            ),
            // Panel inferior confirmar
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: Container(
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black12,
                      blurRadius: 12,
                      offset: Offset(0, -4),
                    ),
                  ],
                ),
                padding: EdgeInsets.fromLTRB(
                  20,
                  20,
                  20,
                  MediaQuery.of(context).padding.bottom + 20,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _pinPickIsOrigin
                          ? 'Punto de origen'
                          : 'Destino seleccionado',
                      style: AppTextStyles.caption.copyWith(
                        color: AppColors.gray400,
                      ),
                    ),
                    const SizedBox(height: 6),
                    _pinPickLoading
                        ? Row(
                            children: [
                              const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: AppColors.primary,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Text(
                                'Buscando dirección…',
                                style: AppTextStyles.body.copyWith(
                                  color: AppColors.gray400,
                                ),
                              ),
                            ],
                          )
                        : Text(
                            _pinPickAddress ?? 'Mueve el mapa para elegir',
                            style: AppTextStyles.body,
                            maxLines: 2,
                          ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: (_pinPickAddress != null && !_pinPickLoading)
                            ? _confirmPinPick
                            : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.black,
                          disabledBackgroundColor: AppColors.gray100,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                        child: Text(
                          _pinPickIsOrigin
                              ? 'Confirmar punto de origen'
                              : 'Confirmar destino',
                          style: AppTextStyles.label,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],

          // ── Overlay superior ─────────────────────────────────────────────
          if (!_pinPickMode)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Card origen + destino
                      Container(
                        decoration: BoxDecoration(
                          color: AppColors.white,
                          borderRadius: _target != _SearchTarget.none
                              ? const BorderRadius.vertical(
                                  top: Radius.circular(16),
                                )
                              : BorderRadius.circular(16),
                          boxShadow: const [
                            BoxShadow(
                              color: Colors.black12,
                              blurRadius: 12,
                              offset: Offset(0, 2),
                            ),
                          ],
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // Fila origen
                            _FieldRow(
                              isTop: true,
                              icon: Icons.radio_button_checked,
                              iconColor: AppColors.success,
                              label: _loadingOrigin
                                  ? 'Detectando ubicación…'
                                  : (route.origin?.shortName ??
                                        'Toca para buscar origen'),
                              hasValue: route.origin != null && !_loadingOrigin,
                              isEditing: _target == _SearchTarget.origin,
                              controller: _searchCtrl,
                              focusNode: _searchFocus,
                              hintText: 'Buscar origen…',
                              onChanged: _onSearchChanged,
                              onClearText: () {
                                _searchCtrl.clear();
                                setState(() => _suggestions = []);
                              },
                              onTap: () => _openSearch(_SearchTarget.origin),
                              onPickMap: route.origin != null && !_loadingOrigin
                                  ? () => _enterPinPickMode(true)
                                  : null,
                              leading: IconButton(
                                icon: const Icon(
                                  Icons.arrow_back_ios_new,
                                  size: 18,
                                ),
                                onPressed: _target != _SearchTarget.none
                                    ? _closeSearch
                                    : () => context.pop(),
                                constraints: const BoxConstraints(),
                                padding: const EdgeInsets.all(8),
                              ),
                            ),

                            Container(
                              margin: const EdgeInsets.only(left: 50),
                              height: 1,
                              color: AppColors.gray100,
                            ),

                            // Fila destino
                            _FieldRow(
                              isTop: false,
                              icon: Icons.location_on,
                              iconColor: AppColors.error,
                              label: dest?.shortName ?? '¿A dónde?',
                              hasValue: dest != null,
                              isEditing: _target == _SearchTarget.destination,
                              controller: _searchCtrl,
                              focusNode: _searchFocus,
                              hintText: '¿A dónde?',
                              onChanged: _onSearchChanged,
                              onClearText: () {
                                _searchCtrl.clear();
                                setState(() => _suggestions = []);
                              },
                              onTap: () =>
                                  _openSearch(_SearchTarget.destination),
                              onPickMap: dest != null
                                  ? () => _enterPinPickMode(false)
                                  : null,
                              onClearValue:
                                  dest != null && _target == _SearchTarget.none
                                  ? () {
                                      ref
                                          .read(tripRouteProvider.notifier)
                                          .removeStop(0);
                                      ref
                                              .read(
                                                fareEstimateProvider.notifier,
                                              )
                                              .state =
                                          null;
                                      _clearMapDest();
                                    }
                                  : null,
                            ),
                          ],
                        ),
                      ),

                      // Panel de resultados (debajo del card, misma anchura)
                      if (_target != _SearchTarget.none)
                        _ResultsPanel(
                          suggesting: _suggesting,
                          suggestions: _suggestions,
                          query: _searchCtrl.text,
                          saved: saved,
                          onSelect: _selectSuggestion,
                          onSaved: _selectSaved,
                        ),
                    ],
                  ),
                ),
              ),
            ),

          // ── Overlay inferior: estimado / loading ─────────────────────────
          if (_target == _SearchTarget.none && !_pinPickMode)
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  child: _loadingEstimate
                      ? Center(
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 20,
                              vertical: 12,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.white,
                              borderRadius: BorderRadius.circular(12),
                              boxShadow: const [
                                BoxShadow(color: Colors.black12, blurRadius: 8),
                              ],
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: AppColors.primary,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Text(
                                  'Calculando ruta…',
                                  style: AppTextStyles.body,
                                ),
                              ],
                            ),
                          ),
                        )
                      : estimate != null
                      ? _EstimateCard(
                          estimate: estimate,
                          onContinue: () => context.push('/request/confirm'),
                        )
                      : const SizedBox.shrink(),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Fila editable (origen / destino) ─────────────────────────────────────────

class _FieldRow extends StatelessWidget {
  const _FieldRow({
    required this.isTop,
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.hasValue,
    required this.isEditing,
    required this.controller,
    required this.focusNode,
    required this.hintText,
    required this.onChanged,
    required this.onClearText,
    required this.onTap,
    this.leading,
    this.onPickMap,
    this.onClearValue,
  });

  final bool isTop;
  final IconData icon;
  final Color iconColor;
  final String label;
  final bool hasValue;
  final bool isEditing;
  final TextEditingController controller;
  final FocusNode focusNode;
  final String hintText;
  final ValueChanged<String> onChanged;
  final VoidCallback onClearText;
  final VoidCallback onTap;
  final Widget? leading;
  final VoidCallback? onPickMap;
  final VoidCallback? onClearValue;

  @override
  Widget build(BuildContext context) {
    final topRadius = isTop ? const Radius.circular(16) : Radius.zero;

    return InkWell(
      onTap: isEditing ? null : onTap,
      borderRadius: BorderRadius.only(topLeft: topRadius, topRight: topRadius),
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          leading != null ? 4 : 14,
          isTop ? 6 : 8,
          12,
          isTop ? 6 : 12,
        ),
        child: Row(
          children: [
            leading ?? const SizedBox(width: 4),
            Icon(icon, color: iconColor, size: 18),
            const SizedBox(width: 10),
            Expanded(
              child: isEditing
                  ? TextField(
                      controller: controller,
                      focusNode: focusNode,
                      onChanged: onChanged,
                      style: AppTextStyles.body,
                      cursorColor: AppColors.gray700,
                      cursorWidth: 1.5,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: InputDecoration(
                        hintText: hintText,
                        hintStyle: AppTextStyles.body.copyWith(
                          color: AppColors.gray400,
                        ),
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        isDense: true,
                        contentPadding: EdgeInsets.zero,
                      ),
                    )
                  : Text(
                      label,
                      style: AppTextStyles.body.copyWith(
                        color: hasValue ? AppColors.gray900 : AppColors.gray400,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
            ),
            if (isEditing && controller.text.isNotEmpty)
              GestureDetector(
                onTap: onClearText,
                child: const Padding(
                  padding: EdgeInsets.only(left: 8),
                  child: Icon(Icons.close, size: 16, color: AppColors.gray400),
                ),
              )
            else if (!isEditing) ...[
              if (onPickMap != null)
                GestureDetector(
                  onTap: onPickMap,
                  child: const Padding(
                    padding: EdgeInsets.only(left: 6),
                    child: Icon(
                      Icons.my_location,
                      size: 17,
                      color: AppColors.gray400,
                    ),
                  ),
                ),
              if (onClearValue != null)
                GestureDetector(
                  onTap: onClearValue,
                  child: const Padding(
                    padding: EdgeInsets.only(left: 6),
                    child: Icon(
                      Icons.close,
                      size: 16,
                      color: AppColors.gray400,
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

// ── Panel de resultados inline ────────────────────────────────────────────────

class _ResultsPanel extends StatelessWidget {
  const _ResultsPanel({
    required this.suggesting,
    required this.suggestions,
    required this.query,
    required this.saved,
    required this.onSelect,
    required this.onSaved,
  });

  final bool suggesting;
  final List<SearchSuggestion> suggestions;
  final String query;
  final List<SavedLocation> saved;
  final ValueChanged<SearchSuggestion> onSelect;
  final ValueChanged<SavedLocation> onSaved;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(maxHeight: 320),
      decoration: const BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(16)),
        boxShadow: [
          BoxShadow(
            color: Colors.black12,
            blurRadius: 12,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
        child: _buildContent(),
      ),
    );
  }

  Widget _buildContent() {
    if (suggesting) {
      return const Padding(
        padding: EdgeInsets.all(20),
        child: Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.primary,
            ),
          ),
        ),
      );
    }

    // Con texto: mostrar sugerencias Mapbox
    if (query.trim().length >= 2) {
      if (suggestions.isEmpty) {
        return Padding(
          padding: const EdgeInsets.all(20),
          child: Center(
            child: Text(
              'Sin resultados',
              style: AppTextStyles.body.copyWith(color: AppColors.gray400),
            ),
          ),
        );
      }
      return ListView.separated(
        shrinkWrap: true,
        itemCount: suggestions.length,
        separatorBuilder: (_, _) =>
            const Divider(height: 1, color: AppColors.gray100),
        itemBuilder: (_, i) {
          final s = suggestions[i];
          return ListTile(
            dense: true,
            leading: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.gray100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.location_on_outlined,
                color: AppColors.gray500,
                size: 16,
              ),
            ),
            title: Text(
              s.name,
              style: AppTextStyles.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: Text(
              s.address,
              style: AppTextStyles.caption.copyWith(color: AppColors.gray400),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            onTap: () => onSelect(s),
          );
        },
      );
    }

    // Sin texto: mostrar lugares guardados
    if (saved.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Text(
          'Escribe para buscar un lugar',
          style: AppTextStyles.body.copyWith(color: AppColors.gray400),
        ),
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Text(
            'Lugares guardados',
            style: AppTextStyles.caption.copyWith(
              color: AppColors.gray500,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        ...saved.map(
          (loc) => ListTile(
            dense: true,
            leading: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.primaryLight,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                _savedIcon(loc.type),
                color: AppColors.secondary,
                size: 16,
              ),
            ),
            title: Text(
              loc.label,
              style: AppTextStyles.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: Text(
              loc.address,
              style: AppTextStyles.caption.copyWith(color: AppColors.gray400),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            onTap: () => onSaved(loc),
          ),
        ),
      ],
    );
  }

  IconData _savedIcon(SavedLocationType t) => switch (t) {
    SavedLocationType.home => Icons.home_outlined,
    SavedLocationType.work => Icons.work_outline,
    SavedLocationType.other => Icons.star_outline,
  };
}

// ── Tarjeta de estimado ───────────────────────────────────────────────────────

class _EstimateCard extends StatelessWidget {
  const _EstimateCard({required this.estimate, required this.onContinue});
  final FareEstimate estimate;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
    decoration: BoxDecoration(
      color: AppColors.white,
      borderRadius: BorderRadius.circular(20),
      boxShadow: const [
        BoxShadow(color: Colors.black12, blurRadius: 14, offset: Offset(0, -2)),
      ],
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '\$${estimate.total.toStringAsFixed(2)}',
              style: AppTextStyles.h2.copyWith(color: AppColors.secondary),
            ),
            const SizedBox(width: 8),
            Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Text(
                '· ${estimate.distanceKm.toStringAsFixed(1)} km'
                ' · ${estimate.durationMin.toInt()} min'
                '${estimate.isNightRate ? ' · Nocturno' : ''}',
                style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
              ),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(
          'Precio estimado, puede variar según el tráfico.',
          style: AppTextStyles.caption.copyWith(color: AppColors.gray400),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          height: 50,
          child: ElevatedButton(
            onPressed: onContinue,
            child: Text('Continuar', style: AppTextStyles.btnLg),
          ),
        ),
      ],
    ),
  );
}
