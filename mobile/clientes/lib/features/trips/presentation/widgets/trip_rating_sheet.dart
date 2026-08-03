import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';

Future<void> showTripRatingSheet(
  BuildContext context,
  WidgetRef ref,
  String tripId,
) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    isDismissible: false,
    enableDrag: false,
    builder: (_) => _TripRatingSheet(tripId: tripId, dio: ref.read(dioProvider)),
  );
}

class _TripRatingSheet extends StatefulWidget {
  const _TripRatingSheet({required this.tripId, required this.dio});
  final String tripId;
  final Dio dio;

  @override
  State<_TripRatingSheet> createState() => _TripRatingSheetState();
}

class _TripRatingSheetState extends State<_TripRatingSheet> {
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
        const SnackBar(content: Text('Selecciona una calificación'), behavior: SnackBarBehavior.floating),
      );
      return;
    }
    setState(() => _loading = true);
    try {
      await widget.dio.post('/ratings', data: {
        'direction': 'client_to_driver',
        'trip_id': widget.tripId,
        'score': _score,
        if (_commentCtrl.text.trim().isNotEmpty) 'comment': _commentCtrl.text.trim(),
      });
    } catch (_) {
      // No bloqueamos al usuario si la calificación falla
    } finally {
      if (mounted) Navigator.pop(context);
    }
  }

  void _skip() => Navigator.pop(context);

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
              width: 40, height: 4,
              decoration: BoxDecoration(color: AppColors.gray300, borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 20),
            const Icon(Icons.star_rounded, color: AppColors.primary, size: 48),
            const SizedBox(height: 12),
            Text('¿Cómo fue tu viaje?', style: AppTextStyles.h3),
            const SizedBox(height: 4),
            Text('Tu calificación ayuda a mejorar el servicio', style: AppTextStyles.body.copyWith(color: AppColors.gray400)),
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
                      size: 44,
                    ),
                  ),
                );
              }),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _commentCtrl,
              maxLines: 3,
              maxLength: 300,
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
            const SizedBox(height: 12),
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
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.secondary))
                    : const Text('Enviar calificación', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _loading ? null : _skip,
              child: Text('Omitir', style: AppTextStyles.body.copyWith(color: AppColors.gray400)),
            ),
          ],
        ),
      ),
    );
  }
}
