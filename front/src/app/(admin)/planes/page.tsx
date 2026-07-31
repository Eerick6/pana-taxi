import type { Metadata } from 'next';
import PlanesList from '@/features/planes/components/PlanesList';

export const metadata: Metadata = { title: 'Planes SaaS | Pana Taxi' };

export default function PlanesPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Planes SaaS</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Gestiona los planes de suscripción disponibles para las cooperativas
        </p>
      </div>
      <PlanesList />
    </div>
  );
}
