import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';

enum BiometricResult {
  success,       // autenticó correctamente
  failed,        // falló o canceló activamente
  notConfigured, // dispositivo sin bloqueo configurado → dejar pasar
}

class BiometricService {
  final _auth = LocalAuthentication();

  Future<bool> isAvailable() => _auth.isDeviceSupported();

  Future<BiometricResult> authenticate() async {
    try {
      final ok = await _auth.authenticate(
        localizedReason: 'Confirma tu identidad para entrar a Pana Taxista',
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
        ),
      );
      return ok ? BiometricResult.success : BiometricResult.failed;
    } on PlatformException catch (e) {
      const noCredentials = {
        'NotAvailable',
        'NotEnrolled',
        'PasscodeNotSet',
        'no_fragment_activity',
      };
      if (noCredentials.contains(e.code)) return BiometricResult.notConfigured;
      return BiometricResult.failed;
    }
  }
}

final biometricServiceProvider = Provider<BiometricService>((_) => BiometricService());
