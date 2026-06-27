import type { Metadata } from 'next';
import StandsList from '@/features/paradas/components/StandsList';

export const metadata: Metadata = { title: 'Paradas | Pana Taxi' };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Paradas</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Puntos de recogida y colas de conductores</p>
      </div>
      <StandsList />
    </div>
  );
}
