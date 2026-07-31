import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/socket_client.dart';
import '../../../auth/data/providers/auth_provider.dart';
import '../models/chat_models.dart';
import '../repositories/chat_repository.dart';

// autoDispose: se libera al salir de la pantalla de conversaciones
final conversationsProvider =
    AsyncNotifierProvider.autoDispose<ConversationsNotifier, List<ConversationModel>>(
  ConversationsNotifier.new,
);

class ConversationsNotifier
    extends AutoDisposeAsyncNotifier<List<ConversationModel>> {
  @override
  Future<List<ConversationModel>> build() async {
    final socket = ref.read(socketClientProvider);
    await socket.connect();
    socket.on('chat.message', (_) => refresh());
    // Limpia el listener al salir de la pantalla
    ref.onDispose(() => socket.off('chat.message'));
    return _fetch();
  }

  String? get _myId => ref.read(authStateProvider).value?.id;

  Future<List<ConversationModel>> _fetch() =>
      ref.read(chatRepositoryProvider).getConversations(myUserId: _myId);

  Future<void> refresh() async {
    state = AsyncData(await _fetch());
  }
}

// autoDispose.family: se libera al salir del chat; arg = conversationId
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
    final socket = ref.read(socketClientProvider);
    await socket.connect();
    socket.joinRoom('conversation:$_conversationId');
    socket.on('chat.message', (data) {
      final msg = MessageModel.fromJson(
          data as Map<String, dynamic>, myUserId: _myId);
      if (msg.conversationId == _conversationId) {
        state = AsyncData([...?state.value, msg]);
      }
    });
    ref.onDispose(() => socket.off('chat.message'));
    return ref
        .read(chatRepositoryProvider)
        .getMessages(_conversationId, myUserId: _myId);
  }

  String? get _myId => ref.read(authStateProvider).value?.id;

  Future<void> send(String content) async {
    final msg = await ref.read(chatRepositoryProvider).sendMessage(
          _conversationId,
          content,
          myUserId: _myId,
        );
    state = AsyncData([...?state.value, msg]);
  }
}
