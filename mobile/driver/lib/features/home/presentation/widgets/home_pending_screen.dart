import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../documents/data/models/document_model.dart';
import '../../../documents/data/providers/document_provider.dart';
import '../../../profile/data/models/driver_profile_model.dart';
import '../../../profile/data/providers/profile_provider.dart';
import '../../../vehicles/data/models/vehicle_model.dart';
import '../../../vehicles/data/providers/vehicle_provider.dart';

// Muestra loading overlay o pantalla de pendiente según el perfil
class HomeProfileGuard extends ConsumerWidget {
  const HomeProfileGuard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(driverProfileProvider);

    if (profileAsync.isLoading) {
      return const ColoredBox(
        color: AppColors.secondary,
        child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
      );
    }

    final profile = profileAsync.value;
    if (profile != null && !profile.isVerified) {
      return HomePendingScreen(profile: profile);
    }

    return const SizedBox.shrink();
  }
}

// Pantalla completa para conductor no aprobado
class HomePendingScreen extends ConsumerStatefulWidget {
  const HomePendingScreen({required this.profile});
  final DriverProfileModel profile;

  @override
  ConsumerState<HomePendingScreen> createState() => _HomePendingScreenState();
}

class _HomePendingScreenState extends ConsumerState<HomePendingScreen> {
  static const _requiredTypes = ['cedula_front', 'cedula_back', 'license_front', 'license_back'];

  DriverProfileModel get profile => widget.profile;

  static const _docLabels = {
    'cedula_front': 'Cédula — frente',
    'cedula_back': 'Cédula — reverso',
    'license_front': 'Licencia — frente',
    'license_back': 'Licencia — reverso',
    'profile_photo': 'Foto de perfil',
  };

  Future<void> _refresh() async {
    await ref.read(driverProfileProvider.notifier).refresh();
    ref.invalidate(documentsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final docsAsync = ref.watch(documentsProvider);

    return Scaffold(
      backgroundColor: AppColors.gray50,
      body: SafeArea(
        child: docsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
          error: (err, st) => _body(context, []),
          data: (docs) => _body(context, docs),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, List<DocumentModel> docs) {
    final docMap = <String, DocumentModel>{};
    for (final d in docs) {
      docMap.putIfAbsent(d.type, () => d);
    }
    final uploadedCount = _requiredTypes.where((t) => docMap.containsKey(t)).length;
    final anyUploaded = uploadedCount > 0;

    return RefreshIndicator(
      onRefresh: _refresh,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(Icons.directions_car, color: AppColors.secondary, size: 26),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Hola, ${profile.fullName.split(' ').first}', style: AppTextStyles.h3),
                    Text('Pana Taxista', style: AppTextStyles.caption.copyWith(color: AppColors.gray500)),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 28),

          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF8E1),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFFFD600)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.hourglass_top_rounded, color: Color(0xFFF59E0B), size: 20),
                    const SizedBox(width: 10),
                    Text(
                      'Cuenta en revisión',
                      style: AppTextStyles.labelLg.copyWith(color: const Color(0xFF92400E)),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Sube tu cédula y licencia de conducir para que el equipo de Pana Taxi pueda verificar tu perfil y habilitarte para recibir viajes.',
                  style: AppTextStyles.body.copyWith(color: const Color(0xFF78350F)),
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Documentos obligatorios', style: AppTextStyles.labelLg),
              Text(
                '$uploadedCount / ${_requiredTypes.length}',
                style: AppTextStyles.label.copyWith(
                  color: uploadedCount == _requiredTypes.length ? Colors.green : AppColors.gray500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: _requiredTypes.isEmpty ? 0 : uploadedCount / _requiredTypes.length,
              backgroundColor: AppColors.gray200,
              valueColor: AlwaysStoppedAnimation(
                uploadedCount == _requiredTypes.length ? Colors.green : AppColors.primary,
              ),
              minHeight: 6,
            ),
          ),

          const SizedBox(height: 14),

          ...(_requiredTypes.map((type) {
            final doc = docMap[type];
            final (color, label, icon) = doc == null
                ? (AppColors.gray300, 'Pendiente de subir', Icons.upload_outlined)
                : doc.isApproved
                    ? (Colors.green, 'Aprobado', Icons.check_circle_outline)
                    : doc.isPending
                        ? (AppColors.warningText, 'En revisión', Icons.hourglass_empty)
                        : (AppColors.errorText, 'Rechazado — vuelve a subir', Icons.cancel_outlined);

            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(12),
                border: doc?.isRejected == true
                    ? Border.all(color: AppColors.error.withValues(alpha: 0.4))
                    : null,
              ),
              child: Row(
                children: [
                  Icon(icon, size: 18, color: color),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_docLabels[type] ?? type, style: AppTextStyles.label),
                        if (doc?.rejectionReason != null)
                          Text(doc!.rejectionReason!,
                              style: AppTextStyles.caption.copyWith(color: AppColors.errorText)),
                      ],
                    ),
                  ),
                  Text(label, style: AppTextStyles.caption.copyWith(color: color)),
                ],
              ),
            );
          })),

          const SizedBox(height: 24),

          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton.icon(
              onPressed: () => context.push('/documents'),
              icon: const Icon(Icons.upload_file_outlined),
              label: Text(
                anyUploaded ? 'Gestionar documentos' : 'Subir documentos',
                style: AppTextStyles.btnLg,
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: AppColors.secondary,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                elevation: 0,
              ),
            ),
          ),


          const SizedBox(height: 20),

          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.gray100,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.info_outline, size: 16, color: AppColors.gray500),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'El equipo de Pana Taxi revisará tus documentos en un plazo de 24–48 horas. Recibirás una notificación cuando tu perfil sea aprobado.',
                    style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

}

