import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/app_config.dart';
import '../storage/secure_storage.dart';

final socketClientProvider = Provider<SocketClient>((ref) {
  final storage = ref.read(secureStorageProvider);
  return SocketClient(storage);
});

class SocketClient {
  SocketClient(this._storage);

  final SecureStorageService _storage;
  io.Socket? _socket;

  io.Socket? get socket => _socket;
  bool get isConnected => _socket?.connected ?? false;

  Future<void> connect() async {
    if (isConnected) return;
    final token = await _storage.getAccessToken();

    _socket = io.io(
      AppConfig.wsUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(2000)
          .setReconnectionAttempts(10)
          .build(),
    );

    _socket!.onConnect((_) {
      if (AppConfig.isDev) debugPrint('[WS] connected ${_socket!.id}');
    });
    _socket!.onDisconnect((_) {
      if (AppConfig.isDev) debugPrint('[WS] disconnected');
    });
    _socket!.onConnectError((e) {
      if (AppConfig.isDev) debugPrint('[WS] connect error: $e');
    });
  }

  void on(String event, Function(dynamic) handler) {
    _socket?.on(event, handler);
  }

  void off(String event) {
    _socket?.off(event);
  }

  void emit(String event, dynamic data) {
    _socket?.emit(event, data);
  }

  void joinRoom(String room) => emit('join', {'room': room});

  void disconnect() {
    _socket?.disconnect();
    _socket = null;
  }
}
