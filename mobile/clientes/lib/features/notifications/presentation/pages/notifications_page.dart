import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';

class _Notif {
  const _Notif({required this.id, required this.title, required this.body, required this.createdAt, this.read = false});
  final String id;
  final String title;
  final String body;
  final DateTime createdAt;
  final bool read;

  factory _Notif.fromJson(Map<String, dynamic> j) => _Notif(
    id:        j['id']    as String,
    title:     j['title'] as String? ?? '',
    body:      j['body']  as String? ?? '',
    createdAt: DateTime.tryParse(j['created_at'] as String? ?? '')?.toLocal() ?? DateTime.now(),
    read:      j['read']  as bool? ?? false,
  );
}

final _notifsProvider = FutureProvider.autoDispose<List<_Notif>>((ref) async {
  try {
    final dio = ref.read(dioProvider);
    final res = await dio.get('/notifications/me');
    final list = res.data as List? ?? [];
    return list.map((e) => _Notif.fromJson(e as Map<String, dynamic>)).toList();
  } catch (_) {
    return [];
  }
});

class NotificationsPage extends ConsumerWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_notifsProvider);

    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        title: Text('Notificaciones', style: AppTextStyles.h3),
        backgroundColor: Colors.white,
        foregroundColor: AppColors.gray800,
        elevation: 0,
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (_, __) => _empty('Error al cargar notificaciones'),
        data: (items) => items.isEmpty
            ? _empty('Sin notificaciones por ahora')
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) => _NotifTile(notif: items[i]),
              ),
      ),
    );
  }

  Widget _empty(String msg) => Center(
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.notifications_none, size: 56, color: AppColors.gray300),
      const SizedBox(height: 12),
      Text(msg, style: AppTextStyles.body.copyWith(color: AppColors.gray400)),
    ]),
  );
}

class _NotifTile extends StatelessWidget {
  const _NotifTile({required this.notif});
  final _Notif notif;

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1)  return 'Ahora mismo';
    if (diff.inMinutes < 60) return 'Hace ${diff.inMinutes} min';
    if (diff.inHours   < 24) return 'Hace ${diff.inHours} h';
    return 'Hace ${diff.inDays} días';
  }

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: notif.read ? Colors.white : AppColors.primary.withValues(alpha: 0.06),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: notif.read ? AppColors.gray100 : AppColors.primary.withValues(alpha: 0.2)),
    ),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
        width: 36, height: 36,
        decoration: BoxDecoration(
          color: AppColors.primary.withValues(alpha: 0.15),
          shape: BoxShape.circle,
        ),
        child: const Icon(Icons.notifications_outlined, size: 18, color: AppColors.secondary),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(notif.title, style: AppTextStyles.label),
          const SizedBox(height: 2),
          Text(notif.body, style: AppTextStyles.caption.copyWith(color: AppColors.gray600), maxLines: 2, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 4),
          Text(_timeAgo(notif.createdAt), style: AppTextStyles.caption.copyWith(color: AppColors.gray400)),
        ]),
      ),
      if (!notif.read)
        Container(width: 8, height: 8, margin: const EdgeInsets.only(top: 4), decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
    ]),
  );
}
