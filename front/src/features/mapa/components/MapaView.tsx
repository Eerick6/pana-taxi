'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import api from '@/lib/api';
import { getCooperativas, getCooperativa } from '@/features/cooperativas/api';
import type { Cooperative } from '@/types';
import { num } from '@/lib/format';
import { useAuth } from '@/context/AuthContext';

interface Driver {
  id: string;
  full_name: string;
  online_status: 'online' | 'busy' | 'offline' | 'looking_for_work';
  current_lat: number | null;
  current_lng: number | null;
  active_vehicle?: {
    plate: string;
    model?: string;
    cooperative?: { id: string; name: string } | null;
  } | null;
}

interface TripRequest {
  id: string;
  status: 'requested' | 'accepted' | 'driver_arrived';
  origin_lat: number | string;
  origin_lng: number | string;
  client_name: string;
  destination_address?: string | null;
  suggested_fare?: number | string | null;
  fare_mode?: string;
}

function driverCoop(d: Driver) {
  return d.active_vehicle?.cooperative ?? null;
}

const PROVINCES = [
  { name: 'Pichincha',      lat: -0.22,  lng: -78.51, zoom: 10 },
  { name: 'Guayas',         lat: -2.17,  lng: -79.92, zoom: 10 },
  { name: 'Azuay',          lat: -2.9,   lng: -79.0,  zoom: 10 },
  { name: 'Manabí',         lat: -1.05,  lng: -80.45, zoom: 9  },
  { name: 'El Oro',         lat: -3.26,  lng: -79.96, zoom: 10 },
  { name: 'Los Ríos',       lat: -1.68,  lng: -79.46, zoom: 10 },
  { name: 'Loja',           lat: -4.0,   lng: -79.2,  zoom: 10 },
  { name: 'Tungurahua',     lat: -1.25,  lng: -78.62, zoom: 11 },
  { name: 'Chimborazo',     lat: -1.66,  lng: -78.65, zoom: 10 },
  { name: 'Imbabura',       lat: 0.35,   lng: -78.12, zoom: 11 },
  { name: 'Cotopaxi',       lat: -0.93,  lng: -78.62, zoom: 10 },
  { name: 'Esmeraldas',     lat: 0.96,   lng: -79.65, zoom: 10 },
  { name: 'Santo Domingo',  lat: -0.25,  lng: -79.17, zoom: 11 },
  { name: 'Santa Elena',    lat: -2.23,  lng: -80.86, zoom: 10 },
];

