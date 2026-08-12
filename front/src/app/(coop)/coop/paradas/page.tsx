'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Stand } from '@/types';
import { getStands, createStand, updateStand, deleteStand, getStandQueue } from '@/features/paradas/api';
import 'maplibre-gl/dist/maplibre-gl.css';

// ── Photon autocomplete ───────────────────────────────────────────────────────

interface GeoSug { label: string; lat: number; lng: number }

function photonToSug(f: Record<string, unknown>): GeoSug | null {
  const props  = (f['properties'] as Record<string, unknown>) ?? {};
  const coords = ((f['geometry'] as Record<string, unknown>)?.['coordinates'] as number[]) ?? [];
  if (coords.length < 2) return null;
  const name   = (props['name']   as string) ?? '';
  const street = (props['street'] as string) ?? '';
  const city   = ((props['city'] ?? props['county'] ?? props['state'] ?? '') as string);
  const main   = name || street;
  if (!main) return null;
  const parts  = [name && street ? street : '', city].filter(Boolean);
  const label  = parts.length ? `${main}, ${parts.join(', ')}` : main;
  return { label, lat: coords[1], lng: coords[0] };
}

function AddressAutocomplete({ value, onChange, onSelect }: {
  value: string; onChange: (v: string) => void;
  onSelect: (label: string, lat: number, lng: number) => void;
}) {
  const [sugs, setSugs] = useState<GeoSug[]>([]);
  const [open, setOpen] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (q: string) => {
    onChange(q);
    if (debRef.current) clearTimeout(debRef.current);
    if (q.length < 2) { setSugs([]); setOpen(false); return; }
    debRef.current = setTimeout(async () => {
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q.trim())}&limit=6&bbox=-81.0,-5.0,-75.0,2.0`;
        const data = await (await fetch(url)).json();
        const results = (data.features as Record<string, unknown>[] ?? []).map(photonToSug).filter(Boolean) as GeoSug[];
        setSugs(results); setOpen(results.length > 0);
      } catch { /* silent */ }
    }, 350);
  };

  const pick = (s: GeoSug) => { onChange(s.label); setSugs([]); setOpen(false); onSelect(s.label, s.lat, s.lng); };

  return (
    <div className="relative">
      <input type="text" value={value} onChange={(e) => search(e.target.value)}
        onFocus={() => sugs.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Busca la dirección de la parada..."
        autoComplete="off"
        className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      {open && sugs.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl overflow-hidden">
          {sugs.map((s, i) => (
            <li key={i}>
              <button type="button" onMouseDown={() => pick(s)}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-start gap-2"
              >
                <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0z" />
                </svg>
                <span className="line-clamp-2">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Mapa picker ───────────────────────────────────────────────────────────────

function MapPicker({ lat, lng, flyTo, onChange }: {
  lat: number | null; lng: number | null;
  flyTo: { lat: number; lng: number } | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<unknown>(null);
  const markerRef    = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const iLat = lat ?? -1.5, iLng = lng ?? -78.5;
    import('maplibre-gl').then((ml) => {
      const mgl = ml.default ?? ml;
      const map = new mgl.Map({
        container: containerRef.current!,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [iLng, iLat], zoom: lat ? 14 : 6,
      });
      const marker = new mgl.Marker({ color: '#fcbd13', draggable: true }).setLngLat([iLng, iLat]).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLngLat();
        onChange(parseFloat(p.lat.toFixed(7)), parseFloat(p.lng.toFixed(7)));
      });
      map.on('click', (e: { lngLat: { lat: number; lng: number } }) => {
        marker.setLngLat([e.lngLat.lng, e.lngLat.lat]);
        onChange(parseFloat(e.lngLat.lat.toFixed(7)), parseFloat(e.lngLat.lng.toFixed(7)));
      });
      mapRef.current = map; markerRef.current = marker;
    });
    return () => {
      if (mapRef.current) { (mapRef.current as { remove: () => void }).remove(); mapRef.current = null; markerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!flyTo || !mapRef.current || !markerRef.current) return;
    (markerRef.current as { setLngLat: (c: [number, number]) => void }).setLngLat([flyTo.lng, flyTo.lat]);
    (mapRef.current as { flyTo: (o: object) => void }).flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 16, duration: 800 });
  }, [flyTo]);

  return (
    <div className="space-y-1">
      <div ref={containerRef} style={{ height: 220, borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }} />
      <p className="text-xs text-gray-400">
        {lat && lng ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Busca arriba o haz clic para marcar la ubicación'}
      </p>
    </div>
  );
}

// ── Queue modal ───────────────────────────────────────────────────────────────

type QueueEntry = { driver_id: string; checked_in_at: string; driver?: { full_name?: string; user?: { phone?: string } }; vehicle?: { plate?: string } | null };

function QueueModal({ stand, onClose }: { stand: Stand; onClose: () => void }) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStandQueue(stand.id)
      .then((data) => setQueue(data as unknown as QueueEntry[]))
      .finally(() => setLoading(false));
  }, [stand.id]);

  return (
    <div className="fixed inset-0 z-999999 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white">Cola — {stand.name}</h3>
            <p className="text-xs text-gray-400">{queue.length} taxi{queue.length !== 1 ? 's' : ''} en parada</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}</div>
        ) : queue.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">No hay taxis en esta parada</div>
        ) : (
          <ol className="space-y-2">
            {queue.map((entry, i) => (
              <li key={entry.driver_id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{entry.driver?.full_name ?? 'Conductor'}</p>
                  <p className="text-xs text-gray-400">{entry.vehicle?.plate ?? '—'} · desde {new Date(entry.checked_in_at).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────

const EMPTY = { name: '', address: '', lat: null as number | null, lng: null as number | null, capacity: 20 };

function CreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const [form, setForm]   = useState(EMPTY);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const valid = !!form.name.trim() && form.lat !== null && form.lng !== null;

  const submit = async () => {
    if (!valid) return;
    setSaving(true); setError('');
    try {
      await createStand({
        name:     form.name.trim(),
        address:  form.address.trim() || undefined,
        lat:      form.lat!,
        lng:      form.lng!,
        capacity: form.capacity,
      });
      onCreate();
      onClose();
    } catch { setError('Error al crear la parada. Intenta de nuevo.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-999999 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white">Nueva parada</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nombre de la parada *</label>
            <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Parada Central" autoFocus
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Capacidad máxima de taxis</label>
            <input type="number" min={1} max={200} value={form.capacity}
              onChange={(e) => setForm(f => ({ ...f, capacity: parseInt(e.target.value) || 20 }))}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Dirección *</label>
            <AddressAutocomplete
              value={form.address}
              onChange={(v) => setForm(f => ({ ...f, address: v }))}
              onSelect={(label, lat, lng) => {
                setForm(f => ({ ...f, address: label, lat, lng }));
                setFlyTo({ lat, lng });
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Ubicación en el mapa *</label>
            <MapPicker lat={form.lat} lng={form.lng} flyTo={flyTo}
              onChange={(lat, lng) => setForm(f => ({ ...f, lat, lng }))}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex gap-3 mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancelar
          </button>
          <button onClick={submit} disabled={!valid || saving}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creando...' : 'Crear parada'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function CoopParadasPage() {
  const [stands, setStands]     = useState<Stand[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [queueStand, setQueueStand] = useState<Stand | null>(null);
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [actionId, setActionId]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getStands();
      setStands((res.items ?? res) as Stand[]);
    } catch { setStands([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doDelete = async () => {
    if (!deleteId) return;
    setActionId(deleteId);
    try { await deleteStand(deleteId); await load(); }
    finally { setActionId(null); setDeleteId(null); }
  };

  const toggleActive = async (s: Stand) => {
    setActionId(s.id);
    try { await updateStand(s.id, { is_active: !s.is_active }); await load(); }
    finally { setActionId(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Paradas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Puntos de espera de tus taxis</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nueva parada
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-44 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
        </div>
      ) : stands.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 py-20 text-center">
          <span className="text-5xl">📍</span>
          <p className="text-gray-500 dark:text-gray-400 mt-3 font-medium">Sin paradas registradas</p>
          <p className="text-sm text-gray-400 mt-1">Crea tu primera parada para empezar a organizar tu flota</p>
          <button onClick={() => setShowCreate(true)}
            className="mt-4 px-5 py-2 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 transition-colors"
          >
            Crear primera parada
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stands.map((s) => (
            <div key={s.id} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center text-lg flex-shrink-0">
                    📍
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 dark:text-white leading-tight">{s.name}</p>
                    {s.address && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{s.address}</p>}
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${s.is_active ? 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                  {s.is_active ? 'Activa' : 'Inactiva'}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-400">
                <button onClick={() => setQueueStand(s)}
                  className="flex items-center gap-1.5 hover:text-brand-500 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <strong className="text-gray-700 dark:text-gray-300">{s.active_drivers ?? 0}</strong> / {s.capacity}
                </button>
                <span>Cap: <strong className="text-gray-600 dark:text-gray-300">{s.capacity}</strong></span>
              </div>

              <div className="flex gap-2 mt-auto pt-2 border-t border-gray-100 dark:border-gray-800">
                <button onClick={() => setQueueStand(s)}
                  className="flex-1 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Ver cola
                </button>
                <button onClick={() => toggleActive(s)} disabled={actionId === s.id}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                    s.is_active
                      ? 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      : 'border-success-200 dark:border-success-800 text-success-600 dark:text-success-400 hover:bg-success-50 dark:hover:bg-success-500/10'
                  }`}
                >
                  {actionId === s.id ? '...' : s.is_active ? 'Desactivar' : 'Activar'}
                </button>
                <button onClick={() => setDeleteId(s.id)}
                  className="py-1.5 px-3 text-xs font-medium rounded-lg border border-error-200 dark:border-error-800 text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-500/10 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreate={load} />
      )}

      {queueStand && (
        <QueueModal stand={queueStand} onClose={() => setQueueStand(null)} />
      )}

      {deleteId && (
        <div className="fixed inset-0 z-999999 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setDeleteId(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-2">Eliminar parada</h3>
            <p className="text-sm text-gray-400 mb-6">¿Estás seguro? Los taxis en cola serán expulsados automáticamente.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >Cancelar</button>
              <button onClick={doDelete} disabled={!!actionId}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-error-500 text-white hover:bg-error-600 disabled:opacity-50 transition-colors"
              >Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
