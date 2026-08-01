'use client';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const Y = '#fcbd13';
const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

const inputClass =
  'w-full h-11 px-4 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/25 transition-colors';
const labelClass = 'block text-xs font-semibold text-gray-400 mb-1.5';

// ── País / código de marcación ────────────────────────────────────────────────

const COUNTRIES = [
  { code: '+593', flag: '🇪🇨', name: 'Ecuador',    hint: '9 XXXX XXXX',     maxLen: 9  },
  { code: '+57',  flag: '🇨🇴', name: 'Colombia',   hint: '3XX XXX XXXX',    maxLen: 10 },
  { code: '+51',  flag: '🇵🇪', name: 'Perú',       hint: '9XX XXX XXX',     maxLen: 9  },
  { code: '+56',  flag: '🇨🇱', name: 'Chile',      hint: '9 XXXX XXXX',     maxLen: 9  },
  { code: '+52',  flag: '🇲🇽', name: 'México',     hint: '55 XXXX XXXX',    maxLen: 10 },
  { code: '+54',  flag: '🇦🇷', name: 'Argentina',  hint: '9 11 XXXX XXXX',  maxLen: 11 },
  { code: '+58',  flag: '🇻🇪', name: 'Venezuela',  hint: '412 XXX XXXX',    maxLen: 10 },
  { code: '+1',   flag: '🇺🇸', name: 'EE. UU.',    hint: '(555) 000-0000',  maxLen: 10 },
];

function PhoneInput({ value, onChange }: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [dialCode, setDialCode] = useState('+593');
  const [local, setLocal] = useState('');

  const country = COUNTRIES.find((c) => c.code === dialCode) ?? COUNTRIES[0];

  const handleLocal = (v: string) => {
    setLocal(v);
    onChange(v ? `${dialCode}${v}` : '');
  };

  const handleDial = (code: string) => {
    setDialCode(code);
    const newMax = COUNTRIES.find((c) => c.code === code)?.maxLen ?? 15;
    const trimmed = local.slice(0, newMax);
    setLocal(trimmed);
    onChange(trimmed ? `${code}${trimmed}` : '');
  };

  return (
    <div className="flex gap-2">
      {/* Country selector */}
      <div className="relative">
        <select
          value={dialCode}
          onChange={(e) => handleDial(e.target.value)}
          aria-label="Código de país"
          className="h-11 pl-3 pr-7 rounded-xl border border-white/10 bg-white/5 text-sm text-white focus:outline-none focus:border-white/25 transition-colors appearance-none cursor-pointer"
          style={{ minWidth: '110px' }}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code} style={{ backgroundColor: '#1a1a2e', color: '#fff' }}>
              {c.flag} {c.code}
            </option>
          ))}
        </select>
        {/* Chevron icon */}
        <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Number input */}
      <input
        type="tel"
        value={local}
        onChange={(e) => handleLocal(e.target.value.replace(/\D/g, '').slice(0, country.maxLen))}
        placeholder={country.hint}
        maxLength={country.maxLen}
        className={`${inputClass} flex-1`}
      />
    </div>
  );
}

// ── Mapbox geocoding autocomplete ─────────────────────────────────────────────

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

interface GeoSuggestion { place_name: string; center: [number, number] }

