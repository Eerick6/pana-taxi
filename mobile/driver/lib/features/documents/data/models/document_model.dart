class DocumentModel {
  const DocumentModel({
    required this.id,
    required this.type,
    required this.status,
    required this.createdAt,
    this.url,
    this.rejectionReason,
  });

  final String id;
  final String type;
  final String status;
  final DateTime createdAt;
  final String? url;
  final String? rejectionReason;

  bool get isApproved => status == 'approved';
  bool get isPending => status == 'pending';
  bool get isRejected => status == 'rejected';

  // Backend DriverDocumentType enum values
  String get typeLabel => switch (type) {
        'license_front' => 'Licencia (frente)',
        'license_back' => 'Licencia (posterior)',
        'cedula_front' => 'Cédula (frente)',
        'cedula_back' => 'Cédula (posterior)',
        'background_check' => 'Récord policial',
        'profile_photo' => 'Foto de perfil',
        _ => type,
      };

  factory DocumentModel.fromJson(Map<String, dynamic> json) => DocumentModel(
        id: json['id'] as String,
        type: json['type'] as String,
        status: json['status'] as String? ?? 'pending',
        createdAt: DateTime.parse(json['created_at'] as String),
        url: json['file_url'] as String?,
        rejectionReason: json['rejection_reason'] as String?,
      );
}
