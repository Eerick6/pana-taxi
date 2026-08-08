import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../trip/presentation/widgets/trip_alert_overlay.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';

class AvailableTripsPanel extends StatelessWidget {
  const AvailableTripsPanel({
    super.key,
    required this.trips,
    required this.pendingOffers,
    required this.onApplyMeter,
    required this.onAcceptNegotiated,
    required this.onOpenNegotiatedSheet,
  });

  final List<TripAlertData> trips;
  final Set<String> pendingOffers;
  final void Function(String tripId) onApplyMeter;
  final void Function(TripAlertData trip) onAcceptNegotiated;
  final void Function(TripAlertData trip) onOpenNegotiatedSheet;

  @override
  Widget build(BuildContext context) {
    if (trips.isEmpty) return const SizedBox.shrink();

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 16, bottom: 8),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            decoration: BoxDecoration(
              color: AppColors.primary,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              '${trips.length} viaje${trips.length != 1 ? 's' : ''} disponible${trips.length != 1 ? 's' : ''}',
              style: AppTextStyles.caption.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        SizedBox(
          height: 200,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            itemCount: trips.length,
            itemBuilder: (context, i) {
              final trip = trips[i];
              return Padding(
                padding: const EdgeInsets.only(right: 10),
                child: _TripCard(
                  trip: trip,
                  isPending: pendingOffers.contains(trip.tripId),
                  onApplyMeter: () => onApplyMeter(trip.tripId),
                  onAcceptNegotiated: () => onAcceptNegotiated(trip),
                  onOpenNegotiatedSheet: () => onOpenNegotiatedSheet(trip),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}

class _TripCard extends StatelessWidget {
  const _TripCard({
    required this.trip,
    required this.isPending,
    required this.onApplyMeter,
    required this.onAcceptNegotiated,
    required this.onOpenNegotiatedSheet,
  });

  final TripAlertData trip;
  final bool isPending;
  final VoidCallback onApplyMeter;
  final VoidCallback onAcceptNegotiated;
  final VoidCallback onOpenNegotiatedSheet;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 300,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 12, offset: Offset(0, 4)),
        ],
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: avatar + nombre + badge modo/precio
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: const BoxDecoration(
                  color: AppColors.primaryLight,
                  shape: BoxShape.circle,
                ),
                child: trip.clientPhoto != null
                    ? ClipOval(
                        child: CachedNetworkImage(
                          imageUrl: trip.clientPhoto!,
                          width: 36,
                          height: 36,
                          fit: BoxFit.cover,
                          errorWidget: (_, __, ___) => const Icon(
                              Icons.person, color: AppColors.secondary, size: 20),
                          placeholder: (_, __) => const SizedBox.shrink(),
                        ),
                      )
                    : const Icon(Icons.person, color: AppColors.secondary, size: 20),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(trip.clientName ?? 'Pasajero',
                        style: AppTextStyles.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                    if (trip.clientRating != null)
                      Row(children: [
                        const Icon(Icons.star_rounded,
                            size: 12, color: Color(0xFFF59E0B)),
                        const SizedBox(width: 2),
                        Text(
                          trip.clientRating!.toStringAsFixed(1),
                          style: AppTextStyles.caption
                              .copyWith(color: AppColors.gray500),
                        ),
                      ]),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: trip.fareMode == 'meter' ? Colors.teal : AppColors.primary,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: trip.fareMode == 'meter'
                    ? const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.speed, size: 12, color: Colors.white),
                          SizedBox(width: 4),
                          Text(
                            'Taxímetro',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      )
                    : Text(
                        '\$${(trip.clientOffer ?? trip.suggestedFare ?? 0).toStringAsFixed(2)}',
                        style: AppTextStyles.label
                            .copyWith(fontWeight: FontWeight.w800),
                      ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Divider(height: 1, color: Color(0xFFEEEEEE)),
          const SizedBox(height: 10),
          // Ruta
          _RouteRow(
              icon: Icons.radio_button_checked,
              color: AppColors.success,
              text: trip.originAddress),
          Padding(
            padding: const EdgeInsets.only(left: 6),
            child: Container(height: 8, width: 2, color: AppColors.gray200),
          ),
          _RouteRow(
              icon: Icons.location_on,
              color: AppColors.error,
              text: trip.destinationAddress),
          if (trip.distanceKm != null) ...[
            const SizedBox(height: 6),
            Row(children: [
              const Icon(Icons.route_outlined, size: 12, color: AppColors.gray400),
              const SizedBox(width: 4),
              Text(
                '${trip.distanceKm!.toStringAsFixed(1)} km',
                style:
                    AppTextStyles.caption.copyWith(color: AppColors.gray500),
              ),
            ]),
          ],
          const Spacer(),
          // Botón(es) de acción
          if (isPending)
            Row(children: [
              const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: AppColors.primary),
              ),
              const SizedBox(width: 8),
              Text('Oferta enviada…',
                  style: AppTextStyles.caption
                      .copyWith(color: AppColors.gray600)),
            ])
          else if (trip.fareMode == 'meter')
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: onApplyMeter,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.teal,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  elevation: 0,
                ),
                child: Text('Apuntarme',
                    style: AppTextStyles.label.copyWith(
                        fontWeight: FontWeight.w700, color: Colors.white)),
              ),
            )
          else
            // Negociado: aceptar directo o contraoferta
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: onOpenNegotiatedSheet,
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: AppColors.primary),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                  child: Text('Oferta distinta',
                      style: AppTextStyles.caption.copyWith(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w700)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  onPressed: onAcceptNegotiated,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    elevation: 0,
                  ),
                  child: Text(
                    'Aceptar \$${(trip.clientOffer ?? trip.suggestedFare ?? 0).toStringAsFixed(2)}',
                    style: AppTextStyles.label.copyWith(
                        fontWeight: FontWeight.w700, color: Colors.white),
                  ),
                ),
              ),
            ]),
        ],
      ),
    );
  }
}

