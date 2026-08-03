import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../data/datasources/trips_api.dart';
import '../../domain/entities/active_trip.dart';

// Un solo fetch al arrancar. Las actualizaciones llegan por socket desde home_page.dart
// (trip.accepted → ref.invalidate, trip.cancelled → ref.invalidate).
// autoDispose: se detiene automáticamente cuando no hay consumidores activos.
final activeTripProvider =
    FutureProvider.autoDispose<ActiveTrip?>((ref) async {
  final token = await ref.read(secureStorageProvider).getAccessToken();
  if (token == null) return null;
  try {
    return await ref.read(tripsApiProvider).getActiveTrip();
  } catch (_) {
    return null;
  }
});
