import 'place_result.dart';

class SearchSuggestion {
  const SearchSuggestion._({
    required this.name,
    required this.address,
    required this.featureType,
    this.placeId,
    this.resolvedPlace,
  });

  // From Google Places Autocomplete — needs a Details call to get coords
  factory SearchSuggestion.fromGooglePlaces(Map<String, dynamic> p) {
    final main      = p['structured_formatting'] as Map<String, dynamic>? ?? {};
    final name      = main['main_text']      as String? ?? p['description'] as String? ?? '';
    final secondary = main['secondary_text'] as String? ?? '';
    final address   = secondary.isNotEmpty ? '$name, $secondary' : name;
    return SearchSuggestion._(
      name:        name,
      address:     address,
      featureType: _googleType(p['types'] as List? ?? []),
      placeId:     p['place_id'] as String?,
    );
  }

  // Coords already available (reverse geocode, saved location)
  factory SearchSuggestion.fromResolved(PlaceResult place, String featureType) {
    return SearchSuggestion._(
      name:          place.shortName,
      address:       place.displayName,
      featureType:   featureType,
      resolvedPlace: place,
    );
  }

  final String       name;
  final String       address;
  final String       featureType;
  final String?      placeId;       // set for Google Places results
  final PlaceResult? resolvedPlace; // set when coords are known

  bool get needsRetrieve => resolvedPlace == null && placeId != null;

  static String _googleType(List types) {
    if (types.contains('establishment') || types.contains('point_of_interest')) return 'poi';
    if (types.contains('street_address') || types.contains('route'))            return 'address';
    if (types.contains('neighborhood') || types.contains('sublocality'))        return 'neighborhood';
    return 'address';
  }
}
