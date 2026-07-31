import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/driver_profile_model.dart';
import '../repositories/profile_repository.dart';

final driverProfileProvider =
    AsyncNotifierProvider<DriverProfileNotifier, DriverProfileModel>(
  DriverProfileNotifier.new,
);

class DriverProfileNotifier extends AsyncNotifier<DriverProfileModel> {
  @override
  Future<DriverProfileModel> build() =>
      ref.read(profileRepositoryProvider).getProfile();

  Future<void> setStatus(String status) async {
    final prev = state;
    final repo = ref.read(profileRepositoryProvider);
    state = const AsyncLoading();
    try {
      final updated = await repo.updateStatus(status);
      state = AsyncData(updated);
    } catch (e, st) {
      state = prev; // restaura perfil anterior en lugar de mostrar error
      Error.throwWithStackTrace(e, st); // propaga al caller
    }
  }

  Future<void> startDay({String? vehicleId}) async {
    final prev = state;
    final repo = ref.read(profileRepositoryProvider);
    state = const AsyncLoading();
    try {
      final updated = await repo.startDay(vehicleId: vehicleId);
      state = AsyncData(updated);
    } catch (e, st) {
      state = prev;
      Error.throwWithStackTrace(e, st);
    }
  }

  Future<void> endDay() async {
    final prev = state;
    final repo = ref.read(profileRepositoryProvider);
    state = const AsyncLoading();
    try {
      final updated = await repo.endDay();
      state = AsyncData(updated);
    } catch (e, st) {
      state = prev;
      Error.throwWithStackTrace(e, st);
    }
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(profileRepositoryProvider).getProfile(),
    );
  }
}
