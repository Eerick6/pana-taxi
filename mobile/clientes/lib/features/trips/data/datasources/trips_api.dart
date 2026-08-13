import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_client.dart';
import '../../domain/entities/active_trip.dart';
import '../../domain/entities/fare_estimate.dart';

class NearbyDriver {
  const NearbyDriver({required this.id, required this.lat, required this.lng});
  final String id;
  final double lat;
  final double lng;
  factory NearbyDriver.fromJson(Map<String, dynamic> j) => NearbyDriver(
    id:  j['id'] as String,
    lat: (j['lat'] as num).toDouble(),
    lng: (j['lng'] as num).toDouble(),
  );
}

class DriverOffer {
  const DriverOffer({
    required this.offerId,
    required this.driverId,
    required this.driverName,
    required this.amount,
    required this.isCounter,
    this.fareMode = 'negotiated',
    this.driverPhoto,
    this.driverRating,
    this.driverTotalTrips,
    this.coopName,
    this.vehiclePlate,
    this.vehicleModel,
    this.vehicleColor,
    this.etaMin,
    this.distanceToOriginKm,
  });

  final String  offerId;
  final String  driverId;
  final String  driverName;
  final double  amount;
  final bool    isCounter;
  final String  fareMode;
  final String? driverPhoto;
  final double? driverRating;
  final int?    driverTotalTrips;
  final String? coopName;
  final String? vehiclePlate;
  final String? vehicleModel;
  final String? vehicleColor;
  final int?    etaMin;
  final double? distanceToOriginKm;

  bool get isMeter => fareMode == 'meter';

  static double? _d(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString());
  }

  factory DriverOffer.fromJson(Map<String, dynamic> j) {
    final driver  = j['driver']  as Map<String, dynamic>;
    final vehicle = j['vehicle'] as Map<String, dynamic>?;
    return DriverOffer(
      offerId:             j['offer_id']              as String,
      driverId:            driver['id']               as String,
      driverName:          driver['name']             as String? ?? 'Conductor',
      driverPhoto:         driver['photo']            as String?,
      driverRating:        _d(driver['rating']),
      driverTotalTrips:    driver['total_trips']      as int?,
      coopName:            j['coop_name']             as String?,
      amount:              (_d(j['amount']) ?? 0),
      fareMode:            j['fare_mode']             as String? ?? 'negotiated',
      isCounter:           j['is_counter']            as bool? ?? false,
      vehiclePlate:        vehicle?['plate']          as String?,
      vehicleModel:        vehicle?['model']          as String?,
      vehicleColor:        vehicle?['color']          as String?,
      etaMin:              j['eta_pickup_min']        as int?,
      distanceToOriginKm:  _d(j['distance_to_origin_km']),
    );
  }

  /// Construye desde el evento socket trip.new_offer
  factory DriverOffer.fromSocketEvent(Map<String, dynamic> j) {
    return DriverOffer(
      offerId:             j['offer_id']              as String,
      driverId:            j['driver_id']             as String,
      driverName:          j['driver_name']           as String? ?? 'Conductor',
      driverPhoto:         j['driver_photo']          as String?,
      driverRating:        _d(j['driver_rating']),
      driverTotalTrips:    j['driver_total_trips']    as int?,
      coopName:            j['coop_name']             as String?,
      amount:              (_d(j['amount']) ?? 0),
      fareMode:            j['fare_mode']             as String? ?? 'negotiated',
      isCounter:           j['is_counter']            as bool? ?? false,
      vehiclePlate:        j['vehicle_plate']         as String?,
      vehicleModel:        j['vehicle_model']         as String?,
      vehicleColor:        j['vehicle_color']         as String?,
      etaMin:              j['eta_pickup_min']        as int?,
      distanceToOriginKm:  _d(j['distance_to_origin_km']),
    );
  }
}

class TripsApi {
  const TripsApi(this._dio);
  final Dio _dio;

  Future<ActiveTrip?> getActiveTrip() async {
    try {
      final res = await _dio.get('/trips/me/active');
      if (res.data == null) return null;
      return ActiveTrip.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      rethrow;
    }
  }

  Future<ActiveTrip> createTrip({
    required String destinationAddress,
    required double destinationLat,
    required double destinationLng,
    String?  originAddress,
    double?  originLat,
    double?  originLng,
    String   fareMode = 'meter',
    double?  clientOffer,
    String?  paymentMethodSlug,
  }) async {
    final res = await _dio.post('/trips', data: {
      'destination_address': destinationAddress,
      'destination_lat':     destinationLat,
      'destination_lng':     destinationLng,
      if (originAddress      != null) 'origin_address':      originAddress,
      if (originLat          != null) 'origin_lat':          originLat,
      if (originLng          != null) 'origin_lng':          originLng,
      'fare_mode':           fareMode,
      if (clientOffer        != null) 'client_offer':        clientOffer,
      if (paymentMethodSlug  != null) 'payment_method_slug': paymentMethodSlug,
    });
    return ActiveTrip.fromJson(res.data as Map<String, dynamic>);
  }

  Future<List<NearbyDriver>> getNearbyDrivers(double lat, double lng, double radiusKm) async {
    try {
      final res = await _dio.get('/drivers/nearby', queryParameters: {
        'lat': lat,
        'lng': lng,
        'radius': radiusKm,
      });
      return (res.data as List)
          .map((d) => NearbyDriver.fromJson(d as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<List<DriverOffer>> getOffers(String tripId) async {
    try {
      final res = await _dio.get('/trips/$tripId/offers');
      return (res.data as List)
          .map((o) => DriverOffer.fromJson(o as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> selectOffer(String tripId, String offerId) async {
    await _dio.patch('/trips/$tripId/offers/$offerId/select');
  }

  Future<void> rejectOffer(String tripId, String offerId) async {
    await _dio.patch('/trips/$tripId/offers/$offerId/reject');
  }

  Future<double> incrementOffer(String tripId) async {
    final res = await _dio.patch('/trips/$tripId/increment-offer');
    return (res.data['client_offer'] as num).toDouble();
  }

  Future<double> decrementOffer(String tripId) async {
    final res = await _dio.patch('/trips/$tripId/decrement-offer');
    return (res.data['client_offer'] as num).toDouble();
  }

  Future<double> setOffer(String tripId, double amount) async {
    final res = await _dio.patch('/trips/$tripId/set-offer', data: {'amount': amount});
    return (res.data['client_offer'] as num).toDouble();
  }

  Future<void> cancelTrip(String tripId, {String reason = 'Cliente canceló'}) async {
    await _dio.patch('/trips/$tripId/cancel', data: {'reason': reason});
  }

  Future<void> clientReady(String tripId) async {
    await _dio.patch('/trips/$tripId/client-ready');
  }

  Future<FareEstimate> getFareEstimate({
    required double originLat,
    required double originLng,
    required double destLat,
    required double destLng,
  }) async {
    final res = await _dio.get('/fares/estimate', queryParameters: {
      'origin_lat': originLat,
      'origin_lng': originLng,
      'dest_lat':   destLat,
      'dest_lng':   destLng,
    });
    return FareEstimate.fromJson(res.data as Map<String, dynamic>);
  }
}

final tripsApiProvider = Provider<TripsApi>((ref) => TripsApi(ref.read(dioProvider)));
