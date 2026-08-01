'use client';
import { useState } from 'react';
import Image from 'next/image';

const Y = '#fcbd13';
const BLUE = '#0a1628';
const DARK = '#030712';

type Panel = 'passenger' | 'coop' | null;

const BADGES_PASSENGER = ['🛡️ Verificado', '📍 GPS activo', '🆘 Botón SOS'];
const BADGES_COOP = ['📡 Mapa en vivo', '📊 Dashboard', '💰 Sin sobrecostos'];

export default function HeroSplit() {
  const [active, setActive] = useState<Panel>(null);

  const lW = active === 'passenger' ? '64%' : active === 'coop' ? '36%' : '50%';
  const rW = active === 'coop' ? '64%' : active === 'passenger' ? '36%' : '50%';
  const T = 'width 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

  const appear = (show: boolean) =>
    `transition-all duration-300 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`;
  const slide = (show: boolean) =>
    `transition-all duration-300 ${show ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-6 pointer-events-none'}`;

  return (
    <section className="max-w-6xl mx-auto px-6 pt-20 pb-14">

      {/* Brand & Slogan */}
      <div className="text-center mb-12">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold text-gray-300 mb-8"
          style={{ border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: Y }} />
          Solo cooperativas legales · Monitoreo GPS en tiempo real
        </div>

        <div className="flex items-center justify-center gap-4 mb-4">
          <Image src="/images/logo/logo.webp" alt="Pana Taxi" width={64} height={64} className="rounded-2xl" priority />
        </div>

        <h1
          className="font-black tracking-tight leading-none mb-5"
          style={{ color: Y, fontSize: 'clamp(3.8rem, 11vw, 8.5rem)' }}
        >
          PANA TAXI
        </h1>

        <p className="text-xl sm:text-2xl font-medium text-gray-300 max-w-2xl mx-auto leading-relaxed">
          Porque un <span className="font-black text-white">PANA</span> no solo te lleva, también te cuida.
        </p>
      </div>

      {/* Desktop: animated split */}
      <div
        className="hidden sm:flex h-[460px] rounded-3xl overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.1)' }}
        onMouseLeave={() => setActive(null)}
      >
        {/* PASAJERO — fondo blanco */}
        <div
          className="relative flex flex-col justify-between p-10 cursor-pointer overflow-hidden flex-shrink-0"
          style={{ width: lW, transition: T, backgroundColor: '#ffffff' }}
          onMouseEnter={() => setActive('passenger')}
        >
          <div className="flex items-start justify-between">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
              style={{ backgroundColor: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)' }}
            >
              🚕
            </div>
            <div className={`flex flex-col gap-2 ${slide(active === 'passenger')}`}>
              {BADGES_PASSENGER.map((b) => (
                <span
                  key={b}
                  className="px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
                  style={{ backgroundColor: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.1)', color: DARK }}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] mb-3" style={{ color: DARK }}>
              Para pasajeros
            </p>
            <h2 className="text-5xl font-black leading-[1.05] mb-4" style={{ color: DARK }}>
              Viaja<br />seguro.
            </h2>
            <p className={`text-sm leading-relaxed mb-6 max-w-[260px] ${appear(active === 'passenger')}`} style={{ color: 'rgba(0,0,0,0.55)' }}>
              Solo taxis de cooperativas legales. Conductor identificado, GPS activo y botón SOS en cada viaje.
            </p>
            <div className={appear(active === 'passenger')}>
              <a
                href="#pasajero"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: DARK }}
              >
                Saber más
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="self-stretch flex-shrink-0" style={{ width: '1px', backgroundColor: 'rgba(0,0,0,0.1)' }} />

        {/* COOPERATIVA — fondo azul */}
        <div
          className="relative flex flex-col justify-between p-10 cursor-pointer overflow-hidden flex-shrink-0"
          style={{ width: rW, transition: T, backgroundColor: BLUE }}
          onMouseEnter={() => setActive('coop')}
        >
          <div className="flex items-start justify-between">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
              style={{ backgroundColor: `${Y}20`, border: `1px solid ${Y}35` }}
            >
              🏢
            </div>
            <div className={`flex flex-col gap-2 ${slide(active === 'coop')}`}>
              {BADGES_COOP.map((b) => (
                <span
                  key={b}
                  className="px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
                  style={{ backgroundColor: `${Y}15`, border: `1px solid ${Y}30`, color: Y }}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] mb-3" style={{ color: Y }}>
              Para cooperativas · taxistas
            </p>
            <h2 className="text-5xl font-black text-white leading-[1.05] mb-4">
              Digitaliza<br />tu flota.
            </h2>
            <div className={`mb-6 space-y-1.5 ${appear(active === 'coop')}`}>
              <p className="text-sm leading-relaxed max-w-[260px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Monitoreo en tiempo real, gestión de conductores y seguridad para toda la cooperativa.
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.60)' }}>
                ¿Eres taxista? Únete a través de tu cooperativa.
              </p>
            </div>
            <div className={appear(active === 'coop')}>
              <a
                href="/registro/cooperativa"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold"
                style={{ backgroundColor: Y, color: DARK }}
              >
                Registrar cooperativa
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: stacked */}
      <div className="sm:hidden flex flex-col gap-4">
        <a
          href="#pasajero"
          className="rounded-2xl p-7 block"
          style={{ backgroundColor: '#ffffff' }}
        >
          <div className="text-3xl mb-4">🚕</div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: DARK }}>Para pasajeros</p>
          <h2 className="text-3xl font-black mb-3" style={{ color: DARK }}>Viaja seguro.</h2>
          <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(0,0,0,0.55)' }}>
            Solo taxis de cooperativas legales. GPS activo y botón SOS en cada viaje.
          </p>
          <div className="flex flex-wrap gap-2">
            {BADGES_PASSENGER.map((b) => (
              <span key={b} className="px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.1)', color: DARK }}>{b}</span>
            ))}
          </div>
        </a>

        <a
          href="/registro/cooperativa"
          className="rounded-2xl p-7 block"
          style={{ backgroundColor: BLUE }}
        >
          <div className="text-3xl mb-4">🏢</div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: Y }}>Para cooperativas · taxistas</p>
          <h2 className="text-3xl font-black text-white mb-3">Digitaliza tu flota.</h2>
          <p className="text-sm leading-relaxed mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Monitoreo en tiempo real, comisiones bajas, gestión total.
          </p>
          <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.60)' }}>¿Eres taxista? Únete a través de tu cooperativa.</p>
          <div className="flex flex-wrap gap-2">
            {BADGES_COOP.map((b) => (
              <span key={b} className="px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: `${Y}15`, border: `1px solid ${Y}30`, color: Y }}>{b}</span>
            ))}
          </div>
        </a>
      </div>

    </section>
  );
}
