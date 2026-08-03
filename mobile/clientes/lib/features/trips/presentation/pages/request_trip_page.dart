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

Future<Uint8List> _buildOriginPinBytes() =>
    _buildTearDropPin(const Color(0xFF34A853));           // verde

Future<Uint8List> _buildDestPinBytes() =>
    _buildTearDropPin(const Color(0xFFEA4335), w: 64, h: 90); // rojo, más grande

// ── Page ──────────────────────────────────────────────────────────────────────

class RequestTripPage extends ConsumerStatefulWidget {
  const RequestTripPage({super.key});

  @override
  ConsumerState<RequestTripPage> createState() => _RequestTripPageState();
}

class _RequestTripPageState extends ConsumerState<RequestTripPage> {
  // Mapa
  MapLibreMapController? _ctrl;
  bool    _mapReady    = false;
  bool    _routeAdded  = false;
  Symbol? _originSym;
  Symbol? _destSym;

  // Origen
  bool _loadingOrigin = true;
  ({double lat, double lng, String? address})? _pendingOrigin;

  // Estimado
  bool _loadingEstimate = false;

  // Pin picker inline
  bool   _pinPickMode     = false;
  bool   _pinPickIsOrigin = false;
  bool   _pinPickLoading  = false;
  String? _pinPickAddress;

  // Búsqueda inline
  _SearchTarget _target = _SearchTarget.none;
  final _searchCtrl  = TextEditingController();
  final _searchFocus = FocusNode();
  List<SearchSuggestion> _suggestions = [];
  bool _suggesting = false;
  Timer? _debounce;
  Timer? _geocodeDebounce;

  @override
  void initState() {
    super.initState();
    if (ref.read(tripRouteProvider).origin == null) {
      _kickGps(); // arranca en paralelo con la carga del mapa
    } else {
      _loadingOrigin = false;
    }
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _searchFocus.dispose();
    _debounce?.cancel();
    _geocodeDebounce?.cancel();
    super.dispose();
  }

  // ── Mapa ──────────────────────────────────────────────────────────────────

