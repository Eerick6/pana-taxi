import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/datasources/saved_locations_local.dart';
import '../../domain/entities/saved_location.dart';

// autoDispose: se libera al salir de Home; se recarga al volver (datos locales, barato)
final savedLocationsProvider =
    AsyncNotifierProvider.autoDispose<SavedLocationsNotifier, List<SavedLocation>>(
  SavedLocationsNotifier.new,
);

class SavedLocationsNotifier
    extends AutoDisposeAsyncNotifier<List<SavedLocation>> {
  @override
  Future<List<SavedLocation>> build() =>
      ref.read(savedLocationsLocalProvider).getAll();

  Future<void> upsert({
    required SavedLocationType type,
    required String label,
    required String address,
    required double lat,
    required double lng,
  }) async {
    await ref.read(savedLocationsLocalProvider).upsertByType(
          type: type,
          label: label,
          address: address,
          lat: lat,
          lng: lng,
        );
    ref.invalidateSelf();
  }

  Future<void> delete(String id) async {
    await ref.read(savedLocationsLocalProvider).delete(id);
    ref.invalidateSelf();
  }
}