const MapboxLiveMap = dynamic(
  () => import('@/features/dashboard/components/MapboxLiveMap'),
  { ssr: false, loading: () => <div className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" style={{ height: 500 }} /> }
);

async function loadDrivers(cooperativeId?: string): Promise<Driver[]> {
  try {
    const { data } = await api.get('/drivers', {
      params: { limit: 500, page: 1, ...(cooperativeId ? { cooperative_id: cooperativeId } : {}) },
    });
    return (data?.items ?? []) as Driver[];
  } catch {
    return [];
  }
}

async function loadTripRequests(): Promise<TripRequest[]> {
  try {
    const [r1, r2, r3, clientsResp] = await Promise.all([
      api.get('/trips', { params: { status: 'requested', limit: 100 } }),
      api.get('/trips', { params: { status: 'accepted', limit: 100 } }),
      api.get('/trips', { params: { status: 'driver_arrived', limit: 100 } }),
      api.get('/clients', { params: { limit: 500 } }).catch(() => ({ data: { items: [] } })),
    ]);

    // Build userId → full_name lookup from client profiles
    const clientProfiles: Array<{ user?: { id?: string }; full_name?: string }> =
      clientsResp.data?.items ?? [];
    const nameMap = new Map<string, string>(
      clientProfiles
        .map((c): [string, string] | null =>
          c.user?.id && c.full_name ? [c.user.id, c.full_name] : null,
        )
        .filter((entry): entry is [string, string] => entry !== null),
    );

    const raw = [
      ...(r1.data?.items ?? []),
      ...(r2.data?.items ?? []),
      ...(r3.data?.items ?? []),
    ];
    return raw
      .filter((t) => t.origin_lat != null && t.origin_lng != null &&
                     !isNaN(parseFloat(String(t.origin_lat))) &&
                     !isNaN(parseFloat(String(t.origin_lng))))
      .map((t) => {
        const clientUserId = (t.client as { id?: string } | null)?.id;
        const clientPhone = (t.client as { phone?: string } | null)?.phone;
        const clientName = (clientUserId ? nameMap.get(clientUserId) : null)
          || clientPhone?.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3')
          || 'Cliente';
        return { ...t, client_name: clientName } as TripRequest;
      });
  } catch {
    return [];
  }
}

interface MapaViewProps { cooperativeId?: string }

export default function MapaView({ cooperativeId: lockedCoopId }: MapaViewProps = {}) {
  const { isLoading: authLoading } = useAuth();
  const [allDrivers, setAllDrivers] = useState<Driver[]>([]);
  const [tripRequests, setTripRequests] = useState<TripRequest[]>([]);
  const [cooperativas, setCooperativas] = useState<Cooperative[]>([]);
  const [selectedCoopId, setSelectedCoopId] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('');
  const [filterMode, setFilterMode] = useState<'coop' | 'province'>('coop');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'busy'>('all');
  const [nameSearch, setNameSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Driver | null>(null);
  const [highlightDriverId, setHighlightDriverId] = useState<string | null>(null);
  const [coopLocation, setCoopLocation] = useState<{ lat: number; lng: number } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (authLoading || lockedCoopId) return;
    getCooperativas().then((r) => setCooperativas(r.items ?? [])).catch(() => {});
  }, [authLoading, lockedCoopId]);

  useEffect(() => {
    if (!lockedCoopId) return;
    getCooperativa(lockedCoopId).then((coop) => {
      if (coop.latitude != null && coop.longitude != null) {
        setCoopLocation({ lat: Number(coop.latitude), lng: Number(coop.longitude) });
      }
    }).catch(() => {});
  }, [lockedCoopId]);

  const coopId = lockedCoopId ?? selectedCoopId ?? undefined;

  const load = useCallback(async () => {
    setLoading(true);
    const [drivers, requests] = await Promise.all([
      loadDrivers(coopId),
      loadTripRequests(),
    ]);
    setAllDrivers(drivers);
    setTripRequests(requests);
    setLoading(false);
  }, [coopId]);

  // No iniciar carga hasta que auth haya restaurado la sesión post-recarga
  useEffect(() => {
    if (authLoading) return;
    load();
    intervalRef.current = setInterval(load, 20_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load, authLoading]);

  // activeDrivers: todos los que están online o busy (base para los contadores)
  const activeDrivers = allDrivers.filter(
    (d) => d.online_status === 'online' || d.online_status === 'busy',
  );

  const province = PROVINCES.find((p) => p.name === selectedProvince);

  // visibleDrivers: lo que se muestra en mapa y lista (aplica todos los filtros)
  // Solo incluye conductores con señal GPS activa
  const visibleDrivers = (() => {
    let list = activeDrivers.filter((d) => d.current_lat != null && d.current_lng != null);
    if (statusFilter === 'online') list = list.filter((d) => d.online_status === 'online');
    if (statusFilter === 'busy')   list = list.filter((d) => d.online_status === 'busy');
    if (filterMode === 'province' && province) {
      list = list.filter((d) => {
        return Math.abs(d.current_lat! - province.lat) < 1.2 && Math.abs(d.current_lng! - province.lng) < 1.2;
      });
    }
    if (nameSearch.trim()) {
      const q = nameSearch.trim().toLowerCase();
      list = list.filter((d) => d.full_name.toLowerCase().includes(q));
    }
    return list;
  })();

  const withGps = activeDrivers.filter((d) => d.current_lat != null && d.current_lng != null);

  // Map focus — cooperative location takes priority when available
  const focusLat  = coopLocation?.lat  ?? province?.lat  ?? -1.5;
  const focusLng  = coopLocation?.lng  ?? province?.lng  ?? -78.5;
  const focusZoom = coopLocation ? 14 : (province?.zoom ?? 7);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Mapa en vivo</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            GPS de conductores conectados · se actualiza cada 20s
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* Controles */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Modo filtro — oculto cuando la vista está bloqueada a una cooperativa */}
          {!lockedCoopId && (
            <>
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                <button
                  onClick={() => { setFilterMode('coop'); setSelectedProvince(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterMode === 'coop' ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                >
                  🏢 Por cooperativa
                </button>
                <button
                  onClick={() => { setFilterMode('province'); setSelectedCoopId(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterMode === 'province' ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                >
                  🗺️ Por provincia
                </button>
              </div>

              {filterMode === 'coop' && (
                <select
                  value={selectedCoopId}
                  onChange={(e) => { setSelectedCoopId(e.target.value); setSelected(null); }}
                  className="flex-1 min-w-[200px] max-w-xs px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Todas las cooperativas</option>
                  {cooperativas.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}

              {filterMode === 'province' && (
                <select
                  value={selectedProvince}
                  onChange={(e) => { setSelectedProvince(e.target.value); setSelected(null); }}
                  className="flex-1 min-w-[200px] max-w-xs px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Todas las provincias</option>
                  {PROVINCES.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              )}
            </>
          )}

          {/* Estado */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
            {([
              { key: 'all',    label: 'Todos' },
              { key: 'online', label: '🟢 Disponibles' },
              { key: 'busy',   label: '🟡 En carrera' },
            ] as const).map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === f.key ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Búsqueda por nombre */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={nameSearch}
              onChange={(e) => { setNameSearch(e.target.value); setSelected(null); }}
              placeholder="Buscar taxista..."
              className="pl-8 pr-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 w-44"
            />
            {nameSearch && (
              <button onClick={() => setNameSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats — siempre muestran totales reales, independiente del filtro de estado */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Disponibles',   value: activeDrivers.filter((d) => d.online_status === 'online').length, color: 'text-success-600 dark:text-success-400', bg: 'bg-success-50 dark:bg-success-500/10', dot: 'bg-success-500' },
          { label: 'En carrera',    value: activeDrivers.filter((d) => d.online_status === 'busy').length,   color: 'text-yellow-600 dark:text-yellow-400',   bg: 'bg-yellow-50 dark:bg-yellow-500/10',   dot: 'bg-yellow-500' },
          { label: 'Con GPS',       value: withGps.length,                                                    color: 'text-brand-600 dark:text-brand-400',     bg: 'bg-brand-50 dark:bg-brand-500/10',     dot: 'bg-brand-500'  },
          { label: 'Total activos', value: activeDrivers.length,                                               color: 'text-gray-700 dark:text-gray-200',       bg: 'bg-gray-50 dark:bg-gray-800',          dot: 'bg-gray-400'   },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl ${s.bg} p-4 flex items-center gap-3`}>
            <span className={`w-2.5 h-2.5 rounded-full ${s.dot} flex-shrink-0 ${s.label !== 'Total activos' ? 'animate-pulse' : ''}`} />
            <div>
              <p className={`text-xl font-bold ${s.color}`}>{loading ? '—' : num(s.value)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Mapa + panel */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Mapa Mapbox */}
        <div className="lg:col-span-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <MapboxLiveMap
            drivers={visibleDrivers}
            tripRequests={lockedCoopId ? [] : tripRequests}
            focusLat={focusLat}
            focusLng={focusLng}
            focusZoom={focusZoom}
            provinceLabel={province?.name}
            highlightDriverId={highlightDriverId}
          />
          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-xs text-gray-400">Disponible</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-xs text-gray-400">En carrera</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-xs text-gray-400">Solicitud cliente</span>
            </div>
            <p className="text-xs text-gray-400 ml-auto">Click en marker para detalles</p>
          </div>
        </div>

        {/* Panel lateral */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col" style={{ maxHeight: 580 }}>
          {selected ? (
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Detalle</h3>
                <button onClick={() => setSelected(null)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-700 dark:text-brand-300 flex-shrink-0">
                  {selected.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <p className="font-semibold text-gray-800 dark:text-white text-sm leading-tight">{selected.full_name}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${selected.online_status === 'busy' ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400' : 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400'}`}>
                    {selected.online_status === 'busy' ? '🟡 En carrera' : '🟢 Disponible'}
                  </span>
                </div>
              </div>
              {driverCoop(selected) && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Cooperativa</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-white">{driverCoop(selected)?.name}</p>
                </div>
              )}
              {selected.active_vehicle && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Vehículo</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-white">{selected.active_vehicle.plate}</p>
                  {selected.active_vehicle.model && <p className="text-xs text-gray-400">{selected.active_vehicle.model}</p>}
                </div>
              )}
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Coordenadas GPS</p>
                {selected.current_lat != null ? (
                  <>
                    <p className="text-xs font-mono text-gray-700 dark:text-gray-300">Lat: {Number(selected.current_lat).toFixed(5)}</p>
                    <p className="text-xs font-mono text-gray-700 dark:text-gray-300">Lng: {Number(selected.current_lng).toFixed(5)}</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">Sin señal GPS activa</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="px-4 pt-4 pb-2 border-b border-gray-100 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
                  {selectedCoopId
                    ? cooperativas.find((c) => c.id === selectedCoopId)?.name ?? 'Cooperativa'
                    : selectedProvince || 'Todos los activos'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {loading ? 'Cargando...' : `${visibleDrivers.length} conductor${visibleDrivers.length !== 1 ? 'es' : ''} activo${visibleDrivers.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              <div className="overflow-y-auto flex-1 p-2">
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-12 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse mb-1.5" />
                    ))
                  : visibleDrivers.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-10">Sin conductores activos</p>
                  : visibleDrivers.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => { setSelected(d); setHighlightDriverId(d.id); }}
                        className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors mb-0.5"
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${d.online_status === 'online' ? 'bg-success-500' : 'bg-yellow-500'} animate-pulse`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-800 dark:text-white truncate">{d.full_name}</p>
                          {driverCoop(d) && !selectedCoopId && (
                            <p className="text-[10px] text-gray-400 truncate">{driverCoop(d)?.name}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          {d.active_vehicle && <span className="text-[9px] text-gray-500">{d.active_vehicle.plate}</span>}
                          {d.current_lat != null && <span className="text-[9px] text-brand-500 font-medium">GPS</span>}
                        </div>
                      </button>
                    ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
