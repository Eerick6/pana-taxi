import type { Metadata } from 'next';
import StaffList from '@/features/staff/components/StaffList';

export const metadata: Metadata = { title: 'Staff | Pana Taxi' };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Staff de Plataforma</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Miembros del equipo con acceso al panel de administración</p>
      </div>
      <StaffList />
    </div>
  );
}
