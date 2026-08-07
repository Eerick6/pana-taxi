import 'package:go_router/go_router.dart';
import '../../features/auth/presentation/pages/auth_gate_page.dart';
import '../../features/auth/presentation/pages/splash_page.dart';
import '../../features/auth/presentation/pages/login_page.dart';
import '../../features/auth/presentation/pages/otp_page.dart';
import '../../features/auth/presentation/pages/register_page.dart';
import '../../features/home/presentation/pages/home_page.dart';
import '../../features/profile/presentation/pages/profile_page.dart';
import '../../features/profile/presentation/pages/locations_page.dart';
import '../../features/profile/presentation/pages/emergency_contacts_page.dart';
import '../../features/profile/presentation/pages/trip_history_page.dart';
import '../../features/profile/presentation/pages/terms_page.dart';
import '../../features/trips/presentation/pages/request_trip_page.dart';
import '../../features/trips/presentation/pages/destination_search_page.dart';
import '../../features/trips/domain/entities/active_trip.dart';
import '../../features/trips/presentation/pages/confirm_trip_page.dart';
import '../../features/trips/presentation/pages/searching_page.dart';
import '../../features/trips/presentation/pages/active_trip_page.dart';
import '../../features/trips/presentation/pages/payphone_webview_page.dart';
import '../../features/auth/presentation/pages/forgot_password_page.dart';
import '../../features/auth/presentation/pages/reset_password_page.dart';
import '../../features/notifications/presentation/pages/notifications_page.dart';
import '../../features/chat/presentation/pages/trip_chat_page.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const AuthGatePage(),
    ),
    GoRoute(
      path: '/welcome',
      builder: (context, state) => const WelcomePage(),
    ),
    GoRoute(
      path: '/login',
      builder: (context, state) => const LoginPage(),
    ),
    GoRoute(
      path: '/otp',
      builder: (context, state) {
        final extra = state.extra as Map<String, dynamic>;
        return OtpPage(
          phone:      extra['phone'] as String,
          flow:       extra['flow']  as String? ?? 'login',
          devCode:    extra['devCode']    as String?,
          photoBytes: extra['photoBytes'] as List<int>?,
        );
      },
    ),
    GoRoute(
      path: '/register',
      builder: (context, state) => const RegisterPage(),
    ),
    GoRoute(
      path: '/forgot-password',
      builder: (context, state) => const ForgotPasswordPage(),
    ),
    GoRoute(
      path: '/reset-password',
      builder: (context, state) {
        final extra = state.extra as Map? ?? {};
        return ResetPasswordPage(
          phone:   extra['phone'] as String? ?? '',
          devCode: extra['dev_code'] as String?,
        );
      },
    ),
    GoRoute(
      path: '/home',
      builder: (context, state) => const HomePage(),
    ),
    GoRoute(
      path: '/profile',
      builder: (context, state) => const ProfilePage(),
    ),
    GoRoute(
      path: '/profile/locations',
      builder: (context, state) => const LocationsPage(),
    ),
    GoRoute(
      path: '/profile/emergency-contacts',
      builder: (context, state) => const EmergencyContactsPage(),
    ),
    GoRoute(
      path: '/profile/trips',
      builder: (context, state) => const TripHistoryPage(),
    ),
    GoRoute(
      path: '/profile/terms',
      builder: (context, state) => const TermsPage(),
    ),
    GoRoute(
      path: '/request',
      builder: (context, state) => const RequestTripPage(),
    ),
    GoRoute(
      path: '/request/destination',
      builder: (context, state) => const DestinationSearchPage(),
    ),
    GoRoute(
      path: '/request/confirm',
      builder: (context, state) => const ConfirmTripPage(),
    ),
    GoRoute(
      path: '/searching',
      builder: (context, state) =>
          SearchingPage(initialTrip: state.extra! as ActiveTrip),
    ),
    GoRoute(
      path: '/trip/:id',
      builder: (context, state) =>
          ActiveTripPage(tripId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/payphone/:tripId/:amount',
      builder: (context, state) => PayphoneWebViewPage(
        tripId: state.pathParameters['tripId']!,
        amount: double.tryParse(state.pathParameters['amount']!) ?? 0,
      ),
    ),
    GoRoute(
      path: '/notifications',
      builder: (context, state) => const NotificationsPage(),
    ),
    GoRoute(
      path: '/chat/:conversationId',
      builder: (context, state) {
        final extra = state.extra as Map<String, dynamic>?;
        return TripChatPage(
          conversationId: state.pathParameters['conversationId']!,
          driverName: extra?['driverName'] as String?,
        );
      },
    ),
  ],
);
