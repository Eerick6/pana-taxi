import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/datasources/trips_api.dart';
import '../../domain/entities/fare_estimate.dart';
import '../../domain/entities/place_result.dart';
import '../providers/fare_estimate_provider.dart';
import '../providers/trip_route_provider.dart';

class ConfirmTripPage extends ConsumerStatefulWidget {
  const ConfirmTripPage({super.key});

  @override
  ConsumerState<ConfirmTripPage> createState() => _ConfirmTripPageState();
}

class _ConfirmTripPageState extends ConsumerState<ConfirmTripPage> {
  String _fareMode          = 'meter';
  String _paymentMethodSlug = 'cash';
  double _clientOffer       = 2.0;
  double _minOffer          = 1.50;
  bool   _loading           = false;

  @override
  void initState() {
    super.initState();
    final estimate = ref.read(fareEstimateProvider);
    if (estimate != null) {
      _clientOffer = estimate.total;
      final rounded = (estimate.minOffer / 0.05).ceil() * 0.05;
      _minOffer = double.parse(rounded.toStringAsFixed(2)).clamp(1.50, 999.0);
    }
  }

  Future<void> _request() async {
    final route = ref.read(tripRouteProvider);
    if (!route.isValid || route.origin == null) return;

    if (_fareMode == 'negotiated' && _clientOffer < _minOffer) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
          'La oferta mínima es \$${_minOffer.toStringAsFixed(2)} (80% del estimado)'),
        backgroundColor: AppColors.error,
      ));
      return;
    }

    final origin   = route.origin!;
    final lastStop = route.stops.last;

    setState(() => _loading = true);
    try {
      final trip = await ref.read(tripsApiProvider).createTrip(
        originAddress:      origin.displayName,
        originLat:          origin.lat,
        originLng:          origin.lng,
        destinationAddress: lastStop.displayName,
        destinationLat:     lastStop.lat,
        destinationLng:     lastStop.lng,
        fareMode:           _fareMode,
        clientOffer:        _fareMode == 'negotiated' ? _clientOffer : null,
        paymentMethodSlug:  _paymentMethodSlug,
      );
      ref.read(tripRouteProvider.notifier).clear();
      ref.read(fareEstimateProvider.notifier).state = null;
      if (mounted) context.go('/searching', extra: trip);
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);

      String msg = 'Error al solicitar el viaje';
      bool hasActiveTrip = false;

      if (e is DioException) {
        final data = e.response?.data;
        if (e.response?.statusCode == 409) {
          hasActiveTrip = true;
          msg = data is Map ? (data['message'] as String? ?? msg) : msg;
        } else if (data is Map) {
          msg = data['message'] as String? ?? msg;
        }
      }

      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.error,
        action: hasActiveTrip
            ? SnackBarAction(
                label: 'Ver viaje',
                textColor: Colors.white,
                onPressed: () => context.go('/home'),
              )
            : null,
      ));

      if (hasActiveTrip) context.go('/home');
    }
  }

  @override
  Widget build(BuildContext context) {
    final route    = ref.watch(tripRouteProvider);
    final estimate = ref.watch(fareEstimateProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text('Confirmar viaje', style: AppTextStyles.h3),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          onPressed: () => context.pop(),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _RouteCard(
                  originLabel: route.origin?.shortName ?? 'Mi ubicación',
                  stops:       route.stops,
                  estimate:    estimate,
                ),
                const SizedBox(height: 16),
                _FareModeCard(
                  selected:  _fareMode,
                  onChanged: (v) => setState(() => _fareMode = v),
                ),
                const SizedBox(height: 16),
                _PaymentMethodCard(
                  selected:  _paymentMethodSlug,
                  onChanged: (v) => setState(() => _paymentMethodSlug = v),
                ),
                if (_fareMode == 'negotiated') ...[
                  const SizedBox(height: 16),
                  _OfferCard(
                    offer:       _clientOffer,
                    minOffer:    _minOffer,
                    discountPct: ref.read(fareEstimateProvider)?.maxNegotiationDiscountPct ?? 20,
                    onChanged:   (v) => setState(() => _clientOffer = v),
                  ),
                ],
              ],
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  onPressed: _loading ? null : _request,
                  child: _loading
                      ? const SizedBox(
                          width: 22, height: 22,
                          child: CircularProgressIndicator(
                              strokeWidth: 2.5, color: AppColors.white))
                      : Text('Solicitar taxi', style: AppTextStyles.btnLg),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Tarjeta de ruta ───────────────────────────────────────────────────────────

class _RouteCard extends StatelessWidget {
  const _RouteCard({
    required this.originLabel,
    required this.stops,
    required this.estimate,
  });
  final String            originLabel;
  final List<PlaceResult> stops;
  final FareEstimate?     estimate;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _RouteRow(
              icon:  Icons.radio_button_checked,
              color: AppColors.success,
              label: originLabel,
            ),
            ...stops.asMap().entries.map((e) {
              final isLast = e.key == stops.length - 1;
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Container(width: 1, height: 14, color: AppColors.gray200),
                  ),
                  _RouteRow(
                    icon:  isLast ? Icons.location_on : Icons.adjust,
                    color: isLast ? AppColors.error : AppColors.secondary,
                    label: e.value.shortName,
                  ),
                ],
              );
            }),
            if (estimate != null) ...[
              const SizedBox(height: 12),
              const Divider(height: 1, color: AppColors.gray100),
              const SizedBox(height: 12),
              Row(
                children: [
                  _InfoChip(
                    icon:  Icons.straighten,
                    label: '${estimate!.distanceKm.toStringAsFixed(1)} km',
                  ),
                  const SizedBox(width: 8),
                  _InfoChip(
                    icon:  Icons.access_time,
                    label: '${estimate!.durationMin.toInt()} min',
                  ),
                  if (estimate!.isNightRate) ...[
                    const SizedBox(width: 8),
                    _InfoChip(
                      icon:  Icons.nightlight_round,
                      label: 'Nocturno',
                      highlight: true,
                    ),
                  ],
                ],
              ),
            ],
          ],
        ),
      );
}

