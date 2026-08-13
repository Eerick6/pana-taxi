import 'dart:async';
import 'package:camera/camera.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

/// Selfies de verificación de seguridad durante un viaje: automáticas y
/// silenciosas (sin preview, sin pedirle nada al conductor), en 2 momentos —
/// a los 2 minutos de iniciar y a la mitad del tiempo estimado del viaje.
///
/// Requiere que la app esté en primer plano — iOS/Android no permiten acceso
/// a la cámara con la app cerrada o en background, así que si el conductor
/// minimiza la app durante esa ventana, la captura simplemente falla en
/// silencio y no se reintenta (no es una falla de red que valga reintentar).
class SafetyCheckService {
  SafetyCheckService(this._dio);
  final Dio _dio;

  final List<Timer> _timers = [];
  String? _activeTripId;

  void start({required String tripId, required int? estimatedDurationMin}) {
    if (_activeTripId == tripId) return; // ya programado para este viaje
    stop();
    _activeTripId = tripId;

    _timers.add(Timer(const Duration(minutes: 2), () => _captureAndUpload(tripId)));

    if (estimatedDurationMin != null && estimatedDurationMin > 4) {
      final midpoint = Duration(minutes: (estimatedDurationMin / 2).round());
      _timers.add(Timer(midpoint, () => _captureAndUpload(tripId)));
    }
  }

  void stop() {
    for (final t in _timers) {
      t.cancel();
    }
    _timers.clear();
    _activeTripId = null;
  }

  Future<void> _captureAndUpload(String tripId) async {
    CameraController? controller;
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) return;
      final front = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );
      controller = CameraController(front, ResolutionPreset.low, enableAudio: false);
      await controller.initialize();

      // Pequeña espera para que el sensor ajuste exposición antes de disparar
      await Future.delayed(const Duration(milliseconds: 400));
      final file = await controller.takePicture();

      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(file.path, filename: 'selfie.jpg'),
      });
      await _dio.post(
        '/driver-safety/trips/$tripId/selfie',
        data: formData,
        options: Options(contentType: 'multipart/form-data'),
      );
      debugPrint('[SafetyCheck] selfie enviada para trip $tripId');
    } catch (e) {
      debugPrint('[SafetyCheck] error: $e');
    } finally {
      await controller?.dispose();
    }
  }
}
