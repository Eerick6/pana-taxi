import 'dart:async';
import 'package:audioplayers/audioplayers.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';

class TripAlertData {
  const TripAlertData({
    required this.tripId,
    required this.originAddress,
    required this.destinationAddress,
    required this.originLat,
    required this.originLng,
    required this.searchRadiusKm,
    required this.fareMode,
    this.suggestedFare,
    this.clientOffer,
    this.distanceKm,
    this.clientName,
    this.clientRating,
    this.clientTotalTrips,
  });

  final String  tripId;
  final String  originAddress;
  final String  destinationAddress;
  final double  originLat;
  final double  originLng;
  final double  searchRadiusKm;
  final String  fareMode;
  final double? suggestedFare;
  final double? clientOffer;
  final double? distanceKm;
  final String? clientName;
  final double? clientRating;
  final int?    clientTotalTrips;

  double get displayFare => fareMode == 'negotiated'
      ? (clientOffer ?? suggestedFare ?? 0)
      : (suggestedFare ?? 0);
  bool get isNegotiated => fareMode == 'negotiated';

  static TripAlertData? fromEvent(Map<String, dynamic> data) {
    try {
      final lat    = _d(data['origin_lat']);
      final lng    = _d(data['origin_lng']);
      final radius = _d(data['search_radius_km']);
      if (lat == null || lng == null || radius == null) return null;
      return TripAlertData(
        tripId:             data['trip_id']              as String,
        originAddress:      data['origin_address']       as String? ?? '—',
        destinationAddress: data['destination_address']  as String? ?? '—',
        originLat:          lat,
        originLng:          lng,
        searchRadiusKm:     radius,
        fareMode:           data['fare_mode']            as String? ?? 'meter',
        suggestedFare:      _d(data['suggested_fare']),
        clientOffer:        _d(data['client_offer']),
        distanceKm:         _d(data['distance_km']),
        clientName:         data['client_name']          as String?,
        clientRating:       _d(data['client_rating']),
        clientTotalTrips:   data['client_total_trips'] is int
            ? data['client_total_trips'] as int
            : int.tryParse(data['client_total_trips']?.toString() ?? ''),
      );
    } catch (_) {
      return null;
    }
  }

  // Mapea desde la respuesta de GET /trips/:id (Trip entity con relaciones)
  static TripAlertData? fromTripDetail(String tripId, Map<String, dynamic> t) {
    try {
      final lat    = _d(t['origin_lat']);
      final lng    = _d(t['origin_lng']);
      final radius = _d(t['current_search_radius_km']);
      if (lat == null || lng == null || radius == null) return null;
      final client = t['client'] as Map<String, dynamic>?;
      return TripAlertData(
        tripId:             tripId,
        originAddress:      t['origin_address']      as String? ?? '—',
        destinationAddress: t['destination_address'] as String? ?? '—',
        originLat:          lat,
        originLng:          lng,
        searchRadiusKm:     radius,
        fareMode:           t['fare_mode']            as String? ?? 'meter',
        suggestedFare:      _d(t['suggested_fare']),
        clientOffer:        _d(t['client_offer']),
        distanceKm:         _d(t['estimated_distance_km']),
        clientName:         client?['full_name']      as String?,
        clientRating:       _d(client?['rating']),
        clientTotalTrips:   client?['total_trips'] is int
            ? client!['total_trips'] as int
            : int.tryParse(client?['total_trips']?.toString() ?? ''),
      );
    } catch (_) {
      return null;
    }
  }

  static double? _d(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString());
  }
}

class TripAlertManager {
  TripAlertManager._();

  static OverlayEntry?           _entry;
  static AudioPlayer?            _player;
  static Timer?                  _timer;
  static _TripAlertOverlayState? _state;
  static String?                 _currentTripId;

  static bool    get isShowing     => _entry != null;
  static String? get currentTripId => _currentTripId;

