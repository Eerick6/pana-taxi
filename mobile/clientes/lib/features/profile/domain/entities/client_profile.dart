class ClientProfile {
  const ClientProfile({
    required this.id,
    required this.fullName,
    required this.phone,
    required this.rating,
    required this.totalTrips,
    this.photoUrl,
  });

  final String  id;
  final String  fullName;
  final String  phone;
  final double  rating;
  final int     totalTrips;
  final String? photoUrl;
}

class EmergencyContact {
  const EmergencyContact({
    required this.id,
    required this.name,
    required this.phone,
    this.relationship,
  });

  final String  id;
  final String  name;
  final String  phone;
  final String? relationship;
}
