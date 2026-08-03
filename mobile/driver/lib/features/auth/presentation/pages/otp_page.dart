import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/config/app_config.dart';
import 'package:dio/dio.dart';
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
  final String  phone;
  final String? devCode;

  @override
  ConsumerState<OtpPage> createState() => _OtpPageState();
}

class _OtpPageState extends ConsumerState<OtpPage> {
  static const _length = 6;

  final _controllers = List.generate(_length, (_) => TextEditingController());
  final _focusNodes  = List.generate(_length, (_) => FocusNode());

  bool   _loading   = false;
  bool   _resending = false;
  int    _countdown = 60;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startCountdown();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNodes[0].requestFocus();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    for (final c in _controllers) c.dispose();
    for (final f in _focusNodes)  f.dispose();
    super.dispose();
  }

  void _startCountdown() {
    _countdown = 60;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) { t.cancel(); return; }
      setState(() => _countdown--);
      if (_countdown <= 0) t.cancel();
    });
  }

  String get _code => _controllers.map((c) => c.text).join();

  void _onDigit(int index, String digit) {
    _controllers[index].text = digit;
    if (index < _length - 1) {
      _focusNodes[index + 1].requestFocus();
    } else {
      _focusNodes[index].unfocus();
      if (_code.length == _length) _verify();
    }
  }

  void _onBackspace(int index) {
    _controllers[index].clear();
    if (index > 0) _focusNodes[index - 1].requestFocus();
  }

  void _snack(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: isError ? AppColors.error : AppColors.secondary,
      behavior: SnackBarBehavior.floating,
    ));
  }

  Future<void> _verify() async {
    final code = _code;
    if (code.length != _length) return;
    setState(() => _loading = true);
    try {
      await ref.read(authStateProvider.notifier).verifyOtp(widget.phone, code);
      ref.invalidate(driverProfileProvider);
      ref.invalidate(vehicleRequestsProvider);
      ref.invalidate(myApplicationsProvider);
      ref.invalidate(ownerRequestsProvider);
      ref.invalidate(myVehiclesProvider);
      ref.invalidate(documentsProvider);
      final dio = ref.read(dioProvider);
      await PushNotificationService.instance.initialize(dio);
      if (mounted) context.go('/home');
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      _clearBoxes();
      _snack(_errorMessage(e), isError: true);
    }
  }

  Future<void> _resend() async {
    setState(() => _resending = true);
    try {
      await ref.read(authStateProvider.notifier).requestOtp(widget.phone);
      if (!mounted) return;
      _startCountdown();
      _snack('Código reenviado');
    } catch (e) {
      if (mounted) _snack(_errorMessage(e), isError: true);
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  String _errorMessage(Object e) {
    if (e is DioException) {
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.connectionError) {
        return 'Sin conexión. Verifica tu red e intenta de nuevo.';
      }
      final statusCode = e.response?.statusCode;
      if (statusCode == 401 || statusCode == 400) {
        return 'Código incorrecto o expirado. Solicita uno nuevo.';
      }
    }
    final msg = e.toString().replaceAll('Exception: ', '');
    return msg.isNotEmpty ? msg : 'Ocurrió un error inesperado';
  }

  void _clearBoxes() {
    for (final c in _controllers) c.clear();
    _focusNodes[0].requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final display     = widget.phone.replaceRange(6, 10, '****');
    final showDevHint = AppConfig.isDev && (widget.devCode?.isNotEmpty ?? false);

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
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Verificar número', style: AppTextStyles.h2),
              const SizedBox(height: 8),
              Text(
                'Ingresa el código de 6 dígitos enviado a $display',
                style: AppTextStyles.body.copyWith(color: AppColors.gray500),
              ),

              if (showDevHint) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.primary.withOpacity(0.4)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.developer_mode, size: 16, color: AppColors.primary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'DEV — código: ${widget.devCode}  (o usa 000000)',
                          style: AppTextStyles.caption.copyWith(color: AppColors.primaryText),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 36),

              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: List.generate(
                  _length,
                  (i) => _OtpBox(
                    controller: _controllers[i],
                    focusNode:  _focusNodes[i],
                    onDigit:     (d) => _onDigit(i, d),
                    onBackspace: ()  => _onBackspace(i),
                  ),
                ),
              ),

              const SizedBox(height: 32),

              Center(
                child: _countdown > 0
                    ? Text(
                        'Reenviar código en $_countdown s',
                        style: AppTextStyles.label.copyWith(color: AppColors.gray400),
                      )
                    : GestureDetector(
                        onTap: _resending ? null : _resend,
                        child: _resending
                            ? const SizedBox(
                                width: 18, height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2, color: AppColors.secondary),
                              )
                            : Text(
                                'Reenviar código',
                                style: AppTextStyles.label.copyWith(
                                  color: AppColors.primaryText,
                                  decoration: TextDecoration.underline,
                                ),
                              ),
                      ),
              ),

              const Spacer(),

              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  onPressed: (_loading || _code.length != _length) ? null : _verify,
                  style: ElevatedButton.styleFrom(
                    disabledBackgroundColor: AppColors.gray200,
                  ),
                  child: _loading
                      ? const SizedBox(
                          width: 22, height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5, color: Colors.white),
                        )
                      : const Text('Verificar'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OtpBox extends StatefulWidget {
  const _OtpBox({
    required this.controller,
    required this.focusNode,
    required this.onDigit,
    required this.onBackspace,
  });

  final TextEditingController controller;
  final FocusNode             focusNode;
  final ValueChanged<String>  onDigit;
  final VoidCallback          onBackspace;

  @override
  State<_OtpBox> createState() => _OtpBoxState();
}

class _OtpBoxState extends State<_OtpBox> {
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 46,
      height: 56,
      child: TextField(
        controller:   widget.controller,
        focusNode:    widget.focusNode,
        textAlign:    TextAlign.center,
        keyboardType: TextInputType.number,
        maxLength:    1,
        style: AppTextStyles.h3.copyWith(color: AppColors.primaryText),
        onChanged: (value) {
          if (value.isEmpty) {
            widget.onBackspace();
          } else {
            final digit = value.replaceAll(RegExp(r'\D'), '');
            if (digit.isNotEmpty) widget.onDigit(digit[0]);
          }
        },
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        decoration: InputDecoration(
          counterText: '',
          contentPadding: EdgeInsets.zero,
          filled:    true,
          fillColor: AppColors.gray50,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.gray200),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.gray200),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.primary, width: 2),
          ),
        ),
      ),
    );
  }
}
