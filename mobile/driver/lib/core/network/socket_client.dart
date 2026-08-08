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
  // Cancelled if the server disconnects before the grace period elapses,
  // so that a server-side auth rejection doesn't reset the failure counter.
  Timer? _connectedGraceTimer;
  bool _destroyed = false;
  int _consecutiveFailures = 0;

  // Set this before connecting to be notified when auth fails persistently.
  VoidCallback? onAuthFailed;

  static const int _maxConsecutiveFailures = 4;
  static const Duration _connectionGrace = Duration(seconds: 5);

  io.Socket? get socket => _socket;
  bool get isConnected => _socket?.connected ?? false;

  Future<void> connect() async {
    if (_socket != null) return; // already created — reconnect loop handles the rest
    _destroyed = false;
    _consecutiveFailures = 0;
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
      // Wait for a grace period before resetting the failure counter.
      // If the server rejects the connection immediately (auth failure) it
      // calls socket.disconnect(true) which fires onDisconnect within ~100ms,
      // cancelling this timer before it fires — so the counter stays intact.
      _connectedGraceTimer?.cancel();
      _connectedGraceTimer = Timer(_connectionGrace, () {
        _consecutiveFailures = 0;
      });
      if (AppConfig.isDev) debugPrint('[WS] connected ${_socket!.id}');
    });
    _socket!.onDisconnect((_) {
      _connectedGraceTimer?.cancel();
      if (AppConfig.isDev) debugPrint('[WS] disconnected');
      _scheduleReconnect();
    });
    _socket!.onConnectError((e) {
      if (AppConfig.isDev) debugPrint('[WS] connect error: $e');
      _scheduleReconnect();
    });
    _socket!.on('error', (_) {/* suppress unhandled socket errors */});

    _socket!.connect();
  }

  void _scheduleReconnect() {
    if (_destroyed) return;
    // If a timer is already ticking, a second event (e.g. onConnectError AND
    // onDisconnect both firing for the same timeout) would double-count the
    // failure — skip it.
    if (_reconnectTimer?.isActive ?? false) return;
    _consecutiveFailures++;
    if (_consecutiveFailures >= _maxConsecutiveFailures) {
      // Token is likely invalid/expired and refresh isn't working — stop the
      // loop and notify the caller so it can force a re-login.
      _destroyed = true;
      _reconnectTimer?.cancel();
      _connectedGraceTimer?.cancel();
      _socket?.disconnect();
      _socket?.destroy();
      _socket = null;
      if (AppConfig.isDev) {
        debugPrint('[WS] too many consecutive failures — auth likely invalid');
      }
      onAuthFailed?.call();
      return;
    }
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 3), _reconnect);
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
    _connectedGraceTimer?.cancel();
    _socket?.disconnect();
    _socket?.destroy();
    _socket = null;
  }
}
