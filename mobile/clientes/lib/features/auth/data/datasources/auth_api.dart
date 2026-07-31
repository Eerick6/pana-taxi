import 'package:dio/dio.dart';
import '../../../../core/constants/api_constants.dart';
import '../../domain/entities/auth_tokens.dart';
import '../models/auth_response_model.dart';

class AuthApi {
  const AuthApi(this._dio);
  final Dio _dio;

  Future<Map<String, dynamic>> getClientTerms() async {
    final res = await _dio.get(ApiConstants.clientTerms);
    return res.data as Map<String, dynamic>;
  }

  Future<String?> registerClient({
    required String phone,
    required String fullName,
    required String cedula,
    required String termsVersion,
    required String password,
  }) async {
    try {
      final res = await _dio.post(ApiConstants.registerClient, data: {
        'phone':         phone,
        'full_name':     fullName,
        'cedula':        cedula,
        'terms_version': termsVersion,
        'password':      password,
      });
      return res.data['dev_code'] as String?;
    } on DioException catch (e) {
      throw Exception(_parseError(e));
    }
  }

  Future<Map<String, dynamic>> refreshSession(String refreshToken) async {
    try {
      final res = await _dio.post(ApiConstants.refresh, data: {'refresh_token': refreshToken});
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception(_parseError(e));
    }
  }

  Future<AuthTokens> loginWithPhone({
    required String phone,
    required String password,
  }) async {
    try {
      final res = await _dio.post(ApiConstants.loginPhone, data: {
        'phone':    phone,
        'password': password,
      });
      return AuthTokensModel.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw Exception(_parseError(e));
    }
  }

  Future<String?> requestOtp({required String phone}) async {
    try {
      final res = await _dio.post(ApiConstants.requestOtp, data: {'phone': phone});
      return res.data['dev_code'] as String?;
    } on DioException catch (e) {
      throw Exception(_parseError(e));
    }
  }

  Future<AuthTokens> verifyOtp({
    required String phone,
    required String code,
  }) async {
    try {
      final res = await _dio.post(ApiConstants.verifyOtp, data: {
        'phone': phone,
        'code':  code,
      });
      return AuthTokensModel.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw Exception(_parseError(e));
    }
  }

  Future<String> uploadPhoto(List<int> bytes, String filename) async {
    try {
      final res = await _dio.post(
        ApiConstants.uploadPhoto,
        data: FormData.fromMap({
          'file': MultipartFile.fromBytes(bytes, filename: filename),
        }),
      );
      return res.data['profile_photo_url'] as String;
    } on DioException catch (e) {
      throw Exception(_parseError(e));
    }
  }

  // Extrae el mensaje legible que envía NestJS en el cuerpo del error
  String _parseError(DioException e) {
    final data = e.response?.data;
    if (data is Map) {
      final msg = data['message'];
      if (msg is String) return msg;
      if (msg is List && msg.isNotEmpty) return msg.first as String;
    }
    return switch (e.response?.statusCode) {
      400 => 'Datos inválidos. Revisa la información.',
      401 => 'No autorizado.',
      409 => 'El teléfono o cédula ya está registrado.',
      422 => 'Error de validación.',
      500 => 'Error del servidor. Intenta más tarde.',
      _   => 'Error de conexión. Verifica tu red.',
    };
  }
}
