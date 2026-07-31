import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../auth/presentation/providers/auth_provider.dart';

final _termsContentProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => ref.read(authRepositoryProvider).getClientTerms(),
);

class TermsPage extends ConsumerWidget {
  const TermsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final termsAsync = ref.watch(_termsContentProvider);

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        title: Text('Términos y condiciones', style: AppTextStyles.h3),
      ),
      body: termsAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.primary)),
        error: (_, _) => Center(
            child: Text('Error al cargar términos', style: AppTextStyles.body)),
        data: (data) {
          final version = data['version'] as String? ?? '';
          final content = data['content'] as String? ?? '';
          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 40),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (version.isNotEmpty) ...[
                  Text('Versión $version',
                      style: AppTextStyles.caption
                          .copyWith(color: AppColors.gray500)),
                  const SizedBox(height: 16),
                  const Divider(color: AppColors.gray100),
                  const SizedBox(height: 16),
                ],
                Text(content,
                    style: AppTextStyles.body.copyWith(height: 1.7)),
              ],
            ),
          );
        },
      ),
    );
  }
}
