import '../../../../core/storage/secure_storage.dart';
import '../../domain/entities/auth_tokens.dart';
import '../../domain/repositories/auth_repository.dart';
import '../datasources/auth_api.dart';

class AuthRepositoryImpl implements AuthRepository {
  const AuthRepositoryImpl(this._api, this._storage);

  final AuthApi _api;
  final SecureStorage _storage;

  @override
  Future<Map<String, dynamic>> getClientTerms() => _api.getClientTerms();

  @override
  Future<String?> registerClient({
    required String phone,
    required String fullName,
    required String cedula,
    required String termsVersion,
    required String password,
  }) =>
      _api.registerClient(
        phone: phone,
        fullName: fullName,
        cedula: cedula,
        termsVersion: termsVersion,
        password: password,
      );

  @override
  Future<AuthTokens> loginWithPhone({
    required String phone,
    required String password,
  }) async {
    final tokens = await _api.loginWithPhone(phone: phone, password: password);
    await _storage.saveTokens(
      access:  tokens.accessToken,
      refresh: tokens.refreshToken,
    );
    return tokens;
  }

  @override
  Future<String?> requestOtp({required String phone}) =>
      _api.requestOtp(phone: phone);

  @override
  Future<AuthTokens> verifyOtp({
    required String phone,
    required String code,
  }) async {
    final tokens = await _api.verifyOtp(phone: phone, code: code);
    await _storage.saveTokens(
      access:  tokens.accessToken,
      refresh: tokens.refreshToken,
    );
    return tokens;
  }

  @override
  Future<bool> hasStoredSession() async {
    final token = await _storage.getRefreshToken();
    return token != null && token.isNotEmpty;
  }

  @override
  Future<void> loginWithBiometric() async {
    final refresh = await _storage.getRefreshToken();
    if (refresh == null || refresh.isEmpty) {
      throw Exception('No hay sesión guardada. Inicia sesión con tu contraseña.');
    }
    try {
      final data = await _api.refreshSession(refresh);
      await _storage.saveTokens(
        access:  data['access_token'] as String,
        refresh: data['refresh_token'] as String? ?? refresh,
      );
    } catch (_) {
      await _storage.clearAll();
      throw Exception('Tu sesión expiró. Inicia sesión con tu contraseña.');
    }
  }

  @override
  Future<void> forgotPassword(String email) => _api.forgotPassword(email);

  @override
  Future<void> resetPassword(String email, String token, String password) =>
      _api.resetPassword(email, token, password);

  @override
  Future<String> uploadPhoto(List<int> bytes, String filename) =>
      _api.uploadPhoto(bytes, filename);
}
