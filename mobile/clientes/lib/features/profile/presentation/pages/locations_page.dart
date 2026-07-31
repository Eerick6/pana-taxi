import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../home/domain/entities/saved_location.dart';
import '../../../home/presentation/providers/saved_locations_provider.dart';

class LocationsPage extends ConsumerWidget {
  const LocationsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locationsAsync = ref.watch(savedLocationsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text('Mis ubicaciones', style: AppTextStyles.h3),
      ),
      body: locationsAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.primary)),
        error: (_, _) => const SizedBox.shrink(),
        data: (locations) => _LocationsList(locations: locations),
      ),
    );
  }
}

class _LocationsList extends ConsumerWidget {
  const _LocationsList({required this.locations});
  final List<SavedLocation> locations;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordered = [
      ...locations.where((l) => l.type == SavedLocationType.home),
      ...locations.where((l) => l.type == SavedLocationType.work),
      ...locations.where((l) => l.type == SavedLocationType.other),
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Tiles de ubicaciones existentes
        ...ordered.map((loc) => _LocationTile(
              location: loc,
              onDelete: () => ref
                  .read(savedLocationsProvider.notifier)
                  .delete(loc.id),
              onEdit: () => _showEditSheet(context, ref, loc),
            )),

        const SizedBox(height: 12),

        // Botones agregar
        if (locations.every((l) => l.type != SavedLocationType.home))
          _AddButton(
            icon: Icons.home_outlined,
            label: 'Agregar casa',
            onTap: () => _showAddSheet(context, ref, SavedLocationType.home),
          ),
        if (locations.every((l) => l.type != SavedLocationType.work))
          _AddButton(
            icon: Icons.work_outline,
            label: 'Agregar trabajo',
            onTap: () => _showAddSheet(context, ref, SavedLocationType.work),
          ),
        _AddButton(
          icon: Icons.star_outline,
          label: 'Agregar otro lugar',
          onTap: () => _showAddSheet(context, ref, SavedLocationType.other),
        ),
      ],
    );
  }

  void _showAddSheet(BuildContext ctx, WidgetRef ref, SavedLocationType type) {
    _showLocationSheet(ctx, ref, type: type);
  }

  void _showEditSheet(BuildContext ctx, WidgetRef ref, SavedLocation loc) {
    _showLocationSheet(ctx, ref, type: loc.type, existing: loc);
  }

  void _showLocationSheet(BuildContext ctx, WidgetRef ref,
      {required SavedLocationType type, SavedLocation? existing}) {
    showModalBottomSheet(
      context: ctx,
      isScrollControlled: true,
      backgroundColor: AppColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetCtx) => _LocationSheet(
        type: type,
        existing: existing,
        onSave: (label, address, lat, lng) async {
          await ref.read(savedLocationsProvider.notifier).upsert(
            type: type, label: label, address: address, lat: lat, lng: lng,
          );
          if (sheetCtx.mounted) Navigator.pop(sheetCtx);
        },
      ),
    );
  }

  String _defaultLabel(SavedLocationType type) => switch (type) {
        SavedLocationType.home  => 'Casa',
        SavedLocationType.work  => 'Trabajo',
        SavedLocationType.other => '',
      };
}

class _LocationTile extends StatelessWidget {
  const _LocationTile({
    required this.location,
    required this.onDelete,
    required this.onEdit,
  });
  final SavedLocation location;
  final VoidCallback  onDelete;
  final VoidCallback  onEdit;

  IconData get _icon => switch (location.type) {
        SavedLocationType.home  => Icons.home_outlined,
        SavedLocationType.work  => Icons.work_outline,
        SavedLocationType.other => Icons.star_outline,
      };

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
        child: ListTile(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          leading: Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: AppColors.primaryLight,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(_icon, color: AppColors.secondary, size: 20),
          ),
          title: Text(location.label, style: AppTextStyles.label),
          subtitle: Text(location.address,
              style: AppTextStyles.caption, maxLines: 1,
              overflow: TextOverflow.ellipsis),
          trailing: PopupMenuButton<String>(
            onSelected: (v) => v == 'edit' ? onEdit() : onDelete(),
            itemBuilder: (_) => [
              PopupMenuItem(value: 'edit',
                  child: Text('Editar', style: AppTextStyles.body)),
              PopupMenuItem(value: 'delete',
                  child: Text('Eliminar',
                      style: AppTextStyles.body.copyWith(color: AppColors.error))),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddButton extends StatelessWidget {
  const _AddButton(
      {required this.icon, required this.label, required this.onTap});
  final IconData     icon;
  final String       label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.gray200, style: BorderStyle.solid),
          ),
          child: Row(
            children: [
              Icon(icon, color: AppColors.gray400, size: 20),
              const SizedBox(width: 12),
              Text(label,
                  style: AppTextStyles.body.copyWith(color: AppColors.gray500)),
              const Spacer(),
              const Icon(Icons.add, color: AppColors.gray400, size: 20),
            ],
          ),
        ),
      );
}

// ── Location Sheet con geocodificación ───────────────────────────────────────

class _LocationSheet extends ConsumerStatefulWidget {
  const _LocationSheet({required this.type, required this.onSave, this.existing});
  final SavedLocationType type;
  final SavedLocation? existing;
  final Future<void> Function(String label, String address, double lat, double lng) onSave;

  @override
  ConsumerState<_LocationSheet> createState() => _LocationSheetState();
}

