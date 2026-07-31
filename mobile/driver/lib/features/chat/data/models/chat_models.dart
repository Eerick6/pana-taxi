class ConversationModel {
  const ConversationModel({
    required this.id,
    required this.type,
    required this.participants,
    required this.unreadCount,
    this.lastMessage,
    this.lastMessageAt,
  });

  final String id;
  final String type;
  final List<ParticipantModel> participants;
  final int unreadCount;
  final String? lastMessage;
  final DateTime? lastMessageAt;

  String get otherName {
    final others = participants.where((p) => !p.isMe).toList();
    return others.isNotEmpty ? others.first.name : 'Conversación';
  }

  factory ConversationModel.fromJson(Map<String, dynamic> json, {String? myUserId}) {
    // Backend uses participant_a / participant_b, not a participants array
    final pa = json['participant_a'] as Map<String, dynamic>?;
    final pb = json['participant_b'] as Map<String, dynamic>?;
    final parts = <ParticipantModel>[
      if (pa != null) ParticipantModel.fromJson(pa, myUserId: myUserId),
      if (pb != null) ParticipantModel.fromJson(pb, myUserId: myUserId),
    ];

    final lm = json['last_message'] as Map<String, dynamic>?;
    return ConversationModel(
      id: json['id'] as String,
      type: json['type'] as String? ?? 'unknown',
      participants: parts,
      unreadCount: json['unread_count'] as int? ?? 0,
      lastMessage: lm?['content'] as String?,
      lastMessageAt: json['last_message_at'] != null
          ? DateTime.parse(json['last_message_at'] as String)
          : null,
    );
  }
}

class ParticipantModel {
  const ParticipantModel({required this.id, required this.name, required this.isMe});
  final String id;
  final String name;
  final bool isMe;

  factory ParticipantModel.fromJson(Map<String, dynamic> json, {String? myUserId}) =>
      ParticipantModel(
        id: json['id'] as String,
        name: json['full_name'] as String? ?? json['phone'] as String? ?? json['email'] as String? ?? 'Usuario',
        isMe: myUserId != null && json['id'] == myUserId,
      );
}

class MessageModel {
  const MessageModel({
    required this.id,
    required this.content,
    required this.senderName,
    required this.isMe,
    required this.createdAt,
    this.conversationId,
    this.senderId,
  });

  final String id;
  final String content;
  final String senderName;
  final bool isMe;
  final DateTime createdAt;
  final String? conversationId;
  final String? senderId;

  factory MessageModel.fromJson(Map<String, dynamic> json, {String? myUserId}) {
    final sender = json['sender'] as Map<String, dynamic>?;
    final senderId = sender?['id'] as String? ?? json['sender_id'] as String?;
    final isMe = myUserId != null && senderId == myUserId;
    return MessageModel(
      id: json['id'] as String,
      content: json['content'] as String,
      senderName: sender?['full_name'] as String? ?? sender?['phone'] as String? ?? sender?['email'] as String? ?? 'Usuario',
      isMe: isMe,
      createdAt: DateTime.parse(json['created_at'] as String),
      conversationId: json['conversation_id'] as String?,
      senderId: senderId,
    );
  }
}
