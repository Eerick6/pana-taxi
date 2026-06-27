import type { Metadata } from 'next';
import ConfigView from '@/features/configuracion/components/ConfigView';

export const metadata: Metadata = { title: 'Configuración | Pana Taxi' };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Configuración</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Tarifas, comisiones y parámetros de la plataforma</p>
      </div>
      <ConfigView />
    </div>
  );
}
