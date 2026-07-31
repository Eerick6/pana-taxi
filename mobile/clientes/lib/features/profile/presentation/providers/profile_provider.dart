import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/datasources/profile_api.dart';
import '../../data/repositories/profile_repository_impl.dart';
import '../../domain/entities/client_profile.dart';
import '../../domain/repositories/profile_repository.dart';

final profileRepositoryProvider = Provider<ProfileRepository>(
  (ref) => ProfileRepositoryImpl(ref.read(profileApiProvider)),
);

final clientProfileProvider = FutureProvider.autoDispose<ClientProfile>((ref) {
  return ref.read(profileRepositoryProvider).getMyProfile();
});

// autoDispose: solo se necesita en ProfilePage
final emergencyContactsProvider =
    FutureProvider.autoDispose<List<EmergencyContact>>((ref) {
  return ref.read(profileRepositoryProvider).getEmergencyContacts();
});
