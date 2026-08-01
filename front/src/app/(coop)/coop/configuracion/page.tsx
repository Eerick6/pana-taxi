'use client';
import React, { useState, useEffect, useRef } from 'react';
import type { Cooperative } from '@/types';
import { getCooperativa, updateCooperativa } from '@/features/cooperativas/api';
import { useAuth } from '@/context/AuthContext';
import 'maplibre-gl/dist/maplibre-gl.css';

// ── Photon geocoding ──────────────────────────────────────────────────────────

interface GeoSug { label: string; lat: number; lng: number }

function photonToGeoSug(f: Record<string, unknown>): GeoSug | null {
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
  value: string;
  onChange: (v: string) => void;
  onSelect: (label: string, lat: number, lng: number) => void;
}) {
  const [suggestions, setSuggestions] = useState<GeoSug[]>([]);
  const [open, setOpen]               = useState(false);
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (q: string) => {
    onChange(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q.trim())}&limit=6&bbox=-81.0,-5.0,-75.0,2.0`;
        const res  = await fetch(url);
        const data = await res.json();
        const results = (data.features as Record<string, unknown>[] ?? [])
          .map(photonToGeoSug).filter(Boolean) as GeoSug[];
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch { /* silent */ }
    }, 350);
  };

  const pick = (s: GeoSug) => {
    onChange(s.label);
    setSuggestions([]);
    setOpen(false);
    onSelect(s.label, s.lat, s.lng);
  };

  return (
    <div className="relative">
      <input
        type="text" value={value}
        onChange={(e) => search(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Busca la dirección de tu cooperativa..."
        autoComplete="off"
        className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl overflow-hidden">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button type="button" onMouseDown={() => pick(s)}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-start gap-2 transition-colors"
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

// ── Mapa con marcador arrastrable ─────────────────────────────────────────────

function LocationMap({ lat, lng, flyTo, onChange }: {
  lat: number | null; lng: number | null;
  flyTo: { lat: number; lng: number } | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<unknown>(null);
  const markerRef    = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initLat = lat ?? -1.5, initLng = lng ?? -78.5;
    import('maplibre-gl').then((ml) => {
      const mgl = ml.default ?? ml;
      const map = new mgl.Map({
        container: containerRef.current!,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [initLng, initLat],
        zoom: lat ? 14 : 6,
      });
      const marker = new mgl.Marker({ color: '#fcbd13', draggable: true })
        .setLngLat([initLng, initLat]).addTo(map);
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
    (mapRef.current as { flyTo: (o: object) => void }).flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 15, duration: 900 });
  }, [flyTo]);

  return (
    <div className="space-y-1">
      <div ref={containerRef} style={{ height: 240, borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }} />
      <p className="text-xs text-gray-400">
        {lat && lng ? `${lat.toFixed(5)}, ${lng.toFixed(5)} — ubicación guardada` : 'Busca arriba o haz clic en el mapa para marcar la ubicación'}
      </p>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function CoopConfiguracionPage() {
  const { user } = useAuth();
  const [coop, setCoop]     = useState<Cooperative | null>(null);
  const [form, setForm]     = useState({ phone: '', address: '', latitude: null as number | null, longitude: null as number | null });
  const [flyTo, setFlyTo]   = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (!user?.cooperative_id) return;
    getCooperativa(user.cooperative_id).then((c) => {
      setCoop(c);
      setForm({
        phone:     c.phone     ?? '',
        address:   c.address   ?? '',
        latitude:  c.latitude  != null ? Number(c.latitude)  : null,
        longitude: c.longitude != null ? Number(c.longitude) : null,
      });
    });
  }, [user?.cooperative_id]);

  const handleSave = async () => {
    if (!user?.cooperative_id) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      await updateCooperativa(user.cooperative_id, {
        phone:     form.phone     || undefined,
        address:   form.address   || undefined,
        latitude:  form.latitude  ?? undefined,
        longitude: form.longitude ?? undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError('Error al guardar. Intenta de nuevo.'); }
    finally { setSaving(false); }
  };

  if (!coop) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Configuración</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Datos y ubicación de tu cooperativa</p>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Datos de la cooperativa</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nombre</label>
            <input value={coop.name} disabled
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed" />
            <p className="text-[10px] text-gray-400 mt-1">Solo puede cambiarlo un administrador de plataforma</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">RUC</label>
            <input value={coop.ruc} disabled
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Teléfono</label>
            <input type="tel" value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+593987654321"
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Dirección</label>
          <AddressAutocomplete
            value={form.address}
            onChange={(v) => setForm((f) => ({ ...f, address: v }))}
            onSelect={(label, lat, lng) => {
              setForm((f) => ({ ...f, address: label, latitude: lat, longitude: lng }));
              setFlyTo({ lat, lng });
            }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Ubicación en el mapa</label>
          <LocationMap
            lat={form.latitude} lng={form.longitude} flyTo={flyTo}
            onChange={(lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }))}
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2.5 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {saving && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          {saved && <span className="text-sm font-medium text-success-600 dark:text-success-400">✓ Guardado</span>}
        </div>
      </div>
    </div>
  );
}
