import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../repositories/ratings_repository.dart';

// autoDispose.family: se libera al salir de ProfilePage; recrea solo si cambia el driverId
final driverRatingStatsProvider =
    FutureProvider.autoDispose.family<DriverRatingStats, String>((ref, driverId) {
  return ref.read(ratingsRepositoryProvider).getDriverStats(driverId);
});

final ownerRatingStatsProvider =
    FutureProvider.autoDispose.family<OwnerRatingStats, String>((ref, ownerId) {
  return ref.read(ratingsRepositoryProvider).getOwnerStats(ownerId);
});
