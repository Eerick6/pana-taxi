import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config/app_config.dart';
import '../storage/secure_storage.dart';

final dioProvider = Provider<Dio>((ref) {
  final storage = ref.read(secureStorageProvider);
  return _buildDio(storage);
});

Dio _buildDio(SecureStorageService storage) {
  final dio = Dio(BaseOptions(
    baseUrl: AppConfig.apiUrl,
    connectTimeout: const Duration(seconds: 5),
    receiveTimeout: const Duration(seconds: 10),
    headers: {'Content-Type': 'application/json'},
  ));

  if (AppConfig.isProd && AppConfig.certPin.isNotEmpty) {
    _applyPinning(dio, AppConfig.certPin);
  }

  dio.interceptors.addAll([
    _AuthInterceptor(dio, storage),
    if (AppConfig.enableHttpLogs) _LogInterceptor(),
  ]);

  return dio;
}

// ── Certificate pinning ──────────────────────────────────────────────────────
//
// Activado solo en prod cuando CERT_PIN está definido via --dart-define.
// Usa SecurityContext(withTrustedRoots: false) para que badCertificateCallback
// sea invocado en TODAS las conexiones (no solo certs inválidos), y ahí
// verificamos que el SHA-256 del certificado coincida con el pin.
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

// ── Auth interceptor — adjunta el JWT y renueva si caduca ───────────────────

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._dio, this._storage);

  final Dio _dio;
  final SecureStorageService _storage;
  bool _isRefreshing = false;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _storage.getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode != 401 || _isRefreshing) {
      handler.next(err);
      return;
    }

    _isRefreshing = true;
    try {
      final refreshToken = await _storage.getRefreshToken();
      if (refreshToken == null) throw Exception('no refresh token');

      final res = await _dio.post(
        '/auth/refresh',
        data: {'refresh_token': refreshToken},
        options: Options(headers: {'Authorization': null}),
      );

      final newAccess = res.data['access_token'] as String;
      final newRefresh = res.data['refresh_token'] as String? ?? refreshToken;
      await _storage.saveTokens(accessToken: newAccess, refreshToken: newRefresh);

      final opts = err.requestOptions;
      opts.headers['Authorization'] = 'Bearer $newAccess';
      final retried = await _dio.fetch(opts);
      handler.resolve(retried);
    } catch (_) {
      await _storage.clearAll();
      handler.next(err);
    } finally {
      _isRefreshing = false;
    }
  }
}

// ── Logger (solo cuando enableHttpLogs = true) ───────────────────────────────

class _LogInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    debugPrint('[HTTP] → ${options.method} ${options.path}');
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    debugPrint('[HTTP] ← ${response.statusCode} ${response.requestOptions.path}');
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    debugPrint('[HTTP] ✗ ${err.response?.statusCode} ${err.requestOptions.path}: ${err.message}');
    handler.next(err);
  }
}
