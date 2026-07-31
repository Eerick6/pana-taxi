import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_client.dart';
import '../models/vehicle_request_model.dart';
import '../models/owner_vehicle_request_model.dart';
import '../models/application_model.dart';

final vehicleRequestRepositoryProvider = Provider<VehicleRequestRepository>((ref) {
  return VehicleRequestRepository(ref.read(dioProvider));
});

class VehicleRequestRepository {
  VehicleRequestRepository(this._dio);
  final Dio _dio;

  // ── Driver: browse open requests ────────────────────────────────────────────

  Future<List<VehicleRequestModel>> getOpenRequests() async {
    final res = await _dio.get('/vehicle-requests/open');
    final data = res.data;
    final items = (data is List ? data : (data['items'] ?? data['data'] ?? [])) as List;
    return items.map((e) => VehicleRequestModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> apply(String requestId, {String? message}) async {
    await _dio.post('/vehicle-requests/$requestId/apply',
        data: message != null ? {'message': message} : null);
  }

  Future<void> withdraw(String applicationId) async {
    await _dio.patch('/vehicle-requests/applications/$applicationId/withdraw');
  }

  // ── Driver: own applications ─────────────────────────────────────────────────

  Future<List<ApplicationModel>> getMyApplications() async {
    final res = await _dio.get('/vehicle-requests/my-applications');
    final items = res.data as List? ?? [];
    return items.map((e) => ApplicationModel.fromDriverJson(e as Map<String, dynamic>)).toList();
  }

  Future<Map<String, dynamic>> startDay() async {
    final res = await _dio.post('/drivers/me/start-day');
    return res.data as Map<String, dynamic>;
  }

  // ── Owner: manage own requests ───────────────────────────────────────────────

  Future<List<OwnerVehicleRequestModel>> getMyRequests() async {
    final res = await _dio.get('/vehicle-requests/mine');
    final items = res.data as List? ?? [];
    return items.map((e) => OwnerVehicleRequestModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Map<String, dynamic>> createRequest({
    required String vehicleId,
    String? notes,
  }) async {
    final res = await _dio.post('/vehicle-requests', data: {
      'vehicle_id': vehicleId,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    });
    return res.data as Map<String, dynamic>;
  }

  Future<void> cancelRequest(String requestId) async {
    await _dio.patch('/vehicle-requests/$requestId/cancel');
  }

  Future<List<ApplicationModel>> getApplicationsForRequest(String requestId) async {
    final res = await _dio.get('/vehicle-requests/$requestId/applications');
    final items = res.data as List? ?? [];
    return items.map((e) => ApplicationModel.fromOwnerJson(e as Map<String, dynamic>)).toList();
  }

  Future<Map<String, dynamic>> acceptApplication(String requestId, String appId) async {
    final res = await _dio.patch('/vehicle-requests/$requestId/applications/$appId/accept');
    return res.data as Map<String, dynamic>;
  }
}
