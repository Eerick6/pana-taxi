import '../../../../core/config/app_env.dart';
import '../../domain/entities/client_profile.dart';

String? _fullUrl(String? path) {
  if (path == null || path.isEmpty) return null;
  if (path.startsWith('http')) return path;          // R2 presigned → usar directo
  return '${AppEnv.baseUrl}/static/$path';            // key local → /static/clients/...
}

class ClientProfileModel extends ClientProfile {
  const ClientProfileModel({
    required super.id,
    required super.fullName,
    required super.phone,
    required super.rating,
    required super.totalTrips,
    super.photoUrl,
  });

  factory ClientProfileModel.fromJson(Map<String, dynamic> j) {
    final user = j['user'] as Map<String, dynamic>? ?? {};
    return ClientProfileModel(
      id:         j['id']                as String? ?? '',
      fullName:   j['full_name']         as String? ?? '',
      phone:      user['phone']          as String? ?? '',
      rating:     double.tryParse('${j['rating'] ?? 0}') ?? 0.0,
      totalTrips: (j['total_trips']      as num?)?.toInt()   ?? 0,
      photoUrl:   _fullUrl(j['profile_photo_url'] as String?),
    );
  }
}

class EmergencyContactModel extends EmergencyContact {
  const EmergencyContactModel({
    required super.id,
    required super.name,
    required super.phone,
    super.relationship,
  });

  factory EmergencyContactModel.fromJson(Map<String, dynamic> j) =>
      EmergencyContactModel(
        id:           j['id']           as String,
        name:         j['name']         as String,
        phone:        j['phone']        as String,
        relationship: j['relationship'] as String?,
      );
}
