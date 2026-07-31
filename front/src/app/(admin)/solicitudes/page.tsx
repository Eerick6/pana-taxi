import type { Metadata } from 'next';
import SolicitudesView from '@/features/solicitudes/components/SolicitudesView';

export const metadata: Metadata = { title: 'Solicitudes | Pana Taxi' };

export default function Page() {
  return (
    <div className="space-y-5 h-full">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Solicitudes de contacto</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Formularios enviados desde el sitio web</p>
      </div>
      <SolicitudesView />
    </div>
  );
}
