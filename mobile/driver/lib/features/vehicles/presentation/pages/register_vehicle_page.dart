import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/models/vehicle_model.dart';
import '../../data/providers/vehicle_provider.dart';

class RegisterVehiclePage extends ConsumerStatefulWidget {
  const RegisterVehiclePage({super.key});

  @override
  ConsumerState<RegisterVehiclePage> createState() => _RegisterVehiclePageState();
}

class _RegisterVehiclePageState extends ConsumerState<RegisterVehiclePage> {
  final _formKey = GlobalKey<FormState>();
  final _plateCtrl = TextEditingController();
  final _brandCtrl = TextEditingController();
  final _modelCtrl = TextEditingController();
  final _colorCtrl = TextEditingController();
  final _yearCtrl = TextEditingController(text: '2020');
  String? _selectedCoopId;
  bool _loading = false;

  @override
  void dispose() {
    _plateCtrl.dispose();
    _brandCtrl.dispose();
    _modelCtrl.dispose();
    _colorCtrl.dispose();
    _yearCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate() || _selectedCoopId == null) return;
    setState(() => _loading = true);
    try {
      final vehicleId = await ref.read(myVehiclesProvider.notifier).register(
            cooperativeId: _selectedCoopId!,
            plate: _plateCtrl.text.trim().toUpperCase(),
            brand: _brandCtrl.text.trim(),
            model: _modelCtrl.text.trim(),
            color: _colorCtrl.text.trim(),
            year: int.parse(_yearCtrl.text.trim()),
          );
      // Refrescar guard provider
      ref.read(myVehiclesGuardProvider.notifier).refresh();
      if (mounted) {
        // Ir directo a documentos del vehículo
        context.push('/vehicles/$vehicleId/documents');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final coopsAsync = ref.watch(activeCooperativesProvider);

    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        backgroundColor: AppColors.secondary,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: AppColors.white, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text('Registrar taxi', style: AppTextStyles.h3.copyWith(color: AppColors.white)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Cooperative selector
              Text('Cooperativa', style: AppTextStyles.labelLg),
              const SizedBox(height: 8),
              coopsAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Text('Error: $e', style: AppTextStyles.caption.copyWith(color: AppColors.errorText)),
                data: (coops) => DropdownButtonFormField<String>(
                  decoration: _inputDecoration('Selecciona una cooperativa'),
                  items: coops.map((c) => DropdownMenuItem(
                        value: c.id,
                        child: Text(c.name),
                      )).toList(),
                  onChanged: (v) => setState(() => _selectedCoopId = v),
                  validator: (v) => v == null ? 'Selecciona una cooperativa' : null,
                ),
              ),
              const SizedBox(height: 20),
              Text('Datos del vehículo', style: AppTextStyles.labelLg),
              const SizedBox(height: 8),
              TextFormField(
                controller: _plateCtrl,
                decoration: _inputDecoration('Placa (ej: ABC1234)'),
                textCapitalization: TextCapitalization.characters,
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9\-]'))],
                validator: (v) => v?.trim().isEmpty == true ? 'Ingresa la placa' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _brandCtrl,
                decoration: _inputDecoration('Marca (ej: Toyota)'),
                textCapitalization: TextCapitalization.words,
                validator: (v) => v?.trim().isEmpty == true ? 'Ingresa la marca' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _modelCtrl,
                decoration: _inputDecoration('Modelo (ej: Corolla)'),
                textCapitalization: TextCapitalization.words,
                validator: (v) => v?.trim().isEmpty == true ? 'Ingresa el modelo' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _colorCtrl,
                decoration: _inputDecoration('Color'),
                textCapitalization: TextCapitalization.words,
                validator: (v) => v?.trim().isEmpty == true ? 'Ingresa el color' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _yearCtrl,
                decoration: _inputDecoration('Año (ej: 2020)'),
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                validator: (v) {
                  final y = int.tryParse(v ?? '');
                  if (y == null) return 'Año inválido';
                  if (y < 1990 || y > DateTime.now().year + 1) return 'Año fuera de rango';
                  return null;
                },
              ),
              const SizedBox(height: 28),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: !_loading ? _submit : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: AppColors.secondary,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: _loading
                      ? const SizedBox(
                          width: 20, height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.secondary))
                      : Text('Registrar vehículo', style: AppTextStyles.labelLg),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: AppTextStyles.body.copyWith(color: AppColors.gray400),
        filled: true,
        fillColor: AppColors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: AppColors.gray200)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: AppColors.gray200)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.primary, width: 2)),
        errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: AppColors.error)),
        focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: AppColors.error, width: 2)),
      );
}
