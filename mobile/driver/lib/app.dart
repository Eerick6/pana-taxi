import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/router/app_router.dart';
import 'core/services/push_notification_service.dart';
import 'core/theme/app_theme.dart';
import 'core/config/app_config.dart';
import 'features/auth/data/providers/auth_provider.dart';
import 'features/home/presentation/widgets/driver_sos_button.dart';

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
          child: Stack(
            children: [
              child!,
              // SOS siempre visible mientras haya sesión — vive por encima del
              // router entero (no solo del shell con bottom nav) para que
              // también aparezca en la pantalla de viaje activo, que está
              // fuera del shell. Se oculta solo mientras no hay usuario
              // logueado (splash, login, registro, onboarding).
              //
              // Arriba a la derecha, no abajo: home tiene un panel de viajes
              // disponibles pegado al fondo (AvailableTripsPanel +
              // HomeBottomPanel) que es más alto que 110px y lo tapaba por
              // completo — quedaba invisible e intocable en la pantalla que
              // el conductor más usa.
              Consumer(
                builder: (context, ref, _) {
                  final user = ref.watch(authStateProvider).valueOrNull;
                  if (user == null) return const SizedBox.shrink();
                  return Positioned(
                    right: 16,
                    top: MediaQuery.of(context).padding.top + 12,
                    child: const DriverSosButton(),
                  );
                },
              ),
            ],
          ),
        );
      },
    );
  }
}
