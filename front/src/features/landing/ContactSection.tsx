'use client';
import React, { useEffect, useState } from 'react';

const Y = '#fcbd13';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const COUNTRIES = [
  { code: '+593', flag: '🇪🇨', name: 'Ecuador',   hint: '9 XXXX XXXX',    maxLen: 9  },
  { code: '+57',  flag: '🇨🇴', name: 'Colombia',  hint: '3XX XXX XXXX',   maxLen: 10 },
  { code: '+51',  flag: '🇵🇪', name: 'Perú',      hint: '9XX XXX XXX',    maxLen: 9  },
  { code: '+56',  flag: '🇨🇱', name: 'Chile',     hint: '9 XXXX XXXX',    maxLen: 9  },
  { code: '+52',  flag: '🇲🇽', name: 'México',    hint: '55 XXXX XXXX',   maxLen: 10 },
  { code: '+54',  flag: '🇦🇷', name: 'Argentina', hint: '9 11 XXXX XXXX', maxLen: 11 },
  { code: '+58',  flag: '🇻🇪', name: 'Venezuela', hint: '412 XXX XXXX',   maxLen: 10 },
  { code: '+1',   flag: '🇺🇸', name: 'EE. UU.',   hint: '(555) 000-0000', maxLen: 10 },
];

function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
      <div className="relative">
        <select
          value={dialCode}
          onChange={(e) => handleDial(e.target.value)}
          className="h-11 pl-3 pr-7 rounded-xl border border-white/10 bg-white/5 text-sm text-white focus:outline-none focus:border-white/25 transition-colors appearance-none cursor-pointer"
          style={{ minWidth: '110px' }}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code} style={{ backgroundColor: '#0f172a', color: '#fff' }}>
              {c.flag} {c.code}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <input
        type="tel"
        value={local}
        onChange={(e) => handleLocal(e.target.value.replace(/\D/g, '').slice(0, country.maxLen))}
        placeholder={country.hint}
        maxLength={country.maxLen}
        className="flex-1 h-11 px-4 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/25 transition-colors"
      />
    </div>
  );
}

interface FormState {
  name: string;
  cooperative: string;
  email: string;
  phone: string;
  driver_count_range: string;
  message: string;
}

const EMPTY: FormState = { name: '', cooperative: '', email: '', phone: '', driver_count_range: '', message: '' };

export default function ContactSection() {
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/public/config`)
      .then((r) => r.json())
      .then((data: Record<string, string>) => {
        // Prefer phone from social_links.whatsapp.url, fall back to contact_phone
        let phone = data.contact_phone ?? null;
        if (data.social_links) {
          try {
            const s = JSON.parse(data.social_links);
            if (s?.whatsapp?.url) phone = s.whatsapp.url;
          } catch { /* ignore */ }
        }
        if (phone) setContactPhone(phone);
      })
      .catch(() => {});
  }, []);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.cooperative || !form.email) return;
    setStatus('sending');
    setErrorMsg('');
    try {
      const res = await fetch(`${API_URL}/public/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          cooperative: form.cooperative,
          email: form.email,
          phone: form.phone || undefined,
          driver_count_range: form.driver_count_range || undefined,
          message: form.message || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'Error al enviar');
      }
      setStatus('sent');
      setForm(EMPTY);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo enviar. Intenta de nuevo.');
      setStatus('error');
    }
  };

  const waHref = contactPhone
    ? `https://wa.me/${contactPhone.replace(/\D/g, '')}?text=${encodeURIComponent('Hola, me interesa Pana Taxi para mi cooperativa.')}`
    : null;

  return (
    <section id="contacto" className="max-w-6xl mx-auto px-6 py-24">
      <div className="mb-12">
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: Y }}>Contacto</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white">¿Listo para comenzar?</h2>
        <p className="text-gray-400 text-sm mt-3 max-w-lg">
          Cuéntanos sobre tu cooperativa y nos ponemos en contacto en menos de 24 horas para activar tu acceso.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
        {/* Left — contact info */}
        <div className="space-y-8">
          {waHref && (
            <div className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-gray-400 flex-shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">WhatsApp</p>
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-200 hover:text-white transition-colors"
                >
                  {contactPhone}
                </a>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-white/5 bg-white/3 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white">¿Por qué elegirnos?</h3>
            {[
              'Activación en menos de 24 horas',
              'Soporte técnico en español',
              'Sin comisiones ocultas',
              'Datos alojados en Ecuador',
              'Actualizaciones gratuitas incluidas',
              'Escala sin límite de conductores',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l2.5 2.5L10 3.5" stroke={Y} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-sm text-gray-300">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — form */}
        {status === 'sent' ? (
          <div className="flex flex-col items-center justify-center text-center py-12 px-6 rounded-2xl border border-white/5 bg-white/3 space-y-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: `${Y}20` }}>
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke={Y} strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white">¡Solicitud enviada!</h3>
            <p className="text-sm text-gray-400 max-w-xs">Recibimos tu mensaje. Nos pondremos en contacto contigo en las próximas 24 horas.</p>
            <button onClick={() => setStatus('idle')} className="text-xs text-gray-500 underline hover:text-gray-400 transition-colors">Enviar otra solicitud</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Nombre <span className="text-red-500">*</span></label>
                <input required type="text" value={form.name} onChange={set('name')} placeholder="Tu nombre" className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Cooperativa <span className="text-red-500">*</span></label>
                <input required type="text" value={form.cooperative} onChange={set('cooperative')} placeholder="Nombre de tu cooperativa" className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Correo electrónico <span className="text-red-500">*</span></label>
              <input required type="email" value={form.email} onChange={set('email')} placeholder="correo@cooperativa.com" className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Teléfono / WhatsApp</label>
              <PhoneInput value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Número de conductores aproximado</label>
              <select value={form.driver_count_range} onChange={set('driver_count_range')} className="w-full h-11 px-4 rounded-xl border border-white/10 bg-[#0f172a] text-sm text-gray-300 focus:outline-none focus:border-white/20 transition-colors">
                <option value="">Selecciona un rango</option>
                <option>1 – 20 conductores</option>
                <option>21 – 50 conductores</option>
                <option>51 – 100 conductores</option>
                <option>Más de 100 conductores</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Mensaje (opcional)</label>
              <textarea rows={3} value={form.message} onChange={set('message')} placeholder="¿Alguna pregunta o comentario?" className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors resize-none" />
            </div>
            {status === 'error' && (
              <p className="text-xs text-red-400">{errorMsg || 'No se pudo enviar. Intenta de nuevo.'}</p>
            )}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full h-12 rounded-xl font-semibold text-sm text-black transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ backgroundColor: Y }}
            >
              {status === 'sending' && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
              {status === 'sending' ? 'Enviando...' : 'Enviar solicitud'}
            </button>
            <p className="text-xs text-gray-600 text-center">
              Al enviar aceptas nuestra{' '}
              <a href="/privacidad" className="underline hover:text-gray-400 transition-colors">política de privacidad</a>.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
