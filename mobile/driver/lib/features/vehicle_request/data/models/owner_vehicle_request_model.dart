class OwnerVehicleRequestModel {
  const OwnerVehicleRequestModel({
    required this.id,
    required this.status,
    required this.vehicleId,
    required this.vehicleInfo,
    required this.createdAt,
    this.notes,
    this.acceptedDriverName,
    this.acceptedDriverPhone,
    this.pendingAppCount,
  });

  final String id;
  final String status; // open, accepted, cancelled, completed
  final String vehicleId;
  final String vehicleInfo;
  final DateTime createdAt;
  final String? notes;
  final String? acceptedDriverName;
  final String? acceptedDriverPhone;
  final int? pendingAppCount;

  bool get isOpen => status == 'open';
  bool get isAccepted => status == 'accepted';

  factory OwnerVehicleRequestModel.fromJson(Map<String, dynamic> json) {
    final vehicle = json['vehicle'] as Map<String, dynamic>?;
    final accepted = json['accepted_driver'] as Map<String, dynamic>?;
    return OwnerVehicleRequestModel(
      id: json['id'] as String,
      status: json['status'] as String? ?? 'open',
      vehicleId: vehicle?['id'] as String? ?? '',
      vehicleInfo: vehicle != null
          ? '${vehicle['brand'] ?? ''} ${vehicle['model'] ?? ''} · ${vehicle['plate'] ?? ''}'.trim()
          : 'Vehículo',
      createdAt: DateTime.parse(json['created_at'] as String),
      notes: json['notes'] as String?,
      acceptedDriverName: accepted?['full_name'] as String?,
      acceptedDriverPhone: (accepted?['user'] as Map<String, dynamic>?)?['phone'] as String?,
    );
  }
}
