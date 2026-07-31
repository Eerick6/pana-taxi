import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../domain/entities/client_profile.dart';
import '../providers/profile_provider.dart';

class EmergencyContactsPage extends ConsumerWidget {
  const EmergencyContactsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final contactsAsync = ref.watch(emergencyContactsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text('Contactos de emergencia', style: AppTextStyles.h3),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showAddSheet(context, ref),
          ),
        ],
      ),
      body: contactsAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.primary)),
        error: (_, _) => Center(
            child: Text('Error al cargar contactos', style: AppTextStyles.body)),
        data: (contacts) => contacts.isEmpty
            ? _EmptyState(onAdd: () => _showAddSheet(context, ref))
            : _ContactsList(contacts: contacts, ref: ref),
      ),
    );
  }

  void _showAddSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _AddContactSheet(ref: ref),
    );
  }
}

class _ContactsList extends StatelessWidget {
  const _ContactsList({required this.contacts, required this.ref});
  final List<EmergencyContact> contacts;
  final WidgetRef              ref;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: contacts.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (_, i) => _ContactTile(
        contact: contacts[i],
        onDelete: () async {
          final confirm = await showDialog<bool>(
            context: context,
            builder: (_) => AlertDialog(
              title: Text('¿Eliminar contacto?', style: AppTextStyles.h3),
              content: Text('Se eliminará ${contacts[i].name} de tu lista.',
                  style: AppTextStyles.body),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Cancelar'),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.error),
                  onPressed: () => Navigator.pop(context, true),
                  child: Text('Eliminar',
                      style: AppTextStyles.btnSm
                          .copyWith(color: AppColors.white)),
                ),
              ],
            ),
          );
          if (confirm == true) {
            await ref
                .read(profileRepositoryProvider)
                .deleteEmergencyContact(contacts[i].id);
            ref.invalidate(emergencyContactsProvider);
          }
        },
      ),
    );
  }
}

class _ContactTile extends StatelessWidget {
  const _ContactTile({required this.contact, required this.onDelete});
  final EmergencyContact contact;
  final VoidCallback     onDelete;

  @override
  Widget build(BuildContext context) => Material(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
        child: ListTile(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          leading: Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: AppColors.primaryLight,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.person_outline,
                color: AppColors.secondary, size: 20),
          ),
          title: Text(contact.name, style: AppTextStyles.label),
          subtitle: Text(
            contact.relationship != null
                ? '${contact.phone} · ${contact.relationship}'
                : contact.phone,
            style: AppTextStyles.caption,
          ),
          trailing: IconButton(
            icon: const Icon(Icons.delete_outline,
                color: AppColors.error, size: 20),
            onPressed: onDelete,
          ),
        ),
      );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onAdd});
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.contacts_outlined,
                size: 64, color: AppColors.gray300),
            const SizedBox(height: 16),
            Text('Sin contactos de emergencia',
                style: AppTextStyles.h3.copyWith(color: AppColors.gray500)),
            const SizedBox(height: 8),
            Text('Agrega alguien de confianza\npara situaciones de emergencia.',
                style: AppTextStyles.body.copyWith(color: AppColors.gray400),
                textAlign: TextAlign.center),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Agregar contacto'),
              style: ElevatedButton.styleFrom(
                minimumSize: Size.zero,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
            ),
          ],
        ),
      );
}

// ── Sheet para agregar contacto ──────────────────────────────────────────────

class _AddContactSheet extends StatefulWidget {
  const _AddContactSheet({required this.ref});
  final WidgetRef ref;

  @override
  State<_AddContactSheet> createState() => _AddContactSheetState();
}

class _AddContactSheetState extends State<_AddContactSheet> {
  final _nameCtrl  = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _relCtrl   = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _relCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name   = _nameCtrl.text.trim();
    final digits = _phoneCtrl.text.trim();
    if (name.isEmpty) {
      _snack('Ingresa el nombre');
      return;
    }
    if (digits.length != 9) {
      _snack('Ingresa 9 dígitos sin el código de país');
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.ref.read(profileRepositoryProvider).addEmergencyContact(
            name:         name,
            phone:        '+593$digits',
            relationship: _relCtrl.text.trim().isEmpty ? null : _relCtrl.text.trim(),
          );
      widget.ref.invalidate(emergencyContactsProvider);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) _snack(e.toString().replaceAll('Exception: ', ''), isError: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _snack(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: isError ? AppColors.error : AppColors.secondary,
    ));
  }

  InputDecoration _deco(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: AppTextStyles.body.copyWith(color: AppColors.gray400),
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
      );

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(
            24, 20, 24, MediaQuery.of(context).viewInsets.bottom + 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Agregar contacto', style: AppTextStyles.h3),
            const SizedBox(height: 20),

            // Nombre
            TextField(
              controller: _nameCtrl,
              textCapitalization: TextCapitalization.words,
              decoration: _deco('Nombre completo'),
              style: AppTextStyles.body,
            ),
            const SizedBox(height: 12),

            // Teléfono con prefijo +593
            TextField(
              controller: _phoneCtrl,
              keyboardType: TextInputType.phone,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(9),
              ],
              decoration: _deco('991234567').copyWith(
                prefixIcon: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.gray100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text('🇪🇨 +593', style: AppTextStyles.label),
                ),
                prefixIconConstraints: const BoxConstraints(),
              ),
              style: AppTextStyles.body,
            ),
            const SizedBox(height: 12),

            // Relación (opcional)
            TextField(
              controller: _relCtrl,
              textCapitalization: TextCapitalization.words,
              decoration: _deco('Relación (ej: Mamá, Esposo…)'),
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
                    : const Text('Guardar'),
              ),
            ),
          ],
        ),
      );
}
