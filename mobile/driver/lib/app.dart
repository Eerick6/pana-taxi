import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/router/app_router.dart';
import 'core/services/push_notification_service.dart';
import 'core/theme/app_theme.dart';
import 'core/config/app_config.dart';

class PanaDriverApp extends ConsumerWidget {
  const PanaDriverApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);

    // Conectar tap/acción de notificación FCM → navegación
    PushNotificationService.instance.onTripNotificationTap =
        (tripId, {String? action}) {
      PushNotificationService.pendingTripId = tripId;
      router.go('/home');
    };

    return MaterialApp.router(
      title: AppConfig.appName,
      theme: AppTheme.light,
      routerConfig: router,
      debugShowCheckedModeBanner: AppConfig.isDev,
      builder: (context, child) {
        // Escala de texto fija — la app no debe romperse con configuraciones de accesibilidad extremas
        return MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.noScaling),
          child: child!,
        );
      },
    );
  }
}
