import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../chat/data/repositories/chat_repository.dart';
import '../../../profile/data/models/driver_profile_model.dart';
import '../../../profile/data/providers/profile_provider.dart';
import '../../../vehicle_request/data/providers/vehicle_request_provider.dart';
import '../../data/models/vehicle_model.dart';
import '../../data/providers/vehicle_provider.dart';

class MyVehiclesPage extends ConsumerWidget {
  const MyVehiclesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(driverProfileProvider);
    final vehiclesAsync = ref.watch(myVehiclesProvider);

    final profile = profileAsync.value;
    final approvedCoops = profile?.cooperatives
            .where((c) => c.membershipStatus == 'approved')
            .toList() ??
        [];
    final pendingCoops = profile?.cooperatives
            .where((c) => c.membershipStatus == 'pending')
            .toList() ??
        [];

    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        backgroundColor: AppColors.secondary,
        title: Text('Mis taxis', style: AppTextStyles.h3.copyWith(color: AppColors.white)),
        actions: [
          if (approvedCoops.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.add, color: AppColors.white),
              tooltip: 'Registrar taxi',
              onPressed: () => context.push('/vehicles/register'),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myVehiclesProvider);
          ref.invalidate(driverProfileProvider);
          ref.read(ownerRequestsProvider.notifier).refresh();
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Si no está aprobado por la plataforma
            if (profile != null && !profile.isVerified) ...[
              _InfoBanner(
                icon: Icons.hourglass_top_rounded,
                color: AppColors.warningText,
                title: 'Perfil pendiente de aprobación',
                body: 'La plataforma debe aprobar tu perfil antes de que puedas unirte a una cooperativa y registrar taxis.',
              ),
              const SizedBox(height: 16),
            ],

            // Si está aprobado pero no tiene coop aprobada
            if (profile != null && profile.isVerified && approvedCoops.isEmpty) ...[
              if (pendingCoops.isNotEmpty)
                _InfoBanner(
                  icon: Icons.hourglass_top_rounded,
                  color: Colors.blue,
                  title: 'Membresía en revisión',
                  body: 'La cooperativa aún no aprueba tu membresía. Puedes registrar taxis mientras tanto; serán revisados por la cooperativa.',
                )
              else
                _InfoBanner(
                  icon: Icons.group_outlined,
                  color: AppColors.primary,
                  title: 'Únete a una cooperativa',
                  body: 'Para registrar tus taxis necesitas ser miembro aprobado de una cooperativa.',
                  action: TextButton(
                    onPressed: () => context.push('/cooperatives/join'),
                    child: const Text('Solicitar membresía →'),
                  ),
                ),
              const SizedBox(height: 16),
            ],

            // Lista de cooperativas donde es miembro
            if (profile?.cooperatives.isNotEmpty == true) ...[
              Text('Cooperativas', style: AppTextStyles.labelLg),
              const SizedBox(height: 8),
              ...profile!.cooperatives.map((c) => _CoopChip(coop: c)),
              const SizedBox(height: 16),
            ],

            // Lista de vehículos
            vehiclesAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Error: $e', style: AppTextStyles.body)),
              data: (vehicles) => vehicles.isEmpty
                  ? _EmptyVehicles(canRegister: approvedCoops.isNotEmpty)
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Mis vehículos', style: AppTextStyles.labelLg),
                        const SizedBox(height: 8),
                        ...vehicles.map((v) => _VehicleCard(vehicle: v)),
                      ],
                    ),
            ),

            // Sección de solicitudes de chofer (solo si tiene vehículos aprobados)
            if (profile != null && profile.isVerified) ...[
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: Text('Solicitudes de chofer', style: AppTextStyles.labelLg),
                  ),
                  TextButton.icon(
                    icon: const Icon(Icons.open_in_new, size: 16),
                    label: const Text('Ver todas'),
                    onPressed: () => context.push('/owner-requests'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              _OwnerRequestsSummary(),
            ],
          ],
        ),
      ),
      floatingActionButton: approvedCoops.isNotEmpty
          ? FloatingActionButton.extended(
              onPressed: () => context.push('/vehicles/register'),
              backgroundColor: AppColors.primary,
              foregroundColor: AppColors.secondary,
              icon: const Icon(Icons.add),
              label: const Text('Registrar taxi'),
            )
          : null,
    );
  }
}

class _InfoBanner extends StatelessWidget {
  const _InfoBanner({
    required this.icon,
    required this.color,
    required this.title,
    required this.body,
    this.action,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text(title, style: AppTextStyles.labelLg.copyWith(color: color))),
            ],
          ),
          const SizedBox(height: 6),
          Text(body, style: AppTextStyles.body.copyWith(color: AppColors.gray600)),
          if (action != null) ...[const SizedBox(height: 4), action!],
        ],
      ),
    );
  }
}

class _CoopChip extends ConsumerStatefulWidget {
  const _CoopChip({required this.coop});
  final CooperativeMembership coop;

  @override
  ConsumerState<_CoopChip> createState() => _CoopChipState();
}

class _CoopChipState extends ConsumerState<_CoopChip> {
  bool _opening = false;

