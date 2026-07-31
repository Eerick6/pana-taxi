import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart' as geo;
import 'package:go_router/go_router.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/config/app_config.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/models/trip_model.dart';
import '../../data/providers/trip_provider.dart';

class TripActivePage extends ConsumerStatefulWidget {
  const TripActivePage({super.key, required this.tripId});
  final String tripId;

  @override
  ConsumerState<TripActivePage> createState() => _TripActivePageState();
}

class _TripActivePageState extends ConsumerState<TripActivePage> {
  bool _loading = false;

  Future<void> _performAction(Future<void> Function() action) async {
    setState(() => _loading = true);
    try {
      await action();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tripAsync = ref.watch(activeTripProvider);

    return tripAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text('Error: $e'))),
      data: (trip) {
        if (trip == null) {
          WidgetsBinding.instance.addPostFrameCallback((_) => context.go('/home'));
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        return _TripView(trip: trip, loading: _loading, onAction: _performAction);
      },
    );
  }
}

Future<String?> _showOtpDialog(BuildContext context) async {
  final ctrl = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Código del pasajero'),
      content: TextField(
        controller: ctrl,
        keyboardType: TextInputType.number,
        maxLength: 6,
        autofocus: true,
        decoration: const InputDecoration(hintText: 'Ingresa el código de 6 dígitos'),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
        ElevatedButton(
          onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
          child: const Text('Confirmar'),
        ),
      ],
    ),
  );
}

// ── Trip view ─────────────────────────────────────────────────────────────────

class _TripView extends ConsumerStatefulWidget {
  const _TripView({required this.trip, required this.loading, required this.onAction});
  final TripModel trip;
  final bool loading;
  final Future<void> Function(Future<void> Function()) onAction;

  @override
  ConsumerState<_TripView> createState() => _TripViewState();
}

class _TripViewState extends ConsumerState<_TripView> {
  MapLibreMapController? _mapController;
  double? _etaMinutes;      // ETA from Mapbox when going to pickup
  Timer?  _waitTimer;
  int     _waitSecondsLeft = 0;

