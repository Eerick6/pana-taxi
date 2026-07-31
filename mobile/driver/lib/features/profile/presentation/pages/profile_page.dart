import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../auth/data/providers/auth_provider.dart';
import '../../data/models/driver_profile_model.dart';
import '../../data/providers/profile_provider.dart';
import '../../../ratings/data/providers/ratings_provider.dart';
import '../../../trip/data/providers/trip_provider.dart';

class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(driverProfileProvider);

    return Scaffold(
      backgroundColor: AppColors.gray50,
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('Error cargando perfil', style: AppTextStyles.body),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () => ref.refresh(driverProfileProvider),
                child: const Text('Reintentar'),
              ),
            ],
          ),
        ),
        data: (profile) => _ProfileContent(profile: profile),
      ),
    );
  }
}

class _ProfileContent extends ConsumerWidget {
  const _ProfileContent({required this.profile});
  final DriverProfileModel profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hasActiveTrip = ref.watch(activeTripProvider).value != null;
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          expandedHeight: 200,
          pinned: true,
          backgroundColor: AppColors.secondary,
          flexibleSpace: FlexibleSpaceBar(
            background: Container(
              color: AppColors.secondary,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SizedBox(height: 40),
                  CircleAvatar(
                    radius: 44,
                    backgroundColor: AppColors.primary,
                    child: profile.photoUrl != null
                        ? ClipOval(
                            child: CachedNetworkImage(
                              imageUrl: profile.photoUrl!,
                              width: 88, height: 88, fit: BoxFit.cover,
                              errorWidget: (_, __, ___) => Text(
                                profile.fullName.isNotEmpty
                                    ? profile.fullName[0].toUpperCase()
                                    : '?',
                                style: AppTextStyles.h1.copyWith(color: AppColors.secondary),
                              ),
                              placeholder: (_, __) => const SizedBox.shrink(),
                            ),
                          )
                        : Text(
                            profile.fullName.isNotEmpty
                                ? profile.fullName[0].toUpperCase()
                                : '?',
                            style: AppTextStyles.h1.copyWith(color: AppColors.secondary),
                          ),
                  ),
                  const SizedBox(height: 10),
                  Text(profile.fullName, style: AppTextStyles.h3.copyWith(color: AppColors.white)),
                  const SizedBox(height: 4),
                  _StatusBadge(status: profile.status),
                ],
              ),
            ),
          ),
        ),

        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                _InfoCard(children: [
                  _InfoRow(icon: Icons.phone_outlined, label: 'Teléfono', value: profile.phone),
                  _InfoRow(
                    icon: Icons.badge_outlined,
                    label: 'Tipo',
                    value: profile.isOwnerDriver ? 'Dueño de taxi' : 'Conductor',
                  ),
                  if (profile.cooperativeName != null)
                    _InfoRow(
                      icon: Icons.business_outlined,
                      label: 'Cooperativa',
                      value: profile.cooperativeName!,
                    ),
                  if (profile.licenseNumber != null)
                    _InfoRow(
                      icon: Icons.credit_card_outlined,
                      label: 'Licencia',
                      value: profile.licenseNumber!,
                    ),
                ]),

                const SizedBox(height: 12),

                _RatingsCard(profile: profile),

                const SizedBox(height: 12),

                _InfoCard(children: [
                  _MenuRow(
                    icon: Icons.history_outlined,
                    label: 'Mis viajes',
                    onTap: () => context.push('/driver-trips'),
                  ),
                  _MenuRow(
                    icon: Icons.folder_outlined,
                    label: 'Mis documentos',
                    onTap: () => context.push('/documents'),
                  ),
                  if (!hasActiveTrip)
                    _MenuRow(
                      icon: profile.isOwnerDriver
                          ? Icons.directions_car_outlined
                          : Icons.work_outline,
                      label: profile.isOwnerDriver ? 'Mis taxis' : 'Empleos',
                      onTap: () => context.push(
                        profile.isOwnerDriver ? '/vehicles' : '/vehicle-requests',
                      ),
                    ),
                  _MenuRow(
                    icon: Icons.notifications_outlined,
                    label: 'Notificaciones',
                    onTap: () => context.push('/notifications'),
                  ),
                  _MenuRow(
                    icon: Icons.help_outline,
                    label: 'Soporte',
                    onTap: () async {
                      final uri = Uri.parse('mailto:soporte@panataxista.com?subject=Soporte+conductor');
                      if (await canLaunchUrl(uri)) await launchUrl(uri);
                    },
                  ),
                ]),

                const SizedBox(height: 12),

                _InfoCard(children: [
                  _MenuRow(
                    icon: Icons.logout,
                    label: 'Cerrar sesión',
                    color: AppColors.error,
                    onTap: () async {
                      final confirm = await showDialog<bool>(
                        context: context,
                        builder: (dialogCtx) => AlertDialog(
                          title: const Text('Cerrar sesión'),
                          content: const Text('¿Estás seguro que deseas salir?'),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(dialogCtx, false),
                              child: const Text('Cancelar'),
                            ),
                            TextButton(
                              onPressed: () => Navigator.pop(dialogCtx, true),
                              child: Text('Salir', style: TextStyle(color: AppColors.errorText)),
                            ),
                          ],
                        ),
                      );
                      if (confirm == true && context.mounted) {
                        await ref.read(authStateProvider.notifier).logout();
                        if (context.mounted) context.go('/auth/welcome');
                      }
                    },
                  ),
                ]),

                const SizedBox(height: 32),
                Text(
                  profile.isVerified ? '✓ Cuenta verificada' : 'Cuenta pendiente de verificación',
                  style: AppTextStyles.caption.copyWith(
                    color: profile.isVerified ? Colors.green : AppColors.gray400,
                  ),
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      'online' => ('En línea', Colors.green),
      'busy' => ('Ocupado', AppColors.primary),
      _ => ('Desconectado', AppColors.gray400),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity( 0.2),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color, width: 1),
      ),
      child: Text(label, style: AppTextStyles.caption.copyWith(color: color)),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity( 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        children: children.asMap().entries.map((e) {
          final isLast = e.key == children.length - 1;
          return Column(
            children: [
              e.value,
              if (!isLast) const Divider(height: 1, indent: 52),
            ],
          );
        }).toList(),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.gray400),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: AppTextStyles.caption),
              const SizedBox(height: 2),
              Text(value, style: AppTextStyles.labelLg),
            ],
          ),
        ],
      ),
    );
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({required this.icon, required this.label, required this.onTap, this.color});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.secondary;
    return ListTile(
      leading: Icon(icon, color: c, size: 22),
      title: Text(label, style: AppTextStyles.labelLg.copyWith(color: c)),
      trailing: Icon(Icons.chevron_right, color: AppColors.gray300, size: 20),
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16),
    );
  }
}

