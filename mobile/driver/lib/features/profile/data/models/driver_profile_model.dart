class CooperativeMembership {
  const CooperativeMembership({
    required this.cooperativeId,
    required this.cooperativeName,
    required this.membershipStatus,
  });

  final String cooperativeId;
  final String cooperativeName;
  final String membershipStatus; // 'pending', 'approved', 'rejected'

  bool get isApproved => membershipStatus == 'approved';
  bool get isPending => membershipStatus == 'pending';
}

class DriverProfileModel {
  const DriverProfileModel({
    required this.id,
    required this.fullName,
    required this.phone,
    required this.driverType,
    required this.status,
    required this.isVerified,
    required this.cooperatives,
    this.licenseNumber,
    this.licenseExpiry,
    this.photoUrl,
  });

  final String id;
  final String fullName;
  final String phone;
  final String driverType;
  final String status;
  final bool isVerified;
  final List<CooperativeMembership> cooperatives;
  final String? licenseNumber;
  final String? licenseExpiry;
  final String? photoUrl;

  bool get isOnline => status == 'online';
  bool get isLookingForWork => status == 'looking_for_work';
  bool get isOwnerDriver => driverType == 'owner_driver';

  // Legacy convenience getters (first approved coop or first coop)
  String? get cooperativeId =>
      cooperatives.where((c) => c.isApproved).firstOrNull?.cooperativeId ??
      cooperatives.firstOrNull?.cooperativeId;

  String? get cooperativeName =>
      cooperatives.where((c) => c.isApproved).firstOrNull?.cooperativeName ??
      cooperatives.firstOrNull?.cooperativeName;

  factory DriverProfileModel.fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>?;
    final coopOwners = json['cooperatives'] as List<dynamic>? ?? [];

    final cooperatives = coopOwners.map((raw) {
      final entry = raw as Map<String, dynamic>;
      final coop = entry['cooperative'] as Map<String, dynamic>? ?? {};
      return CooperativeMembership(
        cooperativeId: coop['id'] as String? ?? '',
        cooperativeName: coop['name'] as String? ?? '',
        membershipStatus: entry['approval_status'] as String? ?? 'pending',
      );
    }).toList();

    return DriverProfileModel(
      id: json['id'] as String,
      fullName: json['full_name'] as String? ?? '',
      phone: user?['phone'] as String? ?? '',
      driverType: json['driver_type'] as String? ?? 'driver',
      status: json['online_status'] as String? ?? 'offline',
      isVerified: (json['approval_status'] as String?) == 'approved',
      cooperatives: cooperatives,
      licenseNumber: json['license_number'] as String?,
      licenseExpiry: json['license_expiry'] as String?,
      photoUrl: json['profile_photo_url'] as String?,
    );
  }
}
