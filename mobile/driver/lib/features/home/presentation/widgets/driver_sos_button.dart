import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';

// SOS del conductor — a diferencia del cliente, tripId es opcional: el
// conductor puede necesitar ayuda esté o no en un viaje (esperando pasajero,
// en la calle sin viaje activo, etc.). Vive fuera del shell de navegación
// (ver app.dart) para estar visible en cualquier pantalla, no solo home.
class DriverSosButton extends ConsumerWidget {
  const DriverSosButton({super.key, this.tripId});
  final String? tripId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () => _confirmSos(context, ref),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.error,
          borderRadius: BorderRadius.circular(22),
          boxShadow: [
            BoxShadow(
              color: AppColors.error.withValues(alpha: 0.4),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.warning_amber_rounded, color: AppColors.white, size: 18),
            const SizedBox(width: 6),
            Text('SOS', style: AppTextStyles.label.copyWith(color: AppColors.white)),
          ],
        ),
      ),
    );
  }

  void _confirmSos(BuildContext context, WidgetRef ref) {
    showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('¿Necesitas ayuda?', style: AppTextStyles.h3),
        content: Text(
          'Se enviará una alerta de emergencia con tu ubicación actual a la plataforma.',
          style: AppTextStyles.body,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Cancelar', style: AppTextStyles.label),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () async {
              Navigator.pop(context);
              await _triggerSos(context, ref);
            },
            child: Text('Enviar SOS', style: AppTextStyles.label.copyWith(color: AppColors.white)),
          ),
        ],
      ),
    );
  }

  Future<void> _triggerSos(BuildContext context, WidgetRef ref) async {
    try {
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
        if (tripId != null) 'trip_id': tripId,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
        'message': 'SOS desde app conductor',
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
    } catch (_) {
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
