import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/trips/domain/entities/place_result.dart';
import '../../features/trips/domain/entities/search_suggestion.dart';

const _kGoogleApiKey = 'AIzaSyARdXsYNXD9dd5Q57rA9Mv0essqk6243kU';

class GeocodingService {
  GeocodingService()
      : _google = Dio(BaseOptions(
          baseUrl: 'https://maps.googleapis.com',
          connectTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 5),
        )),
        _nominatim = Dio(BaseOptions(
          baseUrl: 'https://nominatim.openstreetmap.org',
          connectTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 5),
          headers: {'User-Agent': 'PanaTaxi/1.0'},
        ));

  final Dio _google;
  final Dio _nominatim;

  double? _cachedLat;
  double? _cachedLng;
  String? _cachedAddr;
  static const _cacheThresholdM = 30.0;

  // Google Places Autocomplete
  Future<List<SearchSuggestion>> suggest(
    String query, {
    double? lat,
    double? lng,
  }) async {
    if (query.trim().length < 2) return [];
    try {
      final params = <String, dynamic>{
        'input':      query.trim(),
        'key':        _kGoogleApiKey,
        'language':   'es',
        'components': 'country:ec',
        'types':      'geocode|establishment',
      };
      if (lat != null && lng != null) {
        params['location'] = '$lat,$lng';
        params['radius']   = 50000;
      }

      final res = await _google.get<Map<String, dynamic>>(
        '/maps/api/place/autocomplete/json',
        queryParameters: params,
      );

      final predictions = res.data?['predictions'] as List? ?? [];
      return predictions
          .map((p) => SearchSuggestion.fromGooglePlaces(p as Map<String, dynamic>))
          .toList();
    } catch (e) {
      if (kDebugMode) debugPrint('[Geocoding] suggest error: $e');
      return [];
    }
  }

  // Google Place Details — obtiene lat/lng a partir de un place_id
  Future<PlaceResult?> getPlaceDetails(String placeId) async {
    try {
      final res = await _google.get<Map<String, dynamic>>(
        '/maps/api/place/details/json',
        queryParameters: {
          'place_id': placeId,
          'key':      _kGoogleApiKey,
          'language': 'es',
          'fields':   'geometry,name,formatted_address',
        },
      );
      final result = res.data?['result'] as Map<String, dynamic>?;
      if (result == null) return null;

      final loc    = (result['geometry'] as Map?)?['location'] as Map?;
      final lat    = (loc?['lat'] as num?)?.toDouble();
      final lng    = (loc?['lng'] as num?)?.toDouble();
      if (lat == null || lng == null) return null;

      final name    = result['name']              as String? ?? '';
      final address = result['formatted_address'] as String? ?? name;

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
