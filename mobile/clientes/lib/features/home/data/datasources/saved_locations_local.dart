import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import '../../domain/entities/saved_location.dart';

class SavedLocationsLocal {
  static const _key = 'saved_locations';

  Future<List<SavedLocation>> getAll() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? [];
    return raw
        .map((s) => SavedLocation.fromJson(jsonDecode(s) as Map<String, dynamic>))
        .toList();
  }

  Future<void> save(SavedLocation location) async {
    final all = await getAll();
    // reemplaza si ya existe el mismo tipo home/work
    final idx = all.indexWhere((l) => l.id == location.id);
    if (idx >= 0) {
      all[idx] = location;
    } else {
      all.add(location);
    }
    await _persist(all);
  }

  Future<SavedLocation> upsertByType({
    required SavedLocationType type,
    required String label,
    required String address,
    required double lat,
    required double lng,
  }) async {
    final all = await getAll();
    final idx = all.indexWhere((l) => l.type == type);
    final location = SavedLocation(
      id:      idx >= 0 ? all[idx].id : const Uuid().v4(),
      type:    type,
      label:   label,
      address: address,
      lat:     lat,
      lng:     lng,
    );
    if (idx >= 0) {
      all[idx] = location;
    } else {
      all.add(location);
    }
    await _persist(all);
    return location;
  }

  Future<void> delete(String id) async {
    final all = await getAll();
    all.removeWhere((l) => l.id == id);
    await _persist(all);
  }

  Future<void> _persist(List<SavedLocation> all) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, all.map((l) => jsonEncode(l.toJson())).toList());
  }
}

final savedLocationsLocalProvider =
    Provider<SavedLocationsLocal>((_) => SavedLocationsLocal());
