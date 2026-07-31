import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/models/owner_vehicle_request_model.dart';
import '../../data/providers/vehicle_request_provider.dart';
import '../../../vehicles/data/providers/vehicle_provider.dart';
import '../../../vehicles/data/models/vehicle_model.dart';
import '../../../ratings/presentation/rating_sheet.dart';

class OwnerJobRequestsPage extends ConsumerWidget {
  const OwnerJobRequestsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final requestsAsync = ref.watch(ownerRequestsProvider);

    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        backgroundColor: AppColors.secondary,
        title: Text('Mis solicitudes de chofer',
            style: AppTextStyles.h3.copyWith(color: AppColors.white)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: AppColors.white),
            onPressed: () => ref.read(ownerRequestsProvider.notifier).refresh(),
          ),
        ],
      ),
      body: requestsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppColors.gray300),
              const SizedBox(height: 12),
              Text('Error: $e', style: AppTextStyles.body),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () => ref.read(ownerRequestsProvider.notifier).refresh(),
                child: const Text('Reintentar'),
              ),
            ],
          ),
        ),
        data: (requests) => RefreshIndicator(
          onRefresh: () => ref.read(ownerRequestsProvider.notifier).refresh(),
          child: requests.isEmpty
              ? ListView(
                  children: [
                    SizedBox(
                      height: MediaQuery.of(context).size.height * 0.6,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.work_off_outlined, size: 64, color: AppColors.gray300),
                          const SizedBox(height: 16),
                          Text('No tienes solicitudes publicadas',
                              style: AppTextStyles.body.copyWith(color: AppColors.gray400)),
                          const SizedBox(height: 8),
                          Text('Publica una solicitud para recibir postulaciones',
                              style: AppTextStyles.caption, textAlign: TextAlign.center),
                        ],
                      ),
                    ),
                  ],
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: requests.length,
                  itemBuilder: (_, i) => _OwnerRequestCard(request: requests[i]),
                ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCreateSheet(context, ref),
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.secondary,
        icon: const Icon(Icons.add),
        label: const Text('Nueva solicitud'),
      ),
    );
  }

  Future<void> _showCreateSheet(BuildContext context, WidgetRef ref) async {
    final vehiclesAsync = ref.read(myVehiclesProvider);
    final vehicles = vehiclesAsync.value
            ?.where((v) => v.approvalStatus == 'approved')
            .toList() ??
        [];

    if (vehicles.isEmpty) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Necesitas tener al menos un taxi aprobado para publicar solicitudes.'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
      return;
    }

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _CreateRequestSheet(vehicles: vehicles),
    );
  }
}

String _fmtDate(DateTime d) {
  const m = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return '${d.day} ${m[d.month]} ${d.year}';
}

class _OwnerRequestCard extends ConsumerWidget {
  const _OwnerRequestCard({required this.request});
  final OwnerVehicleRequestModel request;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final (statusColor, statusLabel, statusIcon) = switch (request.status) {
      'open' => (Colors.blue, 'Abierta', Icons.search),
      'accepted' => (Colors.green, 'Asignada', Icons.check_circle_outline),
      'completed' => (AppColors.gray400, 'Completada', Icons.done_all),
      _ => (AppColors.error, 'Cancelada', Icons.cancel_outlined),
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
        border: request.isOpen
            ? Border.all(color: Colors.blue.withOpacity(0.3))
            : null,
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2))
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(request.vehicleInfo, style: AppTextStyles.labelLg),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(statusIcon, size: 13, color: statusColor),
                      const SizedBox(width: 4),
                      Text(statusLabel,
                          style: AppTextStyles.caption.copyWith(color: statusColor)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'Publicada ${_fmtDate(request.createdAt.toLocal())}',
              style: AppTextStyles.caption,
            ),
            if (request.notes != null && request.notes!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(request.notes!, style: AppTextStyles.body.copyWith(color: AppColors.gray500)),
            ],
            if (request.isAccepted && request.acceptedDriverName != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.green.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.green.withOpacity(0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.person_outline, size: 16, color: Colors.green),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(request.acceptedDriverName!,
                              style: AppTextStyles.label.copyWith(color: Colors.green.shade700)),
                          if (request.acceptedDriverPhone != null)
                            Text(request.acceptedDriverPhone!,
                                style: AppTextStyles.caption),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if (request.isAccepted) ...[
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.star_outline, size: 16),
                  label: const Text('Calificar conductor'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    side: const BorderSide(color: AppColors.primary),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: () => _showRatingSheet(context, ref),
                ),
              ),
            ],
            if (request.isOpen) ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.error,
                        side: BorderSide(color: AppColors.error.withOpacity(0.5)),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: () => _confirmCancel(context, ref),
                      child: const Text('Cancelar'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: AppColors.secondary,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        elevation: 0,
                      ),
                      onPressed: () => context.push(
                        '/owner-requests/${request.id}/applicants',
                        extra: request.vehicleInfo,
                      ),
                      child: const Text('Ver postulantes'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _confirmCancel(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancelar solicitud'),
        content: const Text('¿Cancelar esta solicitud? Los conductores postulados serán notificados.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Volver')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Cancelar solicitud', style: TextStyle(color: AppColors.errorText)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(ownerRequestsProvider.notifier).cancel(request.id);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Solicitud cancelada'), behavior: SnackBarBehavior.floating),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  Future<void> _showRatingSheet(BuildContext context, WidgetRef ref) async {
    await showRatingSheet(
      context: context,
      ref: ref,
      title: 'Calificar conductor',
      subtitle: request.acceptedDriverName ?? 'Conductor asignado',
      direction: 'owner_to_driver',
      vehicleRequestId: request.id,
    );
  }
}

