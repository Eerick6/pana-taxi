import '../../domain/entities/client_profile.dart';
import '../../domain/repositories/profile_repository.dart';
import '../datasources/profile_api.dart';

class ProfileRepositoryImpl implements ProfileRepository {
  const ProfileRepositoryImpl(this._api);
  final ProfileApi _api;

  @override
  Future<ClientProfile> getMyProfile() => _api.getMyProfile();

  @override
  Future<void> updateMyProfile({String? fullName}) =>
      _api.updateMyProfile(fullName: fullName);

  @override
  Future<List<EmergencyContact>> getEmergencyContacts() =>
      _api.getEmergencyContacts();

  @override
  Future<EmergencyContact> addEmergencyContact({
    required String name,
    required String phone,
    String? relationship,
  }) =>
      _api.addEmergencyContact(name: name, phone: phone, relationship: relationship);

  @override
  Future<void> deleteEmergencyContact(String id) =>
      _api.deleteEmergencyContact(id);
}
