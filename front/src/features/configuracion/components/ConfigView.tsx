'use client';
import React, { useState, useEffect, useRef } from 'react';
import type { FareConfig, Cooperative } from '@/types';
import { getFareConfig, updateFareConfig } from '../api';
import { getCooperativa, updateCooperativa } from '@/features/cooperativas/api';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import 'maplibre-gl/dist/maplibre-gl.css';

interface FieldDef {
  key: keyof FareConfig;
  label: string;
  description: string;
  prefix?: string;
  suffix?: string;
  step?: string;
  min?: number;
  max?: number;
}

const FIELDS: FieldDef[] = [
  { key: 'base_fare', label: 'Tarifa Base', description: 'Costo mínimo al iniciar un viaje', prefix: '$', step: '0.01', min: 0 },
  { key: 'per_km_rate', label: 'Tarifa por KM', description: 'Costo por kilómetro recorrido', prefix: '$', step: '0.001', min: 0 },
  { key: 'per_min_rate', label: 'Tarifa por Minuto', description: 'Costo por minuto en ruta', prefix: '$', step: '0.001', min: 0 },
  { key: 'minimum_fare', label: 'Tarifa Mínima', description: 'Valor mínimo cobrable', prefix: '$', step: '0.01', min: 0 },
  { key: 'platform_commission_pct', label: 'Comisión Plataforma', description: 'Porcentaje sobre cada viaje', suffix: '%', step: '0.1', min: 0, max: 100 },
];

interface SocialEntry { enabled: boolean; url?: string; }
interface SocialLinks {
  whatsapp: SocialEntry;
  email:    SocialEntry;
  facebook: SocialEntry;
  instagram: SocialEntry;
  tiktok:   SocialEntry;
  youtube:  SocialEntry;
}

const DEFAULT_SOCIAL: SocialLinks = {
  whatsapp:  { enabled: true,  url: '' },
  email:     { enabled: false, url: '' },
  facebook:  { enabled: false, url: '' },
  instagram: { enabled: false, url: '' },
  tiktok:    { enabled: false, url: '' },
  youtube:   { enabled: false, url: '' },
};

type SocialKey = keyof SocialLinks;

const SOCIAL_META: {
  key: SocialKey;
  label: string;
  placeholder: string;
  color: string;
  inputType: 'tel' | 'email' | 'url';
  icon: React.ReactNode;
}[] = [
  {
    key: 'whatsapp', label: 'WhatsApp', inputType: 'tel',
    placeholder: '+593987216789', color: '#25D366',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>,
  },
  {
    key: 'email', label: 'Correo', inputType: 'email',
    placeholder: 'contacto@panataxiapp.com', color: '#EA4335',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>,
  },
  {
    key: 'facebook', label: 'Facebook', inputType: 'url',
    placeholder: 'https://facebook.com/tupagina', color: '#1877F2',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  },
  {
    key: 'instagram', label: 'Instagram', inputType: 'url',
    placeholder: 'https://instagram.com/tuperfil', color: '#E1306C',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>,
  },
  {
    key: 'tiktok', label: 'TikTok', inputType: 'url',
    placeholder: 'https://tiktok.com/@tuperfil', color: '#ff0050',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.3 6.3 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/></svg>,
  },
  {
    key: 'youtube', label: 'YouTube', inputType: 'url',
    placeholder: 'https://youtube.com/@tucanal', color: '#FF0000',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>,
  },
];

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${on ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

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
        type="text"
        value={value}
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
              <button
                type="button"
                onMouseDown={() => pick(s)}
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

function CoopLocationMap({ lat, lng, flyTo, onChange }: {
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
      const marker = new mgl.Marker({ color: '#3b82f6', draggable: true })
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
      <div ref={containerRef} style={{ height: 220, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--color-gray-200)' }} />
      {lat && lng
        ? <p className="text-xs text-gray-400">{lat.toFixed(5)}, {lng.toFixed(5)} — ubicación guardada</p>
        : <p className="text-xs text-gray-400">Busca la dirección arriba o haz clic en el mapa para marcar la ubicación</p>
      }
    </div>
  );
}

// ── Sección perfil cooperativa ────────────────────────────────────────────────

function CoopProfileSection({ coopId }: { coopId: string }) {
  const [coop, setCoop]     = useState<Cooperative | null>(null);
  const [form, setForm]     = useState({ phone: '', address: '', latitude: null as number | null, longitude: null as number | null });
  const [flyTo, setFlyTo]   = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    getCooperativa(coopId).then((c) => {
      setCoop(c);
      setForm({ phone: c.phone ?? '', address: c.address ?? '', latitude: c.latitude ? Number(c.latitude) : null, longitude: c.longitude ? Number(c.longitude) : null });
    }).catch(() => {});
  }, [coopId]);

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      await updateCooperativa(coopId, { phone: form.phone || undefined, address: form.address || undefined, latitude: form.latitude ?? undefined, longitude: form.longitude ?? undefined });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError('Error al guardar. Intenta de nuevo.'); }
    finally { setSaving(false); }
  };

  if (!coop) return <div className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-5">
      <h2 className="text-base font-semibold text-gray-800 dark:text-white">Perfil de la Cooperativa</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nombre</label>
          <input value={coop.name} disabled className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed" />
          <p className="text-[10px] text-gray-400 mt-1">El nombre no se puede cambiar desde aquí</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">RUC</label>
          <input value={coop.ruc} disabled className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Teléfono</label>
          <input
            type="tel" value={form.phone}
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
          onSelect={(label, lat, lng) => { setForm((f) => ({ ...f, address: label, latitude: lat, longitude: lng })); setFlyTo({ lat, lng }); }}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Ubicación en el mapa</label>
        <CoopLocationMap
          lat={form.latitude} lng={form.longitude} flyTo={flyTo}
          onChange={(lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }))}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={handleSave} disabled={saving}
          className="px-6 py-2.5 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {saving && <Spinner />}
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {saved && <span className="text-sm font-medium text-success-600 dark:text-success-400">✓ Guardado</span>}
      </div>
    </div>
  );
}

