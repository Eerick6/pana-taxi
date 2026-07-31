import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/models/chat_models.dart';
import '../../data/providers/chat_provider.dart';

class ChatListPage extends ConsumerWidget {
  const ChatListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final convsAsync = ref.watch(conversationsProvider);

    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        backgroundColor: AppColors.secondary,
        title: Text('Mensajes', style: AppTextStyles.h3.copyWith(color: AppColors.white)),
      ),
      body: convsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.chat_bubble_outline, size: 56, color: AppColors.gray300),
              const SizedBox(height: 12),
              Text('Error cargando mensajes', style: AppTextStyles.body),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () => ref.refresh(conversationsProvider),
                child: const Text('Reintentar'),
              ),
            ],
          ),
        ),
        data: (convs) => convs.isEmpty
            ? Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.chat_bubble_outline, size: 64, color: AppColors.gray300),
                    const SizedBox(height: 16),
                    Text('Sin conversaciones', style: AppTextStyles.body.copyWith(color: AppColors.gray400)),
                    const SizedBox(height: 8),
                    Text('Los mensajes aparecerán aquí', style: AppTextStyles.caption),
                  ],
                ),
              )
            : RefreshIndicator(
                onRefresh: () => ref.read(conversationsProvider.notifier).refresh(),
                child: ListView.separated(
                  itemCount: convs.length,
                  separatorBuilder: (context, i) => const Divider(height: 1, indent: 72),
                  itemBuilder: (_, i) => _ConvTile(conv: convs[i]),
                ),
              ),
      ),
    );
  }
}

class _ConvTile extends StatelessWidget {
  const _ConvTile({required this.conv});
  final ConversationModel conv;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final time = conv.lastMessageAt;
    final timeStr = time == null
        ? ''
        : time.day == now.day && time.month == now.month && time.year == now.year
            ? '${time.toLocal().hour.toString().padLeft(2, '0')}:${time.toLocal().minute.toString().padLeft(2, '0')}'
            : '${time.toLocal().day.toString().padLeft(2, '0')}/${time.toLocal().month.toString().padLeft(2, '0')}';

    final typeIcon = switch (conv.type) {
      'driver_client' => Icons.person_outline,
      'driver_owner' => Icons.directions_car_outlined,
      'driver_operator' => Icons.business_outlined,
      _ => Icons.chat_bubble_outline,
    };

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      leading: Stack(
        children: [
          CircleAvatar(
            radius: 26,
            backgroundColor: AppColors.primaryLight,
            child: Icon(typeIcon, color: AppColors.secondary, size: 24),
          ),
          if (conv.unreadCount > 0)
            Positioned(
              right: 0,
              top: 0,
              child: Container(
                width: 18,
                height: 18,
                decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
                child: Center(
                  child: Text(
                    conv.unreadCount > 9 ? '9+' : '${conv.unreadCount}',
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ),
        ],
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              conv.otherName,
              style: AppTextStyles.labelLg.copyWith(
                fontWeight: conv.unreadCount > 0 ? FontWeight.bold : FontWeight.w500,
              ),
            ),
          ),
          Text(timeStr, style: AppTextStyles.caption),
        ],
      ),
      subtitle: conv.lastMessage != null
          ? Text(
              conv.lastMessage!,
              style: AppTextStyles.body.copyWith(
                color: conv.unreadCount > 0 ? AppColors.secondary : AppColors.gray400,
                fontWeight: conv.unreadCount > 0 ? FontWeight.w500 : FontWeight.normal,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            )
          : null,
      onTap: () => context.push('/chat/${conv.id}'),
    );
  }
}
