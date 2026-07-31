import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/models/application_model.dart';
import '../../data/providers/vehicle_request_provider.dart';
import '../../data/repositories/vehicle_request_repository.dart';
import '../../../chat/data/repositories/chat_repository.dart';
import '../../../ratings/presentation/rating_sheet.dart';

class OwnerApplicantsPage extends ConsumerStatefulWidget {
  const OwnerApplicantsPage({
    super.key,
    required this.requestId,
    required this.vehicleInfo,
  });

  final String requestId;
  final String vehicleInfo;

  @override
  ConsumerState<OwnerApplicantsPage> createState() => _OwnerApplicantsPageState();
}

class _OwnerApplicantsPageState extends ConsumerState<OwnerApplicantsPage> {
  bool _accepting = false;

  Future<void> _accept(ApplicationModel app) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Asignar conductor'),
        content: Text(
          '¿Asignar a ${app.driverName ?? 'este conductor'} a tu taxi ${widget.vehicleInfo}?\n\n'
          'El conductor podrá iniciar jornada de inmediato.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, foregroundColor: AppColors.secondary),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Asignar'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;

    setState(() => _accepting = true);
    try {
      final result = await ref
          .read(vehicleRequestRepositoryProvider)
          .acceptApplication(widget.requestId, app.id);
      await ref.read(ownerRequestsProvider.notifier).refresh();
      if (!mounted) return;
      final phone = result['driver_phone'] as String?;
      showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('¡Conductor asignado!'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(result['message'] as String? ?? 'Asignado correctamente.'),
              if (phone != null) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Icon(Icons.phone_outlined, size: 16, color: AppColors.gray500),
                    const SizedBox(width: 6),
                    Text(phone, style: AppTextStyles.label),
                  ],
                ),
              ],
            ],
          ),
          actions: [
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, foregroundColor: AppColors.secondary),
              onPressed: () {
                Navigator.pop(ctx);
                Navigator.pop(context); // back to owner requests list
              },
              child: const Text('Entendido'),
            ),
          ],
        ),
      );
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
      if (mounted) setState(() => _accepting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final appsAsync = ref.watch(requestApplicationsProvider(widget.requestId));

    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        backgroundColor: AppColors.secondary,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Postulantes', style: AppTextStyles.h3.copyWith(color: AppColors.white)),
            Text(widget.vehicleInfo,
                style: AppTextStyles.caption.copyWith(color: AppColors.white.withOpacity(0.8))),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: AppColors.white),
            onPressed: () => ref.invalidate(requestApplicationsProvider(widget.requestId)),
          ),
        ],
      ),
      body: appsAsync.when(
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
                onPressed: () => ref.invalidate(requestApplicationsProvider(widget.requestId)),
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
                    const Icon(Icons.people_outline, size: 64, color: AppColors.gray300),
                    const SizedBox(height: 16),
                    Text('Nadie se ha postulado aún',
                        style: AppTextStyles.body.copyWith(color: AppColors.gray400)),
                    const SizedBox(height: 8),
                    Text('Vuelve más tarde', style: AppTextStyles.caption),
                  ],
                ),
              )
            : RefreshIndicator(
                onRefresh: () async =>
                    ref.invalidate(requestApplicationsProvider(widget.requestId)),
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: apps.length,
                  itemBuilder: (_, i) => _ApplicantCard(
                    app: apps[i],
                    accepting: _accepting,
                    onAccept: () => _accept(apps[i]),
                  ),
                ),
              ),
      ),
    );
  }
}

class _ApplicantCard extends ConsumerWidget {
  const _ApplicantCard({
    required this.app,
    required this.accepting,
    required this.onAccept,
  });

  final ApplicationModel app;
  final bool accepting;
  final VoidCallback onAccept;

  Future<void> _openChat(BuildContext context, WidgetRef ref) async {
    try {
      final conversationId = await ref
          .read(chatRepositoryProvider)
          .openApplicantConversation(app.id);
      if (context.mounted) context.push('/chat/$conversationId');
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
        ));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
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
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.primaryLight,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.person_outline, color: AppColors.secondary, size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(app.driverName ?? 'Conductor', style: AppTextStyles.labelLg),
                      if (app.driverId != null)
                        RatingBadge.driver(driverId: app.driverId!),
                      if (app.driverPhone != null)
                        Row(
                          children: [
                            const Icon(Icons.phone_outlined, size: 13, color: AppColors.gray400),
                            const SizedBox(width: 4),
                            Text(app.driverPhone!, style: AppTextStyles.caption),
                          ],
                        ),
                    ],
                  ),
                ),
              ],
            ),
            if (app.message != null && app.message!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.gray50,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '"${app.message}"',
                  style: AppTextStyles.body.copyWith(
                    color: AppColors.gray600,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.chat_bubble_outline, size: 16),
                    label: const Text('Chatear'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.secondary,
                      side: const BorderSide(color: AppColors.secondary),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    onPressed: accepting ? null : () => _openChat(context, ref),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.check_circle_outline, size: 16),
                    label: const Text('Asignar'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: AppColors.secondary,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 0,
                    ),
                    onPressed: accepting ? null : onAccept,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