// ── Tarjeta de calificaciones ──────────────────────────────────────────────────

class _RatingsCard extends ConsumerWidget {
  const _RatingsCard({required this.profile});
  final DriverProfileModel profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (profile.isOwnerDriver) {
      final statsAsync = ref.watch(ownerRatingStatsProvider(profile.id));
      return statsAsync.when(
        loading: () => _buildCard(0.0, 0),
        error: (_, __) => const SizedBox.shrink(),
        data: (s) => _buildCard(s.average, s.total),
      );
    } else {
      final statsAsync = ref.watch(driverRatingStatsProvider(profile.id));
      return statsAsync.when(
        loading: () => _buildCard(0.0, 0),
        error: (_, __) => const SizedBox.shrink(),
        data: (s) => _buildCard(s.overallAvg, s.total),
      );
    }
  }

  Widget _buildCard(double avg, int total) {
    final hasRatings = total > 0;
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            // Estrellas
            ...List.generate(5, (i) {
              final filled = hasRatings && i < avg.floor();
              final half = hasRatings && !filled && i < avg;
              return Icon(
                filled ? Icons.star_rounded : (half ? Icons.star_half_rounded : Icons.star_outline_rounded),
                color: hasRatings ? AppColors.primary : AppColors.gray300,
                size: 22,
              );
            }),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  hasRatings ? avg.toStringAsFixed(1) : 'Sin calificaciones',
                  style: AppTextStyles.labelLg,
                ),
                if (hasRatings)
                  Text('$total reseña${total == 1 ? '' : 's'}', style: AppTextStyles.caption),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