  static Future<void> show({
    required BuildContext context,
    required TripAlertData alert,
    required Dio dio,
    required void Function(String tripId) onAccepted,
    bool playSound = true,
  }) async {
    dismiss();

    _currentTripId = alert.tripId;
    _entry = OverlayEntry(
      builder: (_) => _TripAlertOverlay(
        alert:      alert,
        dio:        dio,
        onAccepted: (tripId) { dismiss(); onAccepted(tripId); },
        onDismiss:  dismiss,
      ),
    );

    // Insertar el overlay antes del await para no cruzar un gap async con el context
    Overlay.of(context).insert(_entry!);
    _timer = Timer(const Duration(seconds: 25), dismiss);

    if (playSound) {
      _player = AudioPlayer();
      try {
        await _player!.setReleaseMode(ReleaseMode.loop);
        await _player!.play(
          AssetSource('sounds/trip_alert.wav'),
          ctx: AudioContext(
            android: const AudioContextAndroid(
              usageType: AndroidUsageType.alarm,
              contentType: AndroidContentType.music,
              audioFocus: AndroidAudioFocus.gain,
              stayAwake: true,
            ),
            iOS: AudioContextIOS(
              category: AVAudioSessionCategory.playback,
            ),
          ),
        );
        final p = _player!;
        Future.delayed(const Duration(seconds: 8), p.stop);
      } catch (e) {
        debugPrint('[TripAlert] audio error: $e');
      }
    }
  }

  static void notifyOfferIgnored({required bool canReOffer}) {
    _state?.onOfferIgnored(canReOffer: canReOffer);
  }

  static void notifyPriceUpdated(double newPrice) {
    _state?.onPriceUpdated(newPrice);
  }

  static void dismiss() {
    _timer?.cancel();  _timer  = null;
    _player?.stop();   _player?.dispose(); _player = null;
    _entry?.remove();  _entry  = null;
    _state = null;
    _currentTripId = null;
  }
}

bool driverWithinRadius(double dLat, double dLng, TripAlertData alert) {
  final dist = Geolocator.distanceBetween(dLat, dLng, alert.originLat, alert.originLng);
  return dist <= alert.searchRadiusKm * 1000;
}

// ── Overlay widget ────────────────────────────────────────────────────────────

class _TripAlertOverlay extends StatefulWidget {
  const _TripAlertOverlay({
    required this.alert,
    required this.dio,
    required this.onAccepted,
    required this.onDismiss,
  });
  final TripAlertData  alert;
  final Dio            dio;
  final void Function(String) onAccepted;
  final VoidCallback   onDismiss;

  @override
  State<_TripAlertOverlay> createState() => _TripAlertOverlayState();
}

