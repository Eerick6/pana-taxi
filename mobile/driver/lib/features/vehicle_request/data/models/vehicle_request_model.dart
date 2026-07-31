class VehicleRequestModel {
  const VehicleRequestModel({
    required this.id,
    required this.title,
    required this.description,
    required this.cooperativeName,
    required this.vehicleInfo,
    required this.createdAt,
    required this.status,
    this.hasApplied = false,
    this.applicationId,
    this.ownerId,
    this.ownerName,
  });

  final String id;
  final String title;
  final String description;
  final String cooperativeName;
  final String vehicleInfo;
  final DateTime createdAt;
  final String status;
  final bool hasApplied;
  final String? applicationId;
  final String? ownerId;
  final String? ownerName;

  factory VehicleRequestModel.fromJson(Map<String, dynamic> json) {
    final vehicle = json['vehicle'] as Map<String, dynamic>?;
    final coop = vehicle?['cooperative'] as Map<String, dynamic>?;
    final owner = json['owner'] as Map<String, dynamic>?;
    final apps = json['applications'] as List?;

    final brand = vehicle?['brand'] as String? ?? '';
    final model = vehicle?['model'] as String? ?? '';
    final plate = vehicle?['plate'] as String? ?? '';
    final vehicleInfo = '$brand $model $plate'.trim();

    final ownerName = owner?['full_name'] as String? ?? '';
    final title = vehicleInfo.isNotEmpty
        ? 'Se busca conductor — $vehicleInfo'
        : ownerName.isNotEmpty
            ? 'Se busca conductor — $ownerName'
            : 'Se busca conductor';

    return VehicleRequestModel(
      id: json['id'] as String,
      title: title,
      description: json['notes'] as String? ?? '',
      cooperativeName: coop?['name'] as String? ?? 'Cooperativa',
      vehicleInfo: vehicleInfo.isNotEmpty ? vehicleInfo : 'Vehículo por definir',
      createdAt: DateTime.parse(json['created_at'] as String),
      status: json['status'] as String? ?? 'open',
      hasApplied: apps != null && apps.isNotEmpty,
      applicationId: apps != null && apps.isNotEmpty
          ? (apps.first as Map<String, dynamic>)['id'] as String?
          : null,
      ownerId: owner?['id'] as String?,
      ownerName: ownerName.isNotEmpty ? ownerName : null,
    );
  }
}
