import '../entities/auth_tokens.dart';

abstract class AuthRepository {
  /// Fetches current client terms. Returns { version, content }.
  Future<Map<String, dynamic>> getClientTerms();

  /// Registers a new client. Returns dev_code in dev mode, null in production.
  Future<String?> registerClient({
    required String phone,
    required String fullName,
    required String cedula,
    required String termsVersion,
    required String password,
  });

  /// Login with phone number + password. Persists tokens and returns them.
  Future<AuthTokens> loginWithPhone({
    required String phone,
    required String password,
  });

  /// Returns true if a refresh token is stored (previous session exists).
  Future<bool> hasStoredSession();

  /// Refreshes session using stored refresh token (called after biometric auth).
  /// Throws if no session or if refresh token expired.
  Future<void> loginWithBiometric();

  /// Requests OTP for an existing phone. Returns dev_code in dev mode, null in production.
  Future<String?> requestOtp({required String phone});

  /// Verifies OTP and returns tokens. Also persists them in secure storage.
  Future<AuthTokens> verifyOtp({
    required String phone,
    required String code,
  });

  /// Sends a password reset code to the given email.
  Future<void> forgotPassword(String email);

  /// Resets password using the code sent to email.
  Future<void> resetPassword(String email, String token, String password);

  /// Uploads profile photo. Returns the stored URL.
  Future<String> uploadPhoto(List<int> bytes, String filename);
}
