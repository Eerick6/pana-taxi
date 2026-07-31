import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/services/geocoding_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../home/domain/entities/saved_location.dart';
import '../../../home/presentation/providers/saved_locations_provider.dart';
import '../../domain/entities/place_result.dart';
import '../../domain/entities/search_suggestion.dart';
import '../providers/trip_route_provider.dart';
import 'pin_picker_page.dart';

class DestinationSearchPage extends ConsumerStatefulWidget {
  const DestinationSearchPage({super.key});

  @override
  ConsumerState<DestinationSearchPage> createState() =>
      _DestinationSearchPageState();
}

class _DestinationSearchPageState
    extends ConsumerState<DestinationSearchPage> {
  final _ctrl  = TextEditingController();
  final _focus = FocusNode();

  List<SearchSuggestion> _suggestions = [];
  bool _searching = false;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onChanged(String v) {
    _debounce?.cancel();
    if (v.trim().length < 2) {
      setState(() { _suggestions = []; _searching = false; });
      return;
    }
    setState(() => _searching = true);
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      final origin  = ref.read(tripRouteProvider).origin;
      final results = await ref.read(geocodingServiceProvider).suggest(
        v,
        lat: origin?.lat,
        lng: origin?.lng,
      );
      if (mounted) setState(() { _suggestions = results; _searching = false; });
    });
  }

  void _select(SearchSuggestion s) {
    if (s.resolvedPlace != null) context.pop(s.resolvedPlace!);
  }

  Future<void> _openPinPicker() async {
    final origin = ref.read(tripRouteProvider).origin;
    final result = await Navigator.of(context).push<PlaceResult>(
      MaterialPageRoute(builder: (_) => PinPickerPage(
        initialLat: origin?.lat,
        initialLng: origin?.lng,
      )),
    );
    if (result != null && mounted) context.pop(result);
  }

  void _selectSaved(SavedLocation loc) => context.pop(PlaceResult(
        displayName: loc.address,
        shortName:   loc.label,
        lat:         loc.lat,
        lng:         loc.lng,
      ));

  @override
  Widget build(BuildContext context) {
    final saved  = ref.watch(savedLocationsProvider).valueOrNull ?? [];
    final home   = saved.where((l) => l.type == SavedLocationType.home).firstOrNull;
    final work   = saved.where((l) => l.type == SavedLocationType.work).firstOrNull;
    final others = saved.where((l) => l.type == SavedLocationType.other).toList();

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          onPressed: () => context.pop(),
        ),
        title: TextField(
          controller:        _ctrl,
          focusNode:         _focus,
          onChanged:         _onChanged,
          style:             AppTextStyles.body,
          cursorColor:       AppColors.gray700,
          cursorWidth:       1.5,
          autocorrect:       false,
          enableSuggestions: false,
          decoration: InputDecoration(
            hintText:       '¿A dónde vas?',
            hintStyle:      AppTextStyles.body.copyWith(color: AppColors.gray400),
            border:         InputBorder.none,
            enabledBorder:  InputBorder.none,
            focusedBorder:  InputBorder.none,
            disabledBorder: InputBorder.none,
            suffixIcon: _ctrl.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.close, size: 18, color: AppColors.gray400),
                        onPressed: () {
                          _ctrl.clear();
                          setState(() { _suggestions = []; _searching = false; });
                        },
                      )
                    : null,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Elegir en el mapa',
            icon: const Icon(Icons.map_outlined, color: AppColors.gray700),
            onPressed: _openPinPicker,
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: AppColors.gray100),
        ),
      ),
      body: _searching
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : _suggestions.isNotEmpty
              ? _SuggestionsList(suggestions: _suggestions, onSelect: _select)
              : _EmptyState(home: home, work: work, others: others, onSelect: _selectSaved, onPickMap: _openPinPicker),
    );
  }
}

class _SuggestionsList extends StatelessWidget {
  const _SuggestionsList({required this.suggestions, required this.onSelect});
  final List<SearchSuggestion>         suggestions;
  final ValueChanged<SearchSuggestion> onSelect;

  @override
  Widget build(BuildContext context) => ListView.separated(
        itemCount: suggestions.length,
        separatorBuilder: (_, _) => const Divider(height: 1, color: AppColors.gray100),
        itemBuilder: (_, i) {
          final s = suggestions[i];
          return ListTile(
            leading: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: AppColors.gray100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                _iconFor(s.featureType),
                color: AppColors.gray500,
                size: 18,
              ),
            ),
            title: Text(s.name,
                style: AppTextStyles.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
            subtitle: Text(s.address,
                style: AppTextStyles.caption.copyWith(color: AppColors.gray400),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
            onTap: () => onSelect(s),
          );
        },
      );

  IconData _iconFor(String type) => switch (type) {
        'poi'          => Icons.place_outlined,
        'address'      => Icons.home_outlined,
        'street'       => Icons.fork_right_outlined,
        'neighborhood' => Icons.location_city_outlined,
        _              => Icons.location_on_outlined,
      };
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.home, required this.work,
    required this.others, required this.onSelect,
    required this.onPickMap,
  });
  final SavedLocation?              home;
  final SavedLocation?              work;
  final List<SavedLocation>         others;
  final ValueChanged<SavedLocation> onSelect;
  final VoidCallback                onPickMap;

  @override
  Widget build(BuildContext context) {
    final items = <SavedLocation>[
      if (home  != null) home!,
      if (work  != null) work!,
      ...others,
    ];
    if (items.isEmpty) {
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text('Escribe tu destino para buscar',
              style: AppTextStyles.body.copyWith(color: AppColors.gray400)),
          const SizedBox(height: 16),
          _MapButton(onTap: onPickMap),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: _MapButton(onTap: onPickMap),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: Text('Lugares guardados', style: AppTextStyles.label),
        ),
        ...items.map((loc) => ListTile(
              leading: Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: AppColors.primaryLight,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(_icon(loc.type), color: AppColors.secondary, size: 18),
              ),
              title: Text(loc.label, style: AppTextStyles.label),
              subtitle: Text(loc.address,
                  style: AppTextStyles.caption.copyWith(color: AppColors.gray400),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              onTap: () => onSelect(loc),
            )),
      ],
    );
  }

  IconData _icon(SavedLocationType t) => switch (t) {
        SavedLocationType.home  => Icons.home_outlined,
        SavedLocationType.work  => Icons.work_outline,
        SavedLocationType.other => Icons.star_outline,
      };
}

class _MapButton extends StatelessWidget {
  const _MapButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.gray100),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: AppColors.primaryLight,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.map_outlined, color: AppColors.secondary, size: 18),
              ),
              const SizedBox(width: 12),
              Text('Elegir en el mapa', style: AppTextStyles.label),
              const Spacer(),
              const Icon(Icons.chevron_right, color: AppColors.gray400, size: 20),
            ],
          ),
        ),
      );
}
