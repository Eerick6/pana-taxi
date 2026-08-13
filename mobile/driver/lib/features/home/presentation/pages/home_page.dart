import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:audioplayers/audioplayers.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import '../../../trip/data/providers/trip_provider.dart';
import '../../../trip/presentation/widgets/trip_alert_overlay.dart';
import '../../../auth/data/providers/auth_provider.dart';
import '../../../documents/data/providers/document_provider.dart';
import '../../../vehicles/data/providers/vehicle_provider.dart';
import '../widgets/available_trips_panel.dart';
import '../widgets/home_bottom_panel.dart';
import '../widgets/home_pending_screen.dart';
import '../widgets/home_top_bar.dart';
import '../widgets/home_trip_banner.dart';

Uint8List? _locationDotCache;
Future<Uint8List> _getLocationDotBytes() async =>
    _locationDotCache ??= await _buildLogoBytes();

Future<Uint8List> _buildLogoBytes() async {
  final data = await rootBundle.load('assets/images/logo.webp');
  final codec = await ui.instantiateImageCodec(
    data.buffer.asUint8List(),
    targetWidth: 36,
    targetHeight: 36,
  );
  final frame = await codec.getNextFrame();
  final bytes = await frame.image.toByteData(format: ui.ImageByteFormat.png);
  return bytes!.buffer.asUint8List();
}

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage>
    with WidgetsBindingObserver {
  MapLibreMapController? _mapController;
  Symbol? _locationSymbol;
  bool _imageReady = false;
  StreamSubscription<geo.Position>? _locationSub;
  geo.Position? _pendingPosition;
  DateTime? _lastServerLocationEmit;
  bool _resumeChecked = false;
  SocketClient? _socket; // cached so dispose() can call off() without ref

  // Lista de viajes disponibles (modelo InDriver)
  final Map<String, TripAlertData> _availableTrips = {};
  final Set<String> _pendingOffers = {}; // tripIds donde ya enviamos oferta
  bool _navigatedToTrip =
      false; // evita setState tras context.go al viaje activo

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _requestLocationAndTrack();
    _initSocketAndListen();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadInitialTrips();
      _checkPendingTrip();
    });
  }

  // Carga viajes activos en búsqueda al abrir la app (por si ya habían)
  Future<void> _loadInitialTrips() async {
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get('/trips/available');
      final list = res.data as List? ?? [];
      if (!mounted) return;
      final trips = <String, TripAlertData>{};
      for (final item in list) {
        if (item is! Map) continue;
        final data = Map<String, dynamic>.from(item as Map);
        final tripId = data['id'] as String?;
        if (tripId == null) continue;
        final trip = TripAlertData.fromTripDetail(tripId, data);
        if (trip != null) trips[tripId] = trip;
      }
      if (trips.isNotEmpty) setState(() => _availableTrips.addAll(trips));
    } catch (e) {
      debugPrint('[HomePage] _loadInitialTrips error: $e');
    }
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
      final trip = TripAlertData.fromTripDetail(tripId, data);
      if (trip == null || !mounted) return;
      setState(() => _availableTrips[tripId] = trip);
      _playTripSound();
    } catch (e) {
      debugPrint('[HomePage] pending trip fetch error: $e');
    }
  }

  Future<void> _initSocketAndListen() async {
    _socket = ref.read(socketClientProvider);
    _socket!.onAuthFailed = () {
      ref.read(authStateProvider.notifier).logout().then((_) {
        if (mounted) context.go('/auth/login');
      });
    };
    // Sesión única por cuenta: el backend avisa por socket cuando alguien
    // inicia sesión en otro dispositivo, para no esperar a que este
    // dispositivo falle en su próxima llamada a la API.
    _socket!.on('session.revoked', (_) {
      _showSessionEndedDialog(
        title: 'Sesión cerrada',
        message: 'Se inició sesión con esta cuenta en otro dispositivo.',
      );
    });
    await _socket!.connect();
    _listenForTrips();
  }

  bool _sessionEndedDialogShown = false;

  void _showSessionEndedDialog({required String title, required String message}) {
    if (_sessionEndedDialogShown || !mounted) return;
    _sessionEndedDialogShown = true;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              ref.read(authStateProvider.notifier).logout().then((_) {
                if (mounted) context.go('/auth/login');
              });
            },
            child: const Text('Entendido'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _locationSub?.cancel();
    _socket?.off('driver.approved');
    _socket?.off('vehicle.approved');
    _socket?.off('document.approved');
    _socket?.off('trip.new');
    _socket?.off('trip.taken');
    _socket?.off('trip.cancelled');
    _socket?.off('trip.radius_expanded');
    _socket?.off('trip.offer_accepted');
    _socket?.off('trip.offer_rejected');
    _socket?.off('session.revoked');
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

    // Nuevo viaje disponible → agregar a la lista
    // trip.new también llega en radius expansion sin client_name → preservar info existente
    socket.on('trip.new', (data) {
      if (_navigatedToTrip || !mounted || data is! Map) return;
      final map = Map<String, dynamic>.from(data);
      final trip = TripAlertData.fromEvent(map);
      if (trip == null) return;

      final pos = _pendingPosition;
      if (pos != null && !driverWithinRadius(pos.latitude, pos.longitude, trip))
        return;

      final existing = _availableTrips[trip.tripId];
      final isNew = existing == null;

      // Si ya teníamos este viaje, preservar client info que el evento expansion omite
      final updated = (existing != null && trip.clientName == null)
          ? TripAlertData(
              tripId: trip.tripId,
              originAddress: trip.originAddress,
              destinationAddress: trip.destinationAddress,
              originLat: trip.originLat,
              originLng: trip.originLng,
              searchRadiusKm: trip.searchRadiusKm,
              fareMode: trip.fareMode,
              suggestedFare: trip.suggestedFare,
              clientOffer: trip.clientOffer,
              distanceKm: trip.distanceKm,
              clientName: existing.clientName,
              clientPhoto: existing.clientPhoto,
              clientRating: existing.clientRating,
              clientTotalTrips: existing.clientTotalTrips,
            )
          : trip;

      setState(() => _availableTrips[updated.tripId] = updated);
      if (isNew) _playTripSound(); // sonido solo para viajes realmente nuevos
    });

    // Viaje tomado (otro driver fue seleccionado o fue cancelado) → quitar de lista
    socket.on('trip.taken', (data) {
      if (_navigatedToTrip || data is! Map) return;
      final tripId = data['trip_id'] as String?;
      if (tripId != null && mounted) {
        setState(() {
          _availableTrips.remove(tripId);
          _pendingOffers.remove(tripId);
        });
      }
    });

    // Viaje cancelado por el cliente → quitar de lista
    socket.on('trip.cancelled', (data) {
      if (_navigatedToTrip || data is! Map) return;
      final tripId = data['trip_id'] as String?;
      if (tripId != null && mounted) {
        setState(() {
          _availableTrips.remove(tripId);
          _pendingOffers.remove(tripId);
        });
      }
    });

    // Cliente eligió a este conductor → navegar al viaje
    socket.on('trip.offer_accepted', (data) {
      if (!mounted) return;
      final tripId = (data is Map ? data['trip_id'] : null) as String?;
      if (tripId != null) {
        _navigatedToTrip = true; // bloquea setState en handlers posteriores
        ref.invalidate(activeTripProvider);
        context.go('/trip/$tripId');
      }
    });

    // Cliente eligió a otro conductor → quitar de pendientes, mostrar toast
    socket.on('trip.offer_rejected', (data) {
      if (_navigatedToTrip || !mounted || data is! Map) return;
      final tripId = data['trip_id'] as String?;
      if (tripId != null) setState(() => _pendingOffers.remove(tripId));
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('El cliente eligió a otro conductor'),
          behavior: SnackBarBehavior.floating,
          duration: Duration(seconds: 3),
        ),
      );
    });

    // Expansión de radio → actualizar radio o agregar si el driver ahora está dentro
    socket.on('trip.radius_expanded', (data) {
      if (_navigatedToTrip || !mounted || data is! Map) return;
      final map = Map<String, dynamic>.from(data);
      final tripId = map['trip_id'] as String?;
      if (tripId == null) return;

      if (_availableTrips.containsKey(tripId)) {
        // Actualizar radio del viaje ya en la lista
        final newRadius = (map['search_radius_km'] as num?)?.toDouble();
        if (newRadius != null) {
          final old = _availableTrips[tripId]!;
          setState(
            () => _availableTrips[tripId] = TripAlertData(
              tripId: old.tripId,
              originAddress: old.originAddress,
              destinationAddress: old.destinationAddress,
              originLat: old.originLat,
              originLng: old.originLng,
              searchRadiusKm: newRadius,
              fareMode: old.fareMode,
              suggestedFare: old.suggestedFare,
              clientOffer: old.clientOffer,
              distanceKm: old.distanceKm,
              clientName: old.clientName,
              clientPhoto: old.clientPhoto,
              clientRating: old.clientRating,
              clientTotalTrips: old.clientTotalTrips,
            ),
          );
        }
        return;
      }

      // Viaje que no estaba en lista — ver si el driver ahora entra al radio
      final trip = TripAlertData.fromEvent(map);
      if (trip == null) return;
      final pos = _pendingPosition;
      if (pos != null && !driverWithinRadius(pos.latitude, pos.longitude, trip))
        return;
      setState(() => _availableTrips[trip.tripId] = trip);
      _playTripSound();
    });
  }

  // Apuntarse a un viaje en modo taxímetro
  Future<void> _applyMeter(String tripId) async {
    if (_pendingOffers.contains(tripId)) return;
    setState(() => _pendingOffers.add(tripId));
    try {
      final dio = ref.read(dioProvider);
      await dio.post('/trips/$tripId/offers', data: {});
    } catch (e) {
      if (!mounted) return;
      setState(() => _pendingOffers.remove(tripId));
      String msg = 'Error al enviar oferta';
      if (e is DioException && e.response?.data is Map) {
        msg = (e.response!.data as Map)['message']?.toString() ?? msg;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  // Aceptar oferta del cliente directamente (sin contraoferta)
  Future<void> _acceptNegotiated(TripAlertData trip) async {
    if (_pendingOffers.contains(trip.tripId)) return;
    final amount = trip.clientOffer ?? trip.suggestedFare;
    if (amount == null) return;
    setState(() => _pendingOffers.add(trip.tripId));
    try {
      final dio = ref.read(dioProvider);
      await dio.post('/trips/${trip.tripId}/offers', data: {'amount': amount});
    } catch (e) {
      if (!mounted) return;
      setState(() => _pendingOffers.remove(trip.tripId));
      String msg = 'Error al enviar oferta';
      if (e is DioException && e.response?.data is Map) {
        msg = (e.response!.data as Map)['message']?.toString() ?? msg;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  // Abrir sheet para viaje negociado
  Future<void> _showNegotiatedOfferSheet(TripAlertData trip) async {
    if (_pendingOffers.contains(trip.tripId)) return;
    final amount = await showModalBottomSheet<double>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => NegotiatedOfferSheet(
        trip: trip,
        onSubmit: (val) => Navigator.pop(ctx, val),
      ),
    );
    if (amount == null || !mounted) return;

    setState(() => _pendingOffers.add(trip.tripId));
    try {
      final dio = ref.read(dioProvider);
      await dio.post('/trips/${trip.tripId}/offers', data: {'amount': amount});
    } catch (e) {
      if (!mounted) return;
      setState(() => _pendingOffers.remove(trip.tripId));
      String msg = 'Error al enviar oferta';
      if (e is DioException && e.response?.data is Map) {
        msg = (e.response!.data as Map)['message']?.toString() ?? msg;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  void _playTripSound() {
    AudioPlayer()
      ..setAudioContext(
        AudioContext(
          android: const AudioContextAndroid(
            usageType: AndroidUsageType.alarm,
            contentType: AndroidContentType.music,
            audioFocus: AndroidAudioFocus.gain,
            stayAwake: true,
          ),
        ),
      )
      ..play(AssetSource('sounds/trip_alert.wav')).then((_) async {
        await Future.delayed(const Duration(milliseconds: 900));
        AudioPlayer().play(AssetSource('sounds/trip_alert.wav')).ignore();
      }).ignore();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(driverProfileProvider.notifier).refresh();
      ref.read(myVehiclesGuardProvider.notifier).refresh();
      _checkPendingTrip();
    }
  }

  Future<void> _requestLocationAndTrack() async {
    final status = await Permission.locationWhenInUse.request();
    if (!status.isGranted) return;

    try {
      final pos = await geo.Geolocator.getCurrentPosition(
        locationSettings: const geo.LocationSettings(
          accuracy: geo.LocationAccuracy.high,
        ),
      );
      _pendingPosition = pos;
      if (_imageReady) {
        await _updateSymbol(pos);
        _flyTo(pos);
      }
    } catch (_) {}

    _locationSub =
        geo.Geolocator.getPositionStream(
          locationSettings: const geo.LocationSettings(
            accuracy: geo.LocationAccuracy.high,
            distanceFilter: 20,
          ),
        ).listen((pos) {
          _pendingPosition = pos;
          // El mapa local del conductor se actualiza siempre — fluido, sin
          // costo de servidor (es puramente local).
          if (_imageReady) _updateSymbol(pos);
          _flyTo(pos);

          // Al servidor solo cada ~60s mientras está disponible sin viaje
          // activo (coincide con location_interval_fleet_sec del backend,
          // hoy en 60). No hace falta más que eso: es solo para que el
          // panel web se vea "vivo", no hay taxímetro corriendo. En viaje
          // activo, trip_active_page.dart manda ubicación aparte, sin este
          // throttle, con la frecuencia que sí importa.
          final now = DateTime.now();
          if (_lastServerLocationEmit == null ||
              now.difference(_lastServerLocationEmit!) >= const Duration(seconds: 60)) {
            _lastServerLocationEmit = now;
            ref.read(socketClientProvider).emit('location.update', {
              'lat': pos.latitude,
              'lng': pos.longitude,
              'speed_kmh': pos.speed > 0 ? pos.speed * 3.6 : 0.0,
            });
          }
        });
  }

  Future<void> _onStyleLoaded() async {
    if (_mapController == null || !mounted) return;
    try {
      final bytes = await _getLocationDotBytes();
      await _mapController?.addImage('location-dot', bytes);
      _imageReady = true;
      if (_pendingPosition != null) {
        await _updateSymbol(_pendingPosition!);
        _mapController?.animateCamera(
          CameraUpdate.newLatLngZoom(
            LatLng(_pendingPosition!.latitude, _pendingPosition!.longitude),
            15,
          ),
        );
      }
    } catch (_) {}
  }

  Future<void> _updateSymbol(geo.Position pos) async {
    if (_mapController == null || !mounted) return;
    final latlng = LatLng(pos.latitude, pos.longitude);
    try {
      if (_locationSymbol == null) {
        _locationSymbol = await _mapController?.addSymbol(
          SymbolOptions(
            geometry: latlng,
            iconImage: 'location-dot',
            iconSize: 1.0,
          ),
        );
      } else {
        await _mapController?.updateSymbol(
          _locationSymbol!,
          SymbolOptions(geometry: latlng),
        );
      }
    } catch (_) {}
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
    final vehicles =
        ref
            .read(myVehiclesGuardProvider)
            .value
            ?.where((v) => v.approvalStatus == 'approved')
            .toList() ??
        [];

    if (vehicles.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Necesitas un taxi aprobado para activarte. Ve a "Mis taxis".',
            ),
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
    // Cuenta sin perfil de conductor (403 en /drivers/me, ej. una cuenta de
    // owner que nunca se registró como driver) — no dejar la app atascada
    // mostrando errores de widgets, avisar y cerrar sesión.
    ref.listen<AsyncValue<dynamic>>(driverProfileProvider, (_, next) {
      final err = next.error;
      if (err is! DioException || err.response?.statusCode != 403) return;
      _showSessionEndedDialog(
        title: 'Cuenta no válida para esta app',
        message: 'Esta cuenta no está registrada como conductor. '
            'Vas a cerrar sesión — inicia con una cuenta de conductor.',
      );
    });

    // Auto-resume si hay un viaje activo al abrir la app
    ref.listen<AsyncValue<dynamic>>(activeTripProvider, (_, next) {
      if (_resumeChecked) return;
      final trip = next.valueOrNull;
      if (trip == null) {
        _resumeChecked = true;
        return;
      }
      final status = trip.status as String?;
      if (status == 'accepted' ||
          status == 'in_progress' ||
          status == 'driver_arrived') {
        _resumeChecked = true;
        if (mounted) context.go('/trip/${trip.id}');
      }
    });

    final trips = _availableTrips.values.toList();

    return Scaffold(
      body: Stack(
        children: [
          Padding(
            padding: EdgeInsets.only(bottom: MediaQuery.of(context).padding.bottom),
            child: MapLibreMap(
              styleString: 'https://tiles.openfreemap.org/styles/liberty',
              initialCameraPosition: const CameraPosition(
                target: LatLng(-0.2295, -78.5243),
                zoom: 13,
                tilt: 40,
              ),
              onMapCreated: (controller) => _mapController = controller,
              onStyleLoadedCallback: _onStyleLoaded,
              myLocationEnabled: false,
              trackCameraPosition: false,
            ),
          ),

          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  Expanded(child: HomeTopBarChip(onToggle: _toggleStatus)),
                  const SizedBox(width: 10),
                  HomeTopIconBtn(
                    icon: Icons.notifications_outlined,
                    onTap: () => context.push('/notifications'),
                  ),
                ],
              ),
            ),
          ),

          HomeTripBanner(onNavigate: (id) => context.go('/trip/$id')),

          // Panel de viajes disponibles (modelo InDriver)
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AvailableTripsPanel(
                  trips: trips,
                  pendingOffers: _pendingOffers,
                  onApplyMeter: _applyMeter,
                  onAcceptNegotiated: _acceptNegotiated,
                  onOpenNegotiatedSheet: _showNegotiatedOfferSheet,
                ),
                HomeBottomPanel(onToggle: _toggleStatus),
              ],
            ),
          ),

          const HomeProfileGuard(),
          const HomeOwnerProfileGuard(),
        ],
      ),
    );
  }
}
