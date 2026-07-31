import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/models/vehicle_request_model.dart';
import '../../data/models/application_model.dart';
import '../../data/providers/vehicle_request_provider.dart';
import '../../../ratings/presentation/rating_sheet.dart';

class VehicleRequestsPage extends ConsumerWidget {
  const VehicleRequestsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: AppColors.gray50,
        appBar: AppBar(
          backgroundColor: AppColors.secondary,
          title: Text('Bolsa de empleo', style: AppTextStyles.h3.copyWith(color: AppColors.white)),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh, color: AppColors.white),
              onPressed: () {
                ref.invalidate(vehicleRequestsProvider);
                ref.read(myApplicationsProvider.notifier).refresh();
              },
            ),
          ],
          bottom: TabBar(
            labelColor: AppColors.primary,
            unselectedLabelColor: AppColors.white.withOpacity( 0.7),
            indicatorColor: AppColors.primary,
            tabs: const [
              Tab(text: 'Disponibles'),
              Tab(text: 'Mis postulaciones'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            _OpenRequestsTab(),
            _MyApplicationsTab(),
          ],
        ),
      ),
    );
  }
}

// ── Tab 1: Open requests the driver can apply to ───────────────────────────────

class _OpenRequestsTab extends ConsumerWidget {
  const _OpenRequestsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final requestsAsync = ref.watch(vehicleRequestsProvider);

    return requestsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: AppColors.gray300),
            const SizedBox(height: 12),
            Text('Error cargando solicitudes', style: AppTextStyles.body),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () => ref.refresh(vehicleRequestsProvider),
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
      data: (requests) {
        final available = requests.where((r) => !r.hasApplied).toList();
        return available.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.work_off_outlined, size: 64, color: AppColors.gray300),
                  const SizedBox(height: 16),
                  Text('No hay solicitudes disponibles',
                      style: AppTextStyles.body.copyWith(color: AppColors.gray400)),
                  const SizedBox(height: 8),
                  Text('Vuelve más tarde', style: AppTextStyles.caption),
                ],
              ),
            )
          : RefreshIndicator(
              onRefresh: () async => ref.refresh(vehicleRequestsProvider),
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: available.length,
                itemBuilder: (_, i) => _RequestCard(request: available[i]),
              ),
            );
      },
    );
  }
}

// ── Tab 2: Driver's own applications ──────────────────────────────────────────

class _MyApplicationsTab extends ConsumerWidget {
  const _MyApplicationsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final appsAsync = ref.watch(myApplicationsProvider);

    return appsAsync.when(
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
              onPressed: () => ref.read(myApplicationsProvider.notifier).refresh(),
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
      data: (apps) => apps.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.inbox_outlined, size: 64, color: AppColors.gray300),
                  const SizedBox(height: 16),
                  Text('Aún no te has postulado a ninguna solicitud',
                      style: AppTextStyles.body.copyWith(color: AppColors.gray400),
                      textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  Text('Explora las solicitudes disponibles en la pestaña anterior',
                      style: AppTextStyles.caption, textAlign: TextAlign.center),
                ],
              ),
            )
          : RefreshIndicator(
              onRefresh: () => ref.read(myApplicationsProvider.notifier).refresh(),
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: apps.length,
                itemBuilder: (_, i) => _MyApplicationCard(app: apps[i]),
              ),
            ),
    );
  }
}

// ── Open request card (driver can apply) ──────────────────────────────────────

String _fmtDate(DateTime d) {
  const m = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return '${d.day} ${m[d.month]}';
}

class _RequestCard extends ConsumerWidget {
  const _RequestCard({required this.request});
  final VehicleRequestModel request;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(request.title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                ),
                if (request.ownerId != null)
                  RatingBadge.owner(ownerId: request.ownerId!),
              ],
            ),
            const SizedBox(height: 6),
            Text('${request.cooperativeName} · ${request.vehicleInfo}',
                style: const TextStyle(fontSize: 12, color: Colors.grey)),
            if (request.description.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(request.description,
                  style: const TextStyle(fontSize: 13),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis),
            ],
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: request.hasApplied
                  ? OutlinedButton.icon(
                      onPressed: () => _withdraw(context, ref),
                      icon: const Icon(Icons.check_circle_outline, size: 16),
                      label: const Text('Postulado'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.green,
                        side: const BorderSide(color: Colors.green),
                      ),
                    )
                  : ElevatedButton(
                      onPressed: () => _apply(context, ref),
                      child: const Text('Postularme'),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _apply(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(vehicleRequestsProvider.notifier).apply(request.id);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('¡Postulación enviada!'),
            backgroundColor: Colors.green,
            behavior: SnackBarBehavior.floating,
          ),
        );
        ref.invalidate(vehicleRequestsProvider);
        ref.read(myApplicationsProvider.notifier).refresh();
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

  Future<void> _withdraw(BuildContext context, WidgetRef ref) async {
    if (request.applicationId == null) return;
    try {
      await ref.read(vehicleRequestsProvider.notifier).withdraw(request.applicationId!);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Postulación retirada'), behavior: SnackBarBehavior.floating),
        );
        ref.read(myApplicationsProvider.notifier).refresh();
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
}

// ── My application card (shows accepted / pending / rejected) ─────────────────

class _MyApplicationCard extends ConsumerWidget {
  const _MyApplicationCard({required this.app});
  final ApplicationModel app;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final (statusColor, statusLabel, statusIcon) = switch (app.status) {
      'accepted' => (Colors.green, 'Aceptado', Icons.check_circle_outline),
      'rejected' => (AppColors.errorText, 'Rechazado', Icons.cancel_outlined),
      'withdrawn' => (AppColors.gray400, 'Retirado', Icons.undo_outlined),
      _ => (AppColors.warningText, 'En revisión', Icons.hourglass_top_rounded),
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
        border: app.isAccepted
            ? Border.all(color: Colors.green, width: 2)
            : null,
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity( 0.05), blurRadius: 8, offset: const Offset(0, 2))
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${app.vehicleInfo ?? 'Vehículo'} · ${app.vehiclePlate ?? ''}',
                        style: AppTextStyles.labelLg,
                      ),
                      if (app.ownerName != null)
                        Text('Dueño: ${app.ownerName}', style: AppTextStyles.caption),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity( 0.12),
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
              'Postulado ${_fmtDate(app.createdAt.toLocal())}',
              style: AppTextStyles.caption,
            ),
            if (app.isAccepted) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.green.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.green.withOpacity(0.3)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.celebration_outlined, color: Colors.green, size: 18),
                        const SizedBox(width: 8),
                        Text('¡Fuiste seleccionado!',
                            style: AppTextStyles.label.copyWith(color: Colors.green.shade700)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'El dueño te ha asignado su taxi. '
                      'Coordina la entrega y luego inicia tu jornada desde la pantalla principal.',
                      style: AppTextStyles.body.copyWith(color: AppColors.gray600),
                    ),
                    if (app.ownerPhone != null) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          const Icon(Icons.phone_outlined, size: 14, color: AppColors.gray500),
                          const SizedBox(width: 6),
                          Text(app.ownerPhone!,
                              style: AppTextStyles.label.copyWith(color: AppColors.secondary)),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.star_outline, size: 16),
                  label: const Text('Calificar dueño'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    side: const BorderSide(color: AppColors.primary),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: app.requestId == null
                      ? null
                      : () => showRatingSheet(
                            context: context,
                            ref: ref,
                            title: 'Calificar dueño',
                            subtitle: app.ownerName ?? 'Dueño del taxi',
                            direction: 'driver_to_owner',
                            vehicleRequestId: app.requestId!,
                          ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
