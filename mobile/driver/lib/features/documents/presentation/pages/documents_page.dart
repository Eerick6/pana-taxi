import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/models/document_model.dart';
import '../../data/providers/document_provider.dart';

class DocumentsPage extends ConsumerStatefulWidget {
  const DocumentsPage({super.key});

  @override
  ConsumerState<DocumentsPage> createState() => _DocumentsPageState();
}

class _DocumentsPageState extends ConsumerState<DocumentsPage> {
  static const _requiredDocs = [
    ('profile_photo', 'Foto de perfil', Icons.person_outlined),
    ('cedula_front', 'Cédula (frente)', Icons.badge_outlined),
    ('cedula_back', 'Cédula (reverso)', Icons.badge_outlined),
    ('license_front', 'Licencia (frente)', Icons.credit_card),
    ('license_back', 'Licencia (reverso)', Icons.credit_card),
  ];

  static const _obligatory = ['cedula_front', 'cedula_back', 'license_front', 'license_back'];

  bool _reviewSent    = false;
  bool _reviewLoading = false;

  @override
  Widget build(BuildContext context) {
    final docsAsync = ref.watch(documentsProvider);

    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        backgroundColor: AppColors.secondary,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: AppColors.white, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text('Mis documentos', style: AppTextStyles.h3.copyWith(color: AppColors.white)),
      ),
      body: docsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('Error cargando documentos', style: AppTextStyles.body),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: () => ref.refresh(documentsProvider), child: const Text('Reintentar')),
            ],
          ),
        ),
        data: (docs) {
          final docMap = <String, DocumentModel>{};
          for (final d in docs) {
            docMap.putIfAbsent(d.type, () => d);
          }
          final anyObligatoryUploaded = _obligatory.any((t) => docMap.containsKey(t));
          return RefreshIndicator(
            onRefresh: () async => ref.refresh(documentsProvider),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _SummaryCard(docs: docs, total: _requiredDocs.length),
                const SizedBox(height: 16),
                Text('Documentos requeridos', style: AppTextStyles.labelLg),
                const SizedBox(height: 10),
                ..._requiredDocs.map(
                  (d) => _DocumentCard(
                    type: d.$1,
                    label: d.$2,
                    icon: d.$3,
                    document: docMap[d.$1],
                    onUpload: () => _pickAndUpload(context, d.$1),
                  ),
                ),
                const SizedBox(height: 20),
                if (anyObligatoryUploaded)
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: _reviewSent
                        ? OutlinedButton.icon(
                            onPressed: null,
                            icon: const Icon(Icons.check_circle_outline, size: 18, color: Colors.green),
                            label: const Text('Revisión solicitada — te avisaremos'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.green,
                              side: const BorderSide(color: Colors.green),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            ),
                          )
                        : OutlinedButton.icon(
                            onPressed: _reviewLoading ? null : _requestReview,
                            icon: _reviewLoading
                                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Icon(Icons.send_outlined, size: 18),
                            label: const Text('Notificar al equipo que estoy listo'),
                            style: OutlinedButton.styleFrom(
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            ),
                          ),
                  ),
                const SizedBox(height: 8),
                if (anyObligatoryUploaded && !_reviewSent)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Text(
                      'Sube todos tus documentos y luego pulsa el botón para que el equipo los revise.',
                      style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
                      textAlign: TextAlign.center,
                    ),
                  ),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _requestReview() async {
    setState(() => _reviewLoading = true);
    try {
      await ref.read(dioProvider).patch('/drivers/me/request-review');
      if (!mounted) return;
      setState(() { _reviewSent = true; _reviewLoading = false; });
    } catch (_) {
      if (!mounted) return;
      setState(() => _reviewLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No se pudo enviar la solicitud. Intenta de nuevo.'),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  Future<void> _pickAndUpload(BuildContext context, String type) async {
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
      await ref.read(documentsProvider.notifier).upload(type, File(picked.path));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Documento guardado correctamente'),
            backgroundColor: Colors.green,
            behavior: SnackBarBehavior.floating,
          ),
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
  const _SummaryCard({required this.docs, required this.total});
  final List<DocumentModel> docs;
  final int total;

  @override
  Widget build(BuildContext context) {
    // Conservar solo el más reciente por tipo (backend devuelve DESC)
    final newestByType = <String, DocumentModel>{};
    for (final d in docs) {
      newestByType.putIfAbsent(d.type, () => d);
    }
    final approved = newestByType.values.where((d) => d.isApproved).length;
    final pending  = newestByType.values.where((d) => d.isPending).length;
    final rejected = newestByType.values.where((d) => d.isRejected).length;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.secondary,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Estado de documentos', style: AppTextStyles.label.copyWith(color: AppColors.gray400)),
          const SizedBox(height: 12),
          LinearProgressIndicator(
            value: approved / total,
            backgroundColor: AppColors.gray600,
            valueColor: const AlwaysStoppedAnimation(AppColors.primary),
            borderRadius: BorderRadius.circular(4),
            minHeight: 6,
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _StatChip(label: 'Aprobados', count: approved, color: Colors.green),
              _StatChip(label: 'Pendientes', count: pending, color: AppColors.warningText),
              _StatChip(label: 'Rechazados', count: rejected, color: AppColors.errorText),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.label, required this.count, required this.color});
  final String label;
  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('$count', style: AppTextStyles.h2.copyWith(color: color)),
        Text(label, style: AppTextStyles.caption.copyWith(color: AppColors.gray400)),
      ],
    );
  }
}

class _DocumentCard extends StatelessWidget {
  const _DocumentCard({
    required this.type,
    required this.label,
    required this.icon,
    required this.onUpload,
    this.document,
  });

  final String type;
  final String label;
  final IconData icon;
  final DocumentModel? document;
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
              Text(doc!.rejectionReason!, style: AppTextStyles.caption.copyWith(color: AppColors.errorText), maxLines: 2),
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
}
