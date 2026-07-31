import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';

class WelcomePage extends StatelessWidget {
  const WelcomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.secondary,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            children: [
              const Spacer(flex: 2),

              // Logo
              Image.asset(
                'assets/images/logo.webp',
                width: 120,
                height: 120,
              ),
              const SizedBox(height: 28),

              Text(
                'Pana Taxista',
                style: AppTextStyles.h1.copyWith(color: AppColors.white),
              ),
              const SizedBox(height: 10),
              Text(
                'La plataforma de tu cooperativa\nen la palma de tu mano',
                textAlign: TextAlign.center,
                style: AppTextStyles.body.copyWith(
                  color: AppColors.gray400,
                  height: 1.6,
                ),
              ),

              const Spacer(flex: 3),

              // Botón primario — Iniciar sesión
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: AppColors.secondary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    elevation: 0,
                  ),
                  onPressed: () => context.push('/auth/login'),
                  child: Text('Iniciar sesión', style: AppTextStyles.btnLg),
                ),
              ),
              const SizedBox(height: 14),

              // Botón secundario — Registrarme
              SizedBox(
                width: double.infinity,
                height: 54,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.white,
                    side: const BorderSide(color: Colors.white24, width: 1.5),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  onPressed: () => context.push('/auth/register'),
                  child: Text('Quiero registrarme', style: AppTextStyles.btnLg.copyWith(color: AppColors.white)),
                ),
              ),

              const SizedBox(height: 36),

              Text(
                'Al continuar aceptas nuestros Términos de uso\ny Política de Privacidad',
                textAlign: TextAlign.center,
                style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}
