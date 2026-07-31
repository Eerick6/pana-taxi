import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';

class WelcomePage extends StatelessWidget {
  const WelcomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Spacer(flex: 2),

              // Logo real
              Image.asset(
                'assets/images/logo.webp',
                width: 180,
                fit: BoxFit.contain,
              ),
              const SizedBox(height: 28),

              // Slogan
              Text(
                'Un pana no solo te lleva,\nte cuida.',
                textAlign: TextAlign.center,
                style: AppTextStyles.h3.copyWith(
                  color: AppColors.gray700,
                  height: 1.5,
                ),
              ),

              const Spacer(flex: 3),

              // Botón principal
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  onPressed: () => context.push('/login'),
                  child: Text('Iniciar sesión', style: AppTextStyles.btnLg),
                ),
              ),
              const SizedBox(height: 14),

              // Botón secundario
              SizedBox(
                width: double.infinity,
                height: 54,
                child: OutlinedButton(
                  onPressed: () => context.push('/register'),
                  child: Text('Crear cuenta', style: AppTextStyles.btnLg),
                ),
              ),

              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }
}
