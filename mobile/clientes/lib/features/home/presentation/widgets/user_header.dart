import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';

class UserHeader extends StatelessWidget {
  const UserHeader({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          // Avatar
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.gray200,
              border: Border.all(color: AppColors.white, width: 2),
              boxShadow: [
                BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 6),
              ],
            ),
            child: const Icon(Icons.person, color: AppColors.gray500, size: 24),
          ),
          const SizedBox(width: 10),

          // Saludo (sin caja, texto simple con sombra)
          Expanded(
            child: Text(
              'Hola 👋',
              style: AppTextStyles.h3.copyWith(
                color: AppColors.white,
                shadows: [
                  Shadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 8),
                ],
              ),
            ),
          ),

          // Notificaciones
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              color: AppColors.white,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 6),
              ],
            ),
            child: const Icon(Icons.notifications_outlined,
                color: AppColors.secondary, size: 22),
          ),
        ],
      ),
    );
  }
}