function AddressSearch({ value, onSelect }: {
  value: string;
  onSelect: (address: string, lat: number, lng: number) => void;
}) {
  const [query, setQuery]           = useState(value);
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [open, setOpen]             = useState(false);
  const debounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&language=es&types=address,place,poi,locality&limit=5&country=ec,co,pe,cl,mx,ar,ve,us`;
        const res  = await fetch(url);
        const data = await res.json();
        setSuggestions(data.features ?? []);
        setOpen(true);
      } catch { /* silent */ }
    }, 350);
  };

  const pick = (s: GeoSuggestion) => {
    setQuery(s.place_name);
    setSuggestions([]);
    setOpen(false);
    onSelect(s.place_name, s.center[1], s.center[0]);
  };

  return (
    <div className="relative">
      <div className="relative">
        <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => search(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Busca la dirección de tu cooperativa..."
          className={`${inputClass} pl-9`}
          autoComplete="off"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 rounded-xl border border-white/10 bg-gray-900 shadow-xl overflow-hidden">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={() => pick(s)}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 flex items-start gap-2 transition-colors"
              >
                <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke={Y} strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0z" />
                </svg>
                <span className="line-clamp-2">{s.place_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Map picker (visual confirmation + manual drag) ────────────────────────────

function LocationPicker({ lat, lng, flyTo, onChange }: {
  lat: number | null;
  lng: number | null;
  flyTo: { lat: number; lng: number } | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<unknown>(null);
  const markerRef    = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initLat = lat ?? -1.5;
    const initLng = lng ?? -78.5;

    import('maplibre-gl').then((ml) => {
      const maplibregl = ml.default ?? ml;

      const map = new maplibregl.Map({
        container: containerRef.current!,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [initLng, initLat],
        zoom: lat ? 14 : 6,
      });

      const el = document.createElement('div');
      el.style.cssText = 'width:32px;height:40px;cursor:grab;display:flex;align-items:flex-end;justify-content:center;';
      el.innerHTML = `<svg viewBox="0 0 24 32" width="32" height="40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 23 9 23s9-16.25 9-23c0-4.97-4.03-9-9-9z" fill="${Y}"/>
        <circle cx="12" cy="9" r="4" fill="#fff"/>
      </svg>`;

      const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom' })
        .setLngLat([initLng, initLat])
        .addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLngLat();
        onChange(parseFloat(pos.lat.toFixed(7)), parseFloat(pos.lng.toFixed(7)));
      });

      map.on('click', (e: { lngLat: { lat: number; lng: number } }) => {
        marker.setLngLat([e.lngLat.lng, e.lngLat.lat]);
        onChange(parseFloat(e.lngLat.lat.toFixed(7)), parseFloat(e.lngLat.lng.toFixed(7)));
      });

      mapRef.current    = map;
      markerRef.current = marker;
    });

    return () => {
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to geocoded location when autocomplete selects a place
  useEffect(() => {
    if (!flyTo || !mapRef.current || !markerRef.current) return;
    const map    = mapRef.current as { flyTo: (o: object) => void };
    const marker = markerRef.current as { setLngLat: (c: [number, number]) => void };
    marker.setLngLat([flyTo.lng, flyTo.lat]);
    map.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 15, duration: 1000 });
  }, [flyTo]);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        style={{ height: 200, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}
      />
      {lat && lng ? (
        <p className="text-[10px] text-gray-500 flex items-center gap-1">
          <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke={Y} strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0z" />
          </svg>
          {lat.toFixed(5)}, {lng.toFixed(5)} — ubicación confirmada
        </p>
      ) : (
        <p className="text-[10px] text-gray-600">Busca la dirección arriba o haz clic en el mapa para ajustar el marcador</p>
      )}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CoopData {
  name: string;
  ruc: string;
  address: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  flyTo: { lat: number; lng: number } | null;
}

interface AdminData {
  admin_name: string;
  admin_email: string;
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <React.Fragment key={i}>
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              i + 1 <= current ? 'text-black' : 'bg-white/5 border border-white/10 text-gray-600'
            }`}
            style={i + 1 <= current ? { backgroundColor: Y } : undefined}
          >
            {i + 1 < current ? '✓' : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={`flex-1 h-px transition-all ${i + 1 < current ? 'opacity-100' : 'opacity-20'}`}
              style={i + 1 < current ? { backgroundColor: Y } : { backgroundColor: '#fff' }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Step 1: Cooperative info ──────────────────────────────────────────────────

function StepCoop({ data, onChange, onNext }: {
  data: CoopData;
  onChange: (d: Partial<CoopData>) => void;
  onNext: () => void;
}) {
  const [err, setErr] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{13}$/.test(data.ruc)) { setErr('El RUC debe tener exactamente 13 dígitos.'); return; }
    setErr('');
    onNext();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 space-y-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Datos de la cooperativa</p>

        <div>
          <label className={labelClass}>Nombre de la cooperativa <span className="text-red-400">*</span></label>
          <input
            required type="text" value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Cooperativa de Taxis El Condado"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>RUC <span className="text-red-400">*</span></label>
            <input
              required type="text" value={data.ruc}
              onChange={(e) => onChange({ ruc: e.target.value.replace(/\D/g, '').slice(0, 13) })}
              placeholder="1234567890001" maxLength={13}
              className={inputClass}
            />
            <p className="text-[10px] text-gray-600 mt-1">13 dígitos, sin guiones</p>
          </div>

          <div>
            <label className={labelClass}>Teléfono</label>
            <PhoneInput value={data.phone} onChange={(v) => onChange({ phone: v })} />
            <p className="text-[10px] text-gray-600 mt-1">Ej: 9 8765 4321 (sin el 0 inicial)</p>
          </div>
        </div>

        <div>
          <label className={labelClass}>Dirección <span className="text-gray-600 font-normal">(opcional)</span></label>
          <AddressSearch
            value={data.address}
            onSelect={(address, lat, lng) => onChange({ address, latitude: lat, longitude: lng, flyTo: { lat, lng } })}
          />
        </div>

        <div>
          <label className={labelClass}>Ubicación en el mapa <span className="text-gray-600 font-normal">(ajusta si es necesario)</span></label>
          <LocationPicker
            lat={data.latitude}
            lng={data.longitude}
            flyTo={data.flyTo}
            onChange={(lat, lng) => onChange({ latitude: lat, longitude: lng })}
          />
        </div>
      </div>

      {err && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{err}</p>}

      <button type="submit" className="w-full h-12 rounded-xl font-bold text-sm text-black hover:opacity-90 transition-all" style={{ backgroundColor: Y }}>
        Continuar →
      </button>
    </form>
  );
}

