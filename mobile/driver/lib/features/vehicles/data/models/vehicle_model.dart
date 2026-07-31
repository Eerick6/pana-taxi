class VehicleModel {
  const VehicleModel({
    required this.id,
    required this.plate,
    required this.brand,
    required this.model,
    required this.color,
    required this.year,
    required this.approvalStatus,
    this.cooperativeName,
    this.photoUrl,
    this.status,
  });

  final String id;
  final String plate;
  final String brand;
  final String model;
  final String color;
  final int year;
  final String approvalStatus;
  final String? cooperativeName;
  final String? photoUrl;
  final String? status;

  bool get isPending => approvalStatus == 'pending';
  bool get isApproved => approvalStatus == 'approved';
  bool get isRejected => approvalStatus == 'rejected';

  String get displayName => '$brand $model ($plate)';

  factory VehicleModel.fromJson(Map<String, dynamic> json) {
    final coop = json['cooperative'] as Map<String, dynamic>?;
    return VehicleModel(
      id: json['id'] as String,
      plate: json['plate'] as String,
      brand: json['brand'] as String,
      model: json['model'] as String,
      color: json['color'] as String,
      year: json['year'] as int,
      approvalStatus: json['approval_status'] as String? ?? 'pending',
      cooperativeName: coop?['name'] as String?,
      photoUrl: json['photo_url'] as String?,
      status: json['status'] as String?,
    );
  }
}

class VehicleDocumentModel {
  const VehicleDocumentModel({
    required this.id,
    required this.type,
    required this.status,
    required this.createdAt,
    this.fileUrl,
    this.rejectionReason,
    this.expiresAt,
  });

  final String id;
  final String type;
  final String status;
  final DateTime createdAt;
  final String? fileUrl;
  final String? rejectionReason;
  final DateTime? expiresAt;

  bool get isApproved => status == 'approved';
  bool get isPending => status == 'pending';
  bool get isRejected => status == 'rejected';

  String get typeLabel => switch (type) {
        'matricula' => 'Matrícula',
        'soat' => 'SOAT',
        'technical_review' => 'Revisión técnica',
        'vehicle_photo' => 'Foto del vehículo',
        _ => type,
      };

  factory VehicleDocumentModel.fromJson(Map<String, dynamic> json) => VehicleDocumentModel(
        id: json['id'] as String,
        type: json['type'] as String,
        status: json['status'] as String? ?? 'pending',
        createdAt: DateTime.parse(json['created_at'] as String),
        fileUrl: json['file_url'] as String?,
        rejectionReason: json['rejection_reason'] as String?,
        expiresAt: json['expires_at'] != null ? DateTime.parse(json['expires_at'] as String) : null,
      );
}

class CooperativeModel {
  const CooperativeModel({
    required this.id,
    required this.name,
    this.address,
    this.phone,
    this.logoUrl,
    this.membershipStatus,
  });

  final String id;
  final String name;
  final String? address;
  final String? phone;
  final String? logoUrl;
  final String? membershipStatus; // null = not a member, 'pending', 'approved', 'rejected'

  bool get isMember => membershipStatus == 'approved';
  bool get isPendingMember => membershipStatus == 'pending';

  factory CooperativeModel.fromJson(Map<String, dynamic> json) => CooperativeModel(
        id: json['id'] as String,
        name: json['name'] as String,
        address: json['address'] as String?,
        phone: json['phone'] as String?,
        logoUrl: json['logo_url'] as String?,
      );
}
