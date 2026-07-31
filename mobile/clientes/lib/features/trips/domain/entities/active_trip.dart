import 'dart:convert';

class ActiveTrip {
  const ActiveTrip({
    required this.id,
    required this.status,
    required this.fareMode,
    required this.originAddress,
    required this.destinationAddress,
    this.originLat,
    this.originLng,
    this.destinationLat,
    this.destinationLng,
    this.routeGeometry,
    this.searchRadiusKm,
    this.createdAt,
    this.pendingOfferAmount,
    this.clientOffer,
    this.otpCode,
    this.driverName,
    this.driverPhone,
    this.driverPhoto,
    this.driverRating,
    this.vehiclePlate,
    this.vehicleModel,
  });

  final String    id;
  final String    status;
  final String    fareMode;
  final String    originAddress;
  final String    destinationAddress;
  final double?   originLat;
  final double?   originLng;
  final double?   destinationLat;
  final double?   destinationLng;
  final Map<String, dynamic>? routeGeometry;
  final double?   searchRadiusKm;
  final DateTime? createdAt;
  final double?   pendingOfferAmount;
  final double?   clientOffer;
  final String?   otpCode;
  final String?   driverName;
  final String?   driverPhone;
  final String?   driverPhoto;
  final double?   driverRating;
  final String?   vehiclePlate;
  final String?   vehicleModel;

  bool get isNegotiated => fareMode == 'negotiated';

  bool get isActive => const {
    'requested', 'accepted', 'driver_arrived', 'in_progress'
  }.contains(status);

  factory ActiveTrip.fromJson(Map<String, dynamic> j) => ActiveTrip(
    id:                  j['id']                        as String,
    status:              j['status']                    as String,
    fareMode:            j['fare_mode']                 as String? ?? 'meter',
    originAddress:       j['origin_address']            as String? ?? '',
    destinationAddress:  j['destination_address']       as String? ?? '',
    originLat:           _d(j['origin_lat']),
    originLng:           _d(j['origin_lng']),
    destinationLat:      _d(j['destination_lat']),
    destinationLng:      _d(j['destination_lng']),
    routeGeometry:       _parseGeometry(j['route_geometry']),
    searchRadiusKm:      _d(j['current_search_radius_km']),
    createdAt:           j['created_at'] != null
                           ? DateTime.tryParse(j['created_at'] as String)?.toLocal()
                           : null,
    pendingOfferAmount:  _d(j['pending_offer_amount']),
    clientOffer:         _d(j['client_offer']),
    otpCode:             j['otp_code']                  as String?,
    driverName:          (j['driver']  as Map?)?['full_name']          as String?,
    driverPhone:         (j['driver']  as Map?)?['phone']              as String?,
    driverPhoto:         (j['driver']  as Map?)?['profile_photo_url']  as String?,
    driverRating:        _d((j['driver'] as Map?)?['rating']),
    vehiclePlate:        (j['vehicle'] as Map?)?['plate']              as String?,
    vehicleModel:        () {
      final v = j['vehicle'] as Map?;
      if (v == null) return null;
      final brand = v['brand'] as String?;
      final model = v['model'] as String?;
      final parts = [brand, model].where((s) => s != null && s.isNotEmpty).toList();
      return parts.isEmpty ? null : parts.join(' ');
    }(),
  );
}

double? _d(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString());
}

Map<String, dynamic>? _parseGeometry(dynamic v) {
  if (v == null) return null;
  if (v is Map<String, dynamic>) return v;
  if (v is String && v.isNotEmpty) {
    try {
      return jsonDecode(v) as Map<String, dynamic>;
    } catch (_) {}
  }
  return null;
}
