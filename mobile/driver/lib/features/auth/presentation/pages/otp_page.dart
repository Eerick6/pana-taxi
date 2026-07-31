import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/services/push_notification_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../profile/data/providers/profile_provider.dart';
import '../../../vehicle_request/data/providers/vehicle_request_provider.dart';
import '../../../vehicles/data/providers/vehicle_provider.dart';
import '../../../documents/data/providers/document_provider.dart';
import '../../data/providers/auth_provider.dart';

class OtpPage extends ConsumerStatefulWidget {
  const OtpPage({super.key, required this.phone, this.devCode});
  final String phone;
  final String? devCode;

  @override
  ConsumerState<OtpPage> createState() => _OtpPageState();
}

class _OtpPageState extends ConsumerState<OtpPage> {
  final _controllers = List.generate(6, (_) => TextEditingController());
  final _focusNodes = List.generate(6, (_) => FocusNode());
  int _countdown = 60;
  Timer? _timer;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _startCountdown();
    WidgetsBinding.instance.addPostFrameCallback((_) => _focusNodes[0].requestFocus());
  }

  void _startCountdown() {
    _countdown = 60;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_countdown == 0) {
        t.cancel();
      } else {
        setState(() => _countdown--);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    for (final c in _controllers) { c.dispose(); }
    for (final f in _focusNodes) { f.dispose(); }
    super.dispose();
  }

  String get _otp => _controllers.map((c) => c.text).join();

  void _onDigitEntered(int index, String value) {
    if (value.length == 1 && index < 5) {
      _focusNodes[index + 1].requestFocus();
    }
    if (_otp.length == 6) _verify();
  }

  void _onBackspace(int index) {
    if (_controllers[index].text.isEmpty && index > 0) {
      _focusNodes[index - 1].requestFocus();
      _controllers[index - 1].clear();
    }
  }

  Future<void> _verify() async {
    if (_otp.length < 6) return;
    setState(() => _loading = true);
    try {
      await ref.read(authStateProvider.notifier).verifyOtp(widget.phone, _otp);
      // Limpiar caché de todos los providers del usuario anterior
      ref.invalidate(driverProfileProvider);
      ref.invalidate(vehicleRequestsProvider);
      ref.invalidate(myApplicationsProvider);
      ref.invalidate(ownerRequestsProvider);
      ref.invalidate(myVehiclesProvider);
      ref.invalidate(documentsProvider);
      final dio = ref.read(dioProvider);
      await PushNotificationService.instance.initialize(dio);
      if (mounted) context.go('/home');
    } catch (_) {
      if (mounted) {
        // Limpiar campos en error
        for (final c in _controllers) { c.clear(); }
        _focusNodes[0].requestFocus();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Código incorrecto. Intenta de nuevo.'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resend() async {
    try {
      await ref.read(authStateProvider.notifier).requestOtp(widget.phone);
      _startCountdown();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Código reenviado')),
        );
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final displayPhone = widget.phone.replaceRange(6, 10, '****');

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 16),
              Text('Verificar número', style: AppTextStyles.h2),
              const SizedBox(height: 8),
              Text(
                'Ingresa el código de 6 dígitos enviado a $displayPhone',
                style: AppTextStyles.body.copyWith(color: AppColors.gray500),
              ),
              const SizedBox(height: 40),

              // OTP inputs
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: List.generate(6, (i) => _OtpBox(
                  controller: _controllers[i],
                  focusNode: _focusNodes[i],
                  onChanged: (v) => _onDigitEntered(i, v),
                  onBackspace: () => _onBackspace(i),
                  loading: _loading,
                )),
              ),

              const SizedBox(height: 32),

              // Reenviar
              Center(
                child: _countdown > 0
                    ? Text(
                        'Reenviar código en $_countdown s',
                        style: AppTextStyles.label.copyWith(color: AppColors.gray400),
                      )
                    : TextButton(
                        onPressed: _resend,
                        child: Text(
                          'Reenviar código',
                          style: AppTextStyles.label.copyWith(color: AppColors.primaryText),
                        ),
                      ),
              ),

              const SizedBox(height: 24),

              ElevatedButton(
                onPressed: (_loading || _otp.length < 6) ? null : _verify,
                child: _loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Verificar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OtpBox extends StatelessWidget {
  const _OtpBox({
    required this.controller,
    required this.focusNode,
    required this.onChanged,
    required this.onBackspace,
    required this.loading,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final ValueChanged<String> onChanged;
  final VoidCallback onBackspace;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 46,
      height: 56,
      child: KeyboardListener(
        focusNode: FocusNode(),
        onKeyEvent: (e) {
          if (e is KeyDownEvent &&
              e.logicalKey == LogicalKeyboardKey.backspace) {
            onBackspace();
          }
        },
        child: TextFormField(
          controller: controller,
          focusNode: focusNode,
          enabled: !loading,
          textAlign: TextAlign.center,
          keyboardType: TextInputType.number,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(1),
          ],
          style: AppTextStyles.h3.copyWith(color: AppColors.primaryText),
          decoration: InputDecoration(
            contentPadding: EdgeInsets.zero,
            filled: true,
            fillColor: controller.text.isEmpty
                ? AppColors.gray50
                : AppColors.primaryLight,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: AppColors.gray200),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: AppColors.primary, width: 2),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(
                color: controller.text.isNotEmpty
                    ? AppColors.primary
                    : AppColors.gray200,
              ),
            ),
          ),
          onChanged: onChanged,
        ),
      ),
    );
  }
}
