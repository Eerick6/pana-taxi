class TripModel {
  const TripModel({
    required this.id,
    required this.status,
    required this.originAddress,
    required this.destinationAddress,
    required this.originLat,
    required this.originLng,
    required this.destinationLat,
    required this.destinationLng,
    required this.clientName,
    required this.clientPhone,
    required this.createdAt,
    this.fare,
    this.distance,
    this.durationMinutes,
    this.waitTimerExpiresAt,
  });

  final String    id;
  final String    status;
  final String    originAddress;
  final String    destinationAddress;
  final double    originLat;
  final double    originLng;
  final double    destinationLat;
  final double    destinationLng;
  final String    clientName;
  final String    clientPhone;
  final DateTime  createdAt;
  final double?   fare;
  final double?   distance;
  final int?      durationMinutes;
  final DateTime? waitTimerExpiresAt;

  bool get isActive => ['accepted', 'driver_arrived', 'in_progress'].contains(status);

  factory TripModel.fromJson(Map<String, dynamic> json) {
    // TypeORM decimal columns come back as strings from the pg driver.
    // This helper handles both num and String safely.
    double toDouble(dynamic v, [double fallback = 0]) {
      if (v == null) return fallback;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? fallback;
    }

    double? toDoubleOpt(dynamic v) {
      if (v == null) return null;
      if (v is num) return v.toDouble();
      final parsed = double.tryParse(v.toString());
      return (parsed != null && parsed > 0) ? parsed : null;
    }

    // client is a User entity — has phone/email but NOT full_name
    final client = json['client'] as Map<String, dynamic>?;

    // fare: check multiple possible fields in priority order
    double? parseFare() {
      for (final key in ['fare_amount', 'meter_amount', 'agreed_fare', 'client_offer']) {
        final result = toDoubleOpt(json[key]);
        if (result != null) return result;
      }
      return null;
    }

    return TripModel(
      id: json['id'] as String,
      status: json['status'] as String,
      originAddress: json['origin_address'] as String? ?? '',
      destinationAddress: json['destination_address'] as String? ?? '',
      originLat: toDouble(json['origin_lat']),
      originLng: toDouble(json['origin_lng']),
      destinationLat: toDouble(json['destination_lat']),
      destinationLng: toDouble(json['destination_lng']),
      // walk_in_client_name for walk-in trips; otherwise use phone (User has no full_name)
      clientName: json['walk_in_client_name'] as String? ??
          client?['phone'] as String? ??
          client?['email'] as String? ??
          'Cliente',
      clientPhone: client?['phone'] as String? ?? '',
      createdAt: DateTime.parse(json['created_at'] as String),
      fare: parseFare(),
      distance: toDoubleOpt(json['estimated_distance_km']),
      durationMinutes: json['estimated_duration_min'] as int?,
      waitTimerExpiresAt: json['wait_timer_expires_at'] != null
          ? DateTime.tryParse(json['wait_timer_expires_at'].toString())?.toLocal()
          : null,
    );
  }
}
