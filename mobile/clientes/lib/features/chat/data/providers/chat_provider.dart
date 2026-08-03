import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/socket_client.dart';
import '../../../../core/network/dio_client.dart';
import '../models/chat_models.dart';
import '../repositories/chat_repository.dart';

// Obtiene el ID del usuario autenticado desde el token
final _myUserIdProvider = FutureProvider<String?>((ref) async {
  try {
    final dio = ref.read(dioProvider);
    final res = await dio.get('/auth/me');
    return res.data['id'] as String?;
  } catch (_) {
    return null;
  }
});

final messagesProvider =
    AsyncNotifierProvider.autoDispose
        .family<MessagesNotifier, List<MessageModel>, String>(
  MessagesNotifier.new,
);

class MessagesNotifier
    extends AutoDisposeFamilyAsyncNotifier<List<MessageModel>, String> {
  late String _conversationId;

  @override
  Future<List<MessageModel>> build(String conversationId) async {
    _conversationId = conversationId;
    final myId = await ref.read(_myUserIdProvider.future);
    final socket = ref.read(socketClientProvider);
    await socket.connect();
    socket.joinRoom('conversation:$_conversationId');
    socket.on('chat.message', (data) {
      final msg = MessageModel.fromJson(data as Map<String, dynamic>, myUserId: myId);
      if (msg.conversationId == _conversationId) {
        state = AsyncData([...?state.value, msg]);
      }
    });
    ref.onDispose(() {
      socket.leaveRoom('conversation:$_conversationId');
      socket.off('chat.message');
    });
    return ref.read(chatRepositoryProvider).getMessages(_conversationId, myUserId: myId);
  }

  Future<void> send(String content) async {
    final myId = ref.read(_myUserIdProvider).value;
    final msg = await ref.read(chatRepositoryProvider).sendMessage(
          _conversationId,
          content,
          myUserId: myId,
        );
    state = AsyncData([...?state.value, msg]);
  }
}