class _RouteRow extends StatelessWidget {
  const _RouteRow({required this.icon, required this.color, required this.text});
  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                style: AppTextStyles.caption,
                maxLines: 2,
                overflow: TextOverflow.ellipsis),
          ),
        ],
      );
}

// ── Sheet de oferta para viajes negociados ─────────────────────────────────────

class NegotiatedOfferSheet extends StatefulWidget {
  const NegotiatedOfferSheet({
    super.key,
    required this.trip,
    required this.onSubmit,
  });

  final TripAlertData trip;
  final void Function(double amount) onSubmit;

  @override
  State<NegotiatedOfferSheet> createState() => _NegotiatedOfferSheetState();
}

class _NegotiatedOfferSheetState extends State<NegotiatedOfferSheet> {
  late final TextEditingController _ctrl;
  final _focus = FocusNode();
  String? _error;

  @override
  void initState() {
    super.initState();
    final suggested = widget.trip.clientOffer ?? widget.trip.suggestedFare ?? 0;
    _ctrl = TextEditingController(text: suggested.toStringAsFixed(2));
    WidgetsBinding.instance
        .addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _submit() {
    final val =
        double.tryParse(_ctrl.text.trim().replaceAll(',', '.'));
    if (val == null || val <= 0) {
      setState(() => _error = 'Ingresa un monto válido');
      return;
    }
    widget.onSubmit(val);
  }

  @override
  Widget build(BuildContext context) {
    final kb = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: kb),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.gray200,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Text('Tu oferta', style: AppTextStyles.h3),
            const SizedBox(height: 4),
            Text(
              'Precio del cliente: \$${(widget.trip.clientOffer ?? widget.trip.suggestedFare ?? 0).toStringAsFixed(2)}',
              style:
                  AppTextStyles.caption.copyWith(color: AppColors.gray500),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _ctrl,
              focusNode: _focus,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
              decoration: InputDecoration(
                prefixText: '\$ ',
                labelText: 'Tu precio',
                errorText: _error,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12)),
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 14),
              ),
              style: AppTextStyles.labelLg.copyWith(fontSize: 20),
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  elevation: 0,
                ),
                child: Text(
                  'Enviar oferta',
                  style: AppTextStyles.label
                      .copyWith(fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