  Future<void> _onMapCreated(MapLibreMapController c) async {
    _ctrl = c;
    await c.addImage('origin-pin', await _buildOriginPinBytes());
    await c.addImage('dest-pin',   await _buildDestPinBytes());
    _mapReady = true;

    // Restaurar ruta si ya existe (usuario regresó a esta pantalla)
    final route    = ref.read(tripRouteProvider);
    final estimate = ref.read(fareEstimateProvider);
    final dest     = route.stops.firstOrNull;

    if (route.origin != null) {
      await _placeOriginMarker(route.origin!.lat, route.origin!.lng);
      if (dest == null) _cam(route.origin!.lat, route.origin!.lng, 15);
      if (mounted) setState(() => _loadingOrigin = false);
    }
    if (dest != null) await _placeDestMarker(dest.lat, dest.lng);
    if (estimate?.routeGeometry != null && route.origin != null && dest != null) {
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

  Future<void> _placeOriginMarker(double lat, double lng) async {
    if (_ctrl == null) return;
    final ll = LatLng(lat, lng);
    if (_originSym == null) {
      _originSym = await _ctrl!.addSymbol(
          SymbolOptions(geometry: ll, iconImage: 'origin-pin', iconSize: 1.0, iconAnchor: 'bottom'));
    } else {
      await _ctrl!.updateSymbol(_originSym!, SymbolOptions(geometry: ll));
    }
  }

  Future<void> _placeDestMarker(double lat, double lng) async {
    if (_ctrl == null) return;
    final ll = LatLng(lat, lng);
    if (_destSym == null) {
      _destSym = await _ctrl!.addSymbol(
          SymbolOptions(geometry: ll, iconImage: 'dest-pin', iconSize: 1.0, iconAnchor: 'bottom'));
    } else {
      await _ctrl!.updateSymbol(_destSym!, SymbolOptions(geometry: ll));
    }
  }

  Future<void> _drawRoute(Map<String, dynamic> geometry) async {
    if (_ctrl == null) return;
    final geojson = {
      'type': 'FeatureCollection',
      'features': [
        {'type': 'Feature', 'geometry': geometry, 'properties': <String, dynamic>{}}
      ],
    };
    if (_routeAdded) {
      await _ctrl!.setGeoJsonSource('route-src', geojson);
    } else {
      await _ctrl!.addGeoJsonSource('route-src', geojson);
      await _ctrl!.addLineLayer(
        'route-src', 'route-line',
        const LineLayerProperties(
          lineColor: '#4285F4',
          lineWidth: 5.0,
          lineCap:   'round',
          lineJoin:  'round',
        ),
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
        left: 60, top: 190, right: 60, bottom: 250,
      ),
    );
  }

  // ── Detección de origen ────────────────────────────────────────────────────

  // Obtiene la posición GPS y aplica el origen inmediatamente.
  // El reverse geocoding corre en background — la UI nunca se traba esperando la dirección.
  Future<void> _kickGps() async {
    Position? pos;
    try { pos = await Geolocator.getLastKnownPosition(); } catch (_) {}
    pos ??= await _fetchCurrentPos();
    if (pos == null || !mounted) {
      if (mounted) setState(() => _loadingOrigin = false);
      return;
    }

    // 1 — Aplica coordenadas de inmediato con texto provisional
    if (_mapReady) {
      await _applyGpsOrigin(pos.latitude, pos.longitude, null);
    } else {
      _pendingOrigin = (lat: pos.latitude, lng: pos.longitude, address: null);
    }

    // 2 — Geocoding en background: actualiza solo el nombre cuando llega
    final address = await ref
        .read(geocodingServiceProvider)
        .reverseGeocode(pos.latitude, pos.longitude);
    if (!mounted || address == null || address.isEmpty) return;
    if (ref.read(tripRouteProvider).origin == null) return;
    final current = ref.read(tripRouteProvider).origin!;
    ref.read(tripRouteProvider.notifier).setOrigin(PlaceResult(
      displayName: address,
      shortName:   _short(address),
      lat:         current.lat,
      lng:         current.lng,
    ));
  }

  Future<Position?> _fetchCurrentPos() async {
    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium),
      ).timeout(const Duration(seconds: 8));
    } catch (_) { return null; }
  }

  Future<void> _applyGpsOrigin(double lat, double lng, String? address) async {
    if (!mounted) return;
    final name = (address != null && address.isNotEmpty) ? address : 'Ubicación actual';
    ref.read(tripRouteProvider.notifier).setOrigin(PlaceResult(
      displayName: name,
      shortName:   _short(name),
      lat:         lat,
      lng:         lng,
    ));
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
      _target      = target;
      _suggestions = [];
      _searchCtrl.clear();
    });
    WidgetsBinding.instance
        .addPostFrameCallback((_) => _searchFocus.requestFocus());
  }

  void _closeSearch() {
    _debounce?.cancel();
    _searchFocus.unfocus();
    setState(() {
      _target      = _SearchTarget.none;
      _suggestions = [];
    });
  }

  void _onSearchChanged(String v) {
    _debounce?.cancel();
    if (v.trim().length < 2) {
      setState(() {
        _suggestions = [];
        _suggesting  = false;
      });
      return;
    }
    setState(() => _suggesting = true);
    _debounce = Timer(const Duration(milliseconds: 200), () async {
      final origin  = ref.read(tripRouteProvider).origin;
      final results = await ref.read(geocodingServiceProvider).suggest(
        v,
        lat: origin?.lat,
        lng: origin?.lng,
      );
      if (mounted) {
        setState(() {
          _suggestions = results;
          _suggesting  = false;
        });
      }
    });
  }

  Future<void> _selectSuggestion(SearchSuggestion s) async {
    final target = _target;
    _searchFocus.unfocus();
    setState(() { _target = _SearchTarget.none; _suggestions = []; });
    await _applyPlace(s.resolvedPlace!, target);
  }

  void _selectSaved(SavedLocation loc) {
    final target = _target;
    final place  = PlaceResult(
      displayName: loc.address,
      shortName:   loc.label,
      lat:         loc.lat,
      lng:         loc.lng,
    );
    _closeSearch();
    _applyPlace(place, target);
  }

  Future<void> _applyPlace(PlaceResult place, _SearchTarget target) async {
    if (target == _SearchTarget.origin) {
      ref.read(tripRouteProvider.notifier).setOrigin(place);
      await _placeOriginMarker(place.lat, place.lng);
      _cam(place.lat, place.lng, 15);
      final dest = ref.read(tripRouteProvider).stops.firstOrNull;
      if (dest != null) await _fetchEstimate(place, dest);
    } else {
      final current = ref.read(tripRouteProvider);
      if (current.stops.isEmpty) {
        ref.read(tripRouteProvider.notifier).addStop(place);
      } else {
        ref.read(tripRouteProvider.notifier).updateStop(0, place);
      }
      await _placeDestMarker(place.lat, place.lng);
      final origin = ref.read(tripRouteProvider).origin;
      if (origin != null) await _fetchEstimate(origin, place);
    }
  }

  // ── Pin picker inline ─────────────────────────────────────────────────────

  void _enterPinPickMode(bool isOrigin) {
    final route   = ref.read(tripRouteProvider);
    final current = isOrigin ? route.origin : route.stops.firstOrNull;
    if (current != null) {
      _ctrl?.animateCamera(
        CameraUpdate.newLatLngZoom(LatLng(current.lat, current.lng), 17),
      );
    }
    setState(() {
      _pinPickMode     = true;
      _pinPickIsOrigin = isOrigin;
      _pinPickAddress  = current?.displayName;
      _pinPickLoading  = false;
    });
  }

  Future<void> _onMapIdle() async {
    if (!_pinPickMode) return;
    _geocodeDebounce?.cancel();
    _geocodeDebounce = Timer(const Duration(milliseconds: 600), _geocodeCamera);
  }

  Future<void> _geocodeCamera() async {
    if (!mounted || !_pinPickMode) return;
    final pos = _ctrl?.cameraPosition?.target;
    if (pos == null) return;
    setState(() => _pinPickLoading = true);

    // Mover el símbolo existente al centro de la cámara (sin overlay extra)
    final ll = LatLng(pos.latitude, pos.longitude);
    if (_pinPickIsOrigin && _originSym != null) {
      await _ctrl?.updateSymbol(_originSym!, SymbolOptions(geometry: ll));
    } else if (!_pinPickIsOrigin && _destSym != null) {
      await _ctrl?.updateSymbol(_destSym!, SymbolOptions(geometry: ll));
    }

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
    final pos = _ctrl?.cameraPosition?.target;
    if (pos == null) return;
    final name = _pinPickAddress ?? '';
    // Si no hay dirección, hacer un último intento
    final resolvedName = name.isNotEmpty
        ? name
        : await ref.read(geocodingServiceProvider).reverseGeocode(pos.latitude, pos.longitude)
            ?? 'Lat ${pos.latitude.toStringAsFixed(5)}, Lng ${pos.longitude.toStringAsFixed(5)}';
    final parts = resolvedName.split(', ');
    final short = parts.length >= 2 ? '${parts[0]}, ${parts[1]}' : parts[0];
    setState(() => _pinPickMode = false);
    await _applyPlace(
      PlaceResult(displayName: resolvedName, shortName: short, lat: pos.latitude, lng: pos.longitude),
      _pinPickIsOrigin ? _SearchTarget.origin : _SearchTarget.destination,
    );
  }

  Future<void> _clearMapDest() async {
    if (_ctrl == null) return;
    if (_destSym != null) {
      await _ctrl!.removeSymbol(_destSym!);
      _destSym = null;
    }
    if (_routeAdded) {
      await _ctrl!.setGeoJsonSource('route-src', {
        'type': 'FeatureCollection',
        'features': <dynamic>[],
      });
    }
  }

  // ── Estimado ───────────────────────────────────────────────────────────────

  Future<void> _fetchEstimate(PlaceResult origin, PlaceResult dest) async {
    setState(() => _loadingEstimate = true);
    ref.read(fareEstimateProvider.notifier).state = null;
    try {
      final estimate = await ref.read(tripsApiProvider).getFareEstimate(
        originLat: origin.lat, originLng: origin.lng,
        destLat:   dest.lat,   destLng:   dest.lng,
      );
      if (!mounted) return;
      ref.read(fareEstimateProvider.notifier).state = estimate;
      if (estimate.routeGeometry != null) await _drawRoute(estimate.routeGeometry!);
      await _fitBounds(origin, dest);
    } catch (e) {
      debugPrint('[fetchEstimate] error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('No se pudo calcular la ruta'),
          backgroundColor: AppColors.error,
        ));
      }
    } finally {
      if (mounted) setState(() => _loadingEstimate = false);
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final route    = ref.watch(tripRouteProvider);
    final estimate = ref.watch(fareEstimateProvider);
    final dest     = route.stops.firstOrNull;
    final saved    = ref.watch(savedLocationsProvider).valueOrNull ?? [];

    return Scaffold(
      body: Stack(
        children: [
          // Mapa — GestureDetector cierra la búsqueda al tocar el mapa
          GestureDetector(
            onTap: _target != _SearchTarget.none ? _closeSearch : null,
            child: MapLibreMap(
              onMapCreated: _onMapCreated,
              onCameraIdle: _onMapIdle,
              initialCameraPosition: const CameraPosition(
                target: LatLng(-0.2295, -78.5243),
                zoom: 13,
              ),
              styleString:         'https://tiles.openfreemap.org/styles/liberty',
              myLocationEnabled:   false,
              trackCameraPosition: true,
            ),
          ),

          // ── Overlay pin pick inline ──────────────────────────────────────
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
                    onTap: () => setState(() => _pinPickMode = false),
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
              bottom: 0, left: 0, right: 0,
              child: Container(
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                  boxShadow: [
                    BoxShadow(color: Colors.black12, blurRadius: 12, offset: Offset(0, -4)),
                  ],
                ),
                padding: EdgeInsets.fromLTRB(
                  20, 20, 20, MediaQuery.of(context).padding.bottom + 20,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _pinPickIsOrigin ? 'Punto de origen' : 'Destino seleccionado',
                      style: AppTextStyles.caption.copyWith(color: AppColors.gray400),
                    ),
                    const SizedBox(height: 6),
                    _pinPickLoading
                        ? Row(children: [
                            const SizedBox(
                              width: 16, height: 16,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: AppColors.primary),
                            ),
                            const SizedBox(width: 10),
                            Text('Buscando dirección…',
                                style: AppTextStyles.body.copyWith(color: AppColors.gray400)),
                          ])
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
                              borderRadius: BorderRadius.circular(12)),
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
          if (!_pinPickMode) Positioned(
            top: 0, left: 0, right: 0,
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
                            ? const BorderRadius.vertical(top: Radius.circular(16))
                            : BorderRadius.circular(16),
                        boxShadow: const [
                          BoxShadow(color: Colors.black12, blurRadius: 12, offset: Offset(0, 2)),
                        ],
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Fila origen
                          _FieldRow(
                            isTop:     true,
                            icon:      Icons.radio_button_checked,
                            iconColor: AppColors.success,
                            label: _loadingOrigin
                                ? 'Detectando ubicación…'
                                : (route.origin?.shortName ?? 'Toca para buscar origen'),
                            hasValue:  route.origin != null && !_loadingOrigin,
                            isEditing: _target == _SearchTarget.origin,
                            controller: _searchCtrl,
                            focusNode:  _searchFocus,
                            hintText:  'Buscar origen…',
                            onChanged: _onSearchChanged,
                            onClearText: () {
                              _searchCtrl.clear();
                              setState(() => _suggestions = []);
                            },
                            onTap:    () => _openSearch(_SearchTarget.origin),
                            onPickMap: route.origin != null && !_loadingOrigin
                                ? () => _enterPinPickMode(true)
                                : null,
                            leading: IconButton(
                              icon: const Icon(Icons.arrow_back_ios_new, size: 18),
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
                            isTop:     false,
                            icon:      Icons.location_on,
                            iconColor: AppColors.error,
                            label:     dest?.shortName ?? '¿A dónde?',
                            hasValue:  dest != null,
                            isEditing: _target == _SearchTarget.destination,
                            controller: _searchCtrl,
                            focusNode:  _searchFocus,
                            hintText:  '¿A dónde?',
                            onChanged: _onSearchChanged,
                            onClearText: () {
                              _searchCtrl.clear();
                              setState(() => _suggestions = []);
                            },
                            onTap:     () => _openSearch(_SearchTarget.destination),
                            onPickMap: dest != null
                                ? () => _enterPinPickMode(false)
                                : null,
                            onClearValue: dest != null && _target == _SearchTarget.none
                                ? () {
                                    ref.read(tripRouteProvider.notifier).removeStop(0);
                                    ref.read(fareEstimateProvider.notifier).state = null;
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
                        suggesting:  _suggesting,
                        suggestions: _suggestions,
                        query:       _searchCtrl.text,
                        saved:       saved,
                        onSelect:    _selectSuggestion,
                        onSaved:     _selectSaved,
                      ),
                  ],
                ),
              ),
            ),
          ),

          // ── Overlay inferior: estimado / loading ─────────────────────────
          if (_target == _SearchTarget.none && !_pinPickMode)
            Positioned(
              bottom: 0, left: 0, right: 0,
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  child: _loadingEstimate
                      ? Center(
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 20, vertical: 12),
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
                                  width: 18, height: 18,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2, color: AppColors.primary),
                                ),
                                const SizedBox(width: 12),
                                Text('Calculando ruta…', style: AppTextStyles.body),
                              ],
                            ),
                          ),
                        )
                      : estimate != null
                          ? _EstimateCard(
                              estimate:   estimate,
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

  final bool             isTop;
  final IconData         icon;
  final Color            iconColor;
  final String           label;
  final bool             hasValue;
  final bool             isEditing;
  final TextEditingController controller;
  final FocusNode        focusNode;
  final String           hintText;
  final ValueChanged<String> onChanged;
  final VoidCallback     onClearText;
  final VoidCallback     onTap;
  final Widget?          leading;
  final VoidCallback?    onPickMap;
  final VoidCallback?    onClearValue;

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
                      controller:        controller,
                      focusNode:         focusNode,
                      onChanged:         onChanged,
                      style:             AppTextStyles.body,
                      cursorColor:       AppColors.gray700,
                      cursorWidth:       1.5,
                      autocorrect:       false,
                      enableSuggestions: false,
                      decoration: InputDecoration(
                        hintText:       hintText,
                        hintStyle:      AppTextStyles.body
                            .copyWith(color: AppColors.gray400),
                        border:         InputBorder.none,
                        enabledBorder:  InputBorder.none,
                        focusedBorder:  InputBorder.none,
                        isDense:        true,
                        contentPadding: EdgeInsets.zero,
                      ),
                    )
                  : Text(
                      label,
                      style: AppTextStyles.body.copyWith(
                        color: hasValue
                            ? AppColors.gray900
                            : AppColors.gray400,
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
                    child: Icon(Icons.my_location, size: 17, color: AppColors.gray400),
                  ),
                ),
              if (onClearValue != null)
                GestureDetector(
                  onTap: onClearValue,
                  child: const Padding(
                    padding: EdgeInsets.only(left: 6),
                    child: Icon(Icons.close, size: 16, color: AppColors.gray400),
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

  final bool                    suggesting;
  final List<SearchSuggestion>  suggestions;
  final String                  query;
  final List<SavedLocation>     saved;
  final ValueChanged<SearchSuggestion> onSelect;
  final ValueChanged<SavedLocation>    onSaved;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(maxHeight: 320),
      decoration: const BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(16)),
        boxShadow: [
          BoxShadow(color: Colors.black12, blurRadius: 12, offset: Offset(0, 6)),
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
            width: 22, height: 22,
            child: CircularProgressIndicator(
                strokeWidth: 2, color: AppColors.primary),
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
            child: Text('Sin resultados',
                style: AppTextStyles.body
                    .copyWith(color: AppColors.gray400)),
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
              width: 32, height: 32,
              decoration: BoxDecoration(
                color: AppColors.gray100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.location_on_outlined,
                  color: AppColors.gray500, size: 16),
            ),
            title: Text(s.name,
                style: AppTextStyles.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
            subtitle: Text(s.address,
                style: AppTextStyles.caption
                    .copyWith(color: AppColors.gray400),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
            onTap: () => onSelect(s),
          );
        },
      );
    }

    // Sin texto: mostrar lugares guardados
    if (saved.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Text('Escribe para buscar un lugar',
            style: AppTextStyles.body.copyWith(color: AppColors.gray400)),
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Text('Lugares guardados', style: AppTextStyles.caption
              .copyWith(color: AppColors.gray500, fontWeight: FontWeight.w600)),
        ),
        ...saved.map((loc) => ListTile(
              dense: true,
              leading: Container(
                width: 32, height: 32,
                decoration: BoxDecoration(
                  color: AppColors.primaryLight,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(_savedIcon(loc.type),
                    color: AppColors.secondary, size: 16),
              ),
              title: Text(loc.label,
                  style: AppTextStyles.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
              subtitle: Text(loc.address,
                  style: AppTextStyles.caption
                      .copyWith(color: AppColors.gray400),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
              onTap: () => onSaved(loc),
            )),
      ],
    );
  }

  IconData _savedIcon(SavedLocationType t) => switch (t) {
        SavedLocationType.home  => Icons.home_outlined,
        SavedLocationType.work  => Icons.work_outline,
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
            BoxShadow(
                color: Colors.black12,
                blurRadius: 14,
                offset: Offset(0, -2)),
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
                    style: AppTextStyles.caption
                        .copyWith(color: AppColors.gray500),
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
