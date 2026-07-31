import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_client.dart';
import '../models/vehicle_model.dart';

final vehicleRepositoryProvider = Provider<VehicleRepository>((ref) {
  return VehicleRepository(ref.read(dioProvider));
});

class VehicleRepository {
  VehicleRepository(this._dio);
  final Dio _dio;

  Future<List<VehicleModel>> getMyVehicles() async {
    try {
      final res = await _dio.get('/vehicles/mine');
      final data = res.data;
      final items = (data is List ? data : (data['items'] ?? data['data'] ?? data)) as List;
      return items.map((e) => VehicleModel.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al cargar vehículos');
    }
  }

  Future<String> registerVehicle({
    required String cooperativeId,
    required String plate,
    required String brand,
    required String model,
    required String color,
    required int year,
  }) async {
    try {
      final res = await _dio.post('/vehicles', data: {
        'cooperative_id': cooperativeId,
        'plate': plate,
        'brand': brand,
        'model': model,
        'color': color,
        'year': year,
      });
      final data = res.data as Map<String, dynamic>;
      return data['vehicle_id'] as String;
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al registrar vehículo');
    }
  }

  Future<List<VehicleDocumentModel>> getVehicleDocuments(String vehicleId) async {
    try {
      final res = await _dio.get('/vehicles/$vehicleId/documents');
      final data = res.data;
      final items = (data is List ? data : (data['items'] ?? data['data'] ?? data)) as List;
      return items.map((e) => VehicleDocumentModel.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al cargar documentos del vehículo');
    }
  }

  Future<List<VehicleDocumentModel>> uploadVehicleDocument(
      String vehicleId, String type, File file) async {
    try {
      final formData = FormData.fromMap({
        'type': type,
        'file': await MultipartFile.fromFile(file.path, filename: file.path.split('/').last),
      });
      await _dio.post('/vehicles/$vehicleId/documents', data: formData);
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al subir documento');
    }
    return getVehicleDocuments(vehicleId);
  }

  Future<List<CooperativeModel>> getActiveCooperatives() async {
    try {
      final res = await _dio.get('/cooperatives/active');
      final data = res.data;
      final items = (data['items'] ?? data) as List;
      return items.map((e) => CooperativeModel.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al cargar cooperativas');
    }
  }

  Future<void> joinCooperative(String cooperativeId) async {
    try {
      await _dio.post('/drivers/me/cooperatives', data: {'cooperative_id': cooperativeId});
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al solicitar membresía');
    }
  }

  Future<void> deleteMyVehicle(String vehicleId) async {
    try {
      await _dio.delete('/vehicles/mine/$vehicleId');
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al eliminar vehículo');
    }
  }
}
