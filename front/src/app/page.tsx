import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import ContactSection from '@/features/landing/ContactSection';
import HeroSplit from '@/features/landing/HeroSplit';
import NavUserMenu from '@/features/landing/NavUserMenu';
import FooterSocials from '@/features/landing/FooterSocials';

export const metadata: Metadata = {
  title: 'Pana Taxi — Plataforma de Gestión de Cooperativas de Taxi en Ecuador',
  description: 'Software de gestión integral para cooperativas de taxi en Ecuador. Control en tiempo real, taxímetro digital, billetera digital y mucho más.',
  keywords: ['cooperativa taxi Ecuador', 'software taxi', 'gestión cooperativa taxi', 'taxímetro digital', 'pana taxi'],
  openGraph: {
    title: 'Pana Taxi — Plataforma de Gestión de Cooperativas',
    description: 'Software de gestión para cooperativas de taxi en Ecuador. Control en tiempo real, taxímetro digital y más.',
    type: 'website',
    locale: 'es_EC',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pana Taxi — Plataforma de Gestión de Cooperativas',
    description: 'Software de gestión para cooperativas de taxi en Ecuador.',
  },
  robots: { index: true, follow: true },
};

const Y = '#fcbd13';
const BG = '#030712';

const FEATURES = [
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" /></svg>,
    title: 'Mapa en tiempo real',
    desc: 'Visualiza tu flota completa en un mapa interactivo. Cada conductor, cada viaje, al instante y sin demoras.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>,
    title: 'Taxímetro digital',
    desc: 'Tarifas por distancia, precio negociado o por parada. La cooperativa define sus propias reglas tarifarias.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>,
    title: 'Dashboard ejecutivo',
    desc: 'Métricas de viajes, ingresos y conductores en un solo panel. Decide con datos reales, no con suposiciones.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>,
    title: 'Socios y equipo',
    desc: 'Gestiona los socios de tu cooperativa y tu personal administrativo. Cada quien ve solo lo suyo.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>,
    title: 'Contabilidad integrada',
    desc: 'Reportes exportables, historial de viajes y balances por período. Sin hojas de cálculo manuales.',
  },
  {
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0M3.124 7.5A8.969 8.969 0 0 1 5.292 3m13.416 0a8.969 8.969 0 0 1 2.168 4.5" /></svg>,
    title: 'Botón SOS',
    desc: 'Alerta de emergencia para conductores. El centro de control recibe la ubicación exacta en segundos.',
  },
];

const STEPS = [
  { n: '01', title: 'Solicita el acceso', desc: 'Contáctanos y activa tu cooperativa en la plataforma. El proceso toma menos de 24 horas.' },
  { n: '02', title: 'Configura tu equipo', desc: 'Añade conductores, vehículos y personal administrativo. Sube documentos digitalmente.' },
  { n: '03', title: 'Opera y crece', desc: 'Monitorea viajes en vivo, genera reportes y toma decisiones con datos reales.' },
];

const STATS = [
  { value: '+500', label: 'Conductores registrados' },
  { value: '99.9%', label: 'Uptime garantizado' },
  { value: '<2s', label: 'Latencia GPS' },
  { value: '24/7', label: 'Soporte técnico' },
];

