class FareEstimate {
  const FareEstimate({
    required this.baseFare,
    required this.distanceKm,
    required this.durationMin,
    required this.subtotal,
    required this.nightSurcharge,
    required this.total,
    required this.isNightRate,
    required this.maxNegotiationDiscountPct,
    this.routeGeometry,
  });

  final double baseFare;
  final double distanceKm;
  final double durationMin;
  final double subtotal;
  final double nightSurcharge;
  final double total;
  final bool   isNightRate;
  /// Descuento máximo permitido en negociación (ej: 15 → mínimo oferta = 85% del total)
  final double maxNegotiationDiscountPct;
  final Map<String, dynamic>? routeGeometry;

  double get minOffer =>
      (total * (1 - maxNegotiationDiscountPct / 100) * 100).ceilToDouble() / 100;

  factory FareEstimate.fromJson(Map<String, dynamic> j) => FareEstimate(
        baseFare:       (j['base_fare']       as num).toDouble(),
        distanceKm:     (j['distance_km']     as num).toDouble(),
        durationMin:    (j['duration_min']    as num).toDouble(),
        subtotal:       (j['subtotal']        as num).toDouble(),
        nightSurcharge: (j['night_surcharge'] as num).toDouble(),
        total:          (j['total']           as num).toDouble(),
        isNightRate:    j['is_night_rate']    as bool? ?? false,
        maxNegotiationDiscountPct:
            (j['max_negotiation_discount_pct'] as num?)?.toDouble() ?? 20.0,
        routeGeometry:  j['route_geometry']   as Map<String, dynamic>?,
      );
}
