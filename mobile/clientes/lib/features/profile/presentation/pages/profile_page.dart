import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../domain/entities/client_profile.dart';
import '../providers/profile_provider.dart';

class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(clientProfileProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text('Mi perfil', style: AppTextStyles.h3),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          onPressed: () => context.pop(),
        ),
      ),
      body: profileAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.primary)),
        error: (e, _) => Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Error al cargar perfil',
                    style: AppTextStyles.body.copyWith(color: AppColors.error)),
                const SizedBox(height: 8),
                Text('$e',
                    style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
                    textAlign: TextAlign.center),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () => ref.invalidate(clientProfileProvider),
                  child: const Text('Reintentar'),
                ),
              ],
            )),
        data: (profile) => _ProfileBody(profile: profile),
      ),
    );
  }
}

class _ProfileBody extends ConsumerWidget {
  const _ProfileBody({required this.profile});
  final ClientProfile profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      children: [
        // ── Header ────────────────────────────────────────────────────────
        _ProfileHeader(profile: profile),

        const SizedBox(height: 12),

        // ── Menu items ────────────────────────────────────────────────────
        _Section(children: [
          _MenuItem(
            icon: Icons.person_outline,
            label: 'Editar perfil',
            onTap: () => _showEditProfile(context, ref, profile),
          ),
          _MenuItem(
            icon: Icons.location_on_outlined,
            label: 'Mis ubicaciones',
            onTap: () => context.push('/profile/locations'),
          ),
          _MenuItem(
            icon: Icons.contacts_outlined,
            label: 'Contactos de emergencia',
            onTap: () => context.push('/profile/emergency-contacts'),
          ),
        ]),

        _Section(children: [
          _MenuItem(
            icon: Icons.history,
            label: 'Historial de viajes',
            onTap: () => context.push('/profile/trips'),
          ),
        ]),

        _Section(children: [
          _MenuItem(
            icon: Icons.description_outlined,
            label: 'Términos y condiciones',
            onTap: () => context.push('/profile/terms'),
          ),
        ]),

        _Section(children: [
          _MenuItem(
            icon: Icons.logout,
            label: 'Cerrar sesión',
            color: AppColors.error,
            onTap: () => _confirmLogout(context, ref),
          ),
        ]),

        const SizedBox(height: 32),
      ],
    );
  }

  void _showEditProfile(BuildContext context, WidgetRef ref, ClientProfile profile) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => _EditProfileSheet(profile: profile),
    );
  }

  void _confirmLogout(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Cerrar sesión', style: AppTextStyles.h3),
        content: Text('¿Seguro que quieres salir?', style: AppTextStyles.body),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Cancelar',
                style: AppTextStyles.label.copyWith(color: AppColors.gray500)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () async {
              Navigator.pop(context);
              await ref.read(secureStorageProvider).clearAll();
              if (context.mounted) context.go('/welcome');
            },
            child: Text('Salir',
                style: AppTextStyles.btnSm.copyWith(color: AppColors.white)),
          ),
        ],
      ),
    );
  }

  InputDecoration _inputDeco(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: AppTextStyles.body.copyWith(color: AppColors.gray400),
        filled: true,
        fillColor: AppColors.gray50,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.gray200),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.gray200),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
      );
}

// ── Header ──────────────────────────────────────────────────────────────────

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.profile});
  final ClientProfile profile;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.white,
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 24),
      child: Column(
        children: [
          // Foto
          CircleAvatar(
            radius: 44,
            backgroundColor: AppColors.gray200,
            backgroundImage: profile.photoUrl != null
                ? NetworkImage(profile.photoUrl!)
                : null,
            child: profile.photoUrl == null
                ? const Icon(Icons.person, size: 44, color: AppColors.gray500)
                : null,
          ),
          const SizedBox(height: 12),

          Text(profile.fullName,
              style: AppTextStyles.h2, textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text(profile.phone,
              style: AppTextStyles.body.copyWith(color: AppColors.gray500)),
          const SizedBox(height: 16),

          // Stats
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _Stat(value: profile.rating.toStringAsFixed(1), label: 'Calificación',
                  icon: Icons.star, iconColor: AppColors.primary),
              const SizedBox(width: 32),
              _Stat(value: '${profile.totalTrips}', label: 'Viajes',
                  icon: Icons.directions_car_outlined, iconColor: AppColors.secondary),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label,
      required this.icon, required this.iconColor});
  final String   value;
  final String   label;
  final IconData icon;
  final Color    iconColor;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Row(children: [
            Icon(icon, size: 16, color: iconColor),
            const SizedBox(width: 4),
            Text(value, style: AppTextStyles.h3),
          ]),
          Text(label,
              style: AppTextStyles.caption.copyWith(color: AppColors.gray500)),
        ],
      );
}

