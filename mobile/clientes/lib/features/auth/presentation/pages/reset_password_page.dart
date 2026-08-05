import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/config/app_env.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../providers/auth_provider.dart';

class ResetPasswordPage extends ConsumerStatefulWidget {
  const ResetPasswordPage({super.key, required this.phone, this.devCode});
  final String  phone;
  final String? devCode;

  @override
  ConsumerState<ResetPasswordPage> createState() => _ResetPasswordPageState();
}

class _ResetPasswordPageState extends ConsumerState<ResetPasswordPage> {
  final _tokenCtrl    = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl  = TextEditingController();
  bool _loading  = false;
  bool _obscure1 = true;
  bool _obscure2 = true;

  @override
  void dispose() {
    _tokenCtrl.dispose();
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final otp      = _tokenCtrl.text.trim();
    final password = _passwordCtrl.text;
    final confirm  = _confirmCtrl.text;

    if (otp.length != 6) {
      _snack('El código debe tener 6 dígitos', isError: true);
      return;
    }
    if (password.length < 8) {
      _snack('La contraseña debe tener al menos 8 caracteres', isError: true);
      return;
    }
    if (password != confirm) {
      _snack('Las contraseñas no coinciden', isError: true);
      return;
    }

    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('⚠️ Recuerda tu contraseña'),
        content: const Text(
          'Una vez cambiada, no podrás volver a cambiar tu contraseña durante 7 días.\n\n¿Estás seguro de que recuerdas la nueva contraseña?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sí, cambiar'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    setState(() => _loading = true);
    try {
      await ref.read(authRepositoryProvider).resetPasswordPhone(widget.phone, otp, password);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Contraseña actualizada correctamente'),
        backgroundColor: Colors.green,
        behavior: SnackBarBehavior.floating,
      ));
      context.go('/login');
    } catch (e) {
      if (mounted) _snack(e.toString().replaceAll('Exception: ', ''), isError: true);
    } finally {
      if (mounted) setState(() => _loading = false);
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
    final display = widget.phone.length > 6
        ? '${widget.phone.substring(0, 6)}****'
        : widget.phone;
    final showDevHint = AppEnv.isDev && (widget.devCode?.isNotEmpty ?? false);

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        title: Text('Restablecer contraseña', style: AppTextStyles.h3),
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
              Text('Nueva contraseña', style: AppTextStyles.h2),
              const SizedBox(height: 8),
              Text(
                'Ingresa el código enviado a $display y tu nueva contraseña.',
                style: AppTextStyles.body.copyWith(color: AppColors.gray600),
              ),

              if (showDevHint) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(children: [
                    const Icon(Icons.developer_mode, size: 16, color: AppColors.secondary),
                    const SizedBox(width: 8),
                    Text('DEV — código: ${widget.devCode}  (o usa 000000)', style: AppTextStyles.caption),
                  ]),
                ),
              ] else if (AppEnv.isDev) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(children: [
                    const Icon(Icons.developer_mode, size: 16, color: AppColors.secondary),
                    const SizedBox(width: 8),
                    Text('DEV — usa código 000000', style: AppTextStyles.caption),
                  ]),
                ),
              ],

              const SizedBox(height: 32),

              Text('Código de verificación', style: AppTextStyles.label),
              const SizedBox(height: 6),
              _field(
                controller: _tokenCtrl,
                hint: '000000',
                keyboard: TextInputType.number,
                formatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                prefix: const Icon(Icons.lock_clock_outlined, color: AppColors.gray500, size: 20),
                letterSpacing: 4,
              ),

              const SizedBox(height: 20),

              Text('Nueva contraseña', style: AppTextStyles.label),
              const SizedBox(height: 6),
              _field(
                controller: _passwordCtrl,
                hint: '••••••••',
                obscure: _obscure1,
                prefix: const Icon(Icons.lock_outline, color: AppColors.gray500, size: 20),
                suffix: IconButton(
                  icon: Icon(
                    _obscure1 ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                    color: AppColors.gray500, size: 20,
                  ),
                  onPressed: () => setState(() => _obscure1 = !_obscure1),
                ),
              ),

              const SizedBox(height: 20),

              Text('Confirmar contraseña', style: AppTextStyles.label),
              const SizedBox(height: 6),
              _field(
                controller: _confirmCtrl,
                hint: '••••••••',
                obscure: _obscure2,
                onSubmitted: (_) => _submit(),
                prefix: const Icon(Icons.lock_outline, color: AppColors.gray500, size: 20),
                suffix: IconButton(
                  icon: Icon(
                    _obscure2 ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                    color: AppColors.gray500, size: 20,
                  ),
                  onPressed: () => setState(() => _obscure2 = !_obscure2),
                ),
              ),

              const SizedBox(height: 36),

              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  onPressed: _loading ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    disabledBackgroundColor: AppColors.gray200,
                  ),
                  child: _loading
                      ? const SizedBox(
                          width: 24, height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.secondary),
                        )
                      : Text('Cambiar contraseña', style: AppTextStyles.btnLg),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field({
    required TextEditingController controller,
    required String hint,
    TextInputType? keyboard,
    List<TextInputFormatter>? formatters,
    bool obscure = false,
    Widget? prefix,
    Widget? suffix,
    void Function(String)? onSubmitted,
    double? letterSpacing,
  }) {
    return TextField(
      controller: controller,
      keyboardType: keyboard,
      obscureText: obscure,
      inputFormatters: formatters,
      style: AppTextStyles.body.copyWith(letterSpacing: letterSpacing),
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: AppTextStyles.body.copyWith(color: AppColors.gray400),
        prefixIcon: prefix,
        suffixIcon: suffix,
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
    );
  }
}
