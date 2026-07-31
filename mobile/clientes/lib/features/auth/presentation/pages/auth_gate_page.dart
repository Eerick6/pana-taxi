import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/services/biometric_service.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../trips/data/datasources/trips_api.dart';

class AuthGatePage extends ConsumerStatefulWidget {
  const AuthGatePage({super.key});

  @override
  ConsumerState<AuthGatePage> createState() => _AuthGatePageState();
}

class _AuthGatePageState extends ConsumerState<AuthGatePage> {
  bool _askingBiometric = false;

  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final token = await ref.read(secureStorageProvider).getAccessToken();
    if (!mounted) return;

    if (token == null || token.isEmpty) {
      context.go('/welcome');
      return;
    }

    // Inicia el fetch del viaje activo en paralelo — estará listo cuando termine la biometría
    final tripFuture = TripsApi(ref.read(dioProvider)).getActiveTrip().catchError((_) => null);

    final biometric = ref.read(biometricServiceProvider);
    final available = await biometric.isAvailable();
    if (!mounted) return;

    if (available) {
      setState(() => _askingBiometric = true);
      final result = await biometric.authenticate();
      if (!mounted) return;
      if (result == BiometricResult.failed) {
        setState(() => _askingBiometric = false);
        await ref.read(secureStorageProvider).clearAll();
        if (mounted) context.go('/welcome');
        return;
      }
    }

    // El trip probablemente ya llegó mientras el usuario hacía biometría
    try {
      final trip = await tripFuture;
      if (!mounted) return;
      if (trip != null && trip.isActive) {
        if (trip.status == 'requested') {
          context.go('/searching', extra: trip);
        } else {
          context.go('/trip/${trip.id}');
        }
        return;
      }
    } catch (_) {}

    if (mounted) context.go('/home');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF101828),
      body: Center(
        child: _askingBiometric
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.fingerprint,
                      size: 64, color: AppColors.primary),
                  const SizedBox(height: 20),
                  Text(
                    'Verificando identidad…',
                    style: AppTextStyles.body
                        .copyWith(color: AppColors.white),
                  ),
                ],
              )
            : const CircularProgressIndicator(color: AppColors.primary),
      ),
    );
  }
}
