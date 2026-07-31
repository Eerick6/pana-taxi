import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidad | Pana Taxi',
  description: 'Política de privacidad y tratamiento de datos personales de la plataforma Pana Taxi, conforme a la LOPDP de Ecuador.',
};

const Y = '#fcbd13';
const BG = '#030712';
const LAST_UPDATED = '01 de julio de 2025';

export default function PrivacidadPage() {
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
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">Política de Privacidad</h1>
          <p className="text-sm text-gray-500">Última actualización: {LAST_UPDATED} · Conforme a la Ley Orgánica de Protección de Datos Personales (LOPDP) del Ecuador</p>
        </div>

        <div className="prose-legal">
          <Section title="1. Responsable del tratamiento">
            <p>El responsable del tratamiento de los datos personales recabados a través de la plataforma Pana Taxi es:</p>
            <ul>
              <li><strong className="text-gray-300">Razón social:</strong> Pana Taxi</li>
              <li><strong className="text-gray-300">Correo de contacto:</strong> <a href="mailto:privacidad@panataxiapp.com" className="underline" style={{ color: Y }}>privacidad@panataxiapp.com</a></li>
              <li><strong className="text-gray-300">País:</strong> Ecuador</li>
            </ul>
          </Section>

          <Section title="2. Datos que recopilamos">
            <p>En el contexto de la prestación de nuestros servicios a cooperativas de taxi, recopilamos los siguientes tipos de datos:</p>
            <SubSection title="2.1 Datos de la cooperativa y personal administrativo">
              <ul>
                <li>Nombre completo, correo electrónico y rol dentro de la cooperativa.</li>
                <li>Razón social de la cooperativa, RUC y documentación legal.</li>
                <li>Información de contacto institucional.</li>
              </ul>
            </SubSection>
            <SubSection title="2.2 Datos de conductores">
              <ul>
                <li>Nombre completo, cédula de identidad, datos de contacto.</li>
                <li>Documentación de habilitación: licencia de conducir, matrícula vehicular.</li>
                <li>Ubicación GPS en tiempo real durante las jornadas de trabajo activas.</li>
                <li>Historial de viajes, calificaciones y estado operativo.</li>
              </ul>
            </SubSection>
            <SubSection title="2.3 Datos de uso de la plataforma">
              <ul>
                <li>Registros de acceso, dirección IP y tipo de dispositivo.</li>
                <li>Logs de auditoría: acciones realizadas dentro del panel administrativo.</li>
                <li>Datos de rendimiento y errores del sistema para mejoras técnicas.</li>
              </ul>
            </SubSection>
          </Section>

          <Section title="3. Finalidades del tratamiento">
            <p>Los datos personales recopilados son utilizados exclusivamente para:</p>
            <ul>
              <li>Prestar y mejorar los servicios de la Plataforma a la cooperativa contratante.</li>
              <li>Gestionar el acceso y autenticación de usuarios autorizados.</li>
              <li>Permitir el monitoreo en tiempo real de la flota de conductores.</li>
              <li>Generar reportes operativos y financieros para la cooperativa.</li>
              <li>Garantizar la seguridad e integridad de la Plataforma (registros de auditoría).</li>
              <li>Cumplir con obligaciones legales aplicables en Ecuador.</li>
              <li>Notificar cambios relevantes en los servicios o en estos documentos legales.</li>
            </ul>
            <p>Pana Taxi <strong className="text-gray-300">no vende, arrienda ni comercializa</strong> los datos personales de sus usuarios o de los conductores registrados en la Plataforma a terceros.</p>
          </Section>

          <Section title="4. Base legal del tratamiento">
            <p>El tratamiento de datos personales se realiza bajo las siguientes bases legales establecidas en la LOPDP:</p>
            <ul>
              <li><strong className="text-gray-300">Ejecución de contrato:</strong> para prestar los servicios contratados por la cooperativa.</li>
              <li><strong className="text-gray-300">Consentimiento:</strong> para conductores que instalan la aplicación móvil y aceptan el monitoreo de ubicación.</li>
              <li><strong className="text-gray-300">Interés legítimo:</strong> para el registro de auditoría y la seguridad del sistema.</li>
              <li><strong className="text-gray-300">Obligación legal:</strong> cuando así lo requieran las autoridades competentes del Ecuador.</li>
            </ul>
          </Section>

          <Section title="5. Ubicación GPS y monitoreo">
            <p>La recopilación de datos de ubicación GPS de los conductores se realiza exclusivamente:</p>
            <ul>
              <li>Cuando el conductor tiene la aplicación móvil activa y está en jornada laboral.</li>
              <li>Con el conocimiento y consentimiento expreso del conductor al activar la aplicación.</li>
              <li>Para ser visible únicamente al personal autorizado de la cooperativa a la que pertenece.</li>
            </ul>
            <p>Fuera de la jornada activa, la ubicación del conductor no es rastreada ni almacenada.</p>
          </Section>

          <Section title="6. Conservación de datos">
            <p>Los datos personales serán conservados durante el tiempo necesario para cumplir las finalidades descritas, y específicamente:</p>
            <ul>
              <li><strong className="text-gray-300">Datos de cuenta:</strong> mientras la cooperativa esté activa en la Plataforma. Tras la cancelación, se conservan hasta 2 años por obligaciones legales.</li>
              <li><strong className="text-gray-300">Historial de viajes:</strong> hasta 5 años, por posibles requerimientos tributarios o legales.</li>
              <li><strong className="text-gray-300">Registros de auditoría:</strong> hasta 2 años.</li>
              <li><strong className="text-gray-300">Datos GPS:</strong> las coordenadas históricas se conservan máximo 1 año.</li>
            </ul>
          </Section>

          <Section title="7. Derechos del titular de datos">
            <p>De acuerdo con la LOPDP, los titulares de datos tienen derecho a:</p>
            <ul>
              <li><strong className="text-gray-300">Acceso:</strong> conocer qué datos personales suyos son tratados.</li>
              <li><strong className="text-gray-300">Rectificación:</strong> solicitar la corrección de datos inexactos o incompletos.</li>
              <li><strong className="text-gray-300">Eliminación:</strong> solicitar el borrado de sus datos cuando ya no sean necesarios o si retira el consentimiento.</li>
              <li><strong className="text-gray-300">Oposición:</strong> oponerse al tratamiento en determinadas circunstancias.</li>
              <li><strong className="text-gray-300">Portabilidad:</strong> recibir sus datos en un formato estructurado y de uso común.</li>
            </ul>
            <p>Para ejercer cualquiera de estos derechos, envíe su solicitud a <a href="mailto:privacidad@panataxiapp.com" className="underline" style={{ color: Y }}>privacidad@panataxiapp.com</a>. Responderemos en un plazo máximo de 15 días hábiles.</p>
          </Section>

          <Section title="8. Seguridad de la información">
            <p>Pana Taxi aplica medidas técnicas y organizativas adecuadas para proteger los datos personales contra accesos no autorizados, alteración, divulgación o destrucción. Entre ellas:</p>
            <ul>
              <li>Cifrado de datos en tránsito mediante HTTPS/TLS.</li>
              <li>Autenticación mediante tokens de acceso y tokens de actualización con rotación automática.</li>
              <li>Registro de auditoría de todas las acciones administrativas.</li>
              <li>Acceso restringido por roles: cada usuario accede únicamente a los datos que le corresponden.</li>
              <li>Copias de seguridad periódicas de la base de datos.</li>
            </ul>
          </Section>

          <Section title="9. Transferencias internacionales">
            <p>Pana Taxi puede utilizar proveedores de servicios en la nube o infraestructura tecnológica ubicada fuera del Ecuador. En tales casos, nos aseguramos de que dichas transferencias se realicen con garantías adecuadas de protección, conforme a lo establecido en la LOPDP.</p>
          </Section>

          <Section title="10. Cookies y tecnologías similares">
            <p>La Plataforma web utiliza cookies de sesión estrictamente necesarias para la autenticación y el funcionamiento del servicio. No se utilizan cookies de rastreo publicitario ni se comparte información con redes de publicidad.</p>
            <p>Las cookies de autenticación se eliminan automáticamente al cerrar la sesión o al expirar el período de inactividad configurado.</p>
          </Section>

          <Section title="11. Modificaciones a esta política">
            <p>Pana Taxi puede actualizar esta Política de Privacidad periódicamente. Notificaremos los cambios significativos a través de la Plataforma o por correo electrónico con al menos 15 días de anticipación. La fecha de última actualización siempre estará visible al inicio de este documento.</p>
          </Section>

          <Section title="12. Contacto y reclamaciones">
            <p>Para cualquier consulta, ejercicio de derechos o reclamación relacionada con el tratamiento de sus datos personales:</p>
            <ul>
              <li><strong className="text-gray-300">Correo:</strong> <a href="mailto:privacidad@panataxiapp.com" className="underline" style={{ color: Y }}>privacidad@panataxiapp.com</a></li>
              <li><strong className="text-gray-300">Plazo de respuesta:</strong> máximo 15 días hábiles</li>
            </ul>
            <p>Si considera que sus derechos no han sido debidamente atendidos, puede presentar una reclamación ante la Autoridad de Protección de Datos Personales del Ecuador.</p>
          </Section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 mt-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-600">© {new Date().getFullYear()} Pana Taxi. Todos los derechos reservados.</p>
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <Link href="/terminos" className="hover:text-gray-400 transition-colors">Términos</Link>
            <Link href="/privacidad" className="hover:text-gray-400 transition-colors" style={{ color: Y }}>Privacidad</Link>
            <Link href="/" className="hover:text-gray-400 transition-colors">Inicio</Link>
          </div>
        </div>
      </footer>

      <style>{`
        .prose-legal p { color: #9ca3af; font-size: 0.875rem; line-height: 1.75; margin-bottom: 1rem; }
        .prose-legal ul { color: #9ca3af; font-size: 0.875rem; line-height: 1.75; margin-bottom: 1rem; padding-left: 1.25rem; list-style: disc; }
        .prose-legal li { margin-bottom: 0.35rem; }
        .prose-legal h2 { color: white; font-size: 1.1rem; font-weight: 700; margin-bottom: 0.75rem; }
        .prose-legal h3 { color: #d1d5db; font-size: 0.875rem; font-weight: 600; margin-bottom: 0.5rem; margin-top: 1rem; }
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

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-2">{title}</h3>
      {children}
    </div>
  );
}
