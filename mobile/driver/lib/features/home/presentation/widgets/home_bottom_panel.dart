import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../profile/data/providers/profile_provider.dart';
import '../../../trip/data/models/trip_model.dart';
import '../../../trip/data/providers/trip_provider.dart';
import '../../../vehicle_request/data/providers/vehicle_request_provider.dart';
import '../../../vehicles/data/models/vehicle_model.dart';

class HomeBottomPanel extends ConsumerStatefulWidget {
  const HomeBottomPanel({required this.onToggle});
  final VoidCallback onToggle;

  @override
  ConsumerState<HomeBottomPanel> createState() => _HomeBottomPanelState();
}

class _HomeBottomPanelState extends ConsumerState<HomeBottomPanel> {
  bool _startingDay = false;
  bool _endingDay = false;

  Future<void> _startDay() async {
    if (_startingDay) return;
    setState(() => _startingDay = true);
    try {
      await ref.read(myApplicationsProvider.notifier).startDay();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('¡Jornada iniciada! Ya puedes recibir viajes.'),
            backgroundColor: Colors.green,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _startingDay = false);
    }
  }

  Future<void> _endDay() async {
    if (_endingDay) return;
    setState(() => _endingDay = true);
    try {
      await ref.read(driverProfileProvider.notifier).endDay();
      await ref.read(myApplicationsProvider.notifier).refresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Jornada terminada. ¡Hasta pronto!'),
            backgroundColor: Colors.orange,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _endingDay = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(driverProfileProvider);
    final tripAsync    = ref.watch(activeTripProvider);
    final acceptedApp  = ref.watch(myApplicationsProvider).value
        ?.where((a) => a.isAccepted)
        .firstOrNull;

    final profile   = profileAsync.value;
    final isOnline  = profile?.isOnline  ?? false;
    final isLooking = profile?.isLookingForWork ?? false;
    final isOwner   = profile?.isOwnerDriver ?? true;
    final loading   = profileAsync.isLoading;
    final activeTrip = tripAsync.value;

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [BoxShadow(color: Color(0x18000000), blurRadius: 24, offset: Offset(0, -4))],
      ),
      padding: EdgeInsets.fromLTRB(24, 20, 24, MediaQuery.of(context).padding.bottom + 16),
      child: activeTrip != null && activeTrip.isActive
          ? HomeActiveTripRow(trip: activeTrip)
          : isOwner
              ? HomeOfflineToggle(isOnline: isOnline, loading: loading, onToggle: widget.onToggle)
              : isOnline
                  ? HomeEndDayBanner(
                      loading: _endingDay,
                      onEndDay: _endDay,
                      vehicleInfo: acceptedApp?.vehicleInfo,
                      vehiclePlate: acceptedApp?.vehiclePlate,
                    )
                  : acceptedApp != null
                      ? HomeStartDayBanner(
                          vehicleInfo: acceptedApp.vehicleInfo,
                          vehiclePlate: acceptedApp.vehiclePlate,
                          loading: _startingDay,
                          onStartDay: _startDay,
                        )
                      : HomeLookingForWorkToggle(
                          isLooking: isLooking,
                          loading: loading,
                          onToggle: widget.onToggle,
                        ),
    );
  }
}

class HomeOfflineToggle extends StatelessWidget {
  const HomeOfflineToggle({
    required this.isOnline,
    required this.loading,
    required this.onToggle,
  });
  final bool isOnline;
  final bool loading;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 36, height: 4, margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(color: AppColors.gray200, borderRadius: BorderRadius.circular(2)),
        ),
        Text(isOnline ? '¡Jornada activa!' : '¿Listo para trabajar?', style: AppTextStyles.h3),
        const SizedBox(height: 4),
        Text(
          isOnline
              ? 'Estás disponible para recibir solicitudes de viaje'
              : 'Selecciona tu taxi y empieza a recibir viajes',
          style: AppTextStyles.body.copyWith(color: AppColors.gray500),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: loading ? null : onToggle,
            style: ElevatedButton.styleFrom(
              backgroundColor: isOnline ? AppColors.error : AppColors.primary,
              foregroundColor: isOnline ? AppColors.white : AppColors.secondary,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              elevation: 0,
            ),
            child: loading
                ? const SizedBox(
                    width: 22, height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.white))
                : Text(isOnline ? 'Terminar jornada' : 'Iniciar jornada', style: AppTextStyles.btnLg),
          ),
        ),
      ],
    );
  }
}

class HomeLookingForWorkToggle extends StatelessWidget {
  const HomeLookingForWorkToggle({
    required this.isLooking,
    required this.loading,
    required this.onToggle,
  });
  final bool isLooking;
  final bool loading;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 36, height: 4, margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(color: AppColors.gray200, borderRadius: BorderRadius.circular(2)),
        ),
        Text(isLooking ? '¡Estás buscando empleo!' : '¿Buscas trabajo?', style: AppTextStyles.h3),
        const SizedBox(height: 4),
        Text(
          isLooking
              ? 'Los dueños de taxi pueden encontrarte y asignarte una jornada'
              : 'Actívate para que los dueños de taxi vean tu perfil',
          style: AppTextStyles.body.copyWith(color: AppColors.gray500),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: loading ? null : onToggle,
            style: ElevatedButton.styleFrom(
              backgroundColor: isLooking ? AppColors.error : Colors.blue,
              foregroundColor: AppColors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              elevation: 0,
            ),
            child: loading
                ? const SizedBox(
                    width: 22, height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.white))
                : Text(isLooking ? 'Dejar de buscar' : 'Buscar empleo', style: AppTextStyles.btnLg),
          ),
        ),
      ],
    );
  }
}

