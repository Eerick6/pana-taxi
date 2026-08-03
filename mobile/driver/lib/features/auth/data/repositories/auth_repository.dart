import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/storage/secure_storage.dart';
import '../models/user_model.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    dio: ref.read(dioProvider),
    storage: ref.read(secureStorageProvider),
  );
});

class AuthRepository {
  AuthRepository({required this.dio, required this.storage});

  final Dio dio;
  final SecureStorageService storage;

  /// Registra un nuevo conductor y envía OTP al teléfono para verificación.
  /// Retorna el dev_code si el backend está en modo dev.
  Future<String?> registerDriver({
    required String fullName,
    required String phone,
    required String driverType,
    required String password,
  }) async {
    try {
      await dio.post('/drivers/register', data: {
        'full_name':    fullName,
        'phone':        phone,
        'driver_type':  driverType,
        'terms_version': '1.0',
        'password':     password,
      });
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al registrar');
    }
    return requestOtp(phone);
  }

  /// Login con teléfono + contraseña. Guarda tokens y retorna el usuario.
  Future<UserModel> loginWithPhone(String phone, String password) async {
    try {
      final res = await dio.post('/auth/login/phone', data: {
        'phone':    phone,
        'password': password,
      });
      final data = res.data as Map<String, dynamic>;
      await storage.saveTokens(
        accessToken:  data['access_token'] as String,
        refreshToken: data['refresh_token'] as String? ?? '',
      );
      final meRes = await dio.get('/auth/me');
      return UserModel.fromJson(meRes.data as Map<String, dynamic>);
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Teléfono o contraseña incorrectos');
    }
  }

  /// Solicita OTP por SMS al número de teléfono.
  /// En modo dev retorna el código directamente para mostrarlo en UI.
  Future<String?> requestOtp(String phone) async {
    try {
      final res = await dio.post('/auth/otp/request', data: {'phone': phone});
      final data = res.data as Map<String, dynamic>?;
      return data?['dev_code'] as String?;
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al enviar código');
    }
  }

  /// Verifica el OTP, guarda tokens y retorna el usuario
  Future<UserModel> verifyOtp(String phone, String otp) async {
    try {
      final res = await dio.post('/auth/otp/verify', data: {
        'phone': phone,
        'code': otp,
      });
      final data = res.data as Map<String, dynamic>;
      await storage.saveTokens(
        accessToken: data['access_token'] as String,
        refreshToken: data['refresh_token'] as String? ?? '',
      );
      // El backend retorna tokens + role, no un objeto user — obtenemos el perfil aparte
      final meRes = await dio.get('/auth/me');
      return UserModel.fromJson(meRes.data as Map<String, dynamic>);
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Código inválido');
    }
  }

  /// Obtiene el usuario autenticado desde el token almacenado
  Future<UserModel?> getMe() async {
    try {
      final res = await dio.get('/auth/me');
      return UserModel.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      // 401 = no sesión, cualquier otro error (sin red, timeout) = ir a login igual
      if (e.response?.statusCode == 401) return null;
      return null;
    } catch (_) {
      return null;
    }
  }

  /// Returns true if a refresh token is stored (previous session exists).
  Future<bool> hasStoredSession() async {
    final token = await storage.getRefreshToken();
    return token != null && token.isNotEmpty;
  }

  /// Refreshes session using stored refresh token (called after biometric auth).
  Future<void> loginWithBiometric() async {
    final refresh = await storage.getRefreshToken();
    if (refresh == null || refresh.isEmpty) {
      throw Exception('No hay sesión guardada. Inicia sesión con tu contraseña.');
    }
    try {
      final res = await dio.post('/auth/refresh', data: {'refresh_token': refresh});
      final data = res.data as Map<String, dynamic>;
      await storage.saveTokens(
        accessToken:  data['access_token'] as String,
        refreshToken: data['refresh_token'] as String? ?? refresh,
      );
    } on DioException catch (_) {
      await storage.clearAll();
      throw Exception('Tu sesión expiró. Inicia sesión con tu contraseña.');
    }
  }

  Future<void> forgotPassword(String email) async {
    try {
      await dio.post('/auth/password/forgot', data: {'email': email});
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al enviar correo');
    }
  }

  Future<void> resetPassword(String email, String token, String password) async {
    try {
      await dio.post('/auth/password/reset', data: {
        'email':    email,
        'token':    token,
        'password': password,
      });
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Token inválido o expirado');
    }
  }

  Future<void> logout() async {
    try {
      await dio.post('/auth/logout');
    } catch (_) {}
    await storage.clearAll();
  }
}
