class PlaceResult {
  const PlaceResult({
    required this.displayName,
    required this.shortName,
    required this.lat,
    required this.lng,
  });

  final String displayName;
  final String shortName;
  final double lat;
  final double lng;

  // Geocoding v6 — para reverse geocode y fallback
  factory PlaceResult.fromGeocodingV6(Map<String, dynamic> feature) {
    final props  = feature['properties'] as Map<String, dynamic>;
    final coords = (feature['geometry']['coordinates'] as List);
    final name   = props['name']          as String? ?? '';
    final full   = props['full_address']  as String?
        ?? props['place_formatted']       as String?
        ?? name;
    final parts  = full.split(', ');
    final short  = parts.length >= 2 ? '${parts[0]}, ${parts[1]}' : parts[0];
    return PlaceResult(
      displayName: full.isEmpty  ? name : full,
      shortName:   short.isEmpty ? full : short,
      lat: (coords[1] as num).toDouble(),
      lng: (coords[0] as num).toDouble(),
    );
  }

  // Search Box API retrieve — POIs con datos Foursquare
  factory PlaceResult.fromSearchBoxRetrieve(Map<String, dynamic> feature) {
    final props  = feature['properties'] as Map<String, dynamic>;
    final coords = (feature['geometry']['coordinates'] as List);
    final name   = props['name']         as String? ?? '';
    final full   = props['full_address'] as String?
        ?? props['place_formatted']      as String?
        ?? name;
    final parts = full.split(', ');
    final short = parts.length >= 2 ? '${parts[0]}, ${parts[1]}' : parts[0];
    return PlaceResult(
      displayName: full.isEmpty  ? name : full,
      shortName:   short.isEmpty ? full : short,
      lat: (coords[1] as num).toDouble(),
      lng: (coords[0] as num).toDouble(),
    );
  }
}