// ── Guard de onboarding para dueño de taxi ────────────────────────────────────

class HomeOwnerProfileGuard extends ConsumerWidget {
  const HomeOwnerProfileGuard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(driverProfileProvider);
    final profile = profileAsync.value;

    // Solo aplica a owner_driver verificados por la plataforma
    if (profile == null || !profile.isVerified || !profile.isOwnerDriver) {
      return const SizedBox.shrink();
    }

    final vehiclesAsync = ref.watch(myVehiclesGuardProvider);

    // No bloquear mientras carga por primera vez
    if (vehiclesAsync.isLoading && vehiclesAsync.value == null) {
      return const SizedBox.shrink();
    }

    final vehicles = vehiclesAsync.value ?? [];
    final hasApprovedVehicle = vehicles.any((v) => v.isApproved);

    if (hasApprovedVehicle) return const SizedBox.shrink();

    return HomeOwnerOnboardingScreen(vehicles: vehicles);
  }
}

// ── Pantalla de onboarding para dueño de taxi ────────────────────────────────

class HomeOwnerOnboardingScreen extends ConsumerWidget {
  const HomeOwnerOnboardingScreen({required this.vehicles});
  final List<VehicleModel> vehicles;

  Future<void> _refresh(WidgetRef ref) async {
    await ref.read(driverProfileProvider.notifier).refresh();
    await ref.read(myVehiclesGuardProvider.notifier).refresh();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hasVehicles = vehicles.isNotEmpty;

    return Scaffold(
      backgroundColor: AppColors.gray50,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => _refresh(ref),
          color: AppColors.primary,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
            children: [
              // Header
              Row(
                children: [
                  Container(
                    width: 48, height: 48,
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(Icons.directions_car, color: AppColors.secondary, size: 26),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Pana Taxista — Dueño', style: AppTextStyles.h3),
                        Text('Registra tus taxis para comenzar', style: AppTextStyles.caption.copyWith(color: AppColors.gray500)),
                      ],
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 24),

              if (!hasVehicles) ...[
                // Paso 1: registrar primer taxi
                _StepCard(
                  step: 1,
                  title: 'Registra tu taxi',
                  body: 'Selecciona la cooperativa a la que quieres unirte, ingresa los datos de tu taxi y sube sus documentos. La cooperativa revisará y aprobará tu solicitud.',
                  done: false,
                ),
                const SizedBox(height: 12),
                _StepCard(step: 2, title: 'Sube los documentos del taxi', body: 'Matrícula, SOAT y revisión técnica.', done: false),
                const SizedBox(height: 12),
                _StepCard(step: 3, title: 'Espera la aprobación', body: 'La cooperativa revisará tu solicitud en 24–48 horas.', done: false),
                const SizedBox(height: 28),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton.icon(
                    onPressed: () => context.push('/vehicles/register'),
                    icon: const Icon(Icons.add),
                    label: Text('Registrar mi primer taxi', style: AppTextStyles.btnLg),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: AppColors.secondary,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      elevation: 0,
                    ),
                  ),
                ),
              ] else ...[
                // Tiene taxis pendientes — mostrar estado
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF8E1),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFFFFD600)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.hourglass_top_rounded, color: Color(0xFFF59E0B), size: 20),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Esperando aprobación', style: AppTextStyles.labelLg.copyWith(color: const Color(0xFF92400E))),
                            const SizedBox(height: 4),
                            Text('La cooperativa está revisando tu solicitud y los documentos de tus taxis. Recibirás una notificación cuando sean aprobados.', style: AppTextStyles.caption.copyWith(color: const Color(0xFF78350F))),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                Text('Mis taxis', style: AppTextStyles.labelLg),
                const SizedBox(height: 10),
                ...vehicles.map((v) => _VehicleStatusCard(vehicle: v)),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: OutlinedButton.icon(
                    onPressed: () => context.push('/vehicles/register'),
                    icon: const Icon(Icons.add, size: 18),
                    label: Text('Agregar otro taxi', style: AppTextStyles.label),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.secondary,
                      side: const BorderSide(color: AppColors.secondary),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
              ],

              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: AppColors.gray100, borderRadius: BorderRadius.circular(12)),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.info_outline, size: 16, color: AppColors.gray500),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Puedes tener varios taxis en distintas cooperativas. Cada taxi pertenece a una sola cooperativa, pero puedes ser socio de varias.',
                        style: AppTextStyles.caption.copyWith(color: AppColors.gray500),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StepCard extends StatelessWidget {
  const _StepCard({required this.step, required this.title, required this.body, required this.done});
  final int step;
  final String title;
  final String body;
  final bool done;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: done ? AppColors.success : AppColors.gray200),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 28, height: 28,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: done ? AppColors.success : AppColors.gray200,
            ),
            child: Center(
              child: done
                  ? const Icon(Icons.check, color: AppColors.white, size: 16)
                  : Text('$step', style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.w700)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppTextStyles.label.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(body, style: AppTextStyles.caption.copyWith(color: AppColors.gray500)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _VehicleStatusCard extends StatelessWidget {
  const _VehicleStatusCard({required this.vehicle});
  final VehicleModel vehicle;

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (vehicle.approvalStatus) {
      'approved' => (AppColors.success, 'Aprobado'),
      'rejected'  => (AppColors.errorText, 'Rechazado'),
      _           => (AppColors.warningText, 'En revisión'),
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.directions_car_outlined, size: 18, color: AppColors.gray500),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(vehicle.displayName, style: AppTextStyles.label),
                if (vehicle.cooperativeName != null)
                  Text(vehicle.cooperativeName!, style: AppTextStyles.caption.copyWith(color: AppColors.gray500)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(label, style: AppTextStyles.caption.copyWith(color: color)),
          ),
        ],
      ),
    );
  }
}
