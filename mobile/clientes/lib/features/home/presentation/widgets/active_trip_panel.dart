import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../trips/data/datasources/trips_api.dart';
import '../../../trips/domain/entities/active_trip.dart';
import '../../../trips/presentation/providers/active_trip_provider.dart';

class ActiveTripPanel extends ConsumerWidget {
  const ActiveTripPanel({super.key, required this.trip});
  final ActiveTrip trip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(color: Colors.black12, blurRadius: 16, offset: Offset(0, -4))
        ],
      ),
      padding: EdgeInsets.fromLTRB(20, 16, 20, 32 + MediaQuery.of(context).padding.bottom),
      child: switch (trip.status) {
        'requested'      => _PendingState(trip: trip, ref: ref),
        'accepted'       => _DriverState(trip: trip, ref: ref),
        'driver_arrived' => _DriverArrivedState(trip: trip, ref: ref),
        'in_progress'    => _InProgressState(trip: trip),
        _                => const SizedBox.shrink(),
      },
    );
  }
}

// ── Buscando conductor ───────────────────────────────────────────────────────

class _PendingState extends StatelessWidget {
  const _PendingState({required this.trip, required this.ref});
  final ActiveTrip trip;
  final WidgetRef  ref;

  @override
  Widget build(BuildContext context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Handle(),
          const SizedBox(height: 8),
          const CircularProgressIndicator(color: AppColors.primary, strokeWidth: 3),
          const SizedBox(height: 12),
          Text('Buscando conductor…', style: AppTextStyles.h3),
          const SizedBox(height: 4),
          Text(
            'Tu solicitud está siendo enviada a conductores cercanos.',
            style: AppTextStyles.body.copyWith(color: AppColors.gray500),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          _RouteRow(
            origin:      trip.originAddress.isEmpty ? 'Tu ubicación' : trip.originAddress,
            destination: trip.destinationAddress,
          ),
          const SizedBox(height: 16),
          _CancelBtn(tripId: trip.id, ref: ref),
        ],
      );
}

// ── Conductor asignado ───────────────────────────────────────────────────────

class _DriverState extends StatelessWidget {
  const _DriverState({required this.trip, required this.ref});
  final ActiveTrip trip;
  final WidgetRef  ref;

  @override
  Widget build(BuildContext context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Handle(),
          const SizedBox(height: 12),
          _DriverCard(trip: trip),
          const SizedBox(height: 12),
          if (trip.otpCode != null) _OtpCard(code: trip.otpCode!),
          const SizedBox(height: 12),
          _RouteRow(
            origin:      trip.originAddress.isEmpty ? 'Tu ubicación' : trip.originAddress,
            destination: trip.destinationAddress,
          ),
          const SizedBox(height: 16),
          _CancelBtn(tripId: trip.id, ref: ref),
        ],
      );
}

// ── Conductor llegó ──────────────────────────────────────────────────────────

class _DriverArrivedState extends StatelessWidget {
  const _DriverArrivedState({required this.trip, required this.ref});
  final ActiveTrip trip;
  final WidgetRef  ref;

  @override
  Widget build(BuildContext context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Handle(),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.success.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(children: [
              const Icon(Icons.directions_car, color: AppColors.success, size: 20),
              const SizedBox(width: 8),
              Text('¡El conductor llegó! Dirígete al punto de recogida.',
                  style: AppTextStyles.body
                      .copyWith(color: AppColors.success, fontWeight: FontWeight.w600)),
            ]),
          ),
          const SizedBox(height: 12),
          _DriverCard(trip: trip),
          const SizedBox(height: 12),
          if (trip.otpCode != null) _OtpCard(code: trip.otpCode!),
        ],
      );
}

// ── Viaje en curso ───────────────────────────────────────────────────────────

class _InProgressState extends StatelessWidget {
  const _InProgressState({required this.trip});
  final ActiveTrip trip;

  @override
  Widget build(BuildContext context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Handle(),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.info.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(children: [
              const Icon(Icons.navigation, color: AppColors.info, size: 20),
              const SizedBox(width: 8),
              Text('Viaje en curso',
                  style: AppTextStyles.body
                      .copyWith(color: AppColors.info, fontWeight: FontWeight.w600)),
            ]),
          ),
          const SizedBox(height: 12),
          _DriverCard(trip: trip),
          const SizedBox(height: 12),
          _RouteRow(
            origin:      trip.originAddress.isEmpty ? 'Tu ubicación' : trip.originAddress,
            destination: trip.destinationAddress,
          ),
        ],
      );
}

