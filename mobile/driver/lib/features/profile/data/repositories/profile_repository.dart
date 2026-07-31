import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_client.dart';
import '../models/driver_profile_model.dart';

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(ref.read(dioProvider));
});

class ProfileRepository {
  ProfileRepository(this._dio);
  final Dio _dio;

  Future<DriverProfileModel> getProfile() async {
    final res = await _dio.get('/drivers/me');
    return DriverProfileModel.fromJson(res.data as Map<String, dynamic>);
  }

  // Backend returns {online_status} — refetch full profile after
  Future<DriverProfileModel> updateStatus(String status) async {
    try {
      await _dio.patch('/drivers/me/status', data: {'status': status});
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al cambiar estado');
    }
    return getProfile();
  }

  // Backend expects 'lat' and 'lng', not 'latitude'/'longitude'
  Future<void> updateLocation({required double lat, required double lng}) async {
    await _dio.patch('/drivers/me/location', data: {'lat': lat, 'lng': lng});
  }

  Future<DriverProfileModel> startDay({String? vehicleId}) async {
    try {
      await _dio.post('/drivers/me/start-day',
          data: vehicleId != null ? {'vehicle_id': vehicleId} : null);
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al iniciar jornada');
    }
    return getProfile();
  }

  Future<DriverProfileModel> endDay() async {
    try {
      await _dio.post('/drivers/me/end-day');
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al terminar jornada');
    }
    return getProfile();
  }
}
