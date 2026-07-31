import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_client.dart';
import '../models/chat_models.dart';

final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  return ChatRepository(ref.read(dioProvider));
});

class ChatRepository {
  ChatRepository(this._dio);
  final Dio _dio;

  Future<List<ConversationModel>> getConversations({String? myUserId}) async {
    try {
      final res = await _dio.get('/chat/conversations');
      final data = res.data;
      final items = (data is List ? data : (data['items'] ?? data['data'] ?? [])) as List;
      return items
          .map((e) => ConversationModel.fromJson(e as Map<String, dynamic>, myUserId: myUserId))
          .toList();
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al cargar conversaciones');
    }
  }

  Future<List<MessageModel>> getMessages(String conversationId, {String? myUserId}) async {
    try {
      final res = await _dio.get('/chat/conversations/$conversationId/messages');
      final data = res.data;
      final items = (data is List ? data : (data['items'] ?? data['data'] ?? [])) as List;
      return items
          .map((e) => MessageModel.fromJson(e as Map<String, dynamic>, myUserId: myUserId))
          .toList();
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al cargar mensajes');
    }
  }

  Future<String> openApplicantConversation(String applicationId) async {
    try {
      final res = await _dio.post('/chat/applicant/open', data: {'application_id': applicationId});
      return res.data['id'] as String;
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al abrir chat');
    }
  }

  Future<MessageModel> sendMessage(String conversationId, String content,
      {String? myUserId}) async {
    try {
      final res = await _dio.post('/chat/messages', data: {
        'conversation_id': conversationId,
        'content': content,
      });
      return MessageModel.fromJson(res.data as Map<String, dynamic>, myUserId: myUserId);
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      throw Exception(msg is List ? msg.first : msg ?? 'Error al enviar mensaje');
    }
  }
}
