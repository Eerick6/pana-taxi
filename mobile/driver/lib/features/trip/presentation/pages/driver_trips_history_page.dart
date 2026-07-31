import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/models/trip_model.dart';
import '../../data/providers/trip_provider.dart';

class DriverTripsHistoryPage extends ConsumerWidget {
  const DriverTripsHistoryPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tripsAsync = ref.watch(myTripsProvider);

    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        title: const Text('Mis viajes'),
        backgroundColor: AppColors.secondary,
        foregroundColor: AppColors.white,
        elevation: 0,
      ),
      body: tripsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppColors.gray300),
              const SizedBox(height: 16),
              Text('Error cargando viajes', style: AppTextStyles.body),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () => ref.invalidate(myTripsProvider),
                child: const Text('Reintentar'),
              ),
            ],
          ),
        ),
        data: (trips) {
          if (trips.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.route_outlined, size: 64, color: AppColors.gray300),
                  const SizedBox(height: 16),
                  Text('Aún no tienes viajes realizados',
                      style: AppTextStyles.body.copyWith(color: AppColors.gray500)),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(myTripsProvider),
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              itemCount: trips.length,
              itemBuilder: (_, i) => _TripHistoryCard(trip: trips[i]),
            ),
          );
        },
      ),
    );
  }
}

class _TripHistoryCard extends StatelessWidget {
  const _TripHistoryCard({required this.trip});
  final TripModel trip;

  @override
  Widget build(BuildContext context) {
    final (statusLabel, statusColor) = _statusInfo(trip.status);
    final date = _formatDate(trip.createdAt);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Cabecera: fecha + estado
            Row(children: [
              Text(date, style: AppTextStyles.caption.copyWith(color: AppColors.gray400)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(statusLabel,
                    style: AppTextStyles.caption.copyWith(color: statusColor, fontWeight: FontWeight.w600)),
              ),
            ]),
            const SizedBox(height: 12),

            // Ruta
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Column(children: [
                const Icon(Icons.radio_button_checked, size: 14, color: AppColors.success),
                Container(width: 2, height: 20, color: AppColors.gray200, margin: const EdgeInsets.symmetric(vertical: 2)),
                const Icon(Icons.location_on, size: 14, color: AppColors.error),
              ]),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      trip.originAddress.isNotEmpty ? trip.originAddress : 'Punto de recogida',
                      style: AppTextStyles.body,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 14),
                    Text(
                      trip.destinationAddress.isNotEmpty ? trip.destinationAddress : 'Destino',
                      style: AppTextStyles.body,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ]),

            const SizedBox(height: 12),
            const Divider(height: 1, color: AppColors.gray100),
            const SizedBox(height: 10),

            // Métricas: tarifa · distancia · cliente
            Row(children: [
              if (trip.fare != null) ...[
                const Icon(Icons.attach_money, size: 14, color: AppColors.gray400),
                const SizedBox(width: 3),
                Text('\$${trip.fare!.toStringAsFixed(2)}',
                    style: AppTextStyles.label),
                const SizedBox(width: 16),
              ],
              if (trip.distance != null) ...[
                const Icon(Icons.route_outlined, size: 14, color: AppColors.gray400),
                const SizedBox(width: 3),
                Text('${trip.distance!.toStringAsFixed(1)} km',
                    style: AppTextStyles.caption.copyWith(color: AppColors.gray500)),
                const SizedBox(width: 16),
              ],
              const Icon(Icons.person_outline, size: 14, color: AppColors.gray400),
              const SizedBox(width: 3),
              Expanded(
                child: Text(trip.clientName,
                    style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ]),
          ],
        ),
      ),
    );
  }

  static (String, Color) _statusInfo(String status) => switch (status) {
    'completed'      => ('Completado',  AppColors.success),
    'cancelled'      => ('Cancelado',   AppColors.error),
    'in_progress'    => ('En camino',   AppColors.primary),
    'accepted'       => ('Aceptado',    const Color(0xFF0EA5E9)),
    'driver_arrived' => ('Llegué',      const Color(0xFF8B5CF6)),
    _                => ('Solicitado',  AppColors.gray400),
  };

  static String _formatDate(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inDays == 0) return 'Hoy ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    if (diff.inDays == 1) return 'Ayer';
    if (diff.inDays < 7)  return 'Hace ${diff.inDays} días';
    return '${dt.day}/${dt.month}/${dt.year}';
  }
}
