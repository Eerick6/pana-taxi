import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/socket_client.dart';
import '../../../profile/data/providers/profile_provider.dart';
import '../../../vehicle_request/data/providers/vehicle_request_provider.dart';
import '../models/trip_model.dart';
import '../repositories/trip_repository.dart';

final myTripsProvider = FutureProvider.autoDispose<List<TripModel>>((ref) {
  return ref.read(tripRepositoryProvider).getMyTrips();
});

final activeTripProvider = AsyncNotifierProvider<ActiveTripNotifier, TripModel?>(
  ActiveTripNotifier.new,
);

class ActiveTripNotifier extends AsyncNotifier<TripModel?> {
  @override
  Future<TripModel?> build() async {
    final socket = ref.read(socketClientProvider);
    await socket.connect();

    socket.on('trip.new_request', (data) {
      final trip = TripModel.fromJson(data as Map<String, dynamic>);
      state = AsyncData(trip);
    });

    socket.on('trip.cancelled', (_) {
      state = const AsyncData(null);
    });

    // Cuando el admin aprueba el perfil, refrescar inmediatamente sin recargar
    socket.on('driver.approved', (_) {
      ref.read(driverProfileProvider.notifier).refresh();
    });

    // Cuando el dueño asigna al conductor, refrescar aplicaciones y perfil
    socket.on('driver.assignment_created', (_) {
      ref.read(driverProfileProvider.notifier).refresh();
      ref.invalidate(myApplicationsProvider);
    });

    return ref.read(tripRepositoryProvider).getActiveTrip();
  }

  Future<void> accept(String tripId) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(tripRepositoryProvider).acceptTrip(tripId),
    );
  }

  Future<void> markArrived(String tripId) async {
    state = await AsyncValue.guard(
      () => ref.read(tripRepositoryProvider).markArrived(tripId),
    );
  }

  Future<void> startTrip(String tripId, String otpCode) async {
    state = await AsyncValue.guard(
      () => ref.read(tripRepositoryProvider).startTrip(tripId, otpCode),
    );
  }

  Future<void> completeTrip(String tripId, double fareAmount) async {
    await ref.read(tripRepositoryProvider).completeTrip(tripId, fareAmount);
    state = const AsyncData(null);
  }

  void clear() => state = const AsyncData(null);
}
