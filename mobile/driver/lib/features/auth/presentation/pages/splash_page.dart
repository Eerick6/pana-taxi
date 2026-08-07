import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/services/push_notification_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/providers/auth_provider.dart';
import '../../../trip/data/repositories/trip_repository.dart';

class SplashPage extends ConsumerStatefulWidget {
  const SplashPage({super.key});

  @override
  ConsumerState<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends ConsumerState<SplashPage> {
  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final user = await ref.read(authStateProvider.future);
    if (!mounted) return;

    if (user != null) {
      final dio = ref.read(dioProvider);
      await PushNotificationService.instance.initialize(dio);
      if (!mounted) return;

      // Si hay un viaje activo, ir directo a él en lugar del home
      final activeTrip = await ref.read(tripRepositoryProvider)
          .getActiveTrip()
          .timeout(const Duration(seconds: 6), onTimeout: () => null);
      if (!mounted) return;

      if (activeTrip != null) {
        context.go('/trip/${activeTrip.id}');
      } else {
        context.go('/home');
      }
    } else {
      context.go('/auth/welcome');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.secondary,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset(
              'assets/images/logo.webp',
              width: 110,
              height: 110,
            ),
            const SizedBox(height: 24),
            Text(
              'Pana Taxista',
              style: AppTextStyles.h1.copyWith(color: AppColors.white),
            ),
            const SizedBox(height: 6),
            Text(
              'Tu trabajo, en tus manos',
              style: AppTextStyles.body.copyWith(color: AppColors.gray400),
            ),
            const SizedBox(height: 56),
            const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppColors.primary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
