import '../config/app_env.dart';

class ApiConstants {
  ApiConstants._();

  static const String baseUrl = AppEnv.baseUrl;

  // Auth
  static const String registerClient = '/auth/register/client';
  static const String requestOtp     = '/auth/otp/request';
  static const String verifyOtp      = '/auth/otp/verify';
  static const String loginPhone     = '/auth/login/phone';
  static const String refresh         = '/auth/refresh';
  static const String logout          = '/auth/logout';
  static const String forgotPassword  = '/auth/password/forgot';
  static const String resetPassword   = '/auth/password/reset';

  // Terms
  static const String clientTerms = '/terms/client';

  // Profile
  static const String clientProfile     = '/clients/me';
  static const String uploadPhoto       = '/clients/me/photo';
  static const String emergencyContacts = '/clients/me/emergency-contacts';
}
