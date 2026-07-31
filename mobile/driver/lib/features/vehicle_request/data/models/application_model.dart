/// An application submitted BY a driver TO an owner's request.
/// Used in two contexts:
///  - Owner side: GET /vehicle-requests/:id/applications
///  - Driver side: GET /vehicle-requests/my-applications
class ApplicationModel {
  const ApplicationModel({
    required this.id,
    required this.status,
    required this.createdAt,
    this.message,
    // Driver info (owner sees this)
    this.driverName,
    this.driverPhone,
    this.driverId,
    // Request + vehicle info (driver sees this)
    this.requestId,
    this.requestStatus,
    this.vehicleInfo,
    this.vehiclePlate,
    this.ownerName,
    this.ownerPhone,
  });

  final String id;
  final String status; // pending, accepted, rejected, withdrawn
  final DateTime createdAt;
  final String? message;

  // populated when owner fetches applications
  final String? driverName;
  final String? driverPhone;
  final String? driverId;

  // populated when driver fetches their own applications
  final String? requestId;
  final String? requestStatus;
  final String? vehicleInfo;
  final String? vehiclePlate;
  final String? ownerName;
  final String? ownerPhone;

  bool get isPending => status == 'pending';
  bool get isAccepted => status == 'accepted';
  bool get isRejected => status == 'rejected';

  /// Parse an application from the owner's perspective (GET /vehicle-requests/:id/applications)
  factory ApplicationModel.fromOwnerJson(Map<String, dynamic> json) {
    final driver = json['driver'] as Map<String, dynamic>?;
    final user = driver?['user'] as Map<String, dynamic>?;
    return ApplicationModel(
      id: json['id'] as String,
      status: json['status'] as String? ?? 'pending',
      createdAt: DateTime.parse(json['created_at'] as String),
      message: json['message'] as String?,
      driverName: driver?['full_name'] as String?,
      driverPhone: user?['phone'] as String?,
      driverId: driver?['id'] as String?,
    );
  }

  /// Parse an application from the driver's own perspective (GET /vehicle-requests/my-applications)
  factory ApplicationModel.fromDriverJson(Map<String, dynamic> json) {
    final request = json['request'] as Map<String, dynamic>?;
    final vehicle = request?['vehicle'] as Map<String, dynamic>?;
    final owner = request?['owner'] as Map<String, dynamic>?;
    final ownerUser = owner?['user'] as Map<String, dynamic>?;
    return ApplicationModel(
      id: json['id'] as String,
      status: json['status'] as String? ?? 'pending',
      createdAt: DateTime.parse(json['created_at'] as String),
      message: json['message'] as String?,
      requestId: request?['id'] as String?,
      requestStatus: request?['status'] as String?,
      vehicleInfo: vehicle != null
          ? '${vehicle['brand'] ?? ''} ${vehicle['model'] ?? ''}'.trim()
          : null,
      vehiclePlate: vehicle?['plate'] as String?,
      ownerName: owner?['full_name'] as String?,
      ownerPhone: ownerUser?['phone'] as String?,
    );
  }
}
