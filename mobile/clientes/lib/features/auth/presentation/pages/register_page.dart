import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../providers/auth_provider.dart';

class RegisterPage extends ConsumerStatefulWidget {
  const RegisterPage({super.key});

  @override
  ConsumerState<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends ConsumerState<RegisterPage> {
  final _nameCtrl     = TextEditingController();
  final _cedulaCtrl   = TextEditingController();
  final _phoneCtrl    = TextEditingController();
  final _passCtrl     = TextEditingController();
  final _passConfCtrl = TextEditingController();
  bool _obscurePass     = true;
  bool _obscureConfPass = true;

  List<int>? _photoBytes;
  bool   _termsAccepted = false;
  bool   _loading       = false;
  bool   _termsLoading  = true;
  String? _termsVersion;
  String? _termsContent;

  @override
  void initState() {
    super.initState();
    _loadTerms();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _cedulaCtrl.dispose();
    _phoneCtrl.dispose();
    _passCtrl.dispose();
    _passConfCtrl.dispose();
    super.dispose();
  }

  // ── Terms ──────────────────────────────────────────────────────────────────

  Future<void> _loadTerms() async {
    try {
      final data = await ref.read(authRepositoryProvider).getClientTerms();
      if (mounted) {
        setState(() {
          _termsVersion = data['version'] as String?;
          _termsContent = data['content'] as String?;
          _termsLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _termsLoading = false);
    }
  }

  void _showTermsModal() {
    if (_termsContent == null) return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.85,
        builder: (ctx, ctrl) => Padding(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 36, height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: AppColors.gray300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Text('Términos y Condiciones', style: AppTextStyles.h3),
              Text('v$_termsVersion',
                  style: AppTextStyles.caption.copyWith(color: AppColors.gray500)),
              const SizedBox(height: 16),
              Expanded(
                child: SingleChildScrollView(
                  controller: ctrl,
                  child: Text(_termsContent!,
                      style: AppTextStyles.body.copyWith(height: 1.6)),
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: () {
                    setState(() => _termsAccepted = true);
                    Navigator.pop(ctx);
                  },
                  child: const Text('Acepto los términos'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Photo ──────────────────────────────────────────────────────────────────

  Future<void> _pickPhoto() async {
    final img = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 512,
      imageQuality: 80,
    );
    if (img == null || !mounted) return;
    final bytes = await img.readAsBytes();
    setState(() => _photoBytes = bytes);
  }

  // ── Register ───────────────────────────────────────────────────────────────

  Future<void> _register() async {
    final name     = _nameCtrl.text.trim();
    final cedula   = _cedulaCtrl.text.trim();
    final phone    = '+593${_phoneCtrl.text.trim()}';
    final password = _passCtrl.text;
    final confirm  = _passConfCtrl.text;

    if (name.length < 3)                    return _snack('Ingresa tu nombre completo');
    if (cedula.length != 10)                return _snack('La cédula debe tener 10 dígitos');
    if (_phoneCtrl.text.trim().length != 9) return _snack('Ingresa un número válido de 9 dígitos');
    if (password.length < 8)                return _snack('La contraseña debe tener al menos 8 caracteres');
    final passRe = RegExp(r'^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()\-_=+])');
    if (!passRe.hasMatch(password))         return _snack('La contraseña necesita 1 mayúscula, 1 número y 1 carácter especial');
    if (password != confirm)                return _snack('Las contraseñas no coinciden');
    if (!_termsAccepted)                    return _snack('Debes aceptar los Términos de uso');
    if (_termsVersion == null)              return _snack('No se cargaron los términos. Intenta de nuevo.');

    setState(() => _loading = true);
    try {
      final repo = ref.read(authRepositoryProvider);

      // 1. Registro
      final devCode = await repo.registerClient(
        phone:        phone,
        fullName:     name,
        cedula:       cedula,
        termsVersion: _termsVersion!,
        password:     password,
      );

      if (!mounted) return;

      // Siempre ir a OTP. En dev el back acepta 000000 como bypass.
      context.push('/otp', extra: {
        'phone':      phone,
        'flow':       'register',
        'devCode':    devCode ?? '',
        'photoBytes': _photoBytes,
      });
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
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

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        title: Text('Crear cuenta', style: AppTextStyles.h3),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          onPressed: () => context.pop(),
        ),
      ),
      body: _termsLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : SafeArea(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ── Avatar ──────────────────────────────────────────────
                    Center(
                      child: GestureDetector(
                        onTap: _pickPhoto,
                        child: Stack(
                          children: [
                            CircleAvatar(
                              radius: 48,
                              backgroundColor: AppColors.gray100,
                              backgroundImage: _photoBytes != null
                                  ? MemoryImage(Uint8List.fromList(_photoBytes!))
                                  : null,
                              child: _photoBytes == null
                                  ? const Icon(Icons.person,
                                      size: 48, color: AppColors.gray400)
                                  : null,
                            ),
                            Positioned(
                              bottom: 0, right: 0,
                              child: Container(
                                width: 32, height: 32,
                                decoration: BoxDecoration(
                                  color: AppColors.primary,
                                  shape: BoxShape.circle,
                                  border: Border.all(color: AppColors.white, width: 2),
                                ),
                                child: const Icon(Icons.camera_alt,
                                    size: 16, color: AppColors.secondary),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.only(top: 8, bottom: 24),
                        child: Text('Foto de perfil (opcional)',
                            style: AppTextStyles.caption),
                      ),
                    ),

                    // ── Nombre ──────────────────────────────────────────────
                    _Label('Nombre completo'),
                    TextField(
                      controller: _nameCtrl,
                      textCapitalization: TextCapitalization.words,
                      style: AppTextStyles.body,
                      decoration: _inputDeco(
                        hint: 'Juan Pérez',
                        icon: Icons.person_outline,
                      ),
                    ),
                    const SizedBox(height: 16),

                    // ── Cédula ──────────────────────────────────────────────
                    _Label('Número de cédula'),
                    TextField(
                      controller: _cedulaCtrl,
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(10),
                      ],
                      style: AppTextStyles.body,
                      decoration: _inputDeco(
                        hint: '1712345678',
                        icon: Icons.badge_outlined,
                      ),
                    ),
                    const SizedBox(height: 16),

                    // ── Teléfono ─────────────────────────────────────────────
                    _Label('Teléfono'),
                    TextField(
                      controller: _phoneCtrl,
                      keyboardType: TextInputType.phone,
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

                    // ── Contraseña ────────────────────────────────────────────
                    _Label('Contraseña'),
                    TextField(
                      controller: _passCtrl,
                      obscureText: _obscurePass,
                      style: AppTextStyles.body,
                      decoration: InputDecoration(
                        hintText: 'Mín. 8 caracteres, 1 mayúscula, 1 número, 1 especial',
                        hintStyle: AppTextStyles.body.copyWith(color: AppColors.gray400, fontSize: 12),
                        prefixIcon: const Icon(Icons.lock_outline, color: AppColors.gray500, size: 20),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePass ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                            color: AppColors.gray500, size: 20,
                          ),
                          onPressed: () => setState(() => _obscurePass = !_obscurePass),
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
                    const SizedBox(height: 16),

                    // ── Confirmar contraseña ──────────────────────────────────
                    _Label('Confirmar contraseña'),
                    TextField(
                      controller: _passConfCtrl,
                      obscureText: _obscureConfPass,
                      style: AppTextStyles.body,
                      decoration: InputDecoration(
                        hintText: 'Repite tu contraseña',
                        hintStyle: AppTextStyles.body.copyWith(color: AppColors.gray400),
                        prefixIcon: const Icon(Icons.lock_outline, color: AppColors.gray500, size: 20),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscureConfPass ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                            color: AppColors.gray500, size: 20,
                          ),
                          onPressed: () => setState(() => _obscureConfPass = !_obscureConfPass),
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

                    const SizedBox(height: 24),

                    // ── Términos ─────────────────────────────────────────────
                    GestureDetector(
                      onTap: _termsAccepted
                          ? () => setState(() => _termsAccepted = false)
                          : _showTermsModal,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 150),
                            width: 22, height: 22,
                            decoration: BoxDecoration(
                              color: _termsAccepted
                                  ? AppColors.primary
                                  : AppColors.white,
                              border: Border.all(
                                color: _termsAccepted
                                    ? AppColors.primary
                                    : AppColors.gray300,
                                width: 1.5,
                              ),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: _termsAccepted
                                ? const Icon(Icons.check,
                                    size: 14, color: AppColors.secondary)
                                : null,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: RichText(
                              text: TextSpan(
                                style: AppTextStyles.body
                                    .copyWith(color: AppColors.gray700),
                                children: [
                                  const TextSpan(text: 'Acepto los '),
                                  WidgetSpan(
                                    child: GestureDetector(
                                      onTap: _showTermsModal,
                                      child: Text(
                                        'Términos y Condiciones',
                                        style: AppTextStyles.bodyMedium.copyWith(
                                          color: AppColors.primary,
                                          decoration: TextDecoration.underline,
                                          decorationColor: AppColors.primary,
                                        ),
                                      ),
                                    ),
                                  ),
                                  if (_termsVersion != null)
                                    TextSpan(
                                      text: ' (v$_termsVersion)',
                                      style: AppTextStyles.caption,
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 32),

                    // ── Botón ────────────────────────────────────────────────
                    SizedBox(
                      width: double.infinity,
                      height: 54,
                      child: ElevatedButton(
                        onPressed: _loading ? null : _register,
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
                            : Text('Crear cuenta', style: AppTextStyles.btnLg),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  InputDecoration _inputDeco({required String hint, required IconData icon}) =>
      InputDecoration(
        hintText: hint,
        hintStyle: AppTextStyles.body.copyWith(color: AppColors.gray400),
        prefixIcon: Icon(icon, color: AppColors.gray500, size: 20),
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
      );
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: AppTextStyles.label),
      );
}
