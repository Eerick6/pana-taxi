import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config/app_env.dart';
import '../constants/api_constants.dart';
import '../storage/secure_storage.dart';

final authExpiredProvider = StateProvider<bool>((ref) => false);

final dioProvider = Provider<Dio>((ref) {
  final storage = ref.read(secureStorageProvider);

  final dio = Dio(BaseOptions(
    baseUrl: ApiConstants.baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 15),
    headers: {'Content-Type': 'application/json'},
  ));

  if (AppEnv.isProd && AppEnv.certPin.isNotEmpty) {
    _applyPinning(dio, AppEnv.certPin);
  }

  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (opts, handler) async {
      final token = await storage.getAccessToken();
      if (token != null) opts.headers['Authorization'] = 'Bearer $token';
      handler.next(opts);
    },
    onError: (err, handler) async {
      if (err.response?.statusCode == 401) {
        final refresh = await storage.getRefreshToken();
        if (refresh != null) {
          try {
            final res = await Dio(BaseOptions(baseUrl: ApiConstants.baseUrl))
                .post(ApiConstants.refresh, data: {'refresh_token': refresh});
            final newAccess  = res.data['access_token']  as String;
            final newRefresh = res.data['refresh_token'] as String? ?? refresh;
            await storage.saveTokens(access: newAccess, refresh: newRefresh);
            final opts = err.requestOptions
              ..headers['Authorization'] = 'Bearer $newAccess';
            return handler.resolve(await dio.fetch(opts));
          } catch (_) {
            await storage.clearAll();
            ref.read(authExpiredProvider.notifier).state = true;
          }
        } else {
          await storage.clearAll();
          ref.read(authExpiredProvider.notifier).state = true;
        }
      }
      handler.next(err);
    },
  ));

  return dio;
});

// ── Certificate pinning ──────────────────────────────────────────────────────
//
// Activado solo en prod cuando CERT_PIN está definido via --dart-define.
// Usa SecurityContext(withTrustedRoots: false) para verificar el SHA-256
// del certificado del servidor en cada conexión.
//
// Para obtener el pin de tu servidor en producción:
//   openssl s_client -connect api.panataxis.com:443 </dev/null 2>/dev/null \
//     | openssl x509 -outform DER \
//     | openssl dgst -sha256 -binary \
//     | base64
//
// Pasa el resultado como: --dart-define=CERT_PIN=<base64>

void _applyPinning(Dio dio, String pin) {
  dio.httpClientAdapter = IOHttpClientAdapter(
    onHttpClientCreate: (_) {
      final ctx = SecurityContext(withTrustedRoots: false);
      final client = HttpClient(context: ctx);
      client.badCertificateCallback = (X509Certificate cert, String host, int port) {
        final digest = sha256.convert(cert.der);
        return base64.encode(digest.bytes) == pin;
      };
      return client;
    },
  );
}
