import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_client.dart';

final ratingsRepositoryProvider = Provider<RatingsRepository>((ref) {
  return RatingsRepository(ref.read(dioProvider));
});

class DriverRatingStats {
  const DriverRatingStats({
    required this.fromClientsAvg,
    required this.fromClientsTotal,
    required this.fromOwnersAvg,
    required this.fromOwnersTotal,
  });

  final double fromClientsAvg;
  final int fromClientsTotal;
  final double fromOwnersAvg;
  final int fromOwnersTotal;

  double get overallAvg {
    final total = fromClientsTotal + fromOwnersTotal;
    if (total == 0) return 0;
    return (fromClientsAvg * fromClientsTotal + fromOwnersAvg * fromOwnersTotal) / total;
  }

  int get total => fromClientsTotal + fromOwnersTotal;

  factory DriverRatingStats.fromJson(Map<String, dynamic> json) {
    final fc = json['from_clients'] as Map<String, dynamic>? ?? {};
    final fo = json['from_owners'] as Map<String, dynamic>? ?? {};
    return DriverRatingStats(
      fromClientsAvg: (fc['average'] as num?)?.toDouble() ?? 0.0,
      fromClientsTotal: fc['total'] as int? ?? 0,
      fromOwnersAvg: (fo['average'] as num?)?.toDouble() ?? 0.0,
      fromOwnersTotal: fo['total'] as int? ?? 0,
    );
  }
}

class OwnerRatingStats {
  const OwnerRatingStats({required this.average, required this.total});
  final double average;
  final int total;

  factory OwnerRatingStats.fromJson(Map<String, dynamic> json) => OwnerRatingStats(
        average: (json['average'] as num?)?.toDouble() ?? 0.0,
        total: json['total'] as int? ?? 0,
      );
}

class RatingsRepository {
  RatingsRepository(this._dio);
  final Dio _dio;

  Future<DriverRatingStats> getDriverStats(String driverId) async {
    try {
      final res = await _dio.get('/ratings/drivers/$driverId');
      return DriverRatingStats.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al cargar calificaciones');
    }
  }

  Future<OwnerRatingStats> getOwnerStats(String ownerId) async {
    try {
      final res = await _dio.get('/ratings/owners/$ownerId');
      return OwnerRatingStats.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al cargar calificaciones');
    }
  }

  Future<void> submitRating({
    required String direction,
    String? tripId,
    String? vehicleRequestId,
    required int score,
    String? comment,
  }) async {
    try {
      await _dio.post('/ratings', data: {
        'direction': direction,
        if (tripId != null) 'trip_id': tripId,
        if (vehicleRequestId != null) 'vehicle_request_id': vehicleRequestId,
        'score': score,
        if (comment != null && comment.isNotEmpty) 'comment': comment,
      });
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al enviar calificación');
    }
  }
}
