import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/network/socket_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../profile/presentation/providers/profile_provider.dart';
import '../../../trips/presentation/providers/active_trip_provider.dart';
import '../widgets/home_bottom_sheet.dart';
import '../widgets/sos_button.dart';

Future<Uint8List> _buildLocationDotBytes() async {
  const size  = 60.0;
  const cx    = size / 2;
  const cy    = size / 2;

  final recorder = ui.PictureRecorder();
  final canvas   = Canvas(recorder, Rect.fromLTWH(0, 0, size, size));

  // Halo exterior translúcido (estilo Google Maps)
  canvas.drawCircle(
    const Offset(cx, cy),
    26,
    Paint()..color = const Color(0x554285F4),
  );

  // Sombra del punto central
  canvas.drawCircle(
    const Offset(cx, cy + 2),
    16,
    Paint()..color = Colors.black.withValues(alpha: 0.22),
  );

  // Punto azul sólido
  canvas.drawCircle(
    const Offset(cx, cy),
    16,
    Paint()..color = const Color(0xFF4285F4),
  );

  // Borde blanco
  canvas.drawCircle(
    const Offset(cx, cy),
    16,
    Paint()
      ..color   = Colors.white
      ..style   = PaintingStyle.stroke
      ..strokeWidth = 3,
  );

  final img   = await recorder.endRecording().toImage(size.toInt(), size.toInt());
  final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
  return bytes!.buffer.asUint8List();
}

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  MapLibreMapController? _mapController;
  Symbol? _locationSymbol;
  StreamSubscription<Position>? _locationSub;

  // Flag para desactivar handlers sin llamar socket.off() (que borraría listeners de otras páginas)
  bool _socketActive = false;

  @override
  void initState() {
    super.initState();
    Permission.locationWhenInUse.request().then((_) => _startLocationTracking());
    _initSocket();
  }

  Future<void> _initSocket() async {
    final socket = ref.read(socketClientProvider);
    await socket.connect();
    if (!mounted) return;

    _socketActive = true;

    socket.on('trip.cancelled', (_) {
      if (!_socketActive || !mounted) return;
      ref.invalidate(activeTripProvider);
    });
    socket.on('trip.accepted', (data) {
      if (!_socketActive || !mounted || data is! Map) return;
      final tripId = (data['trip_id'] as String?) ?? '';
      if (tripId.isNotEmpty) context.go('/trip/$tripId');
    });
  }

  @override
  void dispose() {
    _socketActive = false;
    _locationSub?.cancel();
    super.dispose();
  }

  Future<void> _onMapCreated(MapLibreMapController c) async {
    _mapController = c;
    final bytes = await _buildLocationDotBytes();
    await c.addImage('location-dot', bytes);
  }

  Future<void> _startLocationTracking() async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      await _updateSymbol(pos);
      _mapController?.animateCamera(
        CameraUpdate.newLatLngZoom(LatLng(pos.latitude, pos.longitude), 15),
      );
    } catch (_) {}

    _locationSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 5,
      ),
    ).listen(_updateSymbol);
  }

  Future<void> _updateSymbol(Position pos) async {
    final latlng = LatLng(pos.latitude, pos.longitude);
    if (_locationSymbol == null) {
      _locationSymbol = await _mapController?.addSymbol(
        SymbolOptions(
          geometry: latlng,
          iconImage: 'location-dot',
          iconSize: 1.5,
        ),
      );
    } else {
      await _mapController?.updateSymbol(
        _locationSymbol!,
        SymbolOptions(geometry: latlng),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final activeTripAsync = ref.watch(activeTripProvider);
    final hasActiveTrip   = activeTripAsync.valueOrNull?.isActive ?? false;

    return Scaffold(
      body: Stack(
        children: [
          MapLibreMap(
            onMapCreated: _onMapCreated,
            initialCameraPosition: const CameraPosition(
              target: LatLng(-0.2295, -78.5243),
              zoom: 13,
            ),
            styleString: 'https://tiles.openfreemap.org/styles/liberty',
            myLocationEnabled: false,
            trackCameraPosition: false,
          ),

          const SafeArea(child: _TopBar()),

          if (hasActiveTrip)
            Positioned(
              bottom: 220,
              right: 16,
              child: SosButton(tripId: activeTripAsync.valueOrNull!.id),
            ),

          Positioned(
            left: 0, right: 0, bottom: 0,
            child: HomeBottomSheet(mapController: _mapController),
          ),
        ],
      ),
    );
  }
}

class _TopBar extends ConsumerWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final photoUrl = ref.watch(clientProfileProvider).valueOrNull?.photoUrl;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => context.push('/profile'),
            child: Container(
              width: 44, height: 44,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.white,
                boxShadow: [
                  BoxShadow(
                      color: Colors.black.withValues(alpha: 0.15),
                      blurRadius: 6),
                ],
              ),
              child: ClipOval(
                child: photoUrl != null
                    ? CachedNetworkImage(
                        imageUrl: photoUrl,
                        fit: BoxFit.cover,
                        errorWidget: (_, __, ___) => const Icon(
                            Icons.person, color: AppColors.gray500, size: 24),
                        placeholder: (_, __) => const SizedBox.shrink(),
                      )
                    : const Icon(Icons.person,
                        color: AppColors.gray500, size: 24),
              ),
            ),
          ),
          const Spacer(),
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              color: AppColors.white,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.15),
                    blurRadius: 6),
              ],
            ),
            child: const Icon(Icons.notifications_outlined,
                color: AppColors.secondary, size: 22),
          ),
        ],
      ),
    );
  }
}
