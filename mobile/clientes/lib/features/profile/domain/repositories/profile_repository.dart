import '../entities/client_profile.dart';

abstract class ProfileRepository {
  Future<ClientProfile> getMyProfile();
  Future<void> updateMyProfile({String? fullName});
  Future<List<EmergencyContact>> getEmergencyContacts();
  Future<EmergencyContact> addEmergencyContact({
    required String name,
    required String phone,
    String? relationship,
  });
  Future<void> deleteEmergencyContact(String id);
}
