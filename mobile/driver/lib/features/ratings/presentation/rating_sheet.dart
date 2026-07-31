import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_text_styles.dart';
import '../data/repositories/ratings_repository.dart';
import '../data/providers/ratings_provider.dart';

// ── Widget reutilizable: estrellas + puntaje ───────────────────────────────────

class RatingBadge extends ConsumerWidget {
  const RatingBadge.driver({super.key, required this.driverId}) : _type = 'driver', _ownerId = null;
  const RatingBadge.owner({super.key, required String ownerId}) : _type = 'owner', driverId = null, _ownerId = ownerId;

  final String? driverId;
  final String? _ownerId;
  final String _type;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (_type == 'driver' && driverId != null) {
      final s = ref.watch(driverRatingStatsProvider(driverId!));
      return s.when(
        loading: () => const _StarBadge(avg: 0, total: 0, loading: true),
        error: (_, __) => const SizedBox.shrink(),
        data: (stats) => _StarBadge(avg: stats.overallAvg, total: stats.total),
      );
    }
    if (_type == 'owner' && _ownerId != null) {
      final s = ref.watch(ownerRatingStatsProvider(_ownerId!));
      return s.when(
        loading: () => const _StarBadge(avg: 0, total: 0, loading: true),
        error: (_, __) => const SizedBox.shrink(),
        data: (stats) => _StarBadge(avg: stats.average, total: stats.total),
      );
    }
    return const SizedBox.shrink();
  }
}

class _StarBadge extends StatelessWidget {
  const _StarBadge({required this.avg, required this.total, this.loading = false});
  final double avg;
  final int total;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    if (loading) return const SizedBox(width: 40, height: 12);
    final hasRatings = total > 0;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.star_rounded,
            color: hasRatings ? AppColors.primary : AppColors.gray300, size: 14),
        const SizedBox(width: 3),
        Text(
          hasRatings ? avg.toStringAsFixed(1) : 'Nuevo',
          style: AppTextStyles.caption.copyWith(
            fontWeight: hasRatings ? FontWeight.w600 : FontWeight.normal,
            color: hasRatings ? null : AppColors.gray400,
          ),
        ),
        if (hasRatings) ...[
          const SizedBox(width: 2),
          Text('($total)', style: AppTextStyles.caption),
        ],
      ],
    );
  }
}

Future<void> showRatingSheet({
  required BuildContext context,
  required WidgetRef ref,
  required String title,
  required String subtitle,
  required String direction,
  String? vehicleRequestId,
  String? tripId,
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _RatingSheet(
      title: title,
      subtitle: subtitle,
      direction: direction,
      vehicleRequestId: vehicleRequestId,
      tripId: tripId,
      ratingsRepo: ref.read(ratingsRepositoryProvider),
    ),
  );
}

class _RatingSheet extends StatefulWidget {
  const _RatingSheet({
    required this.title,
    required this.subtitle,
    required this.direction,
    required this.ratingsRepo,
    this.vehicleRequestId,
    this.tripId,
  });

  final String title;
  final String subtitle;
  final String direction;
  final String? vehicleRequestId;
  final String? tripId;
  final RatingsRepository ratingsRepo;

  @override
  State<_RatingSheet> createState() => _RatingSheetState();
}

class _RatingSheetState extends State<_RatingSheet> {
  int _score = 0;
  final _commentCtrl = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_score == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Selecciona una calificación'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    setState(() => _loading = true);
    try {
      await widget.ratingsRepo.submitRating(
        direction: widget.direction,
        vehicleRequestId: widget.vehicleRequestId,
        tripId: widget.tripId,
        score: _score,
        comment: _commentCtrl.text.trim(),
      );
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('¡Gracias por tu calificación!'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
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
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.gray300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 20),
            Text(widget.title, style: AppTextStyles.h3),
            const SizedBox(height: 4),
            Text(widget.subtitle, style: AppTextStyles.body.copyWith(color: AppColors.gray400)),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(5, (i) {
                final star = i + 1;
                return GestureDetector(
                  onTap: () => setState(() => _score = star),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    child: Icon(
                      star <= _score ? Icons.star_rounded : Icons.star_outline_rounded,
                      color: AppColors.primary,
                      size: 40,
                    ),
                  ),
                );
              }),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _commentCtrl,
              maxLines: 3,
              maxLength: 500,
              decoration: InputDecoration(
                hintText: 'Comentario opcional...',
                hintStyle: AppTextStyles.body.copyWith(color: AppColors.gray400),
                filled: true,
                fillColor: AppColors.gray50,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.all(14),
                counterStyle: AppTextStyles.caption,
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: AppColors.secondary,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  elevation: 0,
                ),
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.secondary),
                      )
                    : const Text('Enviar calificación', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