// ── Widgets internos ─────────────────────────────────────────────────────────

class _Handle extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Center(
        child: Container(
          width: 36, height: 4,
          decoration: BoxDecoration(
            color: AppColors.gray300,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      );
}

class _DriverCard extends StatelessWidget {
  const _DriverCard({required this.trip});
  final ActiveTrip trip;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: AppColors.gray200,
            backgroundImage: trip.driverPhoto != null
                ? NetworkImage(trip.driverPhoto!)
                : null,
            child: trip.driverPhoto == null
                ? const Icon(Icons.person, color: AppColors.gray500)
                : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(trip.driverName ?? 'Conductor',
                    style: AppTextStyles.label),
                if (trip.vehiclePlate != null)
                  Text('Placa: ${trip.vehiclePlate}',
                      style: AppTextStyles.caption
                          .copyWith(color: AppColors.gray500)),
              ],
            ),
          ),
          if (trip.driverPhone != null)
            IconButton(
              icon: const Icon(Icons.phone_outlined,
                  color: AppColors.secondary),
              onPressed: () async {
                final uri = Uri.parse('tel:${trip.driverPhone}');
                if (await canLaunchUrl(uri)) {
                  await launchUrl(uri);
                } else {
                  await Clipboard.setData(ClipboardData(text: trip.driverPhone!));
                }
              },
            ),
        ],
      );
}

class _OtpCard extends StatelessWidget {
  const _OtpCard({required this.code});
  final String code;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: () {
          Clipboard.setData(ClipboardData(text: code));
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Código copiado')),
          );
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.primaryLight,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.primary),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Código de verificación',
                      style: AppTextStyles.caption
                          .copyWith(color: AppColors.secondary)),
                  Text(code,
                      style: AppTextStyles.h2
                          .copyWith(color: AppColors.secondary,
                              letterSpacing: 8)),
                ],
              ),
              const Icon(Icons.copy_outlined,
                  color: AppColors.secondary, size: 18),
            ],
          ),
        ),
      );
}

class _RouteRow extends StatelessWidget {
  const _RouteRow({required this.origin, required this.destination});
  final String origin;
  final String destination;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Row(children: [
            const Icon(Icons.radio_button_checked,
                size: 14, color: AppColors.success),
            const SizedBox(width: 8),
            Expanded(
              child: Text(origin,
                  style: AppTextStyles.caption, maxLines: 1,
                  overflow: TextOverflow.ellipsis),
            ),
          ]),
          const Padding(
            padding: EdgeInsets.only(left: 6),
            child: SizedBox(
              height: 12,
              child: VerticalDivider(width: 1, color: AppColors.gray300),
            ),
          ),
          Row(children: [
            const Icon(Icons.location_on, size: 14, color: AppColors.error),
            const SizedBox(width: 8),
            Expanded(
              child: Text(destination,
                  style: AppTextStyles.caption, maxLines: 1,
                  overflow: TextOverflow.ellipsis),
            ),
          ]),
        ],
      );
}

class _CancelBtn extends StatefulWidget {
  const _CancelBtn({required this.tripId, required this.ref});
  final String    tripId;
  final WidgetRef ref;

  @override
  State<_CancelBtn> createState() => _CancelBtnState();
}

class _CancelBtnState extends State<_CancelBtn> {
  bool _loading = false;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        height: 46,
        child: OutlinedButton(
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: AppColors.error),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
          ),
          onPressed: _loading
              ? null
              : () async {
                  setState(() => _loading = true);
                  try {
                    await widget.ref.read(tripsApiProvider).cancelTrip(widget.tripId);
                    widget.ref.invalidate(activeTripProvider);
                  } catch (_) {
                    if (mounted) setState(() => _loading = false);
                  }
                },
          child: _loading
              ? const SizedBox(
                  width: 18, height: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: AppColors.error))
              : Text('Cancelar viaje',
                  style: AppTextStyles.label
                      .copyWith(color: AppColors.error)),
        ),
      );
}