  Future<void> _openChat() async {
    if (_opening) return;
    setState(() => _opening = true);
    try {
      final convId = await ref.read(chatRepositoryProvider).openOperatorConversation(widget.coop.cooperativeId);
      if (mounted) context.push('/chat/$convId');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
          backgroundColor: AppColors.error,
        ));
      }
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (widget.coop.membershipStatus) {
      'approved' => (Colors.green, 'Aprobado'),
      'pending' => (AppColors.warningText, 'En revisión'),
      _ => (AppColors.errorText, 'Rechazado'),
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.business_outlined, size: 18, color: AppColors.gray500),
          const SizedBox(width: 10),
          Expanded(child: Text(widget.coop.cooperativeName, style: AppTextStyles.label)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(label, style: AppTextStyles.caption.copyWith(color: color)),
          ),
          if (widget.coop.isApproved) ...[
            const SizedBox(width: 6),
            _opening
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : IconButton(
                    icon: const Icon(Icons.chat_bubble_outline, size: 18),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                    color: AppColors.secondary,
                    tooltip: 'Chatear con la cooperativa',
                    onPressed: _openChat,
                  ),
          ],
        ],
      ),
    );
  }
}

class _VehicleCard extends ConsumerWidget {
  const _VehicleCard({required this.vehicle});
  final VehicleModel vehicle;

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref, VehicleModel v) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar vehículo'),
        content: Text('¿Eliminar ${v.brand} ${v.model} (${v.plate})?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Eliminar', style: TextStyle(color: AppColors.errorText)),
          ),
        ],
      ),
    );
    if (confirm != true || !context.mounted) return;
    try {
      await ref.read(myVehiclesProvider.notifier).delete(v.id);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Vehículo eliminado'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final (statusColor, statusLabel) = switch (vehicle.approvalStatus) {
      'approved' => (Colors.green, 'Aprobado'),
      'pending' => (AppColors.warningText, 'En revisión'),
      _ => (AppColors.errorText, 'Rechazado'),
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: statusColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(Icons.directions_car, color: statusColor, size: 26),
        ),
        title: Text('${vehicle.brand} ${vehicle.model}', style: AppTextStyles.labelLg),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${vehicle.plate} · ${vehicle.color} · ${vehicle.year}',
                style: AppTextStyles.body.copyWith(color: AppColors.gray500)),
            if (vehicle.cooperativeName != null)
              Text(vehicle.cooperativeName!, style: AppTextStyles.caption.copyWith(color: AppColors.gray400)),
            Row(
              children: [
                Container(
                  margin: const EdgeInsets.only(top: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(statusLabel,
                      style: AppTextStyles.caption.copyWith(color: statusColor, fontSize: 11)),
                ),
              ],
            ),
          ],
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.upload_file_outlined, color: AppColors.secondary),
              tooltip: 'Documentos',
              onPressed: () => context.push('/vehicles/${vehicle.id}/documents'),
            ),
            if (vehicle.approvalStatus != 'approved')
              IconButton(
                icon: Icon(Icons.delete_outline, color: AppColors.error),
                tooltip: 'Eliminar',
                onPressed: () => _confirmDelete(context, ref, vehicle),
              ),
          ],
        ),
      ),
    );
  }
}

class _EmptyVehicles extends StatelessWidget {
  const _EmptyVehicles({required this.canRegister});
  final bool canRegister;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Column(
          children: [
            const Icon(Icons.directions_car_outlined, size: 64, color: AppColors.gray300),
            const SizedBox(height: 12),
            Text('No tienes taxis registrados', style: AppTextStyles.body.copyWith(color: AppColors.gray400)),
            if (canRegister) ...[
              const SizedBox(height: 8),
              Text('Toca el botón + para registrar tu primer taxi',
                  style: AppTextStyles.caption, textAlign: TextAlign.center),
            ],
          ],
        ),
      ),
    );
  }
}

class _OwnerRequestsSummary extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final requestsAsync = ref.watch(ownerRequestsProvider);

    return requestsAsync.when(
      loading: () => const SizedBox(
        height: 60,
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (err, st) => const SizedBox.shrink(),
      data: (requests) {
        final openCount = requests.where((r) => r.isOpen).length;
        final acceptedCount = requests.where((r) => r.isAccepted).length;

        return InkWell(
          onTap: () => context.push('/owner-requests'),
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.gray200),
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.04),
                    blurRadius: 6,
                    offset: const Offset(0, 2))
              ],
            ),
            child: requests.isEmpty
                ? Row(
                    children: [
                      const Icon(Icons.work_outline, color: AppColors.gray400, size: 20),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text('Sin solicitudes publicadas',
                            style: AppTextStyles.body.copyWith(color: AppColors.gray400)),
                      ),
                      const Icon(Icons.chevron_right, color: AppColors.gray300),
                    ],
                  )
                : Row(
                    children: [
                      _SummaryChip(
                        icon: Icons.search,
                        count: openCount,
                        label: 'Abiertas',
                        color: Colors.blue,
                      ),
                      const SizedBox(width: 12),
                      _SummaryChip(
                        icon: Icons.check_circle_outline,
                        count: acceptedCount,
                        label: 'Asignadas',
                        color: Colors.green,
                      ),
                      const Spacer(),
                      const Icon(Icons.chevron_right, color: AppColors.gray400),
                    ],
                  ),
          ),
        );
      },
    );
  }
}

class _SummaryChip extends StatelessWidget {
  const _SummaryChip({
    required this.icon,
    required this.count,
    required this.label,
    required this.color,
  });
  final IconData icon;
  final int count;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text('$count $label',
              style: AppTextStyles.caption.copyWith(color: color, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