class _TripAlertOverlayState extends State<_TripAlertOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<Offset>   _slide;
  int    _seconds      = 25;
  Timer? _countdown;
  bool   _sending      = false;
  bool   _waiting      = false;  // offer submitted, awaiting client
  bool   _offerIgnored = false;  // client ignored our offer
  bool   _canReOffer   = true;   // backend allows re-offer (< 3 total)
  double? _currentPrice;         // overrides alert.displayFare on price_updated
  OverlayEntry? _counterEntry;

  @override
  void initState() {
    super.initState();
    TripAlertManager._state = this;
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 350));
    _slide = Tween<Offset>(begin: const Offset(0, 1), end: Offset.zero)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    _ctrl.forward();

    _countdown = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _seconds--);
      if (_seconds <= 0) widget.onDismiss();
    });
  }

  @override
  void dispose() {
    if (TripAlertManager._state == this) TripAlertManager._state = null;
    _countdown?.cancel();
    _counterEntry?.remove();
    _ctrl.dispose();
    super.dispose();
  }

  void onOfferIgnored({required bool canReOffer}) {
    if (!mounted) return;
    _countdown?.cancel();
    setState(() {
      _waiting      = false;
      _offerIgnored = true;
      _canReOffer   = canReOffer;
      _seconds      = 25;
    });
    _countdown = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _seconds--);
      if (_seconds <= 0) widget.onDismiss();
    });
  }

  void onPriceUpdated(double newPrice) {
    if (!mounted) return;
    setState(() => _currentPrice = newPrice);
  }

  Future<void> _openCounterSheet({bool isReOffer = false}) async {
    _counterEntry?.remove();
    final price = _currentPrice ?? widget.alert.displayFare;

    double? result;
    final completer = Completer<double?>();

    _counterEntry = OverlayEntry(
      builder: (ctx) => _CounterOfferSheet(
        currentPrice: price,
        isReOffer:    isReOffer,
        onSubmit:     (val) { completer.complete(val); },
        onDismiss:    ()    { completer.complete(null); },
      ),
    );
    Overlay.of(context).insert(_counterEntry!);

    result = await completer.future;
    _counterEntry?.remove();
    _counterEntry = null;
    if (result != null && mounted) _respond(counterAmount: result);
  }

  Future<void> _respond({double? counterAmount}) async {
    if (_sending) return;
    setState(() => _sending = true);
    try {
      if (widget.alert.isNegotiated) {
        // Submit offer and wait for client to select
        await widget.dio.post(
          '/trips/${widget.alert.tripId}/offers',
          data: counterAmount != null ? {'amount': counterAmount} : {},
        );
        if (!mounted) return;
        setState(() { _sending = false; _waiting = true; });
        // Parar countdown — el conductor espera respuesta del cliente sin límite fijo.
        // El overlay se descarta por: trip.offer_accepted, trip.offer_rejected,
        // trip.offer_ignored (que reinicia el timer a 25s) o tap en fondo.
        _countdown?.cancel();
        _countdown = null;
        TripAlertManager._timer?.cancel();
        TripAlertManager._timer = null;
        // Fallback: si el cliente no responde en 90s, cerrar igualmente
        TripAlertManager._timer = Timer(
          const Duration(seconds: 90),
          TripAlertManager.dismiss,
        );
      } else {
        // Meter mode: directly accept the trip
        await widget.dio.patch('/trips/${widget.alert.tripId}/accept');
        widget.onAccepted(widget.alert.tripId);
      }
    } catch (e) {
      if (!mounted) return;
      String msg = 'Error al procesar';
      if (e is DioException && e.response?.data is Map) {
        msg = (e.response!.data as Map)['message']?.toString() ?? msg;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: AppColors.error),
      );
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final alert = widget.alert;
    return Positioned.fill(
      child: Stack(
        children: [
          GestureDetector(
            onTap: widget.onDismiss,
            child: Container(color: Colors.black.withValues(alpha: 0.45)),
          ),
          AnimatedPadding(
            padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
            duration: const Duration(milliseconds: 150),
            curve: Curves.easeOut,
            child: Align(
            alignment: Alignment.bottomCenter,
            child: SlideTransition(
              position: _slide,
              child: Material(
                color: Colors.transparent,
                child: Container(
                  margin: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 24, offset: Offset(0, -4))],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const SizedBox(height: 12),
                      Container(width: 40, height: 4,
                          decoration: BoxDecoration(color: AppColors.gray200, borderRadius: BorderRadius.circular(2))),
                      const SizedBox(height: 16),

                      // ── Info del cliente ────────────────────────────────
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Row(
                          children: [
                            // Avatar
                            Container(
                              width: 48, height: 48,
                              decoration: const BoxDecoration(color: AppColors.primaryLight, shape: BoxShape.circle),
                              child: const Icon(Icons.person, color: AppColors.secondary, size: 26),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(alert.clientName ?? 'Pasajero',
                                      style: AppTextStyles.labelLg),
                                  Row(children: [
                                    const Icon(Icons.star_rounded, size: 14, color: Color(0xFFF59E0B)),
                                    const SizedBox(width: 3),
                                    Text(
                                      alert.clientRating != null
                                          ? alert.clientRating!.toStringAsFixed(1)
                                          : '—',
                                      style: AppTextStyles.caption.copyWith(color: AppColors.gray600),
                                    ),
                                    const SizedBox(width: 8),
                                    const Icon(Icons.directions_car_outlined, size: 13, color: AppColors.gray400),
                                    const SizedBox(width: 3),
                                    Text('${alert.clientTotalTrips ?? 0} viajes',
                                        style: AppTextStyles.caption.copyWith(color: AppColors.gray500)),
                                  ]),
                                ],
                              ),
                            ),
                            // Precio + countdown
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                  decoration: BoxDecoration(
                                    color: AppColors.primary,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text('\$${(_currentPrice ?? alert.displayFare).toStringAsFixed(2)}',
                                      style: AppTextStyles.labelLg.copyWith(fontWeight: FontWeight.w800)),
                                ),
                                const SizedBox(height: 4),
                                _CountdownRing(seconds: _seconds, total: 25),
                              ],
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 14),
                      const Divider(height: 1, color: Color(0xFFEEEEEE)),
                      const SizedBox(height: 14),

                      // ── Ruta ───────────────────────────────────────────
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Column(children: [
                          _RouteRow(icon: Icons.radio_button_checked, color: AppColors.success, text: alert.originAddress),
                          Padding(
                            padding: const EdgeInsets.only(left: 7),
                            child: Container(height: 16, width: 2, color: AppColors.gray200),
                          ),
                          _RouteRow(icon: Icons.location_on, color: AppColors.error, text: alert.destinationAddress),
                        ]),
                      ),

                      // Distancia del viaje
                      if (alert.distanceKm != null) ...[
                        const SizedBox(height: 8),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          child: Row(children: [
                            const Icon(Icons.route_outlined, size: 13, color: AppColors.gray400),
                            const SizedBox(width: 6),
                            Text('${alert.distanceKm!.toStringAsFixed(1)} km de recorrido',
                                style: AppTextStyles.caption.copyWith(color: AppColors.gray500)),
                          ]),
                        ),
                      ],

                      const SizedBox(height: 16),

                      // ── Esperando confirmación del cliente ──────────────
                      if (_waiting) ...[
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                          child: Row(children: [
                            const SizedBox(width: 18, height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary)),
                            const SizedBox(width: 12),
                            Text('Oferta enviada. Esperando al cliente…',
                                style: AppTextStyles.label.copyWith(color: AppColors.gray600)),
                          ]),
                        ),
                      ],

                      // ── Oferta ignorada por el cliente ──────────────────
                      if (_offerIgnored) ...[
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFF3CD),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Row(children: [
                              const Icon(Icons.info_outline, size: 16, color: Color(0xFF856404)),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _canReOffer
                                      ? 'El cliente ignoró tu oferta. ¿Deseas intentar de nuevo?'
                                      : 'Alcanzaste el límite de 3 ofertas para este viaje.',
                                  style: AppTextStyles.caption.copyWith(color: const Color(0xFF856404)),
                                ),
                              ),
                            ]),
                          ),
                        ),
                      ],

                      // ── Botones principales ─────────────────────────────
                      if (!_waiting) Padding(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                        child: _offerIgnored
                            // Offer ignored: re-offer or dismiss
                            ? Row(children: [
                                Expanded(
                                  child: OutlinedButton(
                                    onPressed: widget.onDismiss,
                                    style: OutlinedButton.styleFrom(
                                      side: const BorderSide(color: AppColors.gray300),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                      padding: const EdgeInsets.symmetric(vertical: 13),
                                    ),
                                    child: Text('Cerrar',
                                        style: AppTextStyles.label.copyWith(color: AppColors.gray600)),
                                  ),
                                ),
                                if (_canReOffer) ...[
                                  const SizedBox(width: 8),
                                  Expanded(
                                    flex: 2,
                                    child: ElevatedButton(
                                      onPressed: _sending ? null : () => _openCounterSheet(isReOffer: true),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: AppColors.primary,
                                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                        padding: const EdgeInsets.symmetric(vertical: 13),
                                        elevation: 0,
                                      ),
                                      child: Text('Cambiar precio',
                                          style: AppTextStyles.label.copyWith(fontWeight: FontWeight.w700)),
                                    ),
                                  ),
                                ],
                              ])
                            // Normal: ignorar / contraofertar / aceptar
                            : Row(children: [
                          // Ignorar
                          Expanded(
                            child: OutlinedButton(
                              onPressed: widget.onDismiss,
                              style: OutlinedButton.styleFrom(
                                side: const BorderSide(color: AppColors.gray300),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                padding: const EdgeInsets.symmetric(vertical: 13),
                              ),
                              child: Text('Ignorar',
                                  style: AppTextStyles.label.copyWith(color: AppColors.gray600)),
                            ),
                          ),
                          const SizedBox(width: 8),
                          // Contra-oferta (solo negociado)
                          if (alert.isNegotiated) ...[
                            Expanded(
                              child: OutlinedButton(
                                onPressed: _sending ? null : () => _openCounterSheet(),
                                style: OutlinedButton.styleFrom(
                                  side: const BorderSide(color: AppColors.secondary),
                                  foregroundColor: AppColors.secondary,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                  padding: const EdgeInsets.symmetric(vertical: 13),
                                ),
                                child: Text('Contraofertar',
                                    style: AppTextStyles.label.copyWith(color: AppColors.secondary)),
                              ),
                            ),
                            const SizedBox(width: 8),
                          ],
                          // Aceptar precio
                          Expanded(
                            flex: alert.isNegotiated ? 1 : 2,
                            child: ElevatedButton(
                              onPressed: _sending ? null : () => _respond(),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.primary,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                padding: const EdgeInsets.symmetric(vertical: 13),
                                elevation: 0,
                              ),
                              child: _sending
                                  ? const SizedBox(width: 18, height: 18,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                                  : Text(
                                      alert.isNegotiated
                                          ? 'Aceptar \$${(_currentPrice ?? alert.displayFare).toStringAsFixed(2)}'
                                          : 'Aceptar viaje',
                                      style: AppTextStyles.label.copyWith(fontWeight: FontWeight.w700),
                                    ),
                            ),
                          ),
                        ]),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          ), // AnimatedPadding
        ],
      ),
    );
  }
}

