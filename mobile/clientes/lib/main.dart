import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/config/app_env.dart';
import 'core/network/dio_client.dart';
import 'core/routes/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/trips/domain/entities/active_trip.dart';
import 'features/trips/presentation/providers/active_trip_provider.dart';
import 'features/profile/presentation/providers/profile_provider.dart';

// Key global para mostrar SnackBars desde cualquier parte de la app
final _messengerKey = GlobalKey<ScaffoldMessengerState>();

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  if (kDebugMode) debugPrint('[AppEnv] FLAVOR=${AppEnv.isDev ? "dev" : "prod"} → ${AppEnv.baseUrl}');
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));
  runApp(const ProviderScope(child: PanaClienteApp()));
}

class PanaClienteApp extends ConsumerStatefulWidget {
  const PanaClienteApp({super.key});

  @override
  ConsumerState<PanaClienteApp> createState() => _PanaClienteAppState();
}

class _PanaClienteAppState extends ConsumerState<PanaClienteApp>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Refrescar perfil al volver a la app (renueva la URL presignada de R2)
      ref.invalidate(clientProfileProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Mantiene el provider activo globalmente y detecta cambios de status
    ref.listen(activeTripProvider, _onTripChange);

    // Redirigir al welcome cuando el token expira y el refresh falla
    ref.listen(authExpiredProvider, (_, expired) {
      if (expired) {
        ref.read(authExpiredProvider.notifier).state = false;
        appRouter.go('/welcome');
      }
    });

    return MaterialApp.router(
      title: 'Pana Taxi',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: appRouter,
      scaffoldMessengerKey: _messengerKey,
    );
  }

  void _onTripChange(
    AsyncValue<ActiveTrip?>? prev,
    AsyncValue<ActiveTrip?> next,
  ) {
    final prevTrip = prev?.valueOrNull;
    final nextTrip = next.valueOrNull;

    // Ignorar primera carga o sin viaje
    if (prevTrip == null || nextTrip == null) return;

    final prevStatus = prevTrip.status;
    final nextStatus = nextTrip.status;
    if (prevStatus == nextStatus) return;

    // Notificación según el nuevo status
    final (String? msg, Color color, IconData icon) = switch (nextStatus) {
      'accepted'       => (
          '¡Conductor en camino! Dirígete al punto de recogida.',
          const Color(0xFF2E7D32),
          Icons.directions_car,
        ),
      'driver_arrived' => (
          '¡El conductor llegó! Está esperándote.',
          const Color(0xFF1565C0),
          Icons.location_on,
        ),
      'in_progress'    => (
          '¡Viaje en curso! Buen viaje 🚕',
          const Color(0xFF1565C0),
          Icons.navigation,
        ),
      'cancelled'      => (
          'El conductor canceló el viaje.',
          const Color(0xFFC62828),
          Icons.cancel_outlined,
        ),
      _                => (null, Colors.black, Icons.info),
    };

    if (msg == null) return;

    _messengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          duration: const Duration(seconds: 5),
          backgroundColor: color,
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14)),
          content: Row(children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(msg,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w500)),
            ),
          ]),
        ),
      );

    // Navegar al home si el driver aceptó (desde cualquier pantalla)
    if (nextStatus == 'accepted' || nextStatus == 'driver_arrived') {
      appRouter.go('/home');
    }
    // Si fue cancelado, volver al home también
    if (nextStatus == 'cancelled') {
      appRouter.go('/home');
    }
  }
}
