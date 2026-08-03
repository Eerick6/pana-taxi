import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/routes/app_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../trips/data/datasources/trips_api.dart';
import '../../../trips/domain/entities/active_trip.dart';

// Parsea num o String → double (TypeORM a veces retorna DECIMAL como string)
double? _toDouble(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v);
  return null;
}

// ── Modelo ────────────────────────────────────────────────────────────────────

class _TripItem {
  const _TripItem({
    required this.id,
    required this.status,
    required this.fareMode,
    required this.originAddress,
    required this.destinationAddress,
    required this.createdAt,
    this.originLat,
    this.originLng,
    this.finalFare,
    this.suggestedFare,
    this.clientOffer,
    this.distanceKm,
    this.durationMin,
    this.driverName,
    this.vehiclePlate,
  });

  final String  id;
  final String  status;
  final String  fareMode;
  final String  originAddress;
  final String  destinationAddress;
  final String  createdAt;
  final double? originLat;
  final double? originLng;
  final double? finalFare;
  final double? suggestedFare;
  final double? clientOffer;
  final double? distanceKm;
  final double? durationMin;
  final String? driverName;
  final String? vehiclePlate;

  factory _TripItem.fromJson(Map<String, dynamic> j) => _TripItem(
    id:                 j['id']                        as String,
    status:             j['status']                    as String,
    fareMode:           j['fare_mode']                 as String? ?? 'meter',
    originAddress:      j['origin_address']            as String? ?? '',
    destinationAddress: j['destination_address']       as String? ?? '',
    createdAt:          j['created_at']                as String,
    originLat:          _toDouble(j['origin_lat']),
    originLng:          _toDouble(j['origin_lng']),
    finalFare:          _toDouble(j['fare_amount']),
    suggestedFare:      _toDouble(j['suggested_fare']),
    clientOffer:        _toDouble(j['client_offer']),
    distanceKm:         _toDouble(j['estimated_distance_km']),
    durationMin:        _toDouble(j['estimated_duration_min']),
    driverName:         (j['driver'] as Map?)?['full_name']  as String?,
    vehiclePlate:       (j['vehicle'] as Map?)?['plate']     as String?,
  );

  String get statusLabel => switch (status) {
    'completed'      => 'Finalizado',
    'cancelled'      => 'Cancelado',
    'in_progress'    => 'Viaje en curso',
    'driver_arrived' => 'Conductor llegó',
    'accepted'       => 'Conductor asignado',
    'requested'      => 'Buscando conductor',
    _                => status,
  };

  Color get statusColor => switch (status) {
    'completed'                       => AppColors.success,
    'cancelled'                       => AppColors.error,
    'in_progress' || 'driver_arrived' => AppColors.info,
    'accepted'                        => AppColors.secondary,
    _                                 => AppColors.gray500,
  };

  bool get isActive => const {
    'requested', 'accepted', 'driver_arrived', 'in_progress'
  }.contains(status);

  String get dateFormatted {
    try {
      final dt = DateTime.parse(createdAt).toLocal();
      return '${dt.day.toString().padLeft(2, '0')}/'
             '${dt.month.toString().padLeft(2, '0')}/'
             '${dt.year}  '
             '${dt.hour.toString().padLeft(2, '0')}:'
             '${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) { return ''; }
  }
}

// ── Paginated state ───────────────────────────────────────────────────────────

class _HistoryState {
  const _HistoryState({
    this.trips          = const [],
    this.isInitialLoad  = true,
    this.isLoadingMore  = false,
    this.hasMore        = true,
    this.error,
  });
  final List<_TripItem> trips;
  final bool            isInitialLoad;
  final bool            isLoadingMore;
  final bool            hasMore;
  final String?         error;

  _HistoryState copyWith({
    List<_TripItem>? trips,
    bool? isInitialLoad,
    bool? isLoadingMore,
    bool? hasMore,
    String? error,
  }) => _HistoryState(
    trips:         trips         ?? this.trips,
    isInitialLoad: isInitialLoad ?? this.isInitialLoad,
    isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    hasMore:       hasMore       ?? this.hasMore,
    error:         error,
  );
}

class _TripHistoryNotifier extends AutoDisposeNotifier<_HistoryState> {
  static const _limit = 20;
  int _page = 1;

  @override
  _HistoryState build() {
    _page = 1;
    _fetch(initial: true);
    return const _HistoryState();
  }

