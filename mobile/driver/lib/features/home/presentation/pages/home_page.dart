import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart' as geo;
import 'package:go_router/go_router.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/network/socket_client.dart';
import '../../../../core/services/push_notification_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../profile/data/providers/profile_provider.dart';
import '../../../trip/presentation/widgets/trip_alert_overlay.dart';
import '../../../documents/data/providers/document_provider.dart';
import '../../../vehicles/data/providers/vehicle_provider.dart';
import '../widgets/home_bottom_panel.dart';
import '../widgets/home_pending_screen.dart';
import '../widgets/home_top_bar.dart';
import '../widgets/home_trip_banner.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> with WidgetsBindingObserver {
  MapLibreMapController? _mapController;
  StreamSubscription<geo.Position>? _locationSub;
  geo.Position? _pendingPosition;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _requestLocationAndTrack();
    _initSocketAndListen();
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkPendingTrip());
  }

  Future<void> _checkPendingTrip() async {
    final tripId = PushNotificationService.pendingTripId;
    if (tripId == null || tripId.isEmpty) return;
    PushNotificationService.pendingTripId = null;
    if (!mounted) return;
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get('/trips/$tripId');
      final data = Map<String, dynamic>.from(res.data as Map);
      if (data['status'] != 'requested') return;
      final alert = TripAlertData.fromTripDetail(tripId, data);
      if (alert == null || !mounted || TripAlertManager.isShowing) return;
      TripAlertManager.show(
        context: context,
        alert: alert,
        dio: dio,
        onAccepted: (_) => context.push('/trip/$tripId'),
        playSound: false,
      );
    } catch (e) {
      debugPrint('[HomePage] pending trip fetch error: $e');
    }
  }

  Future<void> _initSocketAndListen() async {
    final socket = ref.read(socketClientProvider);
    await socket.connect();
    _listenForTrips();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _locationSub?.cancel();
    TripAlertManager.dismiss();
    final socket = ref.read(socketClientProvider);
    socket.off('driver.approved');
    socket.off('vehicle.approved');
    socket.off('document.approved');
    socket.off('trip.new');
    socket.off('trip.taken');
    socket.off('trip.radius_expanded');
    socket.off('trip.offer_accepted');
    socket.off('trip.offer_rejected');
    socket.off('trip.offer_ignored');
    socket.off('trip.price_updated');
    super.dispose();
  }

  void _listenForTrips() {
    final socket = ref.read(socketClientProvider);

    socket.on('driver.approved', (_) {
      if (!mounted) return;
      ref.read(driverProfileProvider.notifier).refresh();
    });

    socket.on('vehicle.approved', (_) {
      if (!mounted) return;
      ref.read(myVehiclesGuardProvider.notifier).refresh();
    });

    socket.on('document.approved', (_) {
      if (!mounted) return;
      ref.invalidate(documentsProvider);
    });

    socket.on('trip.new', (data) {
      debugPrint('[trip.new] received: $data');
      if (!mounted) { debugPrint('[trip.new] skip: not mounted'); return; }
      if (data is! Map) { debugPrint('[trip.new] skip: data is not Map'); return; }
      final map = Map<String, dynamic>.from(data);
      final alert = TripAlertData.fromEvent(map);
      if (alert == null) { debugPrint('[trip.new] skip: fromEvent returned null'); return; }
      if (TripAlertManager.isShowing) { debugPrint('[trip.new] skip: overlay already showing'); return; }
      final pos = _pendingPosition;
      if (pos != null && !driverWithinRadius(pos.latitude, pos.longitude, alert)) {
        debugPrint('[trip.new] skip: outside radius. driver=(${pos.latitude},${pos.longitude}) origin=(${alert.originLat},${alert.originLng}) radius=${alert.searchRadiusKm}km');
        return;
      }
      debugPrint('[trip.new] showing alert for trip ${alert.tripId}');
      TripAlertManager.show(
        context: context,
        alert: alert,
        dio: ref.read(dioProvider),
        onAccepted: (_) => context.push('/trip/${alert.tripId}'),
      );
    });

    socket.on('trip.taken', (_) {
      if (TripAlertManager.isShowing) TripAlertManager.dismiss();
    });

    socket.on('trip.offer_accepted', (data) {
      if (!mounted) return;
      TripAlertManager.dismiss();
      final tripId = (data is Map ? data['trip_id'] : null) as String?;
      if (tripId != null) context.push('/trip/$tripId');
    });

    socket.on('trip.offer_rejected', (_) {
      if (TripAlertManager.isShowing) TripAlertManager.dismiss();
    });

    socket.on('trip.offer_ignored', (data) {
      if (!mounted || data is! Map) return;
      final canReOffer = (data['can_re_offer'] as bool?) ?? true;
      TripAlertManager.notifyOfferIgnored(canReOffer: canReOffer);
    });

    socket.on('trip.price_updated', (data) {
      debugPrint('[price_updated] received: $data');
      if (!mounted || data is! Map) return;
      final map   = Map<String, dynamic>.from(data);
      final alert = TripAlertData.fromEvent(map);
      if (alert == null) { debugPrint('[price_updated] fromEvent returned null'); return; }

      if (TripAlertManager.isShowing && TripAlertManager.currentTripId != alert.tripId) return;

      if (!TripAlertManager.isShowing) {
        final pos = _pendingPosition;
        if (pos != null && !driverWithinRadius(pos.latitude, pos.longitude, alert)) {
          debugPrint('[price_updated] skip: outside radius');
          return;
        }
      }

      debugPrint('[price_updated] showing overlay for trip ${alert.tripId} price=${alert.clientOffer}');
      TripAlertManager.show(
        context: context,
        alert: alert,
        dio: ref.read(dioProvider),
        onAccepted: (_) => context.push('/trip/${alert.tripId}'),
      );
    });

    socket.on('trip.radius_expanded', (data) {
      if (!mounted) return;
      if (data is! Map) return;
      final map = Map<String, dynamic>.from(data);
      final alert = TripAlertData.fromEvent(map);
      if (alert == null) return;
      if (TripAlertManager.isShowing) return;
      final pos = _pendingPosition;
      if (pos == null) return;
      if (!driverWithinRadius(pos.latitude, pos.longitude, alert)) return;
      TripAlertManager.show(
        context: context,
        alert: alert,
        dio: ref.read(dioProvider),
        onAccepted: (_) => context.push('/trip/${alert.tripId}'),
      );
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(driverProfileProvider.notifier).refresh();
      ref.read(myVehiclesGuardProvider.notifier).refresh();
      // User may have tapped a trip notification while the app was in background.
      // router.go('/home') from the tap handler may not rebuild this page if the
      // route is already /home, so we also check here on every resume.
      _checkPendingTrip();
    }
  }

  Future<void> _requestLocationAndTrack() async {
    final status = await Permission.locationWhenInUse.request();
    if (!status.isGranted) return;

    try {
      final pos = await geo.Geolocator.getCurrentPosition(
        locationSettings: const geo.LocationSettings(accuracy: geo.LocationAccuracy.high),
      );
      _pendingPosition = pos;
      _flyTo(pos);
    } catch (_) {}

    _locationSub = geo.Geolocator.getPositionStream(
      locationSettings: const geo.LocationSettings(
        accuracy: geo.LocationAccuracy.high,
        distanceFilter: 20,
      ),
    ).listen((pos) {
      _pendingPosition = pos;
      _flyTo(pos);
      ref.read(socketClientProvider).emit('location.update', {
        'lat': pos.latitude,
        'lng': pos.longitude,
        'speed_kmh': pos.speed > 0 ? pos.speed * 3.6 : 0.0,
      });
    });
  }

  void _flyTo(geo.Position pos) {
    _mapController?.animateCamera(
      CameraUpdate.newLatLngZoom(LatLng(pos.latitude, pos.longitude), 15),
    );
  }

  void _toggleStatus() {
    final isOnline = ref.read(driverProfileProvider).value?.isOnline ?? false;
    if (isOnline) {
      _endOwnerDay();
    } else {
      _showOwnerStartDaySheet();
    }
  }

  Future<void> _endOwnerDay() async {
    try {
      await ref.read(driverProfileProvider.notifier).endDay();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Jornada terminada. ¡Hasta pronto!'),
            backgroundColor: Colors.orange,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  Future<void> _showOwnerStartDaySheet() async {
    final vehicles = ref.read(myVehiclesGuardProvider).value
            ?.where((v) => v.approvalStatus == 'approved')
            .toList() ??
        [];

    if (vehicles.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Necesitas un taxi aprobado para activarte. Ve a "Mis taxis".'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
      return;
    }

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => HomeOwnerStartDaySheet(vehicles: vehicles),
    );
  }

  @override
  Widget build(BuildContext context) {
    // CERO ref.watch aquí — el mapa nunca participa en rebuilds por providers
    return Scaffold(
      body: Stack(
        children: [
          MapLibreMap(
            styleString: 'https://tiles.openfreemap.org/styles/liberty',
            initialCameraPosition: const CameraPosition(
              target: LatLng(-0.2295, -78.5243), zoom: 13,
            ),
            onMapCreated: (controller) {
              _mapController = controller;
              if (_pendingPosition != null) _flyTo(_pendingPosition!);
            },
            myLocationEnabled: true,
            myLocationRenderMode: MyLocationRenderMode.normal,
            trackCameraPosition: false,
          ),

          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  Expanded(child: HomeTopBarChip(onToggle: _toggleStatus)),
                  const SizedBox(width: 10),
                  HomeTopIconBtn(icon: Icons.notifications_outlined, onTap: () => context.push('/notifications')),
                ],
              ),
            ),
          ),

          HomeTripBanner(onNavigate: (id) => context.push('/trip/$id')),

          Positioned(
            bottom: 0, left: 0, right: 0,
            child: HomeBottomPanel(onToggle: _toggleStatus),
          ),

          const HomeProfileGuard(),
          const HomeOwnerProfileGuard(),
        ],
      ),
    );
  }
}
