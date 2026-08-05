import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/config/app_config.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/repositories/auth_repository.dart';

class ForgotPasswordPage extends ConsumerStatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  ConsumerState<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends ConsumerState<ForgotPasswordPage> {
  static const _maxAttempts = 3;

  final _phoneCtrl  = TextEditingController();
  bool   _loading   = false;
  bool   _blocked   = false;
  int    _attempts  = 0;   // intentos ya usados
  String _blockMsg  = '';

  @override
  void dispose() {
    _phoneCtrl.dispose();
    super.dispose();
  }

  int get _remaining => _maxAttempts - _attempts;

  Future<void> _submit() async {
    if (_blocked) return;
    final digits = _phoneCtrl.text.trim();
    if (digits.length < 9) {
      _snack('Ingresa tu número de celular', isError: true);
      return;
    }
    final phone = '+593$digits';
    setState(() => _loading = true);
    try {
      final devCode = await ref.read(authRepositoryProvider).forgotPasswordPhone(phone);
      if (!mounted) return;
      setState(() => _attempts++);
      _snack('Si el número está registrado, recibirás un código SMS');
      context.push('/auth/reset-password', extra: {
        'phone': phone,
        if (devCode != null && AppConfig.isDev) 'dev_code': devCode,
      });
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().replaceAll('Exception: ', '');
      final isBlocking = msg.toLowerCase().contains('demasiados') ||
                         msg.toLowerCase().contains('bloqueada') ||
                         msg.toLowerCase().contains('intentarlo en');
      setState(() {
        _attempts++;
        if (isBlocking || _attempts >= _maxAttempts) {
          _blocked  = true;
          _blockMsg = isBlocking ? msg : 'Has agotado tus intentos. Vuelve a intentarlo en 24 horas.';
        }
      });
      _snack(msg, isError: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _snack(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: isError ? AppColors.error : AppColors.secondary,
      behavior: SnackBarBehavior.floating,
    ));
  }

  @override
  Widget build(BuildContext context) {
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
              Text('Olvidé mi contraseña', style: AppTextStyles.h2),
              const SizedBox(height: 8),
              Text(
                'Ingresa tu número de celular y te enviaremos un código SMS para restablecer tu contraseña.',
                style: AppTextStyles.body.copyWith(color: AppColors.gray500),
              ),

              const SizedBox(height: 20),

              // ── Aviso de límite ──────────────────────────────────────────
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF8E1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFFFE082)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.info_outline, size: 18, color: Color(0xFFF59E0B)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Por seguridad, tienes 3 intentos para ingresar tu número. '
                        'Al agotarlos, esta opción se bloqueará por 24 horas.',
                        style: AppTextStyles.caption.copyWith(
                          color: const Color(0xFF92400E),
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              Text('Número de celular', style: AppTextStyles.labelLg),
              const SizedBox(height: 8),
              TextFormField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                autofocus: true,
                enabled: !_blocked,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(9),
                ],
                style: AppTextStyles.bodyLg,
                onFieldSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  hintText: '991234567',
                  prefixIcon: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.gray100,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text('🇪🇨 +593', style: AppTextStyles.label),
                  ),
                  prefixIconConstraints: const BoxConstraints(),
                ),
              ),

              const Spacer(),

              // ── Botón ────────────────────────────────────────────────────
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: (_loading || _blocked) ? null : _submit,
                  child: _loading
                      ? const SizedBox(
                          width: 22, height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                        )
                      : const Text('Enviar código'),
                ),
              ),

              const SizedBox(height: 12),

              // ── Contador / mensaje de bloqueo ────────────────────────────
              Center(
                child: _blocked
                    ? Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.lock_outline, size: 14, color: AppColors.error),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              _blockMsg,
                              style: AppTextStyles.caption.copyWith(color: AppColors.error),
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ],
                      )
                    : Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          ...List.generate(_maxAttempts, (i) => Container(
                            width: 8, height: 8,
                            margin: const EdgeInsets.symmetric(horizontal: 3),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: i < _attempts
                                  ? AppColors.error
                                  : AppColors.gray200,
                            ),
                          )),
                          const SizedBox(width: 8),
                          Text(
                            _attempts == 0
                                ? '$_maxAttempts intentos disponibles'
                                : '$_remaining intento${_remaining == 1 ? '' : 's'} restante${_remaining == 1 ? '' : 's'}',
                            style: AppTextStyles.caption.copyWith(
                              color: _remaining <= 1 ? AppColors.error : AppColors.gray400,
                            ),
                          ),
                        ],
                      ),
              ),

              const SizedBox(height: 16),
              Center(
                child: TextButton(
                  onPressed: _blocked ? null : () {
                    final digits = _phoneCtrl.text.trim();
                    if (digits.length < 9) {
                      _snack('Ingresa tu número primero', isError: true);
                      return;
                    }
                    context.push('/auth/reset-password', extra: {
                      'phone': '+593$digits',
                    });
                  },
                  child: Text(
                    'Ya tengo un código',
                    style: AppTextStyles.label.copyWith(
                      color: _blocked ? AppColors.gray300 : AppColors.secondary,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
