import type { Metadata } from 'next';
import CooperativaRegistroForm from '@/features/registro/CooperativaRegistroForm';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Registra tu Cooperativa — Pana Taxi',
  description: 'Registra tu cooperativa de taxi en la plataforma Pana Taxi. Gestión digital, monitoreo en tiempo real, taxímetro y más. Ecuador.',
  openGraph: {
    title: 'Registra tu Cooperativa — Pana Taxi',
    description: 'Gestión digital para cooperativas de taxi en Ecuador. Únete a la plataforma.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export default function RegistroCooperativaPage() {
  return (
    <div className="min-h-screen bg-[#030712] text-white flex flex-col" style={{ fontFamily: 'Outfit, sans-serif' }}>
      {/* Header */}
      <header className="border-b border-white/5 bg-[#030712]">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/images/logo/logo.webp" alt="Pana Taxi" width={32} height={32} className="rounded-xl" />
            <span className="text-sm font-bold text-white">Pana Taxi</span>
          </Link>
          <Link href="/signin" className="text-sm text-gray-400 hover:text-white transition-colors">
            Ya tengo cuenta →
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center py-12 px-6">
        <div className="w-full max-w-2xl">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.25em] mb-3" style={{ color: '#fcbd13' }}>
              Registro de cooperativa
            </p>
            <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">
              Únete a Pana Taxi
            </h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              Completa el formulario y nos pondremos en contacto en menos de 24 horas para activar tu cooperativa en la plataforma.
            </p>
          </div>

          <CooperativaRegistroForm />

          <p className="text-center text-xs text-gray-600 mt-6">
            Al enviar aceptas nuestros{' '}
            <Link href="/terminos" className="underline hover:text-gray-400 transition-colors">términos y condiciones</Link>
            {' '}y{' '}
            <Link href="/privacidad" className="underline hover:text-gray-400 transition-colors">política de privacidad</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