class _RouteRow extends StatelessWidget {
  const _RouteRow({required this.icon, required this.color, required this.text});
  final IconData icon; final Color color; final String text;
  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Icon(icon, size: 16, color: color),
      const SizedBox(width: 10),
      Expanded(child: Text(text, style: AppTextStyles.body, maxLines: 2, overflow: TextOverflow.ellipsis)),
    ],
  );
}

class _CountdownRing extends StatelessWidget {
  const _CountdownRing({required this.seconds, required this.total});
  final int seconds; final int total;
  @override
  Widget build(BuildContext context) {
    final progress = seconds / total;
    return SizedBox(
      width: 38, height: 38,
      child: Stack(alignment: Alignment.center, children: [
        CircularProgressIndicator(
          value: progress, strokeWidth: 3,
          backgroundColor: AppColors.gray100,
          valueColor: AlwaysStoppedAnimation(progress > 0.4 ? AppColors.primary : AppColors.error),
        ),
        Text('$seconds', style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.w700)),
      ]),
    );
  }
}

// ── Sheet de contra-oferta (OverlayEntry encima del alert overlay) ────────────

class _CounterOfferSheet extends StatefulWidget {
  const _CounterOfferSheet({
    required this.currentPrice,
    required this.isReOffer,
    required this.onSubmit,
    required this.onDismiss,
  });
  final double          currentPrice;
  final bool            isReOffer;
  final void Function(double) onSubmit;
  final VoidCallback    onDismiss;