export default function ConfigView() {
  const { user, isCoopStaff } = useAuth();
  const [config, setConfig] = useState<FareConfig | null>(null);
  const [form, setForm]     = useState<FareConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  const [social, setSocial]         = useState<SocialLinks>(DEFAULT_SOCIAL);
  const [socialOrig, setSocialOrig] = useState<SocialLinks>(DEFAULT_SOCIAL);
  const [savingSocial, setSavingSocial] = useState(false);
  const [savedSocial, setSavedSocial]   = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      getFareConfig(),
      api.get('/platform/config'),
    ]).then(([fareResult, configResult]) => {
      if (fareResult.status === 'fulfilled') {
        setConfig(fareResult.value);
        setForm(fareResult.value);
      }
      if (configResult.status === 'fulfilled') {
        const configs: { key: string; value: string }[] = configResult.value.data;

        // Build social from social_links, then back-fill from legacy keys if empty
        const legacyPhone = configs.find((c) => c.key === 'contact_phone')?.value ?? '';
        const legacyEmail = configs.find((c) => c.key === 'contact_email')?.value ?? '';
        const rawSocial   = configs.find((c) => c.key === 'social_links')?.value ?? '';

        let parsed: SocialLinks = DEFAULT_SOCIAL;
        try {
          if (rawSocial) parsed = { ...DEFAULT_SOCIAL, ...JSON.parse(rawSocial) };
        } catch { /* keep default */ }

        // Back-fill legacy phone/email into social if not already set
        if (!parsed.whatsapp.url && legacyPhone) parsed = { ...parsed, whatsapp: { ...parsed.whatsapp, url: legacyPhone } };
        if (!parsed.email.url    && legacyEmail) parsed = { ...parsed, email:    { ...parsed.email,    url: legacyEmail } };

        setSocial(parsed);
        setSocialOrig(parsed);
      }
    }).finally(() => setLoading(false));
  }, []);

  const handleSaveFare = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await updateFareConfig(form);
      setConfig(updated); setForm(updated);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const handleSaveSocial = async () => {
    setSavingSocial(true);
    try {
      await api.patch('/platform/config/social_links', { value: JSON.stringify(social) });
      // Keep legacy keys in sync so ContactSection still works
      if (social.whatsapp.url !== socialOrig.whatsapp.url) {
        await api.patch('/platform/config/contact_phone', { value: social.whatsapp.url ?? '' });
      }
      if (social.email.url !== socialOrig.email.url) {
        await api.patch('/platform/config/contact_email', { value: social.email.url ?? '' });
      }
      setSocialOrig(social);
      setSavedSocial(true); setTimeout(() => setSavedSocial(false), 2000);
    } finally { setSavingSocial(false); }
  };

  const setSocialEntry = (key: SocialKey, field: 'enabled' | 'url', value: boolean | string) =>
    setSocial((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

  const isDirty       = form && config && JSON.stringify(form) !== JSON.stringify(config);
  const isSocialDirty = JSON.stringify(social) !== JSON.stringify(socialOrig);

  return (
    <div className="space-y-6">

      {/* ── Perfil cooperativa (solo coop admin) ── */}
      {isCoopStaff && user?.cooperative_id && (
        <CoopProfileSection coopId={user.cooperative_id} />
      )}

      {/* ── Tarifas ── */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">Configuración de Tarifas</h2>
          <p className="text-sm text-gray-400 mt-0.5">Tasas aplicadas al cálculo de viajes en modo taxímetro</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-3 w-24 rounded bg-gray-100 dark:bg-gray-800 mb-2" />
                <div className="h-10 w-full rounded-xl bg-gray-100 dark:bg-gray-800" />
              </div>
            ))}
          </div>
        ) : form ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                  <p className="text-xs text-gray-400 mb-2">{f.description}</p>
                  <div className="relative">
                    {f.prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">{f.prefix}</span>}
                    <input
                      type="number" step={f.step ?? '1'} min={f.min} max={f.max}
                      value={form[f.key]}
                      onChange={(e) => setForm((prev) => prev ? ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }) : prev)}
                      className={`w-full py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 ${f.prefix ? 'pl-7 pr-3' : f.suffix ? 'pl-3 pr-7' : 'px-3'}`}
                    />
                    {f.suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">{f.suffix}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={handleSaveFare}
                disabled={!isDirty || saving}
                className="px-6 py-2.5 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {saving && <Spinner />}
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              {isDirty && !saving && (
                <button
                  onClick={() => setForm(config)}
                  className="px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Descartar
                </button>
              )}
              {saved && <span className="text-sm font-medium text-success-600 dark:text-success-400">✓ Guardado</span>}
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-sm text-gray-400">No se pudo cargar la configuración</div>
        )}
      </div>

      {/* ── Redes sociales y contacto ── */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">Redes sociales y contacto</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Activa cada canal y completa el dato. Se muestran en el footer del sitio web con sus colores reales.
          </p>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {SOCIAL_META.map((s) => {
            const entry = social[s.key];
            return (
              <div key={s.key} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                {/* Toggle */}
                <Toggle on={entry.enabled} onChange={(v) => setSocialEntry(s.key, 'enabled', v)} />

                {/* Icono + label */}
                <div className="flex items-center gap-2 w-28 flex-shrink-0">
                  <span style={{ color: entry.enabled ? s.color : undefined }} className={entry.enabled ? '' : 'text-gray-400 dark:text-gray-600'}>
                    {s.icon}
                  </span>
                  <span className={`text-sm font-medium ${entry.enabled ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-600'}`}>
                    {s.label}
                  </span>
                </div>

                {/* Input */}
                <input
                  type={s.inputType}
                  value={entry.url ?? ''}
                  onChange={(e) => setSocialEntry(s.key, 'url', e.target.value)}
                  placeholder={s.placeholder}
                  disabled={!entry.enabled}
                  className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                />
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={handleSaveSocial}
            disabled={!isSocialDirty || savingSocial}
            className="px-6 py-2.5 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {savingSocial && <Spinner />}
            {savingSocial ? 'Guardando...' : 'Guardar'}
          </button>
          {savedSocial && <span className="text-sm font-medium text-success-600 dark:text-success-400">✓ Actualizado</span>}
        </div>
      </div>

      {/* ── Info cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: '🗺️', title: 'Modo Taxímetro', desc: 'El costo se calcula en tiempo real usando tarifa base + km + minutos. El conductor no puede modificarlo.' },
          { icon: '🤝', title: 'Modo Negociado', desc: 'El cliente propone un precio, el conductor puede aceptar o hacer contraoferta. Mayor flexibilidad.' },
          { icon: '📊', title: 'Comisión', desc: 'La plataforma retiene el % configurado de cada viaje completado. Aplica sobre la tarifa final acordada.' },
        ].map((c) => (
          <div key={c.title} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <div className="text-2xl mb-3">{c.icon}</div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-2">{c.title}</h3>
            <p className="text-xs text-gray-400 leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