// ── Widgets reutilizables ────────────────────────────────────────────────────

class _Section extends StatelessWidget {
  const _Section({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Material(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(16),
          child: Column(children: children),
        ),
      );
}

class _MenuItem extends StatelessWidget {
  const _MenuItem({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
  });
  final IconData     icon;
  final String       label;
  final VoidCallback onTap;
  final Color?       color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.secondary;
    return ListTile(
      onTap: onTap,
      leading: Container(
        width: 36, height: 36,
        decoration: BoxDecoration(
          color: (color ?? AppColors.secondary).withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, size: 20, color: c),
      ),
      title: Text(label, style: AppTextStyles.body.copyWith(color: c)),
      trailing: color == null
          ? const Icon(Icons.chevron_right, color: AppColors.gray400)
          : null,
    );
  }
}

// ── Edit profile sheet (nombre + foto) ──────────────────────────────────────

class _EditProfileSheet extends ConsumerStatefulWidget {
  const _EditProfileSheet({required this.profile});
  final ClientProfile profile;

  @override
  ConsumerState<_EditProfileSheet> createState() => _EditProfileSheetState();
}

class _EditProfileSheetState extends ConsumerState<_EditProfileSheet> {
  late final TextEditingController _nameCtrl;
  Uint8List? _pickedBytes;
  String?    _pickedName;
  bool       _saving = false;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.profile.fullName);
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final xfile = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 800,
    );
    if (xfile == null) return;
    final bytes = await xfile.readAsBytes();
    setState(() {
      _pickedBytes = bytes;
      _pickedName  = xfile.name;
    });
  }

  void _snack(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: isError ? AppColors.error : AppColors.secondary,
    ));
  }

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) { _snack('Ingresa tu nombre'); return; }
    setState(() => _saving = true);
    try {
      if (_pickedBytes != null) {
        await ref.read(authRepositoryProvider)
            .uploadPhoto(_pickedBytes!, _pickedName ?? 'photo.jpg');
      }
      await ref.read(profileRepositoryProvider)
          .updateMyProfile(fullName: name);
      ref.invalidate(clientProfileProvider);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        _snack(e.toString().replaceAll('Exception: ', ''), isError: true);
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentPhoto = widget.profile.photoUrl;

    return Padding(
      padding: EdgeInsets.fromLTRB(
          24, 20, 24, MediaQuery.of(context).viewInsets.bottom + 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Editar perfil', style: AppTextStyles.h3),
          const SizedBox(height: 24),

          // ── Foto ──────────────────────────────────────────────────────────
          Center(
            child: GestureDetector(
              onTap: _pickImage,
              child: Stack(
                children: [
                  CircleAvatar(
                    radius: 48,
                    backgroundColor: AppColors.gray200,
                    backgroundImage: _pickedBytes != null
                        ? MemoryImage(_pickedBytes!)
                        : (currentPhoto != null
                            ? NetworkImage(currentPhoto) as ImageProvider
                            : null),
                    child: (_pickedBytes == null && currentPhoto == null)
                        ? const Icon(Icons.person, size: 48, color: AppColors.gray500)
                        : null,
                  ),
                  Positioned(
                    bottom: 0, right: 0,
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: const BoxDecoration(
                        color: AppColors.primary,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.camera_alt,
                          size: 16, color: AppColors.white),
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 20),

          // ── Nombre ────────────────────────────────────────────────────────
          TextField(
            controller: _nameCtrl,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: 'Nombre completo',
              filled: true, fillColor: AppColors.gray50,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.gray200),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.gray200),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.primary, width: 2),
              ),
            ),
            style: AppTextStyles.body,
          ),

          const SizedBox(height: 20),

          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      width: 20, height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: AppColors.white))
                  : const Text('Guardar cambios'),
            ),
          ),
        ],
      ),
    );
  }
}
