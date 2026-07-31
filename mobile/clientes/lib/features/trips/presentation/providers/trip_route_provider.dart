import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/place_result.dart';

class TripRoute {
  const TripRoute({this.origin, this.stops = const []});
  final PlaceResult?      origin;
  final List<PlaceResult> stops;

  bool get isValid => stops.isNotEmpty;

  TripRoute copyWith({
    PlaceResult? origin,
    bool clearOrigin = false,
    List<PlaceResult>? stops,
  }) =>
      TripRoute(
        origin: clearOrigin ? null : (origin ?? this.origin),
        stops: stops ?? this.stops,
      );
}

class TripRouteNotifier extends StateNotifier<TripRoute> {
  TripRouteNotifier() : super(const TripRoute());

  void setOrigin(PlaceResult? place) =>
      state = state.copyWith(origin: place, clearOrigin: place == null);

  void addStop(PlaceResult place) =>
      state = state.copyWith(stops: [...state.stops, place]);

  void updateStop(int index, PlaceResult place) {
    final list = [...state.stops];
    list[index] = place;
    state = state.copyWith(stops: list);
  }

  void removeStop(int index) {
    final list = [...state.stops]..removeAt(index);
    state = state.copyWith(stops: list);
  }

  void clear() => state = const TripRoute();
}

// autoDispose: la ruta se limpia al salir del flujo de booking
final tripRouteProvider =
    StateNotifierProvider.autoDispose<TripRouteNotifier, TripRoute>(
  (ref) => TripRouteNotifier(),
);
