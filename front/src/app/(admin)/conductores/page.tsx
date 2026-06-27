import type { Metadata } from 'next';
import DriversList from '@/features/conductores/components/DriversList';

export const metadata: Metadata = { title: 'Conductores | Pana Taxi' };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Conductores</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Registro y aprobación de conductores de la plataforma</p>
      </div>
      <DriversList />
    </div>
  );
}
