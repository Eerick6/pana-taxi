import type { Metadata } from 'next';
import CooperativasList from '@/features/cooperativas/components/CooperativasList';

export const metadata: Metadata = { title: 'Cooperativas | Pana Taxi' };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Cooperativas</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gestión de cooperativas de taxi registradas en la plataforma</p>
      </div>
      <CooperativasList />
    </div>
  );
}
