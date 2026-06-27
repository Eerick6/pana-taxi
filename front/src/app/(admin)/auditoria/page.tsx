import type { Metadata } from 'next';
import AuditLogView from '@/features/auditoria/components/AuditLog';

export const metadata: Metadata = { title: 'Auditoría | Pana Taxi' };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Auditoría</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Registro completo de acciones realizadas en la plataforma</p>
      </div>
      <AuditLogView />
    </div>
  );
}