// ── Step 2: Admin + T&C ───────────────────────────────────────────────────────

function StepAdmin({ data, onChange, onNext, onBack, loading, error }: {
  data: AdminData;
  onChange: (d: Partial<AdminData>) => void;
  onNext: () => void;
  onBack: () => void;
  loading: boolean;
  error: string;
}) {
  const [accepted, setAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const submit = (e: React.FormEvent) => { e.preventDefault(); if (accepted) onNext(); };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 space-y-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Administrador de la cooperativa</p>
        <p className="text-xs text-gray-500">Esta persona tendrá acceso al panel de gestión de la cooperativa.</p>

        <div>
          <label className={labelClass}>Nombre completo <span className="text-red-400">*</span></label>
          <input
            required type="text" value={data.admin_name}
            onChange={(e) => onChange({ admin_name: e.target.value })}
            placeholder="Juan Pérez García"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Correo electrónico <span className="text-red-400">*</span></label>
          <input
            required type="email" value={data.admin_email}
            onChange={(e) => onChange({ admin_email: e.target.value })}
            placeholder="admin@micooperativa.com"
            className={inputClass}
          />
          <p className="text-[10px] text-gray-600 mt-1">Recibirás un correo para crear tu contraseña y acceder al panel.</p>
        </div>
      </div>

      {/* Terms & Conditions */}
      <div className={`rounded-2xl border p-4 transition-colors ${accepted ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-white/8 bg-white/[0.02]'}`}>
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <div className="relative flex-shrink-0 mt-0.5">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="sr-only"
            />
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${accepted ? 'border-transparent' : 'border-white/20 bg-white/5'}`}
              style={accepted ? { backgroundColor: Y, borderColor: Y } : undefined}>
              {accepted && (
                <svg className="w-3 h-3 text-black" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            He leído y acepto los{' '}
            <button
              type="button"
              onClick={() => setShowTerms(true)}
              className="font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
              style={{ color: Y }}
            >
              Términos y Condiciones
            </button>
            {' '}y la{' '}
            <button
              type="button"
              onClick={() => setShowTerms(true)}
              className="font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
              style={{ color: Y }}
            >
              Política de Privacidad
            </button>
            {' '}de Pana Taxi. Confirmo que la información proporcionada es verídica y que estoy autorizado para registrar esta cooperativa.
          </p>
        </label>
      </div>

      {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="flex-1 h-12 rounded-xl font-semibold text-sm text-gray-400 border border-white/10 hover:border-white/20 transition-all">
          ← Atrás
        </button>
        <button
          type="submit"
          disabled={loading || !accepted}
          className="flex-1 h-12 rounded-xl font-bold text-sm text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          style={{ backgroundColor: Y }}
        >
          {loading && (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {loading ? 'Registrando...' : 'Crear cuenta →'}
        </button>
      </div>

      {/* Terms modal */}
      {showTerms && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg bg-gray-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-white/8 flex-shrink-0">
              <h3 className="font-black text-white">Términos y Condiciones</h3>
              <button onClick={() => setShowTerms(false)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto p-6 text-xs text-gray-400 leading-relaxed space-y-4">
              <p className="font-bold text-white text-sm">1. Aceptación de los términos</p>
              <p>Al registrar tu cooperativa en la plataforma Pana Taxi, aceptas cumplir con los presentes términos y condiciones. Si no estás de acuerdo, no continúes con el registro.</p>

              <p className="font-bold text-white text-sm">2. Registro y veracidad de la información</p>
              <p>La cooperativa y su representante legal se comprometen a proporcionar información veraz, completa y actualizada. Cualquier falsedad en los datos declarados puede resultar en la cancelación inmediata de la cuenta.</p>

              <p className="font-bold text-white text-sm">3. Aprobación de la cuenta</p>
              <p>El registro no implica la aprobación automática. El equipo de Pana Taxi revisará la documentación enviada y notificará al correo registrado sobre el resultado de la evaluación.</p>

              <p className="font-bold text-white text-sm">4. Uso de la plataforma</p>
              <p>La cooperativa se compromete a utilizar la plataforma únicamente para la gestión de servicios de transporte autorizados, y a cumplir con la normativa vigente de la ANT (Agencia Nacional de Tránsito) y demás entidades reguladoras.</p>

              <p className="font-bold text-white text-sm">5. Comisiones y pagos</p>
              <p>La plataforma aplicará una comisión por cada viaje completado, según la tarifa acordada al momento de la activación. El incumplimiento en los pagos puede derivar en la suspensión del acceso.</p>

              <p className="font-bold text-white text-sm">6. Privacidad de datos</p>
              <p>Los datos personales de la cooperativa, sus administradores y conductores serán tratados conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador (LOPDP). No se compartirán con terceros sin consentimiento expreso, salvo por obligación legal.</p>

              <p className="font-bold text-white text-sm">7. Suspensión y terminación</p>
              <p>Pana Taxi se reserva el derecho de suspender o cancelar cuentas que incumplan estos términos, la normativa vigente o que presenten comportamientos fraudulentos, sin previo aviso.</p>

              <p className="font-bold text-white text-sm">8. Modificaciones</p>
              <p>Pana Taxi puede modificar estos términos en cualquier momento. Los cambios serán notificados por correo electrónico. El uso continuado de la plataforma implica la aceptación de las nuevas condiciones.</p>

              <p className="text-gray-600">Última actualización: junio 2025</p>
            </div>
            <div className="p-4 border-t border-white/8 flex-shrink-0">
              <button
                onClick={() => { setAccepted(true); setShowTerms(false); }}
                className="w-full h-11 rounded-xl font-bold text-sm text-black transition-all hover:opacity-90"
                style={{ backgroundColor: Y }}
              >
                Entendido, acepto los términos
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

// ── Step 3: OTP verification ──────────────────────────────────────────────────

function StepOtp({ email, onSuccess, onBack }: {
  email: string;
  onSuccess: (token: string) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND}/auth/email-otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Código incorrecto');
      onSuccess(data.access_token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al verificar');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      await fetch(`${BACKEND}/auth/email-otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setResent(true);
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={verify} className="space-y-5">
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 space-y-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Verificar correo</p>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/8">
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke={Y} strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-gray-300">Enviamos un código de 6 dígitos a <span className="font-semibold text-white">{email}</span></p>
        </div>
        <div>
          <label className={labelClass}>Código de verificación <span className="text-red-400">*</span></label>
          <input
            required
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            className={`${inputClass} text-center text-xl tracking-[0.5em] font-bold`}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-600">¿No llegó el correo?</p>
          <button type="button" onClick={resend} disabled={resending} className="text-xs font-semibold transition-colors hover:opacity-80" style={{ color: Y }}>
            {resending ? 'Enviando...' : resent ? '✓ Reenviado' : 'Reenviar código'}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="flex-1 h-12 rounded-xl font-semibold text-sm text-gray-400 border border-white/10 hover:border-white/20 transition-all">
          ← Atrás
        </button>
        <button
          type="submit"
          disabled={loading || code.length < 6}
          className="flex-1 h-12 rounded-xl font-bold text-sm text-black hover:opacity-90 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
          style={{ backgroundColor: Y }}
        >
          {loading && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
          {loading ? 'Verificando...' : 'Verificar →'}
        </button>
      </div>
    </form>
  );
}

// ── Step 4: Document upload ───────────────────────────────────────────────────

const DOC_TYPES = [
  { type: 'ruc',       label: 'RUC de la cooperativa' },
  { type: 'ant_permit', label: 'Permiso de operación ANT/GADM' },
];

function StepDocuments({ coopId, token, onDone }: {
  coopId: string;
  token: string;
  onDone: () => void;
}) {
  const [uploaded, setUploaded] = useState<Record<string, 'uploading' | 'done' | 'error'>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const upload = async (type: string, file: File) => {
    setUploaded((u) => ({ ...u, [type]: 'uploading' }));
    setErrors((e) => { const n = { ...e }; delete n[type]; return n; });
    try {
      const fd = new FormData();
      fd.append('type', type);
      fd.append('file', file);
      const res = await fetch(`${BACKEND}/cooperatives/${coopId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(Array.isArray(err.message) ? err.message[0] : err.message ?? 'Error al subir');
      }
      setUploaded((u) => ({ ...u, [type]: 'done' }));
    } catch (err: unknown) {
      setUploaded((u) => { const n = { ...u }; delete n[type]; return n; });
      setErrors((e) => ({ ...e, [type]: err instanceof Error ? err.message : 'Error' }));
    }
  };

  const doneCount = Object.values(uploaded).filter((v) => v === 'done').length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Documentos requeridos</p>
          <span className="text-xs font-semibold" style={{ color: Y }}>{doneCount}/{DOC_TYPES.length} subidos</span>
        </div>
        <p className="text-xs text-gray-500">
          Sube los documentos para que la plataforma pueda revisar y aprobar tu cooperativa.
          Puedes también subirlos desde el panel después de iniciar sesión.
        </p>
        <div className="space-y-3">
          {DOC_TYPES.map(({ type, label }) => {
            const state = uploaded[type];
            return (
              <div key={type} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                state === 'done' ? 'border-green-500/30 bg-green-500/5' :
                errors[type]    ? 'border-red-500/30 bg-red-500/5' :
                                  'border-white/8 bg-white/[0.02]'
              }`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${state === 'done' ? 'bg-green-500/20' : 'bg-white/5'}`}>
                  {state === 'done'
                    ? <svg className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    : state === 'uploading'
                    ? <svg className="w-4 h-4 animate-spin text-yellow-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    : <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-300 truncate">{label}</p>
                  {errors[type] && <p className="text-[10px] text-red-400 mt-0.5">{errors[type]}</p>}
                </div>
                <label className={`cursor-pointer text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                  state === 'done' ? 'text-gray-600 bg-white/5 hover:bg-white/8' : 'text-black hover:opacity-90'
                }`} style={state !== 'done' ? { backgroundColor: Y } : undefined}>
                  {state === 'done' ? 'Cambiar' : state === 'uploading' ? '...' : 'Subir'}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    disabled={state === 'uploading'}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(type, f); e.target.value = ''; }}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onDone}
          className="flex-1 h-12 rounded-xl font-semibold text-sm text-gray-400 border border-white/10 hover:border-white/20 transition-all"
        >
          Subir después →
        </button>
        <button
          onClick={onDone}
          disabled={doneCount === 0}
          className="flex-1 h-12 rounded-xl font-bold text-sm text-black hover:opacity-90 disabled:opacity-50 transition-all"
          style={{ backgroundColor: Y }}
        >
          Finalizar →
        </button>
      </div>
    </div>
  );
}

// ── Step 5: Success ───────────────────────────────────────────────────────────

function StepSuccess({ email }: { email: string }) {
  return (
    <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-10 text-center space-y-4">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: `${Y}20` }}>
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke={Y} strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
        </svg>
      </div>
      <h2 className="text-xl font-black text-white">¡Revisa tu correo!</h2>
      <p className="text-sm text-gray-400 max-w-sm mx-auto">
        Enviamos un correo a <span className="font-semibold text-white">{email}</span> con instrucciones para crear tu contraseña.
      </p>
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 text-left space-y-2 text-xs text-gray-500">
        <p className="flex items-start gap-2"><span style={{ color: Y }}>1.</span> Crea tu contraseña desde el enlace del correo</p>
        <p className="flex items-start gap-2"><span style={{ color: Y }}>2.</span> Inicia sesión y sube los documentos requeridos</p>
        <p className="flex items-start gap-2"><span style={{ color: Y }}>3.</span> Cuando aprobemos tu cooperativa, recibirás otro correo de confirmación</p>
      </div>
      <Link href="/" className="inline-flex items-center justify-center h-11 px-6 rounded-xl font-semibold text-sm text-gray-400 border border-white/10 hover:border-white/20 transition-all">
        Volver al inicio
      </Link>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function CooperativaRegistroForm() {
  const [step, setStep] = useState(1);
  const [coop, setCoop] = useState<CoopData>({ name: '', ruc: '', address: '', phone: '', latitude: null, longitude: null, flyTo: null });
  const [admin, setAdmin] = useState<AdminData>({ admin_name: '', admin_email: '' });
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');

  const register = async () => {
    setRegistering(true);
    setRegisterError('');
    try {
      const res = await fetch(`${BACKEND}/cooperatives/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...coop, ...admin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message ?? 'Error al registrar');
      setStep(3);
    } catch (err: unknown) {
      setRegisterError(err instanceof Error ? err.message : 'Error al registrar');
    } finally {
      setRegistering(false);
    }
  };

  if (step === 3) return <StepSuccess email={admin.admin_email} />;

  const LABELS = ['Cooperativa', 'Administrador'];

  return (
    <div className="space-y-2">
      <StepIndicator current={step} total={2} />
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-4">
        Paso {step} de 2 — {LABELS[step - 1]}
      </p>

      {step === 1 && (
        <StepCoop
          data={coop}
          onChange={(d) => setCoop((c) => ({ ...c, ...d }))}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <StepAdmin
          data={admin}
          onChange={(d) => setAdmin((a) => ({ ...a, ...d }))}
          onNext={register}
          onBack={() => setStep(1)}
          loading={registering}
          error={registerError}
        />
      )}
    </div>
  );
}
