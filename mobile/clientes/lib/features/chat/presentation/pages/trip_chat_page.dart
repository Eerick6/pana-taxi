import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/models/chat_models.dart';
import '../../data/providers/chat_provider.dart';

class TripChatPage extends ConsumerStatefulWidget {
  const TripChatPage({super.key, required this.conversationId, this.driverName});
  final String conversationId;
  final String? driverName;

  @override
  ConsumerState<TripChatPage> createState() => _TripChatPageState();
}

class _TripChatPageState extends ConsumerState<TripChatPage> {
  final _ctrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  bool _sending = false;

  @override
  void dispose() {
    _ctrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    _ctrl.clear();
    try {
      await ref.read(messagesProvider(widget.conversationId).notifier).send(text);
      _scrollToBottom();
    } catch (_) {
      _ctrl.text = text;
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final msgsAsync = ref.watch(messagesProvider(widget.conversationId));
    if (msgsAsync.hasValue) _scrollToBottom();

    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        backgroundColor: AppColors.secondary,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: AppColors.white, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(widget.driverName ?? 'Conductor', style: AppTextStyles.label.copyWith(color: AppColors.white, fontSize: 16)),
            Text('Chat con tu conductor', style: AppTextStyles.caption.copyWith(color: AppColors.white.withValues(alpha: 0.7))),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: msgsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
              error: (e, _) => Center(child: Text('Error: $e')),
              data: (msgs) => msgs.isEmpty
                  ? Center(child: Text('Inicia la conversación', style: AppTextStyles.body.copyWith(color: AppColors.gray400)))
                  : ListView.builder(
                      controller: _scrollCtrl,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      itemCount: msgs.length,
                      itemBuilder: (_, i) {
                        final showDate = i == 0 || msgs[i].createdAt.day != msgs[i - 1].createdAt.day;
                        return Column(children: [
                          if (showDate) _DateDivider(date: msgs[i].createdAt),
                          _MessageBubble(message: msgs[i]),
                        ]);
                      },
                    ),
            ),
          ),
          Container(
            width: double.infinity,
            color: AppColors.secondary.withValues(alpha: 0.07),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Row(children: [
              const Icon(Icons.shield_outlined, size: 14, color: AppColors.secondary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Este chat es monitoreado por Pana Taxi para tu seguridad.',
                  style: AppTextStyles.caption.copyWith(color: AppColors.secondary),
                ),
              ),
            ]),
          ),
          Container(
            color: AppColors.white,
            padding: EdgeInsets.only(
              left: 16, right: 8, top: 8,
              bottom: MediaQuery.of(context).padding.bottom + 8,
            ),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _ctrl,
                  maxLines: 4,
                  minLines: 1,
                  keyboardType: TextInputType.multiline,
                  textCapitalization: TextCapitalization.sentences,
                  style: AppTextStyles.body,
                  decoration: InputDecoration(
                    hintText: 'Escribe un mensaje...',
                    hintStyle: AppTextStyles.body.copyWith(color: AppColors.gray400),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    filled: true,
                    fillColor: AppColors.gray100,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(24),
                      borderSide: BorderSide.none,
                    ),
                  ),
                  onSubmitted: (_) => _send(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: _sending ? null : _send,
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  padding: const EdgeInsets.all(12),
                ),
                icon: _sending
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.secondary))
                    : const Icon(Icons.send_rounded, color: AppColors.secondary, size: 20),
              ),
            ]),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});
  final MessageModel message;

  @override
  Widget build(BuildContext context) {
    final isMe = message.isMe;
    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 6),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
        decoration: BoxDecoration(
          color: isMe ? AppColors.secondary : AppColors.white,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(18),
            topRight: const Radius.circular(18),
            bottomLeft: Radius.circular(isMe ? 18 : 4),
            bottomRight: Radius.circular(isMe ? 4 : 18),
          ),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 4, offset: const Offset(0, 2))],
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              message.content,
              style: AppTextStyles.body.copyWith(color: isMe ? AppColors.white : AppColors.secondary),
            ),
            const SizedBox(height: 4),
            Text(
              _fmtTime(message.createdAt.toLocal()),
              style: AppTextStyles.caption.copyWith(
                color: isMe ? AppColors.white.withValues(alpha: 0.6) : AppColors.gray400,
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DateDivider extends StatelessWidget {
  const _DateDivider({required this.date});
  final DateTime date;

  String _fmtDay(DateTime d) {
    const months = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return '${d.day} ${months[d.month]}';
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 12),
    child: Row(children: [
      const Expanded(child: Divider()),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Text(_fmtDay(date), style: AppTextStyles.caption),
      ),
      const Expanded(child: Divider()),
    ]),
  );
}

String _fmtTime(DateTime d) =>
    '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
