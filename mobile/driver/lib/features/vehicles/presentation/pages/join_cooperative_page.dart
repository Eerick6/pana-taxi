import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../profile/data/providers/profile_provider.dart';
import '../../data/models/vehicle_model.dart';
import '../../data/providers/vehicle_provider.dart';
import '../../data/repositories/vehicle_repository.dart';

class JoinCooperativePage extends ConsumerStatefulWidget {
  const JoinCooperativePage({super.key});

  @override
  ConsumerState<JoinCooperativePage> createState() => _JoinCooperativePageState();
}

class _JoinCooperativePageState extends ConsumerState<JoinCooperativePage> {
  String? _selectedId;
  bool _loading = false;

  Future<void> _submit() async {
    if (_selectedId == null) return;
    setState(() => _loading = true);
    try {
      await ref.read(vehicleRepositoryProvider).joinCooperative(_selectedId!);
      ref.invalidate(driverProfileProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Solicitud enviada. La cooperativa revisará tu perfil.'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final coopsAsync = ref.watch(activeCooperativesProvider);

    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        backgroundColor: AppColors.secondary,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: AppColors.white, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text('Unirse a cooperativa', style: AppTextStyles.h3.copyWith(color: AppColors.white)),
      ),
      body: coopsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('Error: $e', style: AppTextStyles.body),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () => ref.invalidate(activeCooperativesProvider),
                child: const Text('Reintentar'),
              ),
            ],
          ),
        ),
        data: (coops) => Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.primary.withValues(alpha: 0.25)),
                    ),
                    child: Text(
                      'Selecciona la cooperativa a la que deseas unirte. Una vez enviada la solicitud, la cooperativa revisará tu perfil y documentos antes de aprobarte.',
                      style: AppTextStyles.body.copyWith(color: AppColors.gray600),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text('Cooperativas disponibles', style: AppTextStyles.labelLg),
                  const SizedBox(height: 10),
                  if (coops.isEmpty)
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Text('No hay cooperativas activas disponibles.',
                            style: AppTextStyles.body.copyWith(color: AppColors.gray400),
                            textAlign: TextAlign.center),
                      ),
                    )
                  else
                    ...coops.map((c) => _CoopTile(
                          coop: c,
                          selected: _selectedId == c.id,
                          onTap: () => setState(() => _selectedId = c.id),
                        )),
                ],
              ),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _selectedId != null && !_loading ? _submit : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: AppColors.secondary,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: _loading
                        ? const SizedBox(
                            width: 20, height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.secondary))
                        : Text('Solicitar membresía', style: AppTextStyles.labelLg),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CoopTile extends StatelessWidget {
  const _CoopTile({required this.coop, required this.selected, required this.onTap});
  final CooperativeModel coop;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary.withValues(alpha: 0.08) : AppColors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.gray200,
            width: selected ? 2 : 1,
          ),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2))],
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.gray100,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.business_outlined, color: AppColors.gray500),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(coop.name, style: AppTextStyles.labelLg),
                  if (coop.address != null)
                    Text(coop.address!, style: AppTextStyles.caption.copyWith(color: AppColors.gray400)),
                  if (coop.phone != null)
                    Text(coop.phone!, style: AppTextStyles.caption.copyWith(color: AppColors.gray400)),
                ],
              ),
            ),
            if (selected)
              const Icon(Icons.check_circle, color: AppColors.primary, size: 22),
          ],
        ),
      ),
    );
  }
}