  @override
  void initState() {
    super.initState();
    if (widget.trip.status == 'driver_arrived') {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _startWaitCountdown(widget.trip.waitTimerExpiresAt),
      );
    }
  }

  @override
  void dispose() {
    _waitTimer?.cancel();
    super.dispose();
  }

  @override
  void didUpdateWidget(_TripView old) {
    super.didUpdateWidget(old);
    if (old.trip.status != widget.trip.status) {
      _fetchAndDrawRoute(widget.trip);
      if (widget.trip.status == 'driver_arrived') {
        _startWaitCountdown(widget.trip.waitTimerExpiresAt);
      }
    }
  }

  void _startWaitCountdown(DateTime? expiresAt) {
    _waitTimer?.cancel();
    final expires = expiresAt ?? DateTime.now().add(const Duration(minutes: 5));
    final initial = expires.difference(DateTime.now()).inSeconds;
    if (!mounted) return;
    setState(() => _waitSecondsLeft = initial < 0 ? 0 : initial);
    _waitTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final left = expires.difference(DateTime.now()).inSeconds;
      setState(() => _waitSecondsLeft = left < 0 ? 0 : left);
      if (left <= 0) _waitTimer?.cancel();
    });
  }

  Future<void> _fetchAndDrawRoute(TripModel trip) async {
    final ctrl = _mapController;
    if (ctrl == null) return;

    // Stop following while we set up the new view
    await ctrl.updateMyLocationTrackingMode(MyLocationTrackingMode.none);
    await ctrl.clearLines();

    double startLat, startLng, endLat, endLng;
    String lineColor;

    switch (trip.status) {
      case 'accepted':
        try {
          final pos = await geo.Geolocator.getCurrentPosition(
            locationSettings: const geo.LocationSettings(accuracy: geo.LocationAccuracy.high),
          );
          startLat = pos.latitude;
          startLng = pos.longitude;
        } catch (_) {
          return;
        }
        endLat = trip.originLat;
        endLng = trip.originLng;
        lineColor = '#4264fb'; // blue: driver → pickup

      case 'in_progress':
        startLat = trip.originLat;
        startLng = trip.originLng;
        endLat = trip.destinationLat;
        endLng = trip.destinationLng;
        lineColor = '#16a34a'; // green: pickup → destination

      default:
        // driver_arrived: no route needed, just center on pickup
        await ctrl.animateCamera(
          CameraUpdate.newLatLngZoom(LatLng(trip.originLat, trip.originLng), 16),
        );
        await Future.delayed(const Duration(seconds: 2));
        if (mounted) {
          await ctrl.updateMyLocationTrackingMode(MyLocationTrackingMode.trackingCompass);
        }
        return;
    }

    try {
      final dio = Dio();
      final url = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic/'
          '$startLng,$startLat;$endLng,$endLat'
          '?geometries=geojson&overview=full&access_token=${AppConfig.mapboxToken}';

      final response = await dio.get<Map<String, dynamic>>(url);
      final routes = response.data?['routes'] as List?;
      if (routes == null || routes.isEmpty) return;

      if (trip.status == 'accepted') {
        final secs = (routes[0]['duration'] as num?)?.toDouble();
        if (secs != null && mounted) setState(() => _etaMinutes = secs / 60);
      }

      final coords = routes[0]['geometry']['coordinates'] as List;
      final latLngs = coords
          .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
          .toList();

      if (!mounted) return;

      // White border first, colored line on top — Uber/InDrive style
      await ctrl.addLine(LineOptions(
        geometry: latLngs,
        lineColor: '#ffffff',
        lineWidth: 10.0,
        lineOpacity: 1.0,
        lineJoin: 'round',
      ));
      await ctrl.addLine(LineOptions(
        geometry: latLngs,
        lineColor: lineColor,
        lineWidth: 6.0,
        lineOpacity: 1.0,
        lineJoin: 'round',
      ));

      // Show full route for 3 seconds, then switch to navigation follow mode
      final lats = latLngs.map((p) => p.latitude);
      final lngs = latLngs.map((p) => p.longitude);
      await ctrl.animateCamera(
        CameraUpdate.newLatLngBounds(
          LatLngBounds(
            southwest: LatLng(
              lats.reduce((a, b) => a < b ? a : b),
              lngs.reduce((a, b) => a < b ? a : b),
            ),
            northeast: LatLng(
              lats.reduce((a, b) => a > b ? a : b),
              lngs.reduce((a, b) => a > b ? a : b),
            ),
          ),
          left: 50,
          top: 80,
          right: 50,
          bottom: 340,
        ),
      );

      await Future.delayed(const Duration(seconds: 3));
      if (mounted) {
        // Camera follows driver and rotates with compass — navigation mode
        await ctrl.updateMyLocationTrackingMode(MyLocationTrackingMode.trackingCompass);
      }
    } catch (_) {
      // Route fetch failed silently — map still shows, switch to follow mode anyway
      if (mounted) {
        await ctrl.updateMyLocationTrackingMode(MyLocationTrackingMode.trackingCompass);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final trip = widget.trip;

    final (actionLabel, actionColor, action) = switch (trip.status) {
      'accepted' => (
          'Llegué al punto de recogida',
          Colors.blue,
          () => ref.read(activeTripProvider.notifier).markArrived(trip.id),
        ),
      'driver_arrived' => (
          'Iniciar viaje',
          Colors.green,
          () async {
            final otp = await _showOtpDialog(context);
            if (otp == null) return;
            await ref.read(activeTripProvider.notifier).startTrip(trip.id, otp);
          },
        ),
      'in_progress' => (
          'Finalizar viaje',
          AppColors.primary,
          () async {
            final fare = trip.fare ?? 0.0;
            await ref.read(activeTripProvider.notifier).completeTrip(trip.id, fare);
            if (context.mounted) context.go('/home');
          },
        ),
      _ => ('', Colors.grey, () async {}),
    };

    return Scaffold(
      body: Stack(
        children: [
          MapLibreMap(
            styleString: 'https://tiles.openfreemap.org/styles/liberty',
            initialCameraPosition: CameraPosition(
              target: LatLng(trip.originLat, trip.originLng),
              zoom: 14,
            ),
            onMapCreated: (controller) {
              _mapController = controller;
              _fetchAndDrawRoute(trip);
            },
            myLocationEnabled: true,
            myLocationTrackingMode: MyLocationTrackingMode.none,
            myLocationRenderMode: MyLocationRenderMode.compass,
            trackCameraPosition: true,
          ),

          // Back button
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: GestureDetector(
                onTap: () => context.pop(),
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.white,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 8)],
                  ),
                  child: const Icon(Icons.arrow_back_ios_new, size: 18),
                ),
              ),
            ),
          ),

          // Bottom sheet
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              decoration: const BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                boxShadow: [BoxShadow(color: Color(0x18000000), blurRadius: 24, offset: Offset(0, -4))],
              ),
              padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).padding.bottom + 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(width: 36, height: 4, margin: const EdgeInsets.only(bottom: 16), decoration: BoxDecoration(color: AppColors.gray200, borderRadius: BorderRadius.circular(2))),

                  // Status badge
                  _StatusBadge(status: trip.status),
                  const SizedBox(height: 10),

                  // ETA cuando va al cliente
                  if (trip.status == 'accepted' && _etaMinutes != null)
                    _InfoChip(
                      icon: Icons.access_time_rounded,
                      color: Colors.blue,
                      label: 'Llegas en ~${_etaMinutes!.round()} min',
                    ),

                  // Countdown de espera cuando llegó
                  if (trip.status == 'driver_arrived')
                    _WaitTimer(secondsLeft: _waitSecondsLeft),

                  const SizedBox(height: 12),

                  // Client info
                  Row(
                    children: [
                      const CircleAvatar(
                        radius: 24,
                        backgroundColor: AppColors.primaryLight,
                        child: Icon(Icons.person, color: AppColors.secondary),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(trip.clientName, style: AppTextStyles.labelLg),
                            if (trip.fare != null)
                              Text('\$${trip.fare!.toStringAsFixed(2)}', style: AppTextStyles.h3.copyWith(color: AppColors.primaryText)),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: () async {
                          final uri = Uri.parse('tel:${trip.clientPhone}');
                          if (await canLaunchUrl(uri)) launchUrl(uri);
                        },
                        icon: const Icon(Icons.phone_outlined),
                        style: IconButton.styleFrom(backgroundColor: AppColors.primaryLight),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Addresses
                  _RouteCard(origin: trip.originAddress, destination: trip.destinationAddress),
                  const SizedBox(height: 16),

                  if (actionLabel.isNotEmpty)
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton(
                        onPressed: widget.loading ? null : () => widget.onAction(action),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: actionColor,
                          foregroundColor: AppColors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          elevation: 0,
                        ),
                        child: widget.loading
                            ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.white))
                            : Text(actionLabel, style: AppTextStyles.btnLg),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Reusable widgets ──────────────────────────────────────────────────────────

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      'accepted' => ('Yendo al cliente', Colors.blue),
      'driver_arrived' => ('Esperando al cliente', AppColors.warningText),
      'in_progress' => ('Viaje en progreso', Colors.green),
      _ => ('Completado', AppColors.gray400),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color),
      ),
      child: Text(label, style: AppTextStyles.label.copyWith(color: color)),
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.color, required this.label});
  final IconData icon;
  final Color    color;
  final String   label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.center,
    children: [
      Icon(icon, size: 15, color: color),
      const SizedBox(width: 5),
      Text(label, style: AppTextStyles.label.copyWith(color: color)),
    ],
  );
}

