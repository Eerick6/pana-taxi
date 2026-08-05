import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/socket_client.dart';
import '../models/trip_model.dart';
import '../repositories/trip_repository.dart';

final myTripsProvider = FutureProvider.autoDispose<List<TripModel>>((ref) {
  return ref.read(tripRepositoryProvider).getMyTrips();
});

// Metro en vivo — se actualiza desde socket sin reconstruir todo el árbol del viaje
final liveMeterProvider = StateProvider<({double amount, double incPerSec})>(
  (ref) => (amount: 0, incPerSec: 0),
);

final activeTripProvider = AsyncNotifierProvider<ActiveTripNotifier, TripModel?>(
  ActiveTripNotifier.new,
);

class ActiveTripNotifier extends AsyncNotifier<TripModel?> {
  @override
  Future<TripModel?> build() async {
    final socket = ref.read(socketClientProvider);
    await socket.connect();

    void onMeterUpdate(dynamic data) {
      if (data is! Map) return;
      final amount = (data['meter_amount'] as num?)?.toDouble() ?? 0;
      final inc    = (data['increment_per_second'] as num?)?.toDouble() ?? 0;
      ref.read(liveMeterProvider.notifier).state = (amount: amount, incPerSec: inc);
    }

    socket.on('trip.meter_update', onMeterUpdate);

    ref.onDispose(() {
      socket.off('trip.meter_update');
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
  void setTrip(TripModel trip) => state = AsyncData(trip);
}