  Future<void> _fetch({bool initial = false}) async {
    if (!initial && (state.isLoadingMore || !state.hasMore)) return;
    state = state.copyWith(
      isInitialLoad: initial && state.trips.isEmpty,
      isLoadingMore: !initial,
    );
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get('/trips/me',
          queryParameters: {'page': _page, 'limit': _limit});
      final items = (res.data['items'] as List? ?? [])
          .map((j) => _TripItem.fromJson(j as Map<String, dynamic>))
          .toList();
      _page++;
      state = state.copyWith(
        trips:        [...state.trips, ...items],
        isInitialLoad: false,
        isLoadingMore: false,
        hasMore:       items.length == _limit,
      );
    } catch (e) {
      state = state.copyWith(
        isInitialLoad: false,
        isLoadingMore: false,
        error: e.toString().replaceAll('Exception: ', ''),
      );
    }
  }

  Future<void> loadMore()  => _fetch(initial: false);

  Future<void> refresh() async {
    _page = 1;
    state = const _HistoryState();
    await _fetch(initial: true);
  }
}

final _tripHistoryProvider =
    NotifierProvider.autoDispose<_TripHistoryNotifier, _HistoryState>(
  _TripHistoryNotifier.new,
);

// ── Page ─────────────────────────────────────────────────────────────────────

class TripHistoryPage extends ConsumerWidget {
  const TripHistoryPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(_tripHistoryProvider);

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: Text('Mis viajes', style: AppTextStyles.h3),
          bottom: const TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            indicatorColor: AppColors.primary,
            labelColor: AppColors.secondary,
            unselectedLabelColor: AppColors.gray400,
            labelStyle: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            tabs: [
              Tab(text: 'Pendientes'),
              Tab(text: 'En curso'),
              Tab(text: 'Finalizados'),
              Tab(text: 'Cancelados'),
            ],
          ),
        ),
        body: s.isInitialLoad
            ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
            : s.error != null && s.trips.isEmpty
                ? Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Text('Error al cargar viajes', style: AppTextStyles.body),
                      const SizedBox(height: 12),
                      ElevatedButton(
                        onPressed: () => ref.read(_tripHistoryProvider.notifier).refresh(),
                        child: const Text('Reintentar'),
                      ),
                    ]),
                  )
                : TabBarView(
                    children: [
                      _TripList(
                        trips:       s.trips.where((t) => t.status == 'requested').toList(),
                        isLoadingMore: s.isLoadingMore,
                        hasMore:     s.hasMore,
                        onLoadMore:  () => ref.read(_tripHistoryProvider.notifier).loadMore(),
                      ),
                      _TripList(
                        trips:       s.trips.where((t) =>
                            const {'accepted','driver_arrived','in_progress'}.contains(t.status)).toList(),
                        isLoadingMore: s.isLoadingMore,
                        hasMore:     s.hasMore,
                        onLoadMore:  () => ref.read(_tripHistoryProvider.notifier).loadMore(),
                      ),
                      _TripList(
                        trips:       s.trips.where((t) => t.status == 'completed').toList(),
                        isLoadingMore: s.isLoadingMore,
                        hasMore:     s.hasMore,
                        onLoadMore:  () => ref.read(_tripHistoryProvider.notifier).loadMore(),
                      ),
                      _TripList(
                        trips:       s.trips.where((t) => t.status == 'cancelled').toList(),
                        isLoadingMore: s.isLoadingMore,
                        hasMore:     s.hasMore,
                        onLoadMore:  () => ref.read(_tripHistoryProvider.notifier).loadMore(),
                      ),
                    ],
                  ),
      ),
    );
  }
}

// ── Lista ────────────────────────────────────────────────────────────────────

class _TripList extends StatefulWidget {
  const _TripList({
    required this.trips,
    required this.isLoadingMore,
    required this.hasMore,
    required this.onLoadMore,
  });
  final List<_TripItem> trips;
  final bool            isLoadingMore;
  final bool            hasMore;
  final VoidCallback    onLoadMore;

  @override
  State<_TripList> createState() => _TripListState();
}

class _TripListState extends State<_TripList> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 200) {
      widget.onLoadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.trips.isEmpty && !widget.isLoadingMore && !widget.hasMore) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.directions_car_outlined, size: 56, color: AppColors.gray300),
            const SizedBox(height: 12),
            Text('No hay viajes aquí todavía',
                style: AppTextStyles.h3.copyWith(color: AppColors.gray500)),
          ],
        ),
      );
    }

    if (widget.trips.isEmpty && (widget.isLoadingMore || widget.hasMore)) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }

    return ListView.separated(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      itemCount: widget.trips.length + (widget.hasMore ? 1 : 0),
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (ctx, i) {
        if (i == widget.trips.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Center(
              child: widget.isLoadingMore
                  ? const CircularProgressIndicator(
                      strokeWidth: 2, color: AppColors.primary)
                  : TextButton(
                      onPressed: widget.onLoadMore,
                      child: Text(
                        'Cargar más',
                        style: AppTextStyles.label.copyWith(color: AppColors.secondary),
                      ),
                    ),
            ),
          );
        }
        return _TripTile(
          trip: widget.trips[i],
          onTap: () => _showDetail(ctx, widget.trips[i]),
        );
      },
    );
  }

  void _showDetail(BuildContext context, _TripItem trip) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _TripDetailSheet(trip: trip),
    );
  }
}

