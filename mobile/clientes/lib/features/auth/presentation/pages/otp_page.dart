import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show FilteringTextInputFormatter;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/config/app_env.dart';
import '../../../../core/network/dio_client.dart';

import '../../../../core/services/push_notification_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../providers/auth_provider.dart';

class OtpPage extends ConsumerStatefulWidget {
  const OtpPage({
    super.key,
    required this.phone,
    required this.flow,
    this.devCode,
    this.photoBytes,
  });

  final String       phone;
  final String       flow;       // 'login' | 'register'
  final String?      devCode;    // código real devuelto por el back en dev
  final List<int>?   photoBytes; // foto de registro (opcional)

  @override
  ConsumerState<OtpPage> createState() => _OtpPageState();
}

class _OtpPageState extends ConsumerState<OtpPage> {
  static const _length = 6;

  final _controllers = List.generate(_length, (_) => TextEditingController());
  final _focusNodes  = List.generate(_length, (_) => FocusNode());

  bool _loading   = false;
  bool _resending = false;
  int  _countdown = 60;
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

  // ── Countdown ──────────────────────────────────────────────────────────────

  void _startCountdown() {
    _countdown = 60;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) { t.cancel(); return; }
      setState(() => _countdown--);
      if (_countdown <= 0) t.cancel();
    });
  }

  // ── Resend ─────────────────────────────────────────────────────────────────

  Future<void> _resend() async {
    setState(() => _resending = true);
    try {
      await ref.read(authRepositoryProvider).requestOtp(phone: widget.phone);
      if (!mounted) return;
      _startCountdown();
      _snack('Código reenviado');
    } catch (e) {
      if (mounted) _snack(e.toString().replaceAll('Exception: ', ''), isError: true);
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  // ── Verify ─────────────────────────────────────────────────────────────────

  String get _code => _controllers.map((c) => c.text).join();

  Future<void> _verify() async {
    final code = _code;
    if (code.length != _length) return;

    setState(() => _loading = true);
    try {
      final repo = ref.read(authRepositoryProvider);
      await repo.verifyOtp(phone: widget.phone, code: code);

      // Si es registro y hay foto, subirla tras verificar
      if (widget.flow == 'register' && widget.photoBytes != null) {
        try {
          await repo.uploadPhoto(widget.photoBytes!, 'profile.jpg');
        } catch (_) {}
      }

      // Registrar token FCM con el nuevo auth (puede haber fallado en el startup sin sesión)
      PushNotificationService.instance
          .ensureTokenRegistered(ref.read(dioProvider))
          .catchError((_) {});

      if (!mounted) return;
      context.go('/home');
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      _clearBoxes();
      _snack(e.toString().replaceAll('Exception: ', ''), isError: true);
    }
  }

  void _clearBoxes() {
    for (final c in _controllers) c.clear();
    _focusNodes[0].requestFocus();
  }

  // ── Input handling ─────────────────────────────────────────────────────────

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
    if (index > 0) {
      _focusNodes[index - 1].requestFocus();
    }
  }

  void _onPasteAll(String digits) {
    for (var i = 0; i < _length && i < digits.length; i++) {
      _controllers[i].text = digits[i];
    }
    final filled = digits.length >= _length;
    if (filled) {
      _focusNodes[_length - 1].unfocus();
      if (_code.length == _length) _verify();
    } else {
      _focusNodes[digits.length].requestFocus();
    }
  }

  void _snack(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: isError ? AppColors.error : AppColors.secondary,
    ));
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final display = '${widget.phone.substring(0, 4)} ${widget.phone.substring(4)}';
    final showDevHint = AppEnv.isDev && (widget.devCode?.isNotEmpty ?? false);

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        title: Text('Verificar teléfono', style: AppTextStyles.h3),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Ingresa el código', style: AppTextStyles.h2),
              const SizedBox(height: 8),
              RichText(
                text: TextSpan(
                  style: AppTextStyles.body.copyWith(color: AppColors.gray600),
                  children: [
                    const TextSpan(text: 'Enviamos un código de 6 dígitos a\n'),
                    TextSpan(
                      text: display,
                      style: AppTextStyles.bodyMedium
                          .copyWith(color: AppColors.secondary),
                    ),
                  ],
                ),
              ),

              // ── Hint dev mode ────────────────────────────────────────────
              if (showDevHint) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.primary),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.bug_report, size: 16, color: AppColors.secondary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'DEV — código: ${widget.devCode}  (o usa 000000)',
                          style: AppTextStyles.label,
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 36),

              // ── 6 cajitas ────────────────────────────────────────────────
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: List.generate(
                  _length,
                  (i) => _OtpBox(
                    controller:  _controllers[i],
                    focusNode:   _focusNodes[i],
                    onDigit:     (d) => _onDigit(i, d),
                    onBackspace: ()  => _onBackspace(i),
                    onPasteAll:  (s) => _onPasteAll(s),
                  ),
                ),
              ),

              const SizedBox(height: 32),

              // ── Reenviar ─────────────────────────────────────────────────
              Center(
                child: _countdown > 0
                    ? Text(
                        'Reenviar código en $_countdown s',
                        style: AppTextStyles.body.copyWith(color: AppColors.gray500),
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
                                style: AppTextStyles.bodyMedium.copyWith(
                                  color: AppColors.secondary,
                                  decoration: TextDecoration.underline,
                                ),
                              ),
                      ),
              ),

              const SizedBox(height: 24),
              Center(
                child: GestureDetector(
                  onTap: () => launchUrl(
                    Uri.parse('https://wa.me/593987216789?text=Hola,%20no%20recibí%20mi%20código%20OTP%20en%20Pana%20Taxi'),
                    mode: LaunchMode.externalApplication,
                  ),
                  child: Text.rich(
                    TextSpan(
                      text: '¿No recibiste el código? ',
                      style: AppTextStyles.body.copyWith(color: AppColors.gray500),
                      children: [
                        TextSpan(
                          text: 'Contactar soporte',
                          style: AppTextStyles.bodyMedium.copyWith(
                            color: const Color(0xFF25D366),
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      ],
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),

              const SizedBox(height: 32),

              // ── Botón verificar ──────────────────────────────────────────
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
                          width: 24, height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5, color: AppColors.secondary),
                        )
                      : Text('Verificar', style: AppTextStyles.btnLg),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Cajita individual ───────────────────────────────────────────────────────

class _OtpBox extends StatefulWidget {
  const _OtpBox({
    required this.controller,
    required this.focusNode,
    required this.onDigit,
    required this.onBackspace,
    required this.onPasteAll,
  });

  final TextEditingController controller;
  final FocusNode             focusNode;
  final VoidCallback          onBackspace;
  final ValueChanged<String>  onDigit;
  final ValueChanged<String>  onPasteAll;

  @override
  State<_OtpBox> createState() => _OtpBoxState();
}

class _OtpBoxState extends State<_OtpBox> {
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 48,
      height: 60,
      child: TextField(
        controller:   widget.controller,
        focusNode:    widget.focusNode,
        textAlign:    TextAlign.center,
        keyboardType: TextInputType.number,
        maxLength:    1,
        style: const TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w700,
          color: Color(0xFF1A1A1A),
          height: 1,
        ),
        onChanged: (value) {
          if (value.isEmpty) {
            widget.onBackspace();
          } else {
            final digits = value.replaceAll(RegExp(r'\D'), '');
            if (digits.length > 1) {
              widget.controller.text = digits[0];
              widget.onPasteAll(digits);
            } else if (digits.isNotEmpty) {
              widget.onDigit(digits[0]);
            }
          }
        },
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        decoration: InputDecoration(
          counterText: '',
          contentPadding: EdgeInsets.zero,
          filled:    true,
          fillColor: AppColors.gray50,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppColors.gray200),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppColors.gray200),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppColors.primary, width: 2),
          ),
        ),
      ),
    );
  }
}
