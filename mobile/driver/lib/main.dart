import 'package:audioplayers/audioplayers.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'app.dart';
import 'core/services/push_notification_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  AudioPlayer.global.setAudioContext(AudioContext(
    android: AudioContextAndroid(
      usageType: AndroidUsageType.alarm,
      contentType: AndroidContentType.sonification,
      audioFocus: AndroidAudioFocus.gain,
      stayAwake: true,
    ),
  ));
  try {
    await Firebase.initializeApp();
  } catch (e) {
    debugPrint('[Firebase] init failed: $e');
  }
  // Debe registrarse ANTES de runApp() — requisito de firebase_messaging
  FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
  await initializeDateFormatting('es', null);
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle.dark);

  runApp(const ProviderScope(child: PanaDriverApp()));
}
