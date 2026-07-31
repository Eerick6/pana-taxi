/// Lee las variables inyectadas via --dart-define-from-file=env/dev.json
/// No uses String.fromEnvironment directamente fuera de esta clase.
class AppConfig {
  AppConfig._();

  static const String env = String.fromEnvironment('APP_ENV', defaultValue: 'dev');
  static const String appName = String.fromEnvironment('APP_NAME', defaultValue: 'Pana Driver');
  static const String apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3002');
  static const String wsUrl = String.fromEnvironment('WS_URL', defaultValue: 'http://10.0.2.2:3002');
  static const String mapboxToken = String.fromEnvironment(
    'MAPBOX_TOKEN',
    defaultValue: '',
  );
  static const bool enableHttpLogs = bool.fromEnvironment('ENABLE_HTTP_LOGS', defaultValue: false);
  static const String certPin = String.fromEnvironment('CERT_PIN', defaultValue: '');

  static bool get isDev => env == 'dev';
  static bool get isPre => env == 'pre';
  static bool get isProd => env == 'prod';
}