  @override
  State<_CounterOfferSheet> createState() => _CounterOfferSheetState();
}

class _CounterOfferSheetState extends State<_CounterOfferSheet>
    with SingleTickerProviderStateMixin {
  late final TextEditingController _ctrl;
  late final AnimationController   _anim;
  late final Animation<Offset>     _slide;
  final _focus = FocusNode();
  String? _error;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(
      text: widget.currentPrice.toStringAsFixed(2),
    );
    _anim  = AnimationController(vsync: this, duration: const Duration(milliseconds: 280));
    _slide = Tween<Offset>(begin: const Offset(0, 1), end: Offset.zero)
        .animate(CurvedAnimation(parent: _anim, curve: Curves.easeOutCubic));
    _anim.forward();
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    _anim.dispose();
    super.dispose();
  }

  void _submit() {
    final val = double.tryParse(_ctrl.text.trim().replaceAll(',', '.'));
    if (val == null || val <= 0) {
      setState(() => _error = 'Ingresa un monto válido');
      return;
    }
    widget.onSubmit(val);
  }

  @override
  Widget build(BuildContext context) {
    final kb = MediaQuery.of(context).viewInsets.bottom;
    return Material(
      color: Colors.transparent,
      child: Stack(
        children: [
          // Fondo oscuro — toca para cerrar
          GestureDetector(
            onTap: widget.onDismiss,
            child: Container(color: Colors.black.withValues(alpha: 0.4)),
          ),
          // Sheet deslizante
          Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: EdgeInsets.only(bottom: kb),
              child: SlideTransition(
                position: _slide,
                child: Container(
                  width: double.infinity,
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
                          width: 40, height: 4,
                          decoration: BoxDecoration(
                            color: AppColors.gray200,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),
                      Text(
                        widget.isReOffer ? 'Cambiar precio' : 'Contraofertar',
                        style: AppTextStyles.h3,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Precio del cliente: \$${widget.currentPrice.toStringAsFixed(2)}',
                        style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller:      _ctrl,
                        focusNode:       _focus,
                        keyboardType:    const TextInputType.numberWithOptions(decimal: true),
                        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d.,]'))],
                        textInputAction: TextInputAction.done,
                        onSubmitted:     (_) => _submit(),
                        decoration: InputDecoration(
                          prefixText:     '\$ ',
                          labelText:      'Tu precio',
                          errorText:      _error,
                          border:         OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
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
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            elevation: 0,
                          ),
                          child: Text(
                            widget.isReOffer ? 'Re-ofertar' : 'Enviar oferta',
                            style: AppTextStyles.label.copyWith(fontWeight: FontWeight.w700),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
