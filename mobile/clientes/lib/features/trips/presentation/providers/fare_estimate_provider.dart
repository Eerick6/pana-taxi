import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/fare_estimate.dart';

// autoDispose: solo necesario durante el flujo de booking (HomeBottomSheet → searching)
final fareEstimateProvider = StateProvider.autoDispose<FareEstimate?>((ref) => null);
