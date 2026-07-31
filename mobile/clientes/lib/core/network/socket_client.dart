import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/app_env.dart';
import '../storage/secure_storage.dart';

final socketClientProvider = Provider<SocketClient>((ref) {
  return SocketClient(ref.read(secureStorageProvider));
});

class SocketClient {
  SocketClient(this._storage);

  final SecureStorage _storage;
  io.Socket? _socket;

  bool get isConnected => _socket?.connected ?? false;

  static String get _wsUrl {
    final base = AppEnv.baseUrl;
    return base.replaceFirst('http://', 'ws://').replaceFirst('https://', 'wss://');
  }

  Future<void> connect() async {
    if (isConnected) return;
    final token = await _storage.getAccessToken();

    _socket = io.io(
      _wsUrl,
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
      if (AppEnv.isDev) debugPrint('[WS-client] connected ${_socket!.id}');
    });
    _socket!.onDisconnect((_) {
      if (AppEnv.isDev) debugPrint('[WS-client] disconnected');
    });
    _socket!.onConnectError((e) {
      if (AppEnv.isDev) debugPrint('[WS-client] connect error: $e');
    });
  }

  void on(String event, Function(dynamic) handler) => _socket?.on(event, handler);
  void off(String event) => _socket?.off(event);
  void emit(String event, [dynamic data]) => _socket?.emit(event, data);

  void joinTripRoom(String tripId) => emit('trip.subscribe', {'trip_id': tripId});
  void leaveTripRoom(String tripId) => emit('trip.unsubscribe', {'trip_id': tripId});

  void disconnect() {
    _socket?.disconnect();
    _socket = null;
  }
}
