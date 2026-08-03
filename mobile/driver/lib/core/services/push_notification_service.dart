import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
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
const _kTripAlertNotifId = 42;

List<AndroidNotificationAction> _tripActions(String fareMode, String clientOffer) {
  if (fareMode == 'negotiated') {
    final label = clientOffer.isNotEmpty ? 'Aceptar \$$clientOffer' : 'Aceptar';
    return [
      AndroidNotificationAction('accept', label,      showsUserInterface: true),
      AndroidNotificationAction('counter', 'Contraofertar', showsUserInterface: true),
      AndroidNotificationAction('ignore',  'Ignorar',       cancelNotification: true),
    ];
  }
  return [
    AndroidNotificationAction('accept', 'Ver viaje', showsUserInterface: true),
    AndroidNotificationAction('ignore', 'Ignorar',   cancelNotification: true),
  ];
}

@pragma('vm:entry-point')
void onBackgroundNotificationAction(NotificationResponse response) {
  // Las acciones con showsUserInterface:true abren la app y llaman onDidReceiveNotificationResponse.
  // Este handler solo es requerido por el plugin para compilar.
}

/// Handler que corre en isolate separado cuando la app está cerrada/background.
/// Solo se llama para data-only messages — el OS no las intercepta automáticamente.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  print('[FCM-BG] handler called — data: ${message.data}');
  // Requerido para usar plugins de Flutter en un background isolate
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  print('[FCM-BG] firebase initialized');

  if (message.data['type'] != 'trip_new') return;

  final title = message.data['title'] ?? 'Nuevo viaje disponible';
  final body  = message.data['body']  ?? '';

  final plugin = FlutterLocalNotificationsPlugin();

  // Crear canal (no-op si ya existe con misma importancia)
  await plugin
      .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(_kTripChannel);

  final fareMode    = message.data['fare_mode']    ?? 'meter';
  final clientOffer = message.data['client_offer'] ?? '';

  // NO llamar initialize() en background isolate — solo show()
  await plugin.show(
    _kTripAlertNotifId,
    title,
    body,
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
        actions: _tripActions(fareMode, clientOffer),
      ),
    ),
    payload: message.data['trip_id'] ?? '',
  );
}

class PushNotificationService {
  PushNotificationService._();
  static final PushNotificationService instance = PushNotificationService._();

  final _messaging = FirebaseMessaging.instance;
  Dio? _dio;

  // Callback que se llama cuando el usuario toca una notificación de viaje
  // Se asigna desde el widget raíz para poder navegar con GoRouter
  void Function(String tripId, {String? action})? onTripNotificationTap;

  Future<void> initialize(Dio dio) async {
    _dio = dio;

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
        final tripId = response.payload ?? '';
        if (tripId.isEmpty) return;
        onTripNotificationTap?.call(tripId, action: response.actionId);
      },
      onDidReceiveBackgroundNotificationResponse: onBackgroundNotificationAction,
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
    final isTripAlert = message.data['type'] == 'trip_new';
    final title = isTripAlert ? message.data['title'] : message.notification?.title;
    final body  = isTripAlert ? message.data['body']  : message.notification?.body;
    if (title == null) return;

    // Si el overlay ya está visible, el socket ya maneja el sonido — no duplicar
    if (isTripAlert && TripAlertManager.isShowing) return;

    final fareMode    = message.data['fare_mode']    ?? 'meter';
    final clientOffer = message.data['client_offer'] ?? '';
    final tripId      = message.data['trip_id']      ?? '';

    _localNotif.show(
      _kTripAlertNotifId,
      title,
      body,
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
          actions: _tripActions(fareMode, clientOffer),
        ),
      ),
      payload: tripId,
    );
  }

  void _handleMessageTap(RemoteMessage message) {
    final tripId = message.data['trip_id'];
    if (tripId != null && tripId.isNotEmpty) {
      onTripNotificationTap?.call(tripId, action: null);
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
