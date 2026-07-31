import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../data/datasources/trips_api.dart';
import '../../domain/entities/active_trip.dart';

// autoDispose: el polling se detiene cuando el usuario sale de la pantalla que lo observa
// Solo está activo en home_page (SOS button) y auth_gate (redirect al reabrir la app)
final activeTripProvider =
    StreamProvider.autoDispose<ActiveTrip?>((ref) async* {
  final api     = ref.read(tripsApiProvider);
  final storage = ref.read(secureStorageProvider);
  while (true) {
    final token = await storage.getAccessToken();
    if (token != null) {
      try {
        yield await api.getActiveTrip();
      } catch (_) {
        yield null;
      }
    } else {
      yield null;
    }
    await Future.delayed(const Duration(seconds: 10));
  }
});
