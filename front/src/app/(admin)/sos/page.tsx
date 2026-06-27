import type { Metadata } from 'next';
import SosList from '@/features/sos/components/SosList';

export const metadata: Metadata = { title: 'SOS | Pana Taxi' };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Alertas SOS</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Emergencias activas y resueltas de conductores y clientes</p>
      </div>
      <SosList />
    </div>
  );
}
