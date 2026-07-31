import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../../core/network/dio_client.dart';
import '../models/client_profile_model.dart';

class ProfileApi {
  const ProfileApi(this._dio);
  final Dio _dio;

  Future<ClientProfileModel> getMyProfile() async {
    final res = await _dio.get(ApiConstants.clientProfile);
    return ClientProfileModel.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> updateMyProfile({String? fullName}) async {
    final body = <String, dynamic>{};
    if (fullName != null) body['full_name'] = fullName;
    await _dio.patch(ApiConstants.clientProfile, data: body);
  }

  Future<List<EmergencyContactModel>> getEmergencyContacts() async {
    final res = await _dio.get(ApiConstants.emergencyContacts);
    return (res.data as List)
        .map((e) => EmergencyContactModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<EmergencyContactModel> addEmergencyContact({
    required String name,
    required String phone,
    String? relationship,
  }) async {
    final res = await _dio.post(ApiConstants.emergencyContacts, data: {
      'name': name,
      'phone': phone,
      if (relationship != null) 'relationship': relationship,
    });
    return EmergencyContactModel.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> deleteEmergencyContact(String id) async {
    await _dio.delete('${ApiConstants.emergencyContacts}/$id');
  }
}

final profileApiProvider =
    Provider<ProfileApi>((ref) => ProfileApi(ref.read(dioProvider)));