class _CreateRequestSheet extends ConsumerStatefulWidget {
  const _CreateRequestSheet({required this.vehicles});
  final List<VehicleModel> vehicles;

  @override
  ConsumerState<_CreateRequestSheet> createState() => _CreateRequestSheetState();
}

class _CreateRequestSheetState extends ConsumerState<_CreateRequestSheet> {
  VehicleModel? _selectedVehicle;
  final _notesController = TextEditingController();
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    if (widget.vehicles.length == 1) _selectedVehicle = widget.vehicles.first;
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_selectedVehicle == null) return;
    setState(() => _loading = true);
    try {
      await ref.read(ownerRequestsProvider.notifier).create(
            _selectedVehicle!.id,
            notes: _notesController.text.trim(),
          );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = _selectedVehicle != null && !_loading;

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.gray300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text('Publicar solicitud de chofer', style: AppTextStyles.h3),
          const SizedBox(height: 4),
          Text('Los conductores cercanos podrán ver tu solicitud y postularse.',
              style: AppTextStyles.body.copyWith(color: AppColors.gray500)),
          const SizedBox(height: 20),
          Text('¿Para qué taxi?', style: AppTextStyles.labelLg),
          const SizedBox(height: 8),
          ...widget.vehicles.map((v) => _VehicleOption(
                vehicle: v,
                selected: _selectedVehicle?.id == v.id,
                onTap: () => setState(() => _selectedVehicle = v),
              )),
          const SizedBox(height: 16),
          Text('Notas (opcional)', style: AppTextStyles.labelLg),
          const SizedBox(height: 8),
          TextField(
            controller: _notesController,
            maxLines: 2,
            decoration: InputDecoration(
              hintText: 'Ej: horario, zona de trabajo, requisitos especiales...',
              hintStyle: AppTextStyles.body.copyWith(color: AppColors.gray400),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: AppColors.secondary,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
              onPressed: canSubmit ? _submit : null,
              child: _loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Publicar solicitud'),
            ),
          ),
        ],
      ),
    );
  }
}

class _VehicleOption extends StatelessWidget {
  const _VehicleOption({required this.vehicle, required this.selected, required this.onTap});
  final VehicleModel vehicle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: selected ? AppColors.primaryLight : AppColors.gray50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.gray200,
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(Icons.directions_car,
                color: selected ? AppColors.secondary : AppColors.gray400, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                '${vehicle.brand} ${vehicle.model} · ${vehicle.plate}',
                style: AppTextStyles.label.copyWith(
                  color: selected ? AppColors.secondary : AppColors.gray700,
                ),
              ),
            ),
            if (selected) const Icon(Icons.check_circle, color: AppColors.primary, size: 20),
          ],
        ),
      ),
    );
  }
}
