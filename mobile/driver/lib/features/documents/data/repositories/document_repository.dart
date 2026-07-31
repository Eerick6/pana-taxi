import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_client.dart';
import '../models/document_model.dart';

final documentRepositoryProvider = Provider<DocumentRepository>((ref) {
  return DocumentRepository(ref.read(dioProvider));
});

class DocumentRepository {
  DocumentRepository(this._dio);
  final Dio _dio;

  Future<List<DocumentModel>> getDocuments() async {
    try {
      final res = await _dio.get('/drivers/documents');
      final data = res.data;
      final items = (data is List ? data : (data['items'] ?? data['data'] ?? [])) as List;
      return items.map((e) => DocumentModel.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al cargar documentos');
    }
  }

  // Backend returns {message, document_id} — upload, then refetch list
  Future<List<DocumentModel>> uploadDocument(String type, File file) async {
    try {
      final formData = FormData.fromMap({
        'type': type,
        'file': await MultipartFile.fromFile(file.path, filename: file.path.split('/').last),
      });
      await _dio.post('/drivers/documents', data: formData);
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al subir documento');
    }
    return getDocuments();
  }
}
