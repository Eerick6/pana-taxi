import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/providers/auth_provider.dart';

enum _DriverTypeOption { owner, driver }

class RegisterPage extends ConsumerStatefulWidget {
  const RegisterPage({super.key});

  @override
  ConsumerState<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends ConsumerState<RegisterPage> {
  final _formKey      = GlobalKey<FormState>();
  final _nameCtrl     = TextEditingController();
  final _phoneCtrl    = TextEditingController();
  final _passCtrl     = TextEditingController();
  final _passConfCtrl = TextEditingController();
  _DriverTypeOption _driverType = _DriverTypeOption.owner;
  bool _loading         = false;
  bool _obscurePass     = true;
  bool _obscureConfPass = true;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _passCtrl.dispose();
    _passConfCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      final phone = '+593${_phoneCtrl.text.trim()}';
      final devCode = await ref.read(authStateProvider.notifier).registerDriver(
        fullName:   _nameCtrl.text.trim(),
        phone:      phone,
        driverType: _driverType == _DriverTypeOption.owner ? 'owner_driver' : 'driver',
        password:   _passCtrl.text,
      );
      if (mounted) context.go('/auth/otp', extra: {'phone': phone, 'dev_code': devCode});
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
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
        title: Image.asset('assets/images/logo.webp', width: 36, height: 36),
        centerTitle: true,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 24),
                Text('Crear cuenta', style: AppTextStyles.h2),
                const SizedBox(height: 6),
                Text(
                  'Regístrate para empezar a trabajar con Pana',
                  style: AppTextStyles.body.copyWith(color: AppColors.gray500),
                ),
                const SizedBox(height: 32),

                // Nombre completo
                Text('Nombre completo', style: AppTextStyles.labelLg),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _nameCtrl,
                  textCapitalization: TextCapitalization.words,
                  style: AppTextStyles.bodyLg,
                  decoration: const InputDecoration(
                    hintText: 'Ej. Juan Pérez',
                    prefixIcon: Icon(Icons.person_outline, color: AppColors.gray400),
                  ),
                  validator: (v) {
                    if (v == null || v.trim().length < 3) return 'Ingresa tu nombre completo';
                    return null;
                  },
                ),
                const SizedBox(height: 20),

                // Teléfono
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
                    if (!v.startsWith('09'.substring(1))) {
                      // acepta 9XXXXXXXX (sin el 0 inicial)
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 20),

                // Contraseña
                Text('Contraseña', style: AppTextStyles.labelLg),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _passCtrl,
                  obscureText: _obscurePass,
                  style: AppTextStyles.bodyLg,
                  decoration: InputDecoration(
                    hintText: 'Mín. 8 caracteres, 1 mayúscula, 1 número, 1 especial',
                    hintStyle: AppTextStyles.body.copyWith(color: AppColors.gray400, fontSize: 12),
                    prefixIcon: const Icon(Icons.lock_outline, color: AppColors.gray400),
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePass ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                        color: AppColors.gray400,
                      ),
                      onPressed: () => setState(() => _obscurePass = !_obscurePass),
                    ),
                  ),
                  validator: (v) {
                    if (v == null || v.isEmpty) return 'Ingresa una contraseña';
                    if (v.length < 8) return 'Mínimo 8 caracteres';
                    final re = RegExp(r'^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()\-_=+])');
                    if (!re.hasMatch(v)) return '1 mayúscula, 1 número y 1 carácter especial';
                    return null;
                  },
                ),
                const SizedBox(height: 20),

                // Confirmar contraseña
                Text('Confirmar contraseña', style: AppTextStyles.labelLg),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _passConfCtrl,
                  obscureText: _obscureConfPass,
                  style: AppTextStyles.bodyLg,
                  decoration: InputDecoration(
                    hintText: 'Repite tu contraseña',
                    prefixIcon: const Icon(Icons.lock_outline, color: AppColors.gray400),
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscureConfPass ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                        color: AppColors.gray400,
                      ),
                      onPressed: () => setState(() => _obscureConfPass = !_obscureConfPass),
                    ),
                  ),
                  validator: (v) {
                    if (v == null || v.isEmpty) return 'Confirma tu contraseña';
                    if (v != _passCtrl.text) return 'Las contraseñas no coinciden';
                    return null;
                  },
                ),
                const SizedBox(height: 20),

                // Tipo de conductor
                Text('¿Cuál es tu rol?', style: AppTextStyles.labelLg),
                const SizedBox(height: 10),
                _RoleCard(
                  selected: _driverType == _DriverTypeOption.owner,
                  icon: Icons.directions_car,
                  title: 'Dueño de taxi (socio)',
                  subtitle: 'Tengo mi propio taxi y soy socio de una cooperativa',
                  onTap: () => setState(() => _driverType = _DriverTypeOption.owner),
                ),
                const SizedBox(height: 10),
                _RoleCard(
                  selected: _driverType == _DriverTypeOption.driver,
                  icon: Icons.person,
                  title: 'Conductor',
                  subtitle: 'Manejo el taxi de otro dueño o propietario',
                  onTap: () => setState(() => _driverType = _DriverTypeOption.driver),
                ),

                const SizedBox(height: 32),

                SizedBox(
                  width: double.infinity,
                  height: 54,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: AppColors.secondary,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      elevation: 0,
                    ),
                    onPressed: _loading ? null : _submit,
                    child: _loading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.5,
                              color: AppColors.secondary,
                            ),
                          )
                        : Text('Continuar', style: AppTextStyles.btnLg),
                  ),
                ),
                const SizedBox(height: 16),

                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('¿Ya tienes cuenta? ', style: AppTextStyles.body.copyWith(color: AppColors.gray500)),
                    GestureDetector(
                      onTap: () => context.go('/auth/login'),
                      child: Text(
                        'Iniciar sesión',
                        style: AppTextStyles.label.copyWith(color: AppColors.secondary),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 32),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({
    required this.selected,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final bool selected;
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: selected ? AppColors.primaryLight : AppColors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.gray200,
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: selected ? AppColors.primary : AppColors.gray100,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                icon,
                color: selected ? AppColors.secondary : AppColors.gray500,
                size: 22,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppTextStyles.labelLg),
                  const SizedBox(height: 2),
                  Text(subtitle, style: AppTextStyles.caption),
                ],
              ),
            ),
            if (selected)
              const Icon(Icons.check_circle, color: AppColors.secondary, size: 20),
          ],
        ),
      ),
    );
  }
}
