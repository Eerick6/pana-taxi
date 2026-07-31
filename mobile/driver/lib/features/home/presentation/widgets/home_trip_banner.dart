import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../trip/data/models/trip_model.dart';
import '../../../trip/data/providers/trip_provider.dart';

// Banner de viaje asignado — solo se reconstruye cuando cambia activeTripProvider
class HomeTripBanner extends ConsumerWidget {
  const HomeTripBanner({required this.onNavigate});
  final void Function(String tripId) onNavigate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tripAsync = ref.watch(activeTripProvider);
    final trip = tripAsync.value;
    if (trip == null) return const SizedBox.shrink();

    return Positioned(
      top: 100, left: 16, right: 16,
      child: HomeTripRequestBanner(
        trip: trip,
        onAccept: () async {
          await ref.read(activeTripProvider.notifier).accept(trip.id);
          if (context.mounted) onNavigate(trip.id);
        },
        onDecline: () => ref.read(activeTripProvider.notifier).clear(),
      ),
    );
  }
}

class HomeTripRequestBanner extends StatelessWidget {
  const HomeTripRequestBanner({
    required this.trip,
    required this.onAccept,
    required this.onDecline,
  });
  final TripModel trip;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 20, offset: const Offset(0, 4))],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: const BoxDecoration(color: AppColors.primaryLight, shape: BoxShape.circle),
                child: const Icon(Icons.person, color: AppColors.secondary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(trip.clientName, style: AppTextStyles.labelLg),
                    if (trip.fare != null)
                      Text('\$${trip.fare!.toStringAsFixed(2)}',
                          style: AppTextStyles.h3.copyWith(color: AppColors.primaryText)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          HomeAddressRow(icon: Icons.radio_button_checked, color: Colors.green, text: trip.originAddress),
          const SizedBox(height: 4),
          HomeAddressRow(icon: Icons.location_on, color: AppColors.error, text: trip.destinationAddress),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: onDecline,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.error,
                    side: const BorderSide(color: AppColors.error),
                  ),
                  child: const Text('Declinar'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: onAccept,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: AppColors.secondary,
                    elevation: 0,
                  ),
                  child: const Text('Aceptar'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class HomeAddressRow extends StatelessWidget {
  const HomeAddressRow({required this.icon, required this.color, required this.text});
  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: AppTextStyles.body,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
