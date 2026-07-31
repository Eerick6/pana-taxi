enum SavedLocationType { home, work, other }

class SavedLocation {
  const SavedLocation({
    required this.id,
    required this.type,
    required this.label,
    required this.address,
    required this.lat,
    required this.lng,
  });

  final String            id;
  final SavedLocationType type;
  final String            label;
  final String            address;
  final double            lat;
  final double            lng;

  SavedLocation copyWith({String? label, String? address, double? lat, double? lng}) =>
      SavedLocation(
        id:      id,
        type:    type,
        label:   label   ?? this.label,
        address: address ?? this.address,
        lat:     lat     ?? this.lat,
        lng:     lng     ?? this.lng,
      );

  Map<String, dynamic> toJson() => {
    'id': id, 'type': type.name, 'label': label,
    'address': address, 'lat': lat, 'lng': lng,
  };

  factory SavedLocation.fromJson(Map<String, dynamic> j) => SavedLocation(
    id:      j['id']      as String,
    type:    SavedLocationType.values.byName(j['type'] as String),
    label:   j['label']   as String,
    address: j['address'] as String,
    lat:     (j['lat']    as num).toDouble(),
    lng:     (j['lng']    as num).toDouble(),
  );
}
