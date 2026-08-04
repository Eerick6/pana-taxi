import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/services/biometric_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../providers/auth_provider.dart';
import '../../data/datasources/auth_api.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _phoneCtrl    = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _loading             = false;
  bool _obscure             = true;
  bool _biometricAvailable  = false;

  @override
  void initState() {
    super.initState();
    _checkBiometric();
  }

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _checkBiometric() async {
    final bio       = ref.read(biometricServiceProvider);
    final available = await bio.isAvailable();
    if (!available || !mounted) return;
    final hasSession = await ref.read(authRepositoryProvider).hasStoredSession();
    if (mounted) setState(() => _biometricAvailable = hasSession);
  }

  Future<void> _login() async {
    final digits   = _phoneCtrl.text.trim();
    final password = _passwordCtrl.text;

    if (digits.length != 9) return _snack('Ingresa un número válido de 9 dígitos');
    if (password.length < 8) return _snack('La contraseña debe tener al menos 8 caracteres');

    final phone = '+593$digits';
    setState(() => _loading = true);

    try {
      await ref.read(authRepositoryProvider).loginWithPhone(
        phone:    phone,
        password: password,
      );
      if (!mounted) return;
      context.go('/home');
    } on PendingVerificationException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      context.push('/otp', extra: {
        'phone':      e.phone,
        'flow':       'register',
        'devCode':    e.devCode ?? '',
        'photoBytes': null,
      });
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        _snack(e.toString().replaceAll('Exception: ', ''), isError: true);
      }
    }
  }

  Future<void> _loginWithBiometric() async {
    final bio    = ref.read(biometricServiceProvider);
    final result = await bio.authenticate();

    if (result == BiometricResult.notConfigured) return;
    if (result != BiometricResult.success) {
      _snack('Autenticación biométrica fallida', isError: true);
      return;
    }

    setState(() => _loading = true);
    try {
      await ref.read(authRepositoryProvider).loginWithBiometric();
      if (mounted) context.go('/home');
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _biometricAvailable = false;
        });
        _snack(e.toString().replaceAll('Exception: ', ''), isError: true);
      }
    }
  }

  void _snack(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: isError ? AppColors.error : AppColors.secondary,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        title: Text('Iniciar sesión', style: AppTextStyles.h3),
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
              Text('Bienvenido de vuelta', style: AppTextStyles.h2),
              const SizedBox(height: 8),
              Text(
                'Ingresa tu teléfono y contraseña para continuar.',
                style: AppTextStyles.body.copyWith(color: AppColors.gray600),
              ),
              const SizedBox(height: 36),

              // ── Teléfono ────────────────────────────────────────────────
              Text('Teléfono', style: AppTextStyles.label),
              const SizedBox(height: 6),
              TextField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                autofocus: true,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(9),
                ],
                style: AppTextStyles.body,
                decoration: InputDecoration(
                  hintText: '991234567',
                  hintStyle: AppTextStyles.body.copyWith(color: AppColors.gray400),
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
                  filled: true,
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
              const SizedBox(height: 16),

              // ── Contraseña ──────────────────────────────────────────────
              Text('Contraseña', style: AppTextStyles.label),
              const SizedBox(height: 6),
              TextField(
                controller: _passwordCtrl,
                obscureText: _obscure,
                style: AppTextStyles.body,
                onSubmitted: (_) => _login(),
                decoration: InputDecoration(
                  hintText: '••••••••',
                  hintStyle: AppTextStyles.body.copyWith(color: AppColors.gray400),
                  prefixIcon: const Icon(Icons.lock_outline, color: AppColors.gray500, size: 20),
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                      color: AppColors.gray500,
                      size: 20,
                    ),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                  filled: true,
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

              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => context.push('/forgot-password'),
                  style: TextButton.styleFrom(padding: EdgeInsets.zero),
                  child: Text(
                    '¿Olvidaste tu contraseña?',
                    style: AppTextStyles.body.copyWith(color: AppColors.secondary),
                  ),
                ),
              ),

              const SizedBox(height: 32),

              // ── Botón login ──────────────────────────────────────────────
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  onPressed: _loading ? null : _login,
                  style: ElevatedButton.styleFrom(
                    disabledBackgroundColor: AppColors.gray200,
                  ),
                  child: _loading
                      ? const SizedBox(
                          width: 24, height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: AppColors.secondary,
                          ),
                        )
                      : Text('Iniciar sesión', style: AppTextStyles.btnLg),
                ),
              ),

              // ── Biometría ────────────────────────────────────────────────
              if (_biometricAvailable) ...[
                const SizedBox(height: 20),
                Row(
                  children: [
                    const Expanded(child: Divider()),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text(
                        'o usa biometría',
                        style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
                      ),
                    ),
                    const Expanded(child: Divider()),
                  ],
                ),
                const SizedBox(height: 16),
                Center(
                  child: GestureDetector(
                    onTap: _loading ? null : _loginWithBiometric,
                    child: Container(
                      width: 64, height: 64,
                      decoration: BoxDecoration(
                        border: Border.all(color: AppColors.gray200, width: 1.5),
                        borderRadius: BorderRadius.circular(18),
                        color: AppColors.gray50,
                      ),
                      child: const Icon(Icons.fingerprint, size: 34, color: AppColors.primary),
                    ),
                  ),
                ),
              ],

              const SizedBox(height: 16),

              // ── Link a registro ─────────────────────────────────────────
              Center(
                child: GestureDetector(
                  onTap: () => context.pushReplacement('/register'),
                  child: RichText(
                    text: TextSpan(
                      style: AppTextStyles.body.copyWith(color: AppColors.gray600),
                      children: [
                        const TextSpan(text: '¿No tienes cuenta? '),
                        TextSpan(
                          text: 'Crear cuenta',
                          style: AppTextStyles.bodyMedium.copyWith(
                            color: AppColors.secondary,
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      ],
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

