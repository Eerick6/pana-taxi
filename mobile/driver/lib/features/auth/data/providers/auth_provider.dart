import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/user_model.dart';
import '../repositories/auth_repository.dart';

// ── Estado de autenticación global ───────────────────────────────────────────

final authStateProvider = AsyncNotifierProvider<AuthNotifier, UserModel?>(
  AuthNotifier.new,
);

class AuthNotifier extends AsyncNotifier<UserModel?> {
  @override
  Future<UserModel?> build() async {
    // Al iniciar la app intentamos restaurar la sesión desde el token guardado
    return ref.read(authRepositoryProvider).getMe();
  }

  Future<String?> requestOtp(String phone) async {
    return ref.read(authRepositoryProvider).requestOtp(phone);
  }

  Future<String?> registerDriver({
    required String fullName,
    required String phone,
    required String driverType,
    required String password,
  }) async {
    return ref.read(authRepositoryProvider).registerDriver(
      fullName:   fullName,
      phone:      phone,
      driverType: driverType,
      password:   password,
    );
  }

  Future<void> loginWithPhone(String phone, String password) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      return ref.read(authRepositoryProvider).loginWithPhone(phone, password);
    });
  }

  Future<void> loginWithBiometric() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(authRepositoryProvider).loginWithBiometric();
      return ref.read(authRepositoryProvider).getMe();
    });
  }

  Future<void> verifyOtp(String phone, String otp) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      return ref.read(authRepositoryProvider).verifyOtp(phone, otp);
    });
  }

  Future<void> logout() async {
    await ref.read(authRepositoryProvider).logout();
    state = const AsyncData(null);
  }
}

// ── Helper: usuario actual garantizado (solo usar en pantallas protegidas) ───
final currentUserProvider = Provider<UserModel>((ref) {
  return ref.watch(authStateProvider).requireValue!;
});
