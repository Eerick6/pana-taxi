import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../profile/data/providers/profile_provider.dart';

// Chip de estado — solo se reconstruye cuando cambia driverProfileProvider
class HomeTopBarChip extends ConsumerStatefulWidget {
  const HomeTopBarChip({required this.onToggle});
  final VoidCallback onToggle;

  @override
  ConsumerState<HomeTopBarChip> createState() => _HomeTopBarChipState();
}

class _HomeTopBarChipState extends ConsumerState<HomeTopBarChip> {
  bool _toggling = false;

  Future<void> _toggle() async {
    final profile = ref.read(driverProfileProvider).value;
    if (profile == null || _toggling || !profile.isVerified) return;

    if (profile.isOwnerDriver) {
      if (profile.isOnline) {
        setState(() => _toggling = true);
        try {
          await ref.read(driverProfileProvider.notifier).endDay();
        } catch (e) {
          if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: Colors.red.shade700, behavior: SnackBarBehavior.floating,
          ));
        } finally {
          if (mounted) setState(() => _toggling = false);
        }
      } else {
        widget.onToggle();
      }
      return;
    }

    setState(() => _toggling = true);
    try {
      final newStatus = profile.isLookingForWork ? 'offline' : 'looking_for_work';
      await ref.read(driverProfileProvider.notifier).setStatus(newStatus);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(e.toString().replaceAll('Exception: ', '')),
        backgroundColor: Colors.red.shade700, behavior: SnackBarBehavior.floating,
      ));
    } finally {
      if (mounted) setState(() => _toggling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(driverProfileProvider);
    return GestureDetector(
      onTap: _toggle,
      child: HomeStatusChip(
        isOnline:  profileAsync.value?.isOnline  ?? false,
        isLooking: profileAsync.value?.isLookingForWork ?? false,
        loading:   _toggling || profileAsync.isLoading,
      ),
    );
  }
}

class HomeStatusChip extends StatelessWidget {
  const HomeStatusChip({
    required this.isOnline,
    required this.isLooking,
    required this.loading,
  });
  final bool isOnline;
  final bool isLooking;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final (color, label) = isOnline
        ? (Colors.green, 'Disponible')
        : isLooking
            ? (Colors.blue, 'Buscando empleo')
            : (AppColors.gray400, 'No disponible');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 10, offset: const Offset(0, 3))],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          loading
              ? const SizedBox(width: 10, height: 10, child: CircularProgressIndicator(strokeWidth: 2))
              : Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                ),
          const SizedBox(width: 8),
          Text(label, style: AppTextStyles.label),
        ],
      ),
    );
  }
}

class HomeTopIconBtn extends StatelessWidget {
  const HomeTopIconBtn({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 10, offset: const Offset(0, 3))],
        ),
        child: Icon(icon, color: AppColors.gray700, size: 22),
      ),
    );
  }
}