// ── Tile ─────────────────────────────────────────────────────────────────────

class _TripTile extends StatelessWidget {
  const _TripTile({required this.trip, required this.onTap});
  final _TripItem    trip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 6, offset: const Offset(0, 2),
              ),
            ],
          ),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                _StatusBadge(label: trip.statusLabel, color: trip.statusColor),
                const Spacer(),
                Text(trip.dateFormatted,
                    style: AppTextStyles.caption.copyWith(color: AppColors.gray400)),
              ]),
              const SizedBox(height: 12),
              _AddressRow(
                  icon: Icons.radio_button_checked, color: AppColors.success,
                  text: trip.originAddress.isEmpty ? 'Ubicación actual' : trip.originAddress),
              Padding(
                padding: const EdgeInsets.only(left: 11),
                child: Container(width: 1, height: 14, color: AppColors.gray200),
              ),
              _AddressRow(
                  icon: Icons.location_on, color: AppColors.error,
                  text: trip.destinationAddress),
              if (trip.finalFare != null || trip.distanceKm != null) ...[
                const SizedBox(height: 10),
                const Divider(height: 1, color: AppColors.gray100),
                const SizedBox(height: 8),
                Row(children: [
                  if (trip.distanceKm != null)
                    _Chip(Icons.straighten,
                        '${trip.distanceKm!.toStringAsFixed(1)} km'),
                  if (trip.distanceKm != null) const SizedBox(width: 8),
                  const Spacer(),
                  if (trip.finalFare != null)
                    Text('\$${trip.finalFare!.toStringAsFixed(2)}',
                        style: AppTextStyles.label
                            .copyWith(color: AppColors.secondary)),
                ]),
              ],
            ],
          ),
        ),
      );
}

// ── Detail Sheet ─────────────────────────────────────────────────────────────

class _TripDetailSheet extends ConsumerStatefulWidget {
  const _TripDetailSheet({required this.trip});
  final _TripItem trip;

  @override
  ConsumerState<_TripDetailSheet> createState() => _TripDetailSheetState();
}

class _TripDetailSheetState extends ConsumerState<_TripDetailSheet> {
  bool _cancelling = false;

  void _goToSearching() {
    // Construir ActiveTrip con los datos que ya tenemos — sin API call extra
    final t = widget.trip;
    final activeTrip = ActiveTrip(
      id:                 t.id,
      status:             t.status,
      fareMode:           t.fareMode,
      originAddress:      t.originAddress,
      destinationAddress: t.destinationAddress,
      originLat:          t.originLat,
      originLng:          t.originLng,
      clientOffer:        t.clientOffer,
      createdAt:          DateTime.tryParse(t.createdAt)?.toLocal(),
    );
    Navigator.of(context).pop();
    appRouter.go('/searching', extra: activeTrip);
  }

