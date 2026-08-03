import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

const _kTripChannel = AndroidNotificationChannel(
  'trip_updates',
  'Actualizaciones de viaje',
  description: 'Notificaciones sobre el estado de tu viaje',
  importance: Importance.max,
  enableVibration: true,
  playSound: true,
);

final _localNotif = FlutterLocalNotificationsPlugin();

@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

class PushNotificationService {
  PushNotificationService._();
  static final PushNotificationService instance = PushNotificationService._();

  final _messaging = FirebaseMessaging.instance;
  Dio? _dio;

  // Se asigna desde el widget raíz para navegar con GoRouter
  void Function(String? tripId)? onNotificationTap;

  Future<void> initialize(Dio dio) async {
    _dio = dio;

    FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);

    await _localNotif
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_kTripChannel);

    const initSettings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );
    await _localNotif.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (response) {
        onNotificationTap?.call(response.payload);
      },
    );

    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional) {
      await _registerToken();
    }

    _messaging.onTokenRefresh.listen(_sendTokenToServer);

    // Foreground: mostrar notificación local si la app está abierta
    FirebaseMessaging.onMessage.listen(_handleForeground);
    // Background: usuario toca la notificación
    FirebaseMessaging.onMessageOpenedApp.listen(_handleTap);
    // App cerrada: usuario toca y abre la app
    final initial = await _messaging.getInitialMessage();
    if (initial != null) _handleTap(initial);
  }

  void _handleForeground(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;

    final tripId = message.data['trip_id'] as String?;

    _localNotif.show(
      notification.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _kTripChannel.id,
          _kTripChannel.name,
          channelDescription: _kTripChannel.description,
          importance: Importance.max,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
      ),
      payload: tripId,
    );
  }

  void _handleTap(RemoteMessage message) {
    final tripId = message.data['trip_id'] as String?;
    onNotificationTap?.call(tripId);
  }

  Future<void> _registerToken() async {
    try {
      final token = await _messaging.getToken();
      if (token != null) await _sendTokenToServer(token);
    } catch (e) {
      debugPrint('[FCM] Error getting token: $e');
    }
  }

  Future<void> _sendTokenToServer(String token) async {
    try {
      await _dio?.post('/notifications/token', data: {'token': token});
      debugPrint('[FCM] Token registrado');
    } catch (e) {
      debugPrint('[FCM] Error registrando token: $e');
    }
  }

  // Llámalo tras login para registrar el token si el initialize() inicial falló (sin auth)
  Future<void> ensureTokenRegistered(Dio dio) async {
    _dio = dio;
    await _registerToken();
  }

  Future<void> deleteToken(Dio dio) async {
    try {
      await _messaging.deleteToken();
      await dio.delete('/notifications/token');
    } catch (e) {
      debugPrint('[FCM] Error eliminando token: $e');
    }
  }
}
