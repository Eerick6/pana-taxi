import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_client.dart';
import '../models/trip_model.dart';

final tripRepositoryProvider = Provider<TripRepository>((ref) {
  return TripRepository(ref.read(dioProvider));
});

class TripRepository {
  TripRepository(this._dio);
  final Dio _dio;

  Future<TripModel?> getActiveTrip() async {
    try {
      final res = await _dio.get('/trips/driver/me/active');
      if (res.data == null) return null;
      return TripModel.fromJson(res.data as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  // Accept returns {message, trip_id} — refetch active trip after
  Future<TripModel?> acceptTrip(String tripId) async {
    try {
      await _dio.patch('/trips/$tripId/accept');
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al aceptar viaje');
    }
    return getActiveTrip();
  }

  // markArrived returns {message, wait_expires_at} — refetch active trip after
  Future<TripModel?> markArrived(String tripId) async {
    try {
      await _dio.patch('/trips/$tripId/arrived');
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al marcar llegada');
    }
    return getActiveTrip();
  }

  // startTrip requires otp_code (client gives it to driver in person; '000000' works in dev)
  Future<TripModel?> startTrip(String tripId, String otpCode) async {
    try {
      await _dio.patch('/trips/$tripId/start', data: {'otp_code': otpCode});
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Código OTP incorrecto');
    }
    return getActiveTrip();
  }

  Future<List<TripModel>> getMyTrips({int page = 1, int limit = 30}) async {
    final res = await _dio.get('/trips/driver/me', queryParameters: {'page': page, 'limit': limit});
    final items = (res.data['items'] as List? ?? []);
    return items.map((i) => TripModel.fromJson(i as Map<String, dynamic>)).toList();
  }

  // completeTrip requires fare_amount; backend uses meter/agreed_fare if available
  Future<void> completeTrip(String tripId, double fareAmount) async {
    try {
      await _dio.patch('/trips/$tripId/complete', data: {'fare_amount': fareAmount});
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al finalizar viaje');
    }
  }

  Future<void> cancelTrip(String tripId, String reason) async {
    try {
      await _dio.patch('/trips/$tripId/cancel', data: {'reason': reason});
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al cancelar viaje');
    }
  }
}