class HomeOwnerStartDaySheet extends ConsumerStatefulWidget {
  const HomeOwnerStartDaySheet({required this.vehicles});
  final List<VehicleModel> vehicles;

  @override
  ConsumerState<HomeOwnerStartDaySheet> createState() => _HomeOwnerStartDaySheetState();
}

class _HomeOwnerStartDaySheetState extends ConsumerState<HomeOwnerStartDaySheet> {
  VehicleModel? _selected;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    if (widget.vehicles.length == 1) _selected = widget.vehicles.first;
  }

  Future<void> _start() async {
    if (_selected == null || _loading) return;
    setState(() => _loading = true);
    try {
      await ref.read(driverProfileProvider.notifier).startDay(vehicleId: _selected!.id);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40, height: 4,
              decoration: BoxDecoration(color: AppColors.gray300, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 18),
          Text('¿Con qué taxi trabajas hoy?', style: AppTextStyles.h3),
          const SizedBox(height: 4),
          Text('Selecciona el vehículo para iniciar tu jornada.',
              style: AppTextStyles.body.copyWith(color: AppColors.gray500)),
          const SizedBox(height: 18),
          ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.35,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: widget.vehicles.map((v) => HomeVehiclePickerTile(
                      vehicle: v,
                      selected: _selected?.id == v.id,
                      onTap: () => setState(() => _selected = v),
                    )).toList(),
              ),
            ),
          ),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: AppColors.secondary,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                elevation: 0,
              ),
              onPressed: _selected != null && !_loading ? _start : null,
              child: _loading
                  ? const SizedBox(width: 22, height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.5))
                  : Text('Iniciar jornada', style: AppTextStyles.btnLg),
            ),
          ),
        ],
      ),
    );
  }
}

class HomeVehiclePickerTile extends StatelessWidget {
  const HomeVehiclePickerTile({
    required this.vehicle,
    required this.selected,
    required this.onTap,
  });
  final VehicleModel vehicle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: selected ? AppColors.primaryLight : AppColors.gray50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.gray200,
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(Icons.directions_car,
                color: selected ? AppColors.secondary : AppColors.gray400, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                '${vehicle.brand} ${vehicle.model} · ${vehicle.plate}',
                style: AppTextStyles.label.copyWith(
                  color: selected ? AppColors.secondary : AppColors.gray700,
                ),
              ),
            ),
            if (selected)
              const Icon(Icons.check_circle, color: AppColors.primary, size: 20),
          ],
        ),
      ),
    );
  }
}

class HomeStartDayBanner extends StatelessWidget {
  const HomeStartDayBanner({
    required this.loading,
    required this.onStartDay,
    this.vehicleInfo,
    this.vehiclePlate,
  });
  final bool loading;
  final VoidCallback onStartDay;
  final String? vehicleInfo;
  final String? vehiclePlate;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 36, height: 4, margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(color: AppColors.gray200, borderRadius: BorderRadius.circular(2)),
        ),
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.green.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.directions_car, color: Colors.green, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('¡Tienes taxi asignado!',
                      style: AppTextStyles.labelLg.copyWith(color: Colors.green.shade700)),
                  Text(
                    vehicleInfo != null
                        ? '$vehicleInfo${vehiclePlate != null ? ' · $vehiclePlate' : ''}'
                        : 'Taxi asignado por el dueño',
                    style: AppTextStyles.caption,
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: loading ? null : onStartDay,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green,
              foregroundColor: AppColors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              elevation: 0,
            ),
            child: loading
                ? const SizedBox(
                    width: 22, height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.white))
                : Text('Iniciar jornada', style: AppTextStyles.btnLg),
          ),
        ),
      ],
    );
  }
}

class HomeEndDayBanner extends StatelessWidget {
  const HomeEndDayBanner({
    required this.loading,
    required this.onEndDay,
    this.vehicleInfo,
    this.vehiclePlate,
  });
  final bool loading;
  final VoidCallback onEndDay;
  final String? vehicleInfo;
  final String? vehiclePlate;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 36, height: 4, margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(color: AppColors.gray200, borderRadius: BorderRadius.circular(2)),
        ),
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.green.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.directions_car, color: Colors.green, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '¡Jornada activa!',
                    style: AppTextStyles.labelLg.copyWith(color: Colors.green.shade700),
                  ),
                  Text(
                    vehicleInfo != null
                        ? '$vehicleInfo${vehiclePlate != null ? ' · $vehiclePlate' : ''}'
                        : 'Recibiendo solicitudes de viaje',
                    style: AppTextStyles.caption,
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: loading ? null : onEndDay,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              foregroundColor: AppColors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              elevation: 0,
            ),
            child: loading
                ? const SizedBox(
                    width: 22, height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.white))
                : Text('Terminar jornada', style: AppTextStyles.btnLg),
          ),
        ),
      ],
    );
  }
}

class HomeActiveTripRow extends StatelessWidget {
  const HomeActiveTripRow({required this.trip});
  final TripModel trip;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Viaje en curso', style: AppTextStyles.caption.copyWith(color: AppColors.gray500)),
              Text(trip.clientName, style: AppTextStyles.labelLg),
              Text(
                trip.destinationAddress,
                style: AppTextStyles.body.copyWith(color: AppColors.gray400),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
        ElevatedButton(
          onPressed: () => context.push('/trip/${trip.id}'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: AppColors.secondary,
            elevation: 0,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: const Text('Ver viaje'),
        ),
      ],
    );
  }
}
