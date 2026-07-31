import type { Metadata } from 'next';
import TripsList from '@/features/viajes/components/TripsList';

export const metadata: Metadata = { title: 'Viajes | Pana Taxi' };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Viajes</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Historial y seguimiento de todos los viajes</p>
      </div>
      <TripsList canCancel />
    </div>
  );
}
