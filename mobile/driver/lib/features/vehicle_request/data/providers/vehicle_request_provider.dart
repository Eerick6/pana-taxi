import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/vehicle_request_model.dart';
import '../models/owner_vehicle_request_model.dart';
import '../models/application_model.dart';
import '../repositories/vehicle_request_repository.dart';
import '../../../profile/data/providers/profile_provider.dart';

// ── Driver: open requests (browse + apply) ────────────────────────────────────

// autoDispose: solo se necesita en la pantalla de solicitudes de vehículo
final vehicleRequestsProvider =
    AsyncNotifierProvider.autoDispose<VehicleRequestsNotifier, List<VehicleRequestModel>>(
  VehicleRequestsNotifier.new,
);

class VehicleRequestsNotifier
    extends AutoDisposeAsyncNotifier<List<VehicleRequestModel>> {
  @override
  Future<List<VehicleRequestModel>> build() =>
      ref.read(vehicleRequestRepositoryProvider).getOpenRequests();

  Future<void> apply(String requestId) async {
    await ref.read(vehicleRequestRepositoryProvider).apply(requestId);
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(vehicleRequestRepositoryProvider).getOpenRequests(),
    );
  }

  Future<void> withdraw(String applicationId) async {
    await ref.read(vehicleRequestRepositoryProvider).withdraw(applicationId);
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(vehicleRequestRepositoryProvider).getOpenRequests(),
    );
  }
}

// ── Driver: own applications ──────────────────────────────────────────────────

// autoDispose: se libera al salir de Home y de la pantalla de solicitudes
final myApplicationsProvider =
    AsyncNotifierProvider.autoDispose<MyApplicationsNotifier, List<ApplicationModel>>(
  MyApplicationsNotifier.new,
);

class MyApplicationsNotifier
    extends AutoDisposeAsyncNotifier<List<ApplicationModel>> {
  @override
  Future<List<ApplicationModel>> build() async {
    final profile = await ref.read(driverProfileProvider.future);
    if (profile.isOwnerDriver) return [];
    return ref.read(vehicleRequestRepositoryProvider).getMyApplications();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => build());
  }

  Future<void> startDay() async {
    await ref.read(vehicleRequestRepositoryProvider).startDay();
    await ref.read(driverProfileProvider.notifier).refresh();
    await refresh();
  }
}

// ── Owner: own published requests ─────────────────────────────────────────────

// autoDispose: solo se necesita en la pantalla de gestión de solicitudes
final ownerRequestsProvider =
    AsyncNotifierProvider.autoDispose<OwnerRequestsNotifier, List<OwnerVehicleRequestModel>>(
  OwnerRequestsNotifier.new,
);

class OwnerRequestsNotifier
    extends AutoDisposeAsyncNotifier<List<OwnerVehicleRequestModel>> {
  @override
  Future<List<OwnerVehicleRequestModel>> build() =>
      ref.read(vehicleRequestRepositoryProvider).getMyRequests();

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(vehicleRequestRepositoryProvider).getMyRequests(),
    );
  }

  Future<void> create(String vehicleId, {String? notes}) async {
    await ref.read(vehicleRequestRepositoryProvider).createRequest(
        vehicleId: vehicleId, notes: notes);
    await refresh();
  }

  Future<void> cancel(String requestId) async {
    await ref.read(vehicleRequestRepositoryProvider).cancelRequest(requestId);
    await refresh();
  }
}

// ── Owner: applicants for a specific request ──────────────────────────────────

// autoDispose.family: se libera al cerrar la vista de detalle de solicitud
final requestApplicationsProvider =
    FutureProvider.autoDispose.family<List<ApplicationModel>, String>(
        (ref, requestId) {
  return ref
      .read(vehicleRequestRepositoryProvider)
      .getApplicationsForRequest(requestId);
});
