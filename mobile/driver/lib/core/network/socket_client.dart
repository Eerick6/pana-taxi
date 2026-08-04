import 'dart:async';
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
  Timer? _reconnectTimer;
  bool _destroyed = false;

  io.Socket? get socket => _socket;
  bool get isConnected => _socket?.connected ?? false;

  Future<void> connect() async {
    if (_socket != null) return; // already created — reconnect loop handles the rest
    _destroyed = false;
    final token = await _storage.getAccessToken();

    _socket = io.io(
      AppConfig.wsUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()  // we connect manually after handlers are set
          .disableReconnection() // we handle reconnection with a fresh token each time
          .build(),
    );

    _socket!.onConnect((_) {
      _reconnectTimer?.cancel();
      if (AppConfig.isDev) debugPrint('[WS] connected ${_socket!.id}');
    });
    _socket!.onDisconnect((_) {
      if (AppConfig.isDev) debugPrint('[WS] disconnected');
      _scheduleReconnect();
    });
    _socket!.onConnectError((e) {
      if (AppConfig.isDev) debugPrint('[WS] connect error: $e');
      _scheduleReconnect();
    });

    _socket!.connect();
  }

  void _scheduleReconnect() {
    if (_destroyed) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 2), _reconnect);
  }

  Future<void> _reconnect() async {
    if (_destroyed || isConnected || _socket == null) return;
    try {
      // Always read from storage — the HTTP interceptor may have refreshed the
      // access token between disconnects, so this gets the latest value.
      final token = await _storage.getAccessToken();
      if (token != null) _socket!.auth = {'token': token};
      _socket!.connect();
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void on(String event, Function(dynamic) handler) => _socket?.on(event, handler);
  void off(String event) => _socket?.off(event);
  void emit(String event, dynamic data) => _socket?.emit(event, data);
  void joinRoom(String room) => emit('join', {'room': room});

  void disconnect() {
    _destroyed = true;
    _reconnectTimer?.cancel();
    _socket?.disconnect();
    _socket?.destroy();
    _socket = null;
  }
}
