import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/models/vehicle_model.dart';
import '../../data/providers/vehicle_provider.dart';

class VehicleDocumentsPage extends ConsumerWidget {
  const VehicleDocumentsPage({super.key, required this.vehicleId});

  final String vehicleId;

  static const _requiredDocs = [
    ('matricula', 'Matrícula', Icons.article_outlined),
    ('soat', 'SOAT', Icons.shield_outlined),
    ('technical_review', 'Revisión técnica', Icons.build_outlined),
    ('vehicle_photo', 'Foto del vehículo', Icons.directions_car_outlined),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final docsAsync = ref.watch(vehicleDocumentsProvider(vehicleId));

    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        backgroundColor: AppColors.secondary,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: AppColors.white, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text('Documentos del taxi', style: AppTextStyles.h3.copyWith(color: AppColors.white)),
      ),
      body: docsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('Error: $e', style: AppTextStyles.body),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () => ref.invalidate(vehicleDocumentsProvider(vehicleId)),
                child: const Text('Reintentar'),
              ),
            ],
          ),
        ),
        data: (docs) {
          final docMap = {for (final d in docs) d.type: d};
          final approved = docs.where((d) => d.isApproved).length;
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(vehicleDocumentsProvider(vehicleId)),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _SummaryCard(approved: approved, total: _requiredDocs.length),
                const SizedBox(height: 16),
                Text('Documentos requeridos', style: AppTextStyles.labelLg),
                const SizedBox(height: 10),
                ..._requiredDocs.map((d) => _DocCard(
                      type: d.$1,
                      label: d.$2,
                      icon: d.$3,
                      document: docMap[d.$1],
                      onUpload: () => _pickAndUpload(context, ref, d.$1),
                    )),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _pickAndUpload(BuildContext context, WidgetRef ref, String type) async {
    final picker = ImagePicker();
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Tomar foto'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Desde galería'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;

    final picked = await picker.pickImage(source: source, imageQuality: 85);
    if (picked == null) return;

    try {
      await ref.read(vehicleDocumentsProvider(vehicleId).notifier).upload(type, File(picked.path));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Documento enviado para revisión'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error),
        );
      }
    }
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.approved, required this.total});
  final int approved;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.secondary,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Documentos aprobados', style: AppTextStyles.label.copyWith(color: AppColors.gray400)),
          const SizedBox(height: 8),
          Text('$approved / $total', style: AppTextStyles.h2.copyWith(color: AppColors.primaryText)),
          const SizedBox(height: 8),
          LinearProgressIndicator(
            value: total > 0 ? approved / total : 0,
            backgroundColor: AppColors.gray600,
            valueColor: const AlwaysStoppedAnimation(AppColors.primary),
            borderRadius: BorderRadius.circular(4),
            minHeight: 6,
          ),
        ],
      ),
    );
  }
}

class _DocCard extends StatelessWidget {
  const _DocCard({
    required this.type,
    required this.label,
    required this.icon,
    required this.onUpload,
    this.document,
  });

  final String type;
  final String label;
  final IconData icon;
  final VehicleDocumentModel? document;
  final VoidCallback onUpload;

  @override
  Widget build(BuildContext context) {
    final doc = document;
    final (statusColor, statusLabel, statusIcon) = doc == null
        ? (AppColors.gray300, 'Sin subir', Icons.upload_outlined)
        : doc.isApproved
            ? (Colors.green, 'Aprobado', Icons.check_circle_outline)
            : doc.isPending
                ? (AppColors.warningText, 'En revisión', Icons.hourglass_empty)
                : (AppColors.errorText, 'Rechazado', Icons.cancel_outlined);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
        border: doc?.isRejected == true ? Border.all(color: AppColors.error.withValues(alpha: 0.4)) : null,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: statusColor.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: statusColor, size: 22),
        ),
        title: Text(label, style: AppTextStyles.labelLg),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(statusIcon, size: 13, color: statusColor),
                const SizedBox(width: 4),
                Text(statusLabel, style: AppTextStyles.caption.copyWith(color: statusColor)),
              ],
            ),
            if (doc?.rejectionReason != null) ...[
              const SizedBox(height: 2),
              Text(doc!.rejectionReason!,
                  style: AppTextStyles.caption.copyWith(color: AppColors.errorText), maxLines: 2),
            ],
            if (doc?.expiresAt != null) ...[
              const SizedBox(height: 2),
              Text(
                'Vence: ${_formatDate(doc!.expiresAt!)}',
                style: AppTextStyles.caption.copyWith(color: AppColors.gray400),
              ),
            ],
          ],
        ),
        trailing: IconButton(
          onPressed: onUpload,
          icon: Icon(
            doc == null ? Icons.add_circle_outline : Icons.refresh,
            color: AppColors.secondary,
          ),
          tooltip: doc == null ? 'Subir' : 'Reemplazar',
        ),
      ),
    );
  }

  String _formatDate(DateTime date) =>
      '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
}
