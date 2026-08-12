import 'dart:math';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config/app_env.dart';
import '../../features/trips/domain/entities/place_result.dart';
import '../../features/trips/domain/entities/search_suggestion.dart';

// Genera token aleatorio para agrupar autocomplete + details en una sesión ($0.017 flat)
String _newSessionToken() {
  final r = Random.secure();
  return List.generate(32, (_) => r.nextInt(16).toRadixString(16)).join();
}

class GeocodingService {
  GeocodingService()
      : _places = Dio(BaseOptions(
          baseUrl: 'https://places.googleapis.com',
          connectTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 5),
          headers: {'X-Goog-Api-Key': AppEnv.googleMapsKey},
        )),
        _nominatim = Dio(BaseOptions(
          baseUrl: 'https://nominatim.openstreetmap.org',
          connectTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 5),
          headers: {'User-Agent': 'PanaTaxi/1.0'},
        ));

  final Dio _places;
  final Dio _nominatim;

  // Un token por sesión de búsqueda — se renueva después de cada selección
  String _sessionToken = _newSessionToken();

  double? _cachedLat;
  double? _cachedLng;
  String? _cachedAddr;
  static const _cacheThresholdM = 30.0;

  // Places API (New) — Autocomplete
  Future<List<SearchSuggestion>> suggest(
    String query, {
    double? lat,
    double? lng,
  }) async {
    if (query.trim().length < 2) return [];
    try {
      final body = <String, dynamic>{
        'input':               query.trim(),
        'sessionToken':        _sessionToken,
        'includedRegionCodes': ['ec'],
        'languageCode':        'es',
      };
      if (lat != null && lng != null) {
        body['locationBias'] = {
          'circle': {
            'center': {'latitude': lat, 'longitude': lng},
            'radius': 50000.0,
          },
        };
      }

      final res = await _places.post<Map<String, dynamic>>(
        '/v1/places:autocomplete',
        data: body,
      );

      final suggestions = res.data?['suggestions'] as List? ?? [];
      return suggestions
          .map((s) {
            final p = (s as Map<String, dynamic>)['placePrediction'] as Map<String, dynamic>?;
            if (p == null) return null;
            return SearchSuggestion.fromGooglePlaces(p);
          })
          .whereType<SearchSuggestion>()
          .toList();
    } catch (e) {
      if (kDebugMode) debugPrint('[Geocoding] suggest error: $e');
      return [];
    }
  }

  // Places API (New) — Details (cierra la sesión de facturación)
  Future<PlaceResult?> getPlaceDetails(String placeId) async {
    try {
      final res = await _places.get<Map<String, dynamic>>(
        '/v1/places/$placeId',
        queryParameters: {'sessionToken': _sessionToken},
        options: Options(headers: {
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
        }),
      );

      // Renovar token — la sesión terminó
      _sessionToken = _newSessionToken();

      final data    = res.data ?? {};
      final loc     = data['location'] as Map?;
      final lat     = (loc?['latitude']  as num?)?.toDouble();
      final lng     = (loc?['longitude'] as num?)?.toDouble();
      if (lat == null || lng == null) return null;

      final name    = (data['displayName']     as Map?)?['text'] as String? ?? '';
      final address =  data['formattedAddress'] as String? ?? name;

      return PlaceResult(
        displayName: address,
        shortName:   name,
        lat: lat,
        lng: lng,
      );
    } catch (e) {
      if (kDebugMode) debugPrint('[Geocoding] getPlaceDetails error: $e');
      return null;
    }
  }

  // Reverse geocoding via Nominatim (gratis, sin key)
  Future<String?> reverseGeocode(double lat, double lng) async {
    if (_cachedLat != null && _cachedLng != null && _cachedAddr != null) {
      if (_distanceM(_cachedLat!, _cachedLng!, lat, lng) < _cacheThresholdM) {
        return _cachedAddr;
      }
    }
    try {
      final res = await _nominatim.get<Map<String, dynamic>>(
        '/reverse',
        queryParameters: {
          'lat': lat, 'lon': lng,
          'format': 'jsonv2',
          'accept-language': 'es',
          'zoom': 17,
        },
      );
      final data = res.data ?? {};
      final addr = data['address'] as Map? ?? {};

      String? pick(List<String> keys) {
        for (final k in keys) {
          final v = addr[k] as String?;
          if (v != null && v.isNotEmpty) return v;
        }
        return null;
      }

      final road   = pick(['road', 'pedestrian', 'path', 'footway', 'cycleway']);
      final sector = pick(['neighbourhood', 'suburb', 'city_district', 'quarter']);
      final city   = pick(['city', 'town', 'village', 'municipality', 'county']);

      final parts = [road, sector, city].whereType<String>().toList();
      String? result;
      if (parts.isNotEmpty) {
        result = parts.join(', ');
      } else {
        final display = data['display_name'] as String?;
        if (display != null && display.isNotEmpty) {
          result = display.split(', ').take(3).join(', ');
        }
      }

      if (result != null) {
        _cachedLat  = lat;
        _cachedLng  = lng;
        _cachedAddr = result;
      }
      return result;
    } catch (e) {
      if (kDebugMode) debugPrint('[Geocoding] reverseGeocode error: $e');
      return null;
    }
  }

  double _distanceM(double lat1, double lng1, double lat2, double lng2) {
    const degToM = 111000.0;
    return ((lat2 - lat1).abs() + (lng2 - lng1).abs()) * degToM;
  }
}

final geocodingServiceProvider =
    Provider<GeocodingService>((ref) => GeocodingService());
