import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../../../../core/services/geocoding_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../domain/entities/place_result.dart';

class PinPickerPage extends ConsumerStatefulWidget {
  const PinPickerPage({
    super.key,
    this.initialLat,
    this.initialLng,
    this.confirmLabel = 'Confirmar destino',
    this.panelTitle = 'Destino seleccionado',
  });

  final double? initialLat;
  final double? initialLng;
  final String confirmLabel;
  final String panelTitle;

  @override
  ConsumerState<PinPickerPage> createState() => _PinPickerPageState();
}

class _PinPickerPageState extends ConsumerState<PinPickerPage> {
  MapLibreMapController? _ctrl;

  double? _lat;
  double? _lng;
  String? _address;
  bool _loading = false;
  bool _moving = false;

  @override
  void initState() {
    super.initState();
    _lat = widget.initialLat;
    _lng = widget.initialLng;
  }

  @override
  void dispose() {
    _ctrl?.removeListener(_onControllerChanged);
    super.dispose();
  }

  void _onControllerChanged() {
    if (!mounted || _loading) return;
    final pos = _ctrl?.cameraPosition?.target;
    if (pos == null) return;
    _lat = pos.latitude;
    _lng = pos.longitude;
    if (!_moving) setState(() => _moving = true);
  }

  @override
  Widget build(BuildContext context) {
    final double initLat = widget.initialLat ?? -0.2295;
    final double initLng = widget.initialLng ?? -78.5243;

    return Scaffold(
      body: Stack(
        children: [
          // ── Mapa + pin fijo, recortados juntos por la barra de 3 botones ────
          // El pin se centra en el mismo Padding que el mapa: si se recortaran
          // por separado, el pin quedaría desalineado del centro real que
          // reporta `cameraPosition.target` (la coordenada que se guarda).
          Padding(
            padding: EdgeInsets.only(bottom: MediaQuery.of(context).padding.bottom),
            child: Stack(
              children: [
                MapLibreMap(
                  onMapCreated: (c) {
                    _ctrl = c;
                    c.addListener(_onControllerChanged);
                  },
                  onCameraIdle: _onIdle,
                  initialCameraPosition: CameraPosition(
                    target: LatLng(initLat, initLng),
                    zoom: 15,
                  ),
                  styleString: 'https://tiles.openfreemap.org/styles/liberty',
                  myLocationEnabled: false,
                  trackCameraPosition: true,
                ),

                // ── Pin fijo en el centro ───────────────────────────────────
                IgnorePointer(
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 120),
                          transform: Matrix4.translationValues(
                            0,
                            _moving ? -14 : 0,
                            0,
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 58,
                                height: 58,
                                decoration: BoxDecoration(
                                  color: const Color(0xFFEA4335),
                                  shape: BoxShape.circle,
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withValues(
                                        alpha: _moving ? 0.38 : 0.28,
                                      ),
                                      blurRadius: _moving ? 18 : 10,
                                      offset: Offset(0, _moving ? 8 : 4),
                                    ),
                                  ],
                                ),
                                child: const Icon(
                                  Icons.location_on,
                                  color: Colors.white,
                                  size: 32,
                                ),
                              ),
                              CustomPaint(
                                size: const Size(18, 10),
                                painter: _TrianglePainter(),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 4),
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 120),
                          width: _moving ? 8 : 12,
                          height: 5,
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(
                              alpha: _moving ? 0.10 : 0.18,
                            ),
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // ── Botón atrás ───────────────────────────────────────────────────
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 12,
            child: SafeArea(
              child: Material(
                color: Colors.white,
                shape: const CircleBorder(),
                elevation: 4,
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: () => Navigator.of(context).pop(),
                  child: const Padding(
                    padding: EdgeInsets.all(10),
                    child: Icon(Icons.arrow_back_ios_new, size: 18),
                  ),
                ),
              ),
            ),
          ),

          // ── Panel inferior ────────────────────────────────────────────────
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black12,
                    blurRadius: 12,
                    offset: Offset(0, -4),
                  ),
                ],
              ),
              padding: EdgeInsets.fromLTRB(
                20,
                20,
                20,
                MediaQuery.of(context).padding.bottom + 20,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.panelTitle,
                    style: AppTextStyles.caption.copyWith(
                      color: AppColors.gray400,
                    ),
                  ),
                  const SizedBox(height: 6),
                  _moving
                      ? Text(
                          'Moviendo…',
                          style: AppTextStyles.body.copyWith(
                            color: AppColors.gray400,
                          ),
                        )
                      : _loading
                      ? Row(
                          children: [
                            const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: AppColors.primary,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Text(
                              'Buscando dirección…',
                              style: AppTextStyles.body.copyWith(
                                color: AppColors.gray400,
                              ),
                            ),
                          ],
                        )
                      : Text(
                          _address ?? 'Mueve el mapa para elegir',
                          style: AppTextStyles.body,
                          maxLines: 2,
                        ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: (_lat != null && !_loading) ? _confirm : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.black,
                        disabledBackgroundColor: AppColors.gray100,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      child: Text(
                        widget.confirmLabel,
                        style: AppTextStyles.label,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _onIdle() async {
    final pos = _ctrl?.cameraPosition?.target;
    if (pos == null) return;
    _lat = pos.latitude;
    _lng = pos.longitude;
    setState(() {
      _moving = false;
      _loading = true;
    });

    final address = await ref
        .read(geocodingServiceProvider)
        .reverseGeocode(pos.latitude, pos.longitude);

    if (!mounted) return;
    setState(() {
      _loading = false;
      _lat = pos.latitude;
      _lng = pos.longitude;
      _address = address ?? 'Ubicación seleccionada';
    });
  }

  void _confirm() {
    if (_lat == null || _lng == null) return;
    final name = _address ?? 'Ubicación seleccionada';
    final parts = name.split(', ');
    final short = parts.length >= 2 ? '${parts[0]}, ${parts[1]}' : parts[0];
    Navigator.of(context).pop(
      PlaceResult(displayName: name, shortName: short, lat: _lat!, lng: _lng!),
    );
  }
}

class _TrianglePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width / 2, size.height)
      ..close();
    canvas.drawPath(path, Paint()..color = const Color(0xFFEA4335));
  }

  @override
  bool shouldRepaint(_) => false;
}
