import type { Metadata } from 'next';
import VehiclesList from '@/features/vehiculos/components/VehiclesList';

export const metadata: Metadata = { title: 'Vehículos | Pana Taxi' };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Vehículos</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Flota vehicular registrada y pendientes de aprobación</p>
      </div>
      <VehiclesList />
    </div>
  );
}
