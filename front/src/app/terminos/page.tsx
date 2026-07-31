import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Términos y Condiciones | Pana Taxi',
  description: 'Términos y condiciones de uso de la plataforma Pana Taxi para cooperativas de taxi en Ecuador.',
};

const Y = '#fcbd13';
const BG = '#030712';

const LAST_UPDATED = '01 de julio de 2025';

export default function TerminosPage() {
  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: BG, fontFamily: 'Outfit, sans-serif' }}>

      {/* Navbar */}
      <header className="border-b border-white/5 sticky top-0 z-50" style={{ backgroundColor: BG }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/images/logo/logo.webp" alt="Pana Taxi" width={32} height={32} className="rounded-xl" />
            <span className="text-sm font-bold text-white">Pana Taxi</span>
          </Link>
          <Link href="/signin" className="px-4 py-2 rounded-xl text-xs font-semibold text-black" style={{ backgroundColor: Y }}>
            Iniciar sesión
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: Y }}>Legal</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">Términos y Condiciones</h1>
          <p className="text-sm text-gray-500">Última actualización: {LAST_UPDATED}</p>
        </div>

        <div className="prose-legal">
          <Section title="1. Aceptación de los términos">
            <p>Al acceder y utilizar la plataforma Pana Taxi (en adelante &quot;la Plataforma&quot;), las cooperativas de taxi afiliadas y su personal autorizado (en adelante &quot;el Usuario&quot;) aceptan de forma íntegra y sin reservas los presentes Términos y Condiciones de Uso.</p>
            <p>Si no está de acuerdo con alguno de estos términos, debe abstenerse de utilizar la Plataforma. El uso continuado de la Plataforma constituye aceptación de cualquier modificación posterior a estos términos.</p>
          </Section>

          <Section title="2. Descripción del servicio">
            <p>Pana Taxi es una plataforma de gestión integral para cooperativas de taxi en Ecuador que ofrece, entre otros, los siguientes servicios:</p>
            <ul>
              <li>Monitoreo en tiempo real de la flota de conductores mediante GPS.</li>
              <li>Taxímetro digital con configuración de tarifas personalizada.</li>
              <li>Panel de administración con estadísticas, reportes financieros y control de personal.</li>
              <li>Sistema de alertas SOS para conductores.</li>
              <li>Gestión de documentación de conductores y vehículos.</li>
              <li>Módulo de contabilidad e historial de viajes.</li>
            </ul>
            <p>La Plataforma está destinada exclusivamente a personas jurídicas debidamente constituidas como cooperativas de transporte, así como a su personal administrativo autorizado.</p>
          </Section>

          <Section title="3. Registro y acceso">
            <p>El acceso a la Plataforma requiere aprobación previa por parte de Pana Taxi. La cooperativa interesada debe completar el proceso de solicitud, proporcionar documentación válida y recibir confirmación de activación.</p>
            <p>Las credenciales de acceso son personales e intransferibles. El Usuario es responsable de mantener la confidencialidad de su contraseña y de todas las actividades que ocurran bajo su cuenta.</p>
            <p>Pana Taxi se reserva el derecho de suspender o cancelar el acceso de cualquier Usuario que incumpla estos términos, sin necesidad de previo aviso.</p>
          </Section>

          <Section title="4. Obligaciones del usuario">
            <p>El Usuario se compromete a:</p>
            <ul>
              <li>Proporcionar información veraz, completa y actualizada durante el registro y uso de la Plataforma.</li>
              <li>Utilizar la Plataforma únicamente para los fines lícitos relacionados con la gestión de su cooperativa.</li>
              <li>No intentar acceder a secciones de la Plataforma para las cuales no tiene autorización.</li>
              <li>No reproducir, copiar, distribuir ni explotar comercialmente ningún contenido de la Plataforma sin autorización expresa.</li>
              <li>Notificar de inmediato a Pana Taxi cualquier uso no autorizado de su cuenta.</li>
              <li>Cumplir con todas las leyes y regulaciones aplicables al transporte cooperativo en Ecuador.</li>
            </ul>
          </Section>

          <Section title="5. Propiedad intelectual">
            <p>Todos los derechos de propiedad intelectual sobre la Plataforma, incluyendo pero no limitado a su diseño, código fuente, logotipos, marcas, texto y funcionalidades, son propiedad exclusiva de Pana Taxi o sus licenciantes.</p>
            <p>Se otorga al Usuario una licencia limitada, no exclusiva, no transferible y revocable para acceder y utilizar la Plataforma únicamente de acuerdo con estos Términos.</p>
          </Section>

          <Section title="6. Datos e información de la cooperativa">
            <p>Los datos ingresados por la cooperativa en la Plataforma (información de conductores, vehículos, viajes, etc.) son de su propiedad. Pana Taxi los almacena y procesa exclusivamente para prestar el servicio contratado, en cumplimiento de la Ley Orgánica de Protección de Datos Personales del Ecuador (LOPDP).</p>
            <p>Para mayor información sobre el tratamiento de datos, consulte nuestra <Link href="/privacidad" className="underline" style={{ color: Y }}>Política de Privacidad</Link>.</p>
          </Section>

          <Section title="7. Disponibilidad del servicio">
            <p>Pana Taxi realiza los mejores esfuerzos para garantizar la disponibilidad continua de la Plataforma. Sin embargo, no garantiza un funcionamiento ininterrumpido y no se responsabiliza por interrupciones causadas por:</p>
            <ul>
              <li>Mantenimientos programados o de emergencia.</li>
              <li>Fallas en servicios de terceros (conectividad, GPS, servicios en la nube).</li>
              <li>Casos de fuerza mayor o eventos fuera del control razonable de Pana Taxi.</li>
            </ul>
          </Section>

          <Section title="8. Limitación de responsabilidad">
            <p>En la máxima medida permitida por la ley ecuatoriana, Pana Taxi no será responsable por:</p>
            <ul>
              <li>Daños indirectos, incidentales o consecuentes derivados del uso o imposibilidad de uso de la Plataforma.</li>
              <li>Pérdidas de datos, ingresos o ganancias de la cooperativa.</li>
              <li>Actos u omisiones de conductores, socios u operadores de la cooperativa.</li>
              <li>Decisiones operativas tomadas por la cooperativa basadas en la información de la Plataforma.</li>
            </ul>
          </Section>

          <Section title="9. Modificaciones">
            <p>Pana Taxi se reserva el derecho de modificar estos Términos en cualquier momento. Las modificaciones serán notificadas a través de la Plataforma o por correo electrónico con al menos 15 días de anticipación. El uso continuado de la Plataforma tras dicho período constituirá aceptación de los nuevos términos.</p>
          </Section>

          <Section title="10. Ley aplicable y jurisdicción">
            <p>Estos Términos se rigen por las leyes de la República del Ecuador. Cualquier controversia derivada de su interpretación o cumplimiento se someterá a los tribunales competentes de la ciudad de Quito, con renuncia expresa a cualquier otro fuero.</p>
          </Section>

          <Section title="11. Contacto">
            <p>Para cualquier consulta sobre estos Términos y Condiciones, puede comunicarse con nosotros a través de:</p>
            <ul>
              <li>Correo electrónico: <a href="mailto:legal@panataxiapp.com" className="underline" style={{ color: Y }}>legal@panataxiapp.com</a></li>
              <li>Dirección: Quito, Ecuador</li>
            </ul>
          </Section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 mt-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-600">© {new Date().getFullYear()} Pana Taxi. Todos los derechos reservados.</p>
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <Link href="/terminos" className="hover:text-gray-400 transition-colors" style={{ color: Y }}>Términos</Link>
            <Link href="/privacidad" className="hover:text-gray-400 transition-colors">Privacidad</Link>
            <Link href="/" className="hover:text-gray-400 transition-colors">Inicio</Link>
          </div>
        </div>
      </footer>

      <style>{`
        .prose-legal p { color: #9ca3af; font-size: 0.875rem; line-height: 1.75; margin-bottom: 1rem; }
        .prose-legal ul { color: #9ca3af; font-size: 0.875rem; line-height: 1.75; margin-bottom: 1rem; padding-left: 1.25rem; list-style: disc; }
        .prose-legal li { margin-bottom: 0.25rem; }
        .prose-legal h2 { color: white; font-size: 1.1rem; font-weight: 700; margin-bottom: 0.75rem; }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10 pb-10 border-b border-white/5 last:border-0 last:pb-0">
      <h2 className="text-lg font-bold text-white mb-4">{title}</h2>
      <div>{children}</div>
    </div>
  );
}