const CHECK = (
  <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 12 12" fill="none">
    <path d="M2 6l2.5 2.5L10 3.5" stroke={Y} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function LandingPage() {
  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: BG, fontFamily: 'Outfit, sans-serif' }}>

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-white/5" style={{ backgroundColor: BG }}>
        <div className="max-w-6xl mx-auto px-6 h-16 grid grid-cols-3 items-center">
          {/* Left: logo */}
          <Link href="/" className="flex items-center gap-3 justify-self-start">
            <Image src="/images/logo/logo.webp" alt="Pana Taxi" width={32} height={32} className="rounded-xl" />
            <span className="text-sm font-bold text-white tracking-tight">Pana Taxi</span>
          </Link>
          {/* Center: nav links */}
          <nav className="hidden md:flex items-center justify-center gap-7 text-sm text-gray-400">
            <a href="#funcionalidades" className="hover:text-white transition-colors">Funcionalidades</a>
            <a href="#bolsa-empleo" className="hover:text-white transition-colors">Bolsa de empleo</a>
            <a href="#contacto" className="hover:text-white transition-colors">Contacto</a>
          </nav>
          {/* Right: user menu */}
          <div className="flex justify-self-end col-start-3">
            <NavUserMenu />
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <HeroSplit />

      {/* ── Stats ── */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-4xl font-extrabold tabular-nums" style={{ color: Y }}>{s.value}</p>
                <p className="text-sm text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Funcionalidades ── */}
      <section id="funcionalidades" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: Y }}>Funcionalidades</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Todo lo que tu cooperativa necesita</h2>
          <p className="text-gray-400 max-w-lg mx-auto text-sm leading-relaxed">
            Desde el primer viaje del día hasta el cierre de caja mensual, Pana Taxi lo gestiona todo desde un solo lugar.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => {
            const isBlue = i % 2 === 1;
            return (
              <div
                key={f.title}
                className="rounded-2xl p-6 transition-all"
                style={isBlue
                  ? { backgroundColor: '#0a1628', border: '1px solid rgba(255,255,255,0.08)' }
                  : { backgroundColor: '#ffffff', border: '1px solid rgba(0,0,0,0.06)' }
                }
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={isBlue
                    ? { color: Y, backgroundColor: `${Y}18`, border: `1px solid ${Y}30` }
                    : { color: '#030712', backgroundColor: `${Y}20`, border: `1px solid ${Y}40` }
                  }
                >
                  {f.icon}
                </div>
                <h3 className="font-semibold mb-2 text-sm" style={{ color: isBlue ? '#ffffff' : '#030712' }}>
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: isBlue ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)' }}>
                  {f.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Para pasajeros ── */}
      <section id="pasajero" className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            {/* Left — passenger info */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: Y }}>Para pasajeros</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6 leading-tight">
                Viaja seguro.<br />Siempre con un pana.
              </h2>
              <p className="text-gray-400 text-sm leading-relaxed mb-8">
                Con Pana Taxi solo viajas con conductores de cooperativas legalmente registradas en Ecuador.
                Cada viaje es monitoreado en tiempo real, y tanto tú como el conductor tienen herramientas de seguridad que Uber e InDrive no ofrecen.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  'Solo taxis de cooperativas legales y verificadas',
                  'Conductor identificado antes de subir al taxi',
                  'Monitoreo GPS en tiempo real durante todo el viaje',
                  'Botón SOS para emergencias — respuesta inmediata',
                  'Tarifas justas, sin sobrecostos ni comisiones abusivas',
                  'Comparte tu viaje en vivo con quienes quieras',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-gray-300">
                    <span className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${Y}15` }}>
                      {CHECK}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="flex flex-col sm:flex-row gap-3">
                <a href="#" className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-sm font-semibold text-white">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                  App Store
                  <span className="text-xs text-gray-500 font-normal">Próximamente</span>
                </a>
                <a href="#" className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-sm font-semibold text-white">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.76c.3.16.64.22.99.16l13.2-7.62-2.83-2.83-11.36 10.29zM.5 1.28C.19 1.6 0 2.1 0 2.72v18.56c0 .63.19 1.12.5 1.44l.08.07 10.4-10.4v-.24L.58 1.21.5 1.28zm17.64 9.47L15.04 8.6 3.18.24c-.35-.2-.69-.23-.99-.08L13.55 11.5l4.59-2.75zm-2.89 5.56l-4.59 2.75.08.07 13.2 7.62c.3.06.64 0 .94-.16l.08-.08-13.31-7.62-.4-.58z"/></svg>
                  Google Play
                  <span className="text-xs text-gray-500 font-normal">Próximamente</span>
                </a>
              </div>
            </div>

            {/* Right — passenger trip mockup */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-white">Tu viaje en curso</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                  </span>
                  Monitoreando
                </span>
              </div>
              {/* Map GPS visualization */}
              <div className="rounded-xl border border-white/5 h-36 relative overflow-hidden" style={{ backgroundColor: '#0c1929' }}>
                {/* Grid streets */}
                <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 280 144" preserveAspectRatio="xMidYMid slice">
                  {/* Horizontal streets */}
                  <line x1="0" y1="36" x2="280" y2="36" stroke="#4a9eff" strokeWidth="4" />
                  <line x1="0" y1="72" x2="280" y2="72" stroke="#4a9eff" strokeWidth="2" />
                  <line x1="0" y1="108" x2="280" y2="108" stroke="#4a9eff" strokeWidth="4" />
                  {/* Vertical streets */}
                  <line x1="56" y1="0" x2="56" y2="144" stroke="#4a9eff" strokeWidth="2" />
                  <line x1="140" y1="0" x2="140" y2="144" stroke="#4a9eff" strokeWidth="4" />
                  <line x1="224" y1="0" x2="224" y2="144" stroke="#4a9eff" strokeWidth="2" />
                  {/* Diagonal route */}
                  <path d="M 30 120 Q 80 80 140 72 Q 190 65 230 30" stroke="#fcbd13" strokeWidth="2.5" fill="none" strokeDasharray="6 3" opacity="0.9" />
                  {/* Blocks */}
                  <rect x="60" y="40" width="76" height="28" rx="2" fill="#1e3a5f" opacity="0.6" />
                  <rect x="144" y="40" width="76" height="28" rx="2" fill="#1e3a5f" opacity="0.4" />
                  <rect x="60" y="76" width="76" height="28" rx="2" fill="#1e3a5f" opacity="0.4" />
                  <rect x="144" y="76" width="76" height="28" rx="2" fill="#1e3a5f" opacity="0.5" />
                </svg>
                {/* Destination pin */}
                <div className="absolute top-4 right-8 flex flex-col items-center">
                  <div className="w-5 h-5 rounded-full border-2 border-red-400 bg-red-500/30 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  </div>
                  <div className="w-px h-2 bg-red-400 opacity-60" />
                </div>
                {/* Car/driver pin with pulse */}
                <div className="absolute bottom-10 left-10">
                  <div className="relative flex items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-8 w-8 rounded-full opacity-20" style={{ backgroundColor: '#fcbd13' }} />
                    <div className="relative w-7 h-7 rounded-full flex items-center justify-center border-2 z-10" style={{ backgroundColor: '#fcbd13', borderColor: '#fde68a' }}>
                      <svg viewBox="0 0 16 16" fill="#000" className="w-3.5 h-3.5">
                        <path d="M8 1.5a2 2 0 0 1 1.95 1.57l.47 2.13h2.33a1 1 0 0 1 .97 1.24l-.5 2A1 1 0 0 1 12.25 9H11v.5a.5.5 0 0 1-1 0V9H6v.5a.5.5 0 0 1-1 0V9H3.75a1 1 0 0 1-.97-.76l-.5-2A1 1 0 0 1 3.25 5h2.33l.47-2.13A2 2 0 0 1 8 1.5zm-3 6h6l.25-1H4.75L5 7.5zM6.5 4h3l-.3-1.36a1 1 0 0 0-.97-.64h-.46a1 1 0 0 0-.97.64L6.5 4z"/>
                      </svg>
                    </div>
                  </div>
                </div>
                {/* GPS label */}
                <div className="absolute bottom-2 right-3 flex items-center gap-1 bg-black/40 backdrop-blur-sm rounded-lg px-2 py-1">
                  <svg className="w-2.5 h-2.5 text-green-400" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                  </svg>
                  <span className="text-xs font-medium text-green-400">GPS activo</span>
                </div>
              </div>
              {/* Driver card */}
              <div className="rounded-xl bg-white/5 border border-white/5 p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg border border-white/10 bg-white/10">👤</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">Carlos M.</p>
                  <p className="text-xs text-gray-500 truncate">Coop. Central de Taxis · Toyota Yaris · PBX-1234</p>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: Y }}>
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                  4.9
                </div>
              </div>
              {/* Safety features */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: '🛡️', label: 'Verificado' },
                  { icon: '📍', label: 'GPS activo' },
                  { icon: '🆘', label: 'Botón SOS' },
                ].map((f) => (
                  <div key={f.label} className="rounded-xl bg-white/5 border border-white/5 p-3 text-center">
                    <div className="text-lg mb-1">{f.icon}</div>
                    <p className="text-xs text-gray-400">{f.label}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Bolsa de empleo ── */}
      <section id="bolsa-empleo" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: Y }}>Bolsa de empleo</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Conductores y dueños, conectados</h2>
          <p className="text-gray-400 max-w-lg mx-auto text-sm leading-relaxed">
            Pana Taxi es también un puente entre quienes buscan trabajo y quienes buscan conductores de confianza.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card conductor */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-5" style={{ backgroundColor: `${Y}15`, border: `1px solid ${Y}25` }}>
              🧑‍✈️
            </div>
            <h3 className="text-lg font-bold text-white mb-3">Soy conductor y busco cooperativa</h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-5">
              Regístrate en la plataforma, crea tu perfil de conductor y conéctate con cooperativas legales cerca de ti.
              El dueño o administrador de la cooperativa revisa tu solicitud y te incorpora a su flota.
            </p>
            <ul className="space-y-2.5 text-sm text-gray-300">
              {[
                'Perfil verificado con documentos digitales',
                'Calificaciones visibles para los dueños',
                'Sin intermediarios — contacto directo',
              ].map((i) => (
                <li key={i} className="flex items-start gap-2.5">
                  {CHECK}
                  {i}
                </li>
              ))}
            </ul>
          </div>
          {/* Card dueño */}
          <div className="rounded-2xl border p-8" style={{ borderColor: `${Y}30`, backgroundColor: `${Y}06` }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-5" style={{ backgroundColor: `${Y}20`, border: `1px solid ${Y}35` }}>
              🚖
            </div>
            <h3 className="text-lg font-bold text-white mb-3">Soy dueño y busco conductores</h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-5">
              Desde tu dashboard de cooperativa puedes ver los conductores disponibles, revisar sus perfiles,
              calificaciones y documentos, y aprobar o rechazar su ingreso a tu flota.
            </p>
            <ul className="space-y-2.5 text-sm text-gray-300">
              {[
                'Filtro por ciudad, calificación y disponibilidad',
                'Historial completo de viajes del conductor',
                'Aprobación o rechazo con un clic',
              ].map((i) => (
                <li key={i} className="flex items-start gap-2.5">
                  {CHECK}
                  {i}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ── */}
      <section id="como-funciona" className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: Y }}>Proceso</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Empieza en tres pasos</h2>
            <p className="text-gray-400 max-w-md mx-auto text-sm">
              Sin instalaciones complicadas ni infraestructura costosa. En menos de un día tu cooperativa ya opera en la plataforma.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step, i) => (
              <div key={step.n} className="relative flex flex-col items-center text-center">
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-px -translate-x-1/2 pointer-events-none" style={{ background: `linear-gradient(90deg, ${Y}60, transparent)` }} />
                )}
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-extrabold text-black mb-5 z-10" style={{ backgroundColor: Y }}>
                  {step.n}
                </div>
                <h3 className="text-base font-bold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed max-w-xs">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Para tu cooperativa ── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: Y }}>Diseñado para Ecuador</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6 leading-tight">
              Una plataforma que entiende cómo funcionan las cooperativas
            </h2>
            <p className="text-gray-400 text-sm leading-relaxed mb-8">
              Pana Taxi nació entendiendo las necesidades reales del transporte cooperativo ecuatoriano:
              control de socios, documentación digital, rutas y seguridad para conductores y pasajeros.
              No es un software genérico adaptado — fue creado para esto.
            </p>
            <ul className="space-y-3">
              {[
                'Aprobación de conductores y vehículos con documentación digital',
                'Control total de la flota desde cualquier dispositivo',
                'Historial completo de viajes con trazabilidad GPS',
                'Alertas SOS integradas con monitoreo en tiempo real',
                'Reportes financieros listos para directiva y socios',
                'Portal independiente para cada cooperativa afiliada',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-gray-300">
                  <span className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${Y}15` }}>
                    {CHECK}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Dashboard mockup */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Panel de cooperativa</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">● En línea</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Conductores activos', value: '24', c: 'text-green-400' },
                { label: 'Viajes hoy', value: '138', c: 'text-blue-400' },
                { label: 'Ingresos del mes', value: '$4,820', c: '' },
                { label: 'Alertas SOS', value: '0', c: 'text-gray-400' },
              ].map((c) => (
                <div key={c.label} className="rounded-xl bg-white/5 p-3 border border-white/5">
                  <p className={`text-xl font-bold tabular-nums ${c.c}`} style={c.label === 'Ingresos del mes' ? { color: Y } : {}}>{c.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-white/5 border border-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-400">Últimos viajes</span>
                <span className="text-xs" style={{ color: Y }}>Ver todos →</span>
              </div>
              {[
                { driver: 'Juan P.', dest: 'El Condado', fare: '$3.50', st: 'Completado', sc: 'text-green-400' },
                { driver: 'María G.', dest: 'La Carolina', fare: '$5.20', st: 'En curso', sc: 'text-blue-400' },
                { driver: 'Luis T.', dest: 'Cumbayá', fare: '$8.00', st: 'Aceptado', sc: '' },
              ].map((t) => (
                <div key={t.driver} className="flex items-center gap-2 py-2 text-xs border-b border-white/5 last:border-0">
                  <span className="text-gray-300 w-16 flex-shrink-0">{t.driver}</span>
                  <span className="text-gray-500 flex-1 truncate">{t.dest}</span>
                  <span className="font-semibold text-white w-12 text-right">{t.fare}</span>
                  <span className={`w-20 text-right ${t.sc}`} style={t.st === 'Aceptado' ? { color: Y } : {}}>{t.st}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Contacto ── */}
      <div className="border-t border-white/5 bg-white/[0.02]">
        <ContactSection />
      </div>

      {/* ── CTA final ── */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="rounded-3xl border border-white/10 text-center p-14" style={{ backgroundColor: '#0a0f1a' }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: Y }}>Únete hoy</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 max-w-xl mx-auto">¿Listo para modernizar tu cooperativa?</h2>
          <p className="text-gray-400 text-sm mb-8 max-w-md mx-auto">
            Únete a las cooperativas que ya digitalizaron su operación. Contáctanos y activa tu acceso en menos de 24 horas.
          </p>
          <a href="#contacto" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-sm text-black transition-all hover:opacity-90 active:scale-95" style={{ backgroundColor: Y }}>
            Solicitar acceso gratis
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 pt-14 pb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <Image src="/images/logo/logo.webp" alt="Pana Taxi" width={36} height={36} className="rounded-xl" />
                <span className="text-base font-bold text-white">Pana Taxi</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed max-w-xs mb-5">
                Plataforma de gestión integral para cooperativas de taxi en Ecuador.
                Más que un taxi, un pana.
              </p>
              <FooterSocials />
            </div>

            <div>
              <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-4">Plataforma</h4>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li><a href="#funcionalidades" className="hover:text-gray-300 transition-colors">Funcionalidades</a></li>
                <li><a href="#como-funciona" className="hover:text-gray-300 transition-colors">Cómo funciona</a></li>
                <li><Link href="/signin" className="hover:text-gray-300 transition-colors">Iniciar sesión</Link></li>
                <li><a href="#contacto" className="hover:text-gray-300 transition-colors">Solicitar acceso</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-4">Legal</h4>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li><Link href="/terminos" className="hover:text-gray-300 transition-colors">Términos y condiciones</Link></li>
                <li><Link href="/privacidad" className="hover:text-gray-300 transition-colors">Política de privacidad</Link></li>
                <li><a href="#contacto" className="hover:text-gray-300 transition-colors">Contacto</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-gray-600">© {new Date().getFullYear()} Pana Taxi. Todos los derechos reservados.</p>
            <div className="flex items-center gap-4 text-xs text-gray-600">
              <Link href="/terminos" className="hover:text-gray-400 transition-colors">Términos</Link>
              <Link href="/privacidad" className="hover:text-gray-400 transition-colors">Privacidad</Link>
              <span>Quito, Ecuador 🇪🇨</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
