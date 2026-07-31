import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/services/biometric_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/providers/auth_provider.dart';
import '../../data/repositories/auth_repository.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _phoneCtrl    = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _formKey      = GlobalKey<FormState>();
  bool _loading            = false;
  bool _obscure            = true;
  bool _biometricAvailable = false;

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

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);

    try {
      final phone    = '+593${_phoneCtrl.text.trim()}';
      final password = _passwordCtrl.text;
      await ref.read(authStateProvider.notifier).loginWithPhone(phone, password);
      if (mounted) context.go('/home');
    } catch (e) {
      if (mounted) {
        final msg = e.toString().replaceAll('Exception: ', '');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 6),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loginWithBiometric() async {
    final bio    = ref.read(biometricServiceProvider);
    final result = await bio.authenticate();

    if (result == BiometricResult.notConfigured) return;
    if (result != BiometricResult.success) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Autenticación biométrica fallida'),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    setState(() => _loading = true);
    try {
      await ref.read(authStateProvider.notifier).loginWithBiometric();
      if (mounted) context.go('/home');
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _biometricAvailable = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 48),

                // Logo / Header
                Center(
                  child: Column(
                    children: [
                      Image.asset(
                        'assets/images/logo.webp',
                        width: 72,
                        height: 72,
                      ),
                      const SizedBox(height: 16),
                      Text('Pana Taxista', style: AppTextStyles.h2),
                      const SizedBox(height: 6),
                      Text(
                        'Ingresa tu teléfono y contraseña',
                        style: AppTextStyles.body.copyWith(color: AppColors.gray500),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 48),

                Text('Número de celular', style: AppTextStyles.labelLg),
                const SizedBox(height: 8),

                TextFormField(
                  controller: _phoneCtrl,
                  keyboardType: TextInputType.phone,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(9),
                  ],
                  style: AppTextStyles.bodyLg,
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
                  validator: (v) {
                    if (v == null || v.isEmpty) return 'Ingresa tu número';
                    if (v.length < 9) return 'Número incompleto';
                    return null;
                  },
                ),

                const SizedBox(height: 20),

                Text('Contraseña', style: AppTextStyles.labelLg),
                const SizedBox(height: 8),

                TextFormField(
                  controller: _passwordCtrl,
                  obscureText: _obscure,
                  style: AppTextStyles.bodyLg,
                  onFieldSubmitted: (_) => _submit(),
                  decoration: InputDecoration(
                    hintText: '••••••••',
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                        color: AppColors.gray500,
                      ),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                  validator: (v) {
                    if (v == null || v.isEmpty) return 'Ingresa tu contraseña';
                    if (v.length < 8) return 'Mínimo 8 caracteres';
                    return null;
                  },
                ),

                const SizedBox(height: 32),

                ElevatedButton(
                  onPressed: _loading ? null : _submit,
                  child: _loading
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Iniciar sesión'),
                ),

                // ── Biometría ──────────────────────────────────────────────
                if (_biometricAvailable) ...[
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      const Expanded(child: Divider()),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Text(
                          'o usa biometría',
                          style: AppTextStyles.caption,
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

                const SizedBox(height: 24),

                Center(
                  child: Text(
                    'Al continuar, aceptas nuestros Términos y Política de Privacidad',
                    textAlign: TextAlign.center,
                    style: AppTextStyles.caption,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
