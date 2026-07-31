class UserModel {
  const UserModel({
    required this.id,
    required this.role,
    this.email,
    this.phone,
    this.isVerified = false,
  });

  final String id;
  final String? email;
  final String role;
  final String? phone;
  final bool isVerified;

  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
        id: json['id'] as String,
        email: json['email'] as String?,
        role: json['role'] as String,
        phone: json['phone'] as String?,
        isVerified: json['is_verified'] as bool? ?? false,
      );
}
