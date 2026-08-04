import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../trips/presentation/providers/active_trip_provider.dart';
import 'active_trip_panel.dart';

class HomeBottomSheet extends ConsumerWidget {
  const HomeBottomSheet({super.key, this.mapController});
  final MapLibreMapController? mapController;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trip = ref.watch(activeTripProvider).valueOrNull;

    if (trip != null && trip.isActive) return ActiveTripPanel(trip: trip);

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(color: Colors.black12, blurRadius: 16, offset: Offset(0, -4))
        ],
      ),
      padding: EdgeInsets.fromLTRB(16, 12, 16, 32 + MediaQuery.of(context).padding.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: AppColors.gray300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.search, size: 22),
              label: Text('¿A dónde vas?', style: AppTextStyles.btnLg),
              onPressed: () => context.push('/request'),
            ),
          ),
        ],
      ),
    );
  }
}
