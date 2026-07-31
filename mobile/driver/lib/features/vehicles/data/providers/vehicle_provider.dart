import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/vehicle_model.dart';
import '../repositories/vehicle_repository.dart';

// autoDispose: se libera al salir de VehiclesPage
final myVehiclesProvider =
    AsyncNotifierProvider.autoDispose<MyVehiclesNotifier, List<VehicleModel>>(
  MyVehiclesNotifier.new,
);

class MyVehiclesNotifier extends AutoDisposeAsyncNotifier<List<VehicleModel>> {
  @override
  Future<List<VehicleModel>> build() =>
      ref.read(vehicleRepositoryProvider).getMyVehicles();

  Future<String> register({
    required String cooperativeId,
    required String plate,
    required String brand,
    required String model,
    required String color,
    required int year,
  }) async {
    final vehicleId = await ref.read(vehicleRepositoryProvider).registerVehicle(
          cooperativeId: cooperativeId,
          plate: plate,
          brand: brand,
          model: model,
          color: color,
          year: year,
        );
    state = AsyncData(await ref.read(vehicleRepositoryProvider).getMyVehicles());
    return vehicleId;
  }

  Future<void> delete(String vehicleId) async {
    await ref.read(vehicleRepositoryProvider).deleteMyVehicle(vehicleId);
    state = AsyncData(await ref.read(vehicleRepositoryProvider).getMyVehicles());
  }
}

// autoDispose.family: se libera al salir de VehicleDocumentsPage
final vehicleDocumentsProvider =
    AsyncNotifierProvider.autoDispose
        .family<VehicleDocumentsNotifier, List<VehicleDocumentModel>, String>(
  VehicleDocumentsNotifier.new,
);

class VehicleDocumentsNotifier
    extends AutoDisposeFamilyAsyncNotifier<List<VehicleDocumentModel>, String> {
  @override
  Future<List<VehicleDocumentModel>> build(String vehicleId) =>
      ref.read(vehicleRepositoryProvider).getVehicleDocuments(vehicleId);

  Future<void> upload(String type, File file) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(vehicleRepositoryProvider).uploadVehicleDocument(arg, type, file),
    );
  }
}

// autoDispose: se libera al cerrar el formulario de registro de vehículo
final activeCooperativesProvider =
    FutureProvider.autoDispose<List<CooperativeModel>>((ref) {
  return ref.read(vehicleRepositoryProvider).getActiveCooperatives();
});

// Proveedor estable (sin autoDispose) para el guard de onboarding de dueño
final myVehiclesGuardProvider =
    AsyncNotifierProvider<MyVehiclesGuardNotifier, List<VehicleModel>>(
  MyVehiclesGuardNotifier.new,
);

class MyVehiclesGuardNotifier extends AsyncNotifier<List<VehicleModel>> {
  @override
  Future<List<VehicleModel>> build() =>
      ref.read(vehicleRepositoryProvider).getMyVehicles();

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
        () => ref.read(vehicleRepositoryProvider).getMyVehicles());
  }
}
