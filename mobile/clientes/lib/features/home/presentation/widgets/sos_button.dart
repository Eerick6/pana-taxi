import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';

class SosButton extends ConsumerWidget {
  const SosButton({super.key, required this.tripId});
  final String tripId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () => _confirmSos(context, ref),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.error,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: AppColors.error.withValues(alpha: 0.4),
              blurRadius: 12, offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.warning_amber_rounded, color: AppColors.white, size: 20),
            const SizedBox(width: 6),
            Text('SOS', style: AppTextStyles.btnSm.copyWith(color: AppColors.white)),
          ],
        ),
      ),
    );
  }

  void _confirmSos(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('¿Necesitas ayuda?', style: AppTextStyles.h3),
        content: Text(
          'Se enviará una alerta de emergencia con tu ubicación actual.',
          style: AppTextStyles.body,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Cancelar', style: AppTextStyles.label.copyWith(color: AppColors.gray500)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () async {
              Navigator.pop(context);
              await _triggerSos(context, ref);
            },
            child: Text('Enviar SOS', style: AppTextStyles.btnSm.copyWith(color: AppColors.white)),
          ),
        ],
      ),
    );
  }

  Future<void> _triggerSos(BuildContext context, WidgetRef ref) async {
    try {
      // Obtener GPS actual (best effort, no bloquear si falla)
      double? lat, lng;
      try {
        final pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 5)),
        );
        lat = pos.latitude;
        lng = pos.longitude;
      } catch (_) {}

      final dio = ref.read(dioProvider);
      await dio.post('/sos', data: {
        'trip_id': tripId,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
        'message': 'SOS desde app cliente',
      });

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('🆘 Alerta enviada. El equipo de soporte fue notificado.'),
            backgroundColor: Color(0xFFB91C1C),
            duration: Duration(seconds: 5),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No se pudo enviar la alerta. Llama al 911.'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}
