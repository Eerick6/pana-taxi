import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../../features/trip/presentation/widgets/trip_alert_overlay.dart';

// Canal de Android con sonido personalizado para alertas de viaje
const _kTripChannel = AndroidNotificationChannel(
  'trip_alert',
  'Alertas de viaje',
  description: 'Notificaciones de nuevos viajes disponibles',
  importance: Importance.max,
  sound: RawResourceAndroidNotificationSound('trip_alert'),
  enableVibration: true,
  playSound: true,
);

final _localNotif = FlutterLocalNotificationsPlugin();

/// Handler que corre en isolate separado cuando la app está cerrada/background
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // FCM muestra la notificación automáticamente con el canal configurado.
  // No necesitamos hacer nada más aquí.
}

class PushNotificationService {
  PushNotificationService._();
  static final PushNotificationService instance = PushNotificationService._();

  final _messaging = FirebaseMessaging.instance;
  Dio? _dio;

  // Callback que se llama cuando el usuario toca una notificación de viaje
  // Se asigna desde el widget raíz para poder navegar con GoRouter
  void Function(String tripId)? onTripNotificationTap;

  Future<void> initialize(Dio dio) async {
    _dio = dio;

    // Registrar handler de background
    FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);

    // Crear canal de Android con sonido personalizado
    await _localNotif
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_kTripChannel);

    // Inicializar plugin local
    const initSettings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );
    await _localNotif.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        if (payload != null && payload.isNotEmpty) {
          onTripNotificationTap?.call(payload);
        }
      },
    );

    // Pedir permisos (Android 13+, iOS)
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

    // Foreground: FCM no muestra nada — mostramos notificación local con sonido
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // App en segundo plano, usuario toca la notificación
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageTap);

    // App cerrada, usuario toca la notificación → app abre
    final initial = await _messaging.getInitialMessage();
    if (initial != null) _handleMessageTap(initial);
  }

  void _handleForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;

    // Si el overlay ya está visible, el sonido y la alerta ya están manejados — no duplicar
    if (TripAlertManager.isShowing) return;

    final tripId = message.data['trip_id'] ?? '';

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
          sound: const RawResourceAndroidNotificationSound('trip_alert'),
          playSound: true,
          enableVibration: true,
          icon: '@mipmap/ic_launcher',
        ),
      ),
      payload: tripId,
    );
  }

  void _handleMessageTap(RemoteMessage message) {
    final tripId = message.data['trip_id'];
    if (tripId != null && tripId.isNotEmpty) {
      onTripNotificationTap?.call(tripId);
    }
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
      debugPrint('[FCM] Token registered');
    } catch (e) {
      debugPrint('[FCM] Error registering token: $e');
    }
  }

  Future<void> deleteToken(Dio dio) async {
    try {
      await _messaging.deleteToken();
      await dio.delete('/notifications/token');
    } catch (e) {
      debugPrint('[FCM] Error deleting token: $e');
    }
  }
}