  Future<void> _cancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('¿Cancelar viaje?'),
        content: const Text('Se cancelará la búsqueda de conductor.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('No'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text('Sí, cancelar',
                style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _cancelling = true);
    final nav       = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(tripsApiProvider).cancelTrip(widget.trip.id);
      if (!mounted) return;
      await ref.read(_tripHistoryProvider.notifier).refresh();
      nav.pop();
      messenger.showSnackBar(
        const SnackBar(content: Text('Viaje cancelado.')),
      );
    } catch (_) {
      if (mounted) {
        setState(() => _cancelling = false);
        messenger.showSnackBar(
          const SnackBar(
            content: Text('No se pudo cancelar. Intenta de nuevo.'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final trip      = widget.trip;
    final isPending = trip.status == 'requested';

    return DraggableScrollableSheet(
      initialChildSize: isPending ? 0.65 : 0.6,
      minChildSize:     0.4,
      maxChildSize:     0.92,
      builder: (_, ctrl) => Container(
        decoration: const BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: ListView(
          controller: ctrl,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
          children: [
            Center(
              child: Container(
                margin: const EdgeInsets.symmetric(vertical: 12),
                width: 36, height: 4,
                decoration: BoxDecoration(
                  color: AppColors.gray300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Row(children: [
              _StatusBadge(label: trip.statusLabel, color: trip.statusColor),
              const Spacer(),
              Text(trip.dateFormatted,
                  style: AppTextStyles.caption.copyWith(color: AppColors.gray400)),
            ]),
            const SizedBox(height: 20),

            // Ruta
            _SectionTitle('Ruta'),
            const SizedBox(height: 10),
            _AddressRow(icon: Icons.radio_button_checked, color: AppColors.success,
                text: trip.originAddress.isEmpty ? 'Ubicación actual' : trip.originAddress),
            Padding(
              padding: const EdgeInsets.only(left: 11),
              child: Container(width: 1, height: 20, color: AppColors.gray200),
            ),
            _AddressRow(icon: Icons.location_on, color: AppColors.error,
                text: trip.destinationAddress),

            if (trip.distanceKm != null || trip.durationMin != null) ...[
              const SizedBox(height: 16),
              Row(children: [
                if (trip.distanceKm != null)
                  _Chip(Icons.straighten,
                      '${trip.distanceKm!.toStringAsFixed(1)} km'),
                if (trip.durationMin != null) ...[
                  const SizedBox(width: 8),
                  _Chip(Icons.access_time,
                      '${trip.durationMin!.toInt()} min'),
                ],
              ]),
            ],

            const SizedBox(height: 20),
            const Divider(color: AppColors.gray100),
            const SizedBox(height: 16),

            // Tarifa
            _SectionTitle('Tarifa'),
            const SizedBox(height: 10),
            _DetailRow('Modo',
                trip.fareMode == 'negotiated' ? 'Negociado' : 'Taxímetro'),
            if (trip.suggestedFare != null)
              _DetailRow('Estimado', '\$${trip.suggestedFare!.toStringAsFixed(2)}'),
            if (trip.clientOffer != null)
              _DetailRow('Tu oferta', '\$${trip.clientOffer!.toStringAsFixed(2)}'),
            if (trip.finalFare != null) ...[
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.primaryLight,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Total pagado', style: AppTextStyles.label),
                    Text('\$${trip.finalFare!.toStringAsFixed(2)}',
                        style: AppTextStyles.h3
                            .copyWith(color: AppColors.secondary)),
                  ],
                ),
              ),
            ],

            if (trip.driverName != null || trip.vehiclePlate != null) ...[
              const SizedBox(height: 20),
              const Divider(color: AppColors.gray100),
              const SizedBox(height: 16),
              _SectionTitle('Conductor'),
              const SizedBox(height: 10),
              if (trip.driverName != null)
                _DetailRow('Nombre', trip.driverName!),
              if (trip.vehiclePlate != null)
                _DetailRow('Placa', trip.vehiclePlate!),
            ],

            // ── Acciones para viaje pendiente ─────────────────────────────
            if (isPending) ...[
              const SizedBox(height: 24),
              const Divider(color: AppColors.gray100),
              const SizedBox(height: 16),

              // Botón: ver búsqueda en mapa
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: AppColors.secondary,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                    elevation: 0,
                  ),
                  onPressed: _cancelling ? null : _goToSearching,
                  icon: const Icon(Icons.map_outlined),
                  label: const Text('Ver búsqueda en mapa',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),

              const SizedBox(height: 10),

              // Botón: cancelar viaje
              SizedBox(
                width: double.infinity,
                height: 48,
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: AppColors.error),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                  ),
                  onPressed: _cancelling ? null : _cancel,
                  icon: _cancelling
                      ? const SizedBox(
                          width: 18, height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: AppColors.error))
                      : const Icon(Icons.cancel_outlined, color: AppColors.error),
                  label: Text('Cancelar viaje',
                      style: AppTextStyles.label.copyWith(color: AppColors.error)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ── Widgets internos ──────────────────────────────────────────────────────────

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.label, required this.color});
  final String label;
  final Color  color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(label,
            style: AppTextStyles.caption
                .copyWith(color: color, fontWeight: FontWeight.w600)),
      );
}

class _AddressRow extends StatelessWidget {
  const _AddressRow({required this.icon, required this.color, required this.text});
  final IconData icon;
  final Color    color;
  final String   text;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                style: AppTextStyles.body, maxLines: 2,
                overflow: TextOverflow.ellipsis),
          ),
        ],
      );
}

class _Chip extends StatelessWidget {
  const _Chip(this.icon, this.label);
  final IconData icon;
  final String   label;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: AppColors.gray50,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 13, color: AppColors.gray500),
          const SizedBox(width: 4),
          Text(label,
              style: AppTextStyles.caption.copyWith(color: AppColors.gray600)),
        ]),
      );
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) =>
      Text(text, style: AppTextStyles.label.copyWith(color: AppColors.gray500));
}

class _DetailRow extends StatelessWidget {
  const _DetailRow(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label,
                style: AppTextStyles.body.copyWith(color: AppColors.gray500)),
            Text(value, style: AppTextStyles.body),
          ],
        ),
      );
}