class _LocationSheetState extends ConsumerState<_LocationSheet> {
  late final TextEditingController _labelCtrl;
  late final TextEditingController _addressCtrl;
  bool _geocoding = false;
  bool _saving    = false;
  String? _error;

  // Coordenadas geocodificadas
  double? _lat;
  double? _lng;
  String? _resolvedAddress;

  @override
  void initState() {
    super.initState();
    _labelCtrl   = TextEditingController(text: widget.existing?.label   ?? _defaultLabel(widget.type));
    _addressCtrl = TextEditingController(text: widget.existing?.address ?? '');
    if (widget.existing != null) {
      _lat = widget.existing!.lat;
      _lng = widget.existing!.lng;
      _resolvedAddress = widget.existing!.address;
    }
  }

  @override
  void dispose() {
    _labelCtrl.dispose();
    _addressCtrl.dispose();
    super.dispose();
  }

  String _defaultLabel(SavedLocationType t) => switch (t) {
    SavedLocationType.home  => 'Casa',
    SavedLocationType.work  => 'Trabajo',
    SavedLocationType.other => '',
  };

  Future<void> _geocode() async {
    final query = _addressCtrl.text.trim();
    if (query.length < 3) return;
    setState(() { _geocoding = true; _error = null; });
    try {
      final dio = Dio(BaseOptions(
        baseUrl: 'https://nominatim.openstreetmap.org',
        connectTimeout: const Duration(seconds: 8),
        receiveTimeout: const Duration(seconds: 8),
        headers: {'User-Agent': 'PanaTaxi/1.0'},
      ));
      final res = await dio.get<List<dynamic>>(
        '/search',
        queryParameters: {
          'q':            '$query, Ecuador',
          'format':       'jsonv2',
          'limit':        1,
          'accept-language': 'es',
          'countrycodes': 'ec',
        },
      );
      final results = res.data ?? [];
      if (results.isEmpty) {
        setState(() { _error = 'No se encontró la dirección. Intenta ser más específico.'; _geocoding = false; });
        return;
      }
      final first   = results.first as Map<String, dynamic>;
      final lat     = double.tryParse(first['lat'] as String? ?? '');
      final lng     = double.tryParse(first['lon'] as String? ?? '');
      final address = first['display_name'] as String? ?? query;
      if (lat == null || lng == null) {
        setState(() { _error = 'No se pudo obtener coordenadas.'; _geocoding = false; });
        return;
      }
      setState(() {
        _lat              = lat;
        _lng              = lng;
        _resolvedAddress  = address;
        _addressCtrl.text = address;
        _geocoding        = false;
      });
    } catch (_) {
      setState(() { _error = 'Error al buscar la dirección.'; _geocoding = false; });
    }
  }

  Future<void> _save() async {
    if (_lat == null || _lng == null) {
      setState(() => _error = 'Primero busca y confirma la dirección.');
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.onSave(
        widget.type == SavedLocationType.other ? _labelCtrl.text.trim() : _defaultLabel(widget.type),
        _resolvedAddress ?? _addressCtrl.text.trim(),
        _lat!,
        _lng!,
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final resolved = _lat != null;

    return Padding(
      padding: EdgeInsets.fromLTRB(24, 20, 24, MediaQuery.of(context).viewInsets.bottom + 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.existing == null ? 'Agregar ubicación' : 'Editar ubicación', style: AppTextStyles.h3),
          const SizedBox(height: 20),
          if (widget.type == SavedLocationType.other) ...[
            TextField(controller: _labelCtrl, decoration: _deco('Nombre (ej: Gym, Universidad…)')),
            const SizedBox(height: 12),
          ],
          Row(children: [
            Expanded(
              child: TextField(
                controller: _addressCtrl,
                decoration: _deco('Dirección (ej: Av. Amazonas y Colón, Quito)'),
                onSubmitted: (_) => _geocode(),
                onChanged: (_) => setState(() { _lat = null; _lng = null; }),
              ),
            ),
            const SizedBox(width: 8),
            _geocoding
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : IconButton(
                    icon: const Icon(Icons.search),
                    color: AppColors.primary,
                    onPressed: _geocode,
                    tooltip: 'Buscar dirección',
                  ),
          ]),
          if (resolved) ...[
            const SizedBox(height: 8),
            Row(children: [
              const Icon(Icons.check_circle, color: AppColors.success, size: 16),
              const SizedBox(width: 6),
              Expanded(child: Text('Ubicación confirmada', style: AppTextStyles.caption.copyWith(color: AppColors.success))),
            ]),
          ],
          if (_error != null) ...[
            const SizedBox(height: 6),
            Text(_error!, style: AppTextStyles.caption.copyWith(color: AppColors.error)),
          ],
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity, height: 50,
            child: ElevatedButton(
              onPressed: _saving ? null : (resolved ? _save : _geocode),
              child: _saving
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(resolved
                      ? (widget.existing == null ? 'Guardar' : 'Actualizar')
                      : 'Buscar dirección'),
            ),
          ),
        ],
      ),
    );
  }

  InputDecoration _deco(String hint) => InputDecoration(
    hintText: hint,
    hintStyle: AppTextStyles.body.copyWith(color: AppColors.gray400),
    filled: true, fillColor: AppColors.gray50,
    border:        OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.gray200)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.gray200)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.primary, width: 2)),
  );
}