class _RouteRow extends StatelessWidget {
  const _RouteRow({required this.icon, required this.color, required this.label});
  final IconData icon;
  final Color    color;
  final String   label;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(label,
                style: AppTextStyles.body,
                maxLines: 2,
                overflow: TextOverflow.ellipsis),
          ),
        ],
      );
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label, this.highlight = false});
  final IconData icon;
  final String   label;
  final bool     highlight;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: highlight ? AppColors.primaryLight : AppColors.gray50,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 13,
                color: highlight ? AppColors.secondary : AppColors.gray500),
            const SizedBox(width: 4),
            Text(label,
                style: AppTextStyles.caption.copyWith(
                    color: highlight ? AppColors.secondary : AppColors.gray600)),
          ],
        ),
      );
}

// ── Modo de tarifa ────────────────────────────────────────────────────────────

class _FareModeCard extends StatelessWidget {
  const _FareModeCard({required this.selected, required this.onChanged});
  final String               selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Modo de pago', style: AppTextStyles.label),
            const SizedBox(height: 12),
            _ModeOption(
              value:    'meter',
              selected: selected,
              icon:     Icons.speed_outlined,
              title:    'Taxímetro',
              subtitle: 'Precio al finalizar el viaje',
              onTap:    () => onChanged('meter'),
            ),
            const SizedBox(height: 10),
            _ModeOption(
              value:    'negotiated',
              selected: selected,
              icon:     Icons.handshake_outlined,
              title:    'Negociar precio',
              subtitle: 'Propones un precio, el conductor acepta',
              onTap:    () => onChanged('negotiated'),
            ),
          ],
        ),
      );
}

class _ModeOption extends StatelessWidget {
  const _ModeOption({
    required this.value, required this.selected,
    required this.icon,  required this.title,
    required this.subtitle, required this.onTap,
  });
  final String       value, selected, title, subtitle;
  final IconData     icon;
  final VoidCallback onTap;

  bool get _sel => value == selected;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color:  _sel ? AppColors.primaryLight : AppColors.gray50,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: _sel ? AppColors.primary : AppColors.gray200,
              width: _sel ? 2 : 1,
            ),
          ),
          child: Row(
            children: [
              Icon(icon, size: 22,
                  color: _sel ? AppColors.secondary : AppColors.gray500),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: AppTextStyles.label.copyWith(
                            color: _sel
                                ? AppColors.secondary
                                : AppColors.gray700)),
                    Text(subtitle,
                        style: AppTextStyles.caption
                            .copyWith(color: AppColors.gray500)),
                  ],
                ),
              ),
              if (_sel)
                const Icon(Icons.check_circle,
                    color: AppColors.primary, size: 20),
            ],
          ),
        ),
      );
}

