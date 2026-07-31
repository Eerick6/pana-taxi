class AppEnv {
  AppEnv._();

  static const String _flavor = String.fromEnvironment('FLAVOR', defaultValue: 'dev');

  static const bool isDev  = _flavor != 'prod';
  static const bool isProd = _flavor == 'prod';

  static const String baseUrl = _flavor == 'prod'
      ? 'https://api.panataxis.com'
      : 'http://10.0.2.2:3002';

  static const String mapboxToken = String.fromEnvironment(
    'MAPBOX_TOKEN',
    defaultValue: '',
  );

  static const String certPin = String.fromEnvironment('CERT_PIN', defaultValue: '');

  static const String googleMapsKey = String.fromEnvironment('GOOGLE_MAPS_KEY', defaultValue: '');
}
