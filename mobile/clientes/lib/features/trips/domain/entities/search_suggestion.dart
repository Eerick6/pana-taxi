import 'place_result.dart';

class SearchSuggestion {
  const SearchSuggestion._({
    required this.name,
    required this.address,
    required this.featureType,
    this.mapboxId,
    this.resolvedPlace,
  });

  // From Search Box /suggest — needs a /retrieve call to get coords
  factory SearchSuggestion.fromSearchBox(Map<String, dynamic> s) {
    final name = s['name'] as String? ?? '';
    final address = s['full_address'] as String?
        ?? s['place_formatted'] as String?
        ?? name;
    return SearchSuggestion._(
      name:        name,
      address:     address,
      featureType: s['feature_type'] as String? ?? 'poi',
      mapboxId:    s['mapbox_id'] as String?,
    );
  }

  // From Geocoding v6 — coords already available, no retrieve needed
  factory SearchSuggestion.fromV6(PlaceResult place, String featureType) {
    return SearchSuggestion._(
      name:          place.shortName,
      address:       place.displayName,
      featureType:   featureType,
      resolvedPlace: place,
    );
  }

  final String name;
  final String address;
  final String featureType;
  final String? mapboxId;           // set for Search Box results
  final PlaceResult? resolvedPlace; // set for v6 results

  bool get needsRetrieve => resolvedPlace == null;
}
