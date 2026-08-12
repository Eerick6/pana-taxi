import type { Metadata } from 'next';
import DeviationAlertsList from '@/features/driver-safety/components/DeviationAlertsList';

export const metadata: Metadata = { title: 'Desviaciones | Panel Cooperativa' };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Desviaciones de ruta</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Conductores de tu cooperativa que llevan más de 15 min fuera de la ruta planeada</p>
      </div>
      <DeviationAlertsList />
    </div>
  );
}
