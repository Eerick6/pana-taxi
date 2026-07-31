import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorage {
  final _s = const FlutterSecureStorage();

  Future<void> saveTokens({required String access, required String refresh}) async {
    await _s.write(key: 'access_token', value: access);
    await _s.write(key: 'refresh_token', value: refresh);
  }

  Future<String?> getAccessToken()  => _s.read(key: 'access_token');
  Future<String?> getRefreshToken() => _s.read(key: 'refresh_token');
  Future<void>    clearAll()        => _s.deleteAll();
}

final secureStorageProvider = Provider<SecureStorage>((_) => SecureStorage());
