import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/presentation/pages/splash_page.dart';
import '../../features/auth/presentation/pages/welcome_page.dart';
import '../../features/auth/presentation/pages/login_page.dart';
import '../../features/auth/presentation/pages/register_page.dart';
import '../../features/auth/presentation/pages/otp_page.dart';
import '../../features/auth/presentation/pages/onboarding_page.dart';
import '../../features/home/presentation/pages/home_page.dart';
import '../../features/trip/presentation/pages/trip_active_page.dart';
import '../../features/documents/presentation/pages/documents_page.dart';
import '../../features/vehicle_request/presentation/pages/vehicle_requests_page.dart';
import '../../features/vehicle_request/presentation/pages/owner_job_requests_page.dart';
import '../../features/vehicle_request/presentation/pages/owner_applicants_page.dart';
import '../../features/vehicles/presentation/pages/my_vehicles_page.dart';
import '../../features/vehicles/presentation/pages/register_vehicle_page.dart';
import '../../features/vehicles/presentation/pages/vehicle_documents_page.dart';
import '../../features/vehicles/presentation/pages/join_cooperative_page.dart';
import '../../features/chat/presentation/pages/chat_list_page.dart';
import '../../features/chat/presentation/pages/chat_conversation_page.dart';
import '../../features/wallet/presentation/pages/wallet_page.dart';
import '../../features/profile/presentation/pages/profile_page.dart';
import '../../features/trip/presentation/pages/driver_trips_history_page.dart';
import '../../features/notifications/presentation/pages/notifications_page.dart';

// El router es estático — la navegación la maneja el SplashPage.
// No se recrea con cada cambio de auth para evitar resets de navegación.
final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/splash',
    debugLogDiagnostics: false,
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashPage()),

      // ── Auth ────────────────────────────────────────────────────────────────
      GoRoute(path: '/auth/welcome',  builder: (_, _) => const WelcomePage()),
      GoRoute(path: '/auth/login',    builder: (_, _) => const LoginPage()),
      GoRoute(path: '/auth/register', builder: (_, _) => const RegisterPage()),
      GoRoute(
        path: '/auth/otp',
        builder: (_, state) {
          final extra = state.extra;
          if (extra is Map) {
            return OtpPage(
              phone: extra['phone'] as String,
              devCode: extra['dev_code'] as String?,
            );
          }
          return OtpPage(phone: extra as String);
        },
      ),
      GoRoute(path: '/auth/onboarding', builder: (_, _) => const OnboardingPage()),

      // ── Main shell (4 tabs: Mapa | Mensajes | Billetera | Perfil) ────────────
      ShellRoute(
        builder: (context, state, child) => _MainShell(child: child),
        routes: [
          GoRoute(
            path: '/home',
            pageBuilder: (_, _) => const NoTransitionPage(child: HomePage()),
          ),
          GoRoute(
            path: '/chat',
            pageBuilder: (_, _) => const NoTransitionPage(child: ChatListPage()),
          ),
          GoRoute(
            path: '/wallet',
            pageBuilder: (_, _) => const NoTransitionPage(child: WalletPage()),
          ),
          GoRoute(
            path: '/profile',
            pageBuilder: (_, _) => const NoTransitionPage(child: ProfilePage()),
          ),
        ],
      ),

      // ── Fuera del shell (sin bottom nav, con flecha de regreso) ────────────
      GoRoute(
        path: '/trip/:tripId',
        builder: (_, state) => TripActivePage(
          tripId: state.pathParameters['tripId']!,
        ),
      ),
      GoRoute(path: '/driver-trips',  builder: (_, _) => const DriverTripsHistoryPage()),
      GoRoute(path: '/notifications', builder: (_, _) => const NotificationsPage()),
      GoRoute(path: '/documents',    builder: (_, _) => const DocumentsPage()),
      GoRoute(path: '/cooperatives/join', builder: (_, _) => const JoinCooperativePage()),
      // Conductores sin vehículo propio — solicitudes de trabajo
      GoRoute(path: '/vehicle-requests', builder: (_, _) => const VehicleRequestsPage()),
      // Dueños — gestión de sus taxis
      GoRoute(
        path: '/vehicles',
        builder: (_, _) => const MyVehiclesPage(),
        routes: [
          GoRoute(path: 'register', builder: (_, _) => const RegisterVehiclePage()),
          GoRoute(
            path: ':vehicleId/documents',
            builder: (_, state) => VehicleDocumentsPage(
              vehicleId: state.pathParameters['vehicleId']!,
            ),
          ),
        ],
      ),
      GoRoute(
        path: '/chat/:conversationId',
        builder: (_, state) => ChatConversationPage(
          conversationId: state.pathParameters['conversationId']!,
        ),
      ),
      GoRoute(path: '/owner-requests', builder: (_, _) => const OwnerJobRequestsPage()),
      GoRoute(
        path: '/owner-requests/:requestId/applicants',
        builder: (_, state) => OwnerApplicantsPage(
          requestId: state.pathParameters['requestId']!,
          vehicleInfo: state.extra as String? ?? 'Taxi',
        ),
      ),
    ],
  );
});

// ── Shell con bottom navigation bar ──────────────────────────────────────────

class _MainShell extends ConsumerWidget {
  const _MainShell({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const tabs = [
      _TabItem(icon: Icons.map_outlined,                    activeIcon: Icons.map,                    label: 'Mapa',      path: '/home'),
      _TabItem(icon: Icons.chat_bubble_outline,             activeIcon: Icons.chat_bubble,            label: 'Mensajes',  path: '/chat'),
      _TabItem(icon: Icons.account_balance_wallet_outlined, activeIcon: Icons.account_balance_wallet, label: 'Billetera', path: '/wallet'),
      _TabItem(icon: Icons.person_outline,                  activeIcon: Icons.person,                 label: 'Perfil',    path: '/profile'),
    ];

    final location = GoRouterState.of(context).matchedLocation;
    final currentIndex = tabs.indexWhere((t) => location.startsWith(t.path));

    return Scaffold(
      body: child,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: currentIndex < 0 ? 0 : currentIndex,
        onTap: (i) => context.go(tabs[i].path),
        items: tabs
            .map((t) => BottomNavigationBarItem(
                  icon: Icon(t.icon),
                  activeIcon: Icon(t.activeIcon),
                  label: t.label,
                ))
            .toList(),
      ),
    );
  }
}

class _TabItem {
  const _TabItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.path,
  });
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final String path;
}
