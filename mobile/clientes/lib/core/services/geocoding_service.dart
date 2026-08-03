import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/trips/domain/entities/place_result.dart';
import '../../features/trips/domain/entities/search_suggestion.dart';

class GeocodingService {
  GeocodingService()
      : _photon = Dio(BaseOptions(
          baseUrl: 'https://photon.komoot.io',
          connectTimeout: const Duration(seconds: 4),
          receiveTimeout: const Duration(seconds: 4),
          headers: {'User-Agent': 'PanaTaxi/1.0'},
        )),
        _nominatim = Dio(BaseOptions(
          baseUrl: 'https://nominatim.openstreetmap.org',
          connectTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 5),
          headers: {'User-Agent': 'PanaTaxi/1.0'},
        ));

  final Dio _photon;
  final Dio _nominatim;

  // Caché de reverse geocode — evita llamadas repetidas cuando el pin no se movió
  double? _cachedLat;
  double? _cachedLng;
  String? _cachedAddr;
  static const _cacheThresholdM = 30.0; // metros

  // Autocomplete via Photon (OSM) — gratis, sin API key, retorna POIs + calles + coords directas.
  Future<List<SearchSuggestion>> suggest(
    String query, {
    double? lat,
    double? lng,
  }) async {
    if (query.trim().length < 2) return [];
    if (kDebugMode) debugPrint('[Geocoding] buscando: "$query" lat=$lat lng=$lng');
    try {
      final params = <String, dynamic>{
        'q':     query.trim(),
        'limit': 8,
      };
      if (lat != null && lng != null) {
        params['lat'] = lat;
        params['lon'] = lng;
      } else {
        // Sin GPS: restringir a Ecuador por bounding box
        params['bbox'] = '-81.0,-5.0,-75.0,2.0';
      }

      final res = await _photon.get<Map<String, dynamic>>('/api/', queryParameters: params);
      final features = res.data?['features'] as List? ?? [];
      if (kDebugMode) debugPrint('[Geocoding] ${features.length} features recibidas');
      final results = features
          .map((f) => _toSuggestion(f as Map<String, dynamic>))
          .where((s) => s.resolvedPlace != null)
          .toList();
      if (kDebugMode) debugPrint('[Geocoding] ${results.length} sugerencias devueltas');
      return results;
    } catch (e) {
      if (kDebugMode) debugPrint('[GeocodingService] suggest error: $e');
      return [];
    }
  }

  SearchSuggestion _toSuggestion(Map<String, dynamic> feature) {
    final props   = feature['properties'] as Map<String, dynamic>;
    final coords  = (feature['geometry']?['coordinates'] as List?) ?? [];
    if (coords.length < 2) return SearchSuggestion.fromV6(_emptyPlace(), 'address');

    final lng     = (coords[0] as num).toDouble();
    final lat     = (coords[1] as num).toDouble();
    final name    = props['name']     as String? ?? '';
    final street  = props['street']   as String? ?? '';
    final city    = props['city']     as String?
        ?? props['county']  as String?
        ?? props['state']   as String? ?? '';
    final osmKey  = props['osm_key']  as String? ?? '';
    final osmVal  = props['osm_value'] as String? ?? '';
    final type    = props['type']     as String? ?? '';

    // Nombre principal: el nombre del lugar o la calle
    final mainName = name.isNotEmpty ? name : street;

    // Dirección secundaria: calle + ciudad
    final parts = <String>[
      if (name.isNotEmpty && street.isNotEmpty) street,
      if (city.isNotEmpty) city,
    ];
    final address = parts.isNotEmpty ? '$mainName, ${parts.join(', ')}' : mainName;

    final featureType = _featureType(osmKey, osmVal, type);

    final place = PlaceResult(
      displayName: address,
      shortName:   mainName,
      lat: lat,
      lng: lng,
    );
    return SearchSuggestion.fromV6(place, featureType);
  }

  PlaceResult _emptyPlace() => const PlaceResult(
    displayName: '', shortName: '', lat: 0, lng: 0,
  );

  String _featureType(String osmKey, String osmVal, String type) {
    if (type == 'street') return 'street';
    if (osmKey == 'highway') return 'street';
    if (osmKey == 'shop' || osmVal == 'mall' || osmVal == 'supermarket') return 'poi';
    if (osmKey == 'amenity') return 'poi';
    if (osmKey == 'tourism' || osmKey == 'leisure') return 'poi';
    if (osmKey == 'place') return 'place';
    if (osmVal == 'residential' || osmVal == 'tertiary') return 'street';
    return 'address';
  }

  // Reverse geocoding via Nominatim — gratis, sin API key, sin plugin nativo.
  Future<String?> reverseGeocode(double lat, double lng) async {
    // Retornar caché si el pin no se movió más de 30m
    if (_cachedLat != null && _cachedLng != null && _cachedAddr != null) {
      final dist = _haversineM(_cachedLat!, _cachedLng!, lat, lng);
      if (dist < _cacheThresholdM) return _cachedAddr;
    }
    try {
      final res = await _nominatim.get<Map<String, dynamic>>(
        '/reverse',
        queryParameters: {'lat': lat, 'lon': lng, 'format': 'jsonv2', 'accept-language': 'es', 'zoom': 17},
      );
      final data = res.data ?? {};
      final addr = data['address'] as Map? ?? {};
      final parts = <String>[
        if ((addr['road']         as String?)?.isNotEmpty == true) addr['road']         as String,
        if ((addr['neighbourhood']as String?)?.isNotEmpty == true) addr['neighbourhood']as String,
        if ((addr['city']         as String?)?.isNotEmpty == true) addr['city']         as String
            else if ((addr['town'] as String?)?.isNotEmpty == true) addr['town']        as String,
      ];
      final result = parts.isEmpty ? null : parts.join(', ');
      if (result != null) {
        _cachedLat = lat;
        _cachedLng = lng;
        _cachedAddr = result;
      }
      return result;
    } catch (e) {
      if (kDebugMode) debugPrint('[GeocodingService] reverseGeocode error: $e');
      return null;
    }
  }

  // Manhattan distance en metros — suficiente para el umbral de 30m del caché
  double _haversineM(double lat1, double lng1, double lat2, double lng2) {
    const degToM = 111000.0;
    return ((lat2 - lat1).abs() + (lng2 - lng1).abs()) * degToM;
  }
}

final geocodingServiceProvider =
    Provider<GeocodingService>((ref) => GeocodingService());