// ── Oferta de precio ──────────────────────────────────────────────────────────

class _OfferCard extends StatefulWidget {
  const _OfferCard({
    required this.offer,
    required this.minOffer,
    required this.onChanged,
    this.discountPct = 20,
  });
  final double               offer;
  final double               minOffer;
  final ValueChanged<double> onChanged;
  final double               discountPct;

  @override
  State<_OfferCard> createState() => _OfferCardState();
}

class _OfferCardState extends State<_OfferCard> {
  late final TextEditingController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.offer.toStringAsFixed(2));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _step(double delta) {
    final v = double.parse(
      (widget.offer + delta).clamp(widget.minOffer, 999.0).toStringAsFixed(2),
    );
    _ctrl.text = v.toStringAsFixed(2);
    widget.onChanged(v);
  }

  bool get _belowMin => widget.offer < widget.minOffer;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Tu oferta (USD)', style: AppTextStyles.label),
            const SizedBox(height: 12),
            Row(
              children: [
                _StepBtn(
                  icon:     Icons.remove,
                  onTap:    () => _step(-0.25),
                  disabled: widget.offer <= widget.minOffer,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _ctrl,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'^\d+\.?\d{0,2}')),
                    ],
                    textAlign: TextAlign.center,
                    style: AppTextStyles.h2.copyWith(
                      color: _belowMin ? AppColors.error : AppColors.gray900,
                    ),
                    decoration: InputDecoration(
                      prefixText: '\$ ',
                      prefixStyle: AppTextStyles.h2.copyWith(
                        color: _belowMin ? AppColors.error : AppColors.gray500,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(
                          color: _belowMin ? AppColors.error : AppColors.gray200,
                        ),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(
                          color: _belowMin ? AppColors.error : AppColors.primary,
                          width: 2,
                        ),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(
                          color: _belowMin ? AppColors.error : AppColors.gray200,
                        ),
                      ),
                    ),
                    onChanged: (v) {
                      final p = double.tryParse(v);
                      if (p != null) widget.onChanged(p);
                    },
                  ),
                ),
                const SizedBox(width: 12),
                _StepBtn(icon: Icons.add, onTap: () => _step(0.25)),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Mínimo: \$${widget.minOffer.toStringAsFixed(2)}',
                  style: AppTextStyles.caption.copyWith(
                    color: _belowMin ? AppColors.error : AppColors.gray400,
                    fontWeight: _belowMin ? FontWeight.w600 : FontWeight.normal,
                  ),
                ),
                if (_belowMin)
                  Text(
                    'Por debajo del mínimo permitido',
                    style: AppTextStyles.caption.copyWith(color: AppColors.error),
                  ),
              ],
            ),
          ],
        ),
      );
}

// ── Método de pago ────────────────────────────────────────────────────────────

class _PaymentMethodCard extends StatelessWidget {
  const _PaymentMethodCard({required this.selected, required this.onChanged});
  final String               selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Método de pago', style: AppTextStyles.label),
            const SizedBox(height: 12),
            _ModeOption(
              value:    'cash',
              selected: selected,
              icon:     Icons.payments_outlined,
              title:    'Efectivo',
              subtitle: 'Pagas en efectivo al conductor',
              onTap:    () => onChanged('cash'),
            ),
            const SizedBox(height: 10),
            _ModeOption(
              value:    'card',
              selected: selected,
              icon:     Icons.credit_card_outlined,
              title:    'Tarjeta',
              subtitle: 'Visa, Mastercard, Diners, Discover',
              onTap:    () => onChanged('card'),
            ),
          ],
        ),
      );
}

class _StepBtn extends StatelessWidget {
  const _StepBtn({required this.icon, required this.onTap, this.disabled = false});
  final IconData     icon;
  final VoidCallback onTap;
  final bool         disabled;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: disabled ? null : onTap,
        child: Container(
          width: 44, height: 44,
          decoration: BoxDecoration(
            color: disabled ? AppColors.gray50 : AppColors.gray100,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon,
              color: disabled ? AppColors.gray300 : AppColors.secondary,
              size: 22),
        ),
      );
}