class _WaitTimer extends StatelessWidget {
  const _WaitTimer({required this.secondsLeft});
  final int secondsLeft;

  @override
  Widget build(BuildContext context) {
    final mins = secondsLeft ~/ 60;
    final secs = secondsLeft % 60;
    final expired = secondsLeft <= 0;
    final color = expired ? AppColors.errorText : AppColors.warningText;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.timer_outlined, size: 16, color: color),
          const SizedBox(width: 6),
          Text(
            expired
                ? 'Tiempo de espera agotado'
                : 'Espera al pasajero: ${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}',
            style: AppTextStyles.label.copyWith(color: color),
          ),
        ],
      ),
    );
  }
}

class _RouteCard extends StatelessWidget {
  const _RouteCard({required this.origin, required this.destination});
  final String origin;
  final String destination;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.gray50,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          Row(
            children: [
              const Icon(Icons.radio_button_checked, size: 16, color: Colors.green),
              const SizedBox(width: 10),
              Expanded(child: Text(origin, style: AppTextStyles.body, maxLines: 2)),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(left: 7),
            child: Container(width: 2, height: 20, color: AppColors.gray300),
          ),
          Row(
            children: [
              const Icon(Icons.location_on, size: 16, color: AppColors.error),
              const SizedBox(width: 10),
              Expanded(child: Text(destination, style: AppTextStyles.body, maxLines: 2)),
            ],
          ),
        ],
      ),
    );
  }
}
