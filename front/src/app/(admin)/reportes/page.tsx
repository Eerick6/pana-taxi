import type { Metadata } from 'next';
import ReportesView from '@/features/reportes/components/ReportesView';

export const metadata: Metadata = { title: 'Reportes Globales | Pana Taxi' };

export default function ReportesPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Reportes Globales</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Análisis de viajes, ingresos y actividad por cooperativa en toda la plataforma
        </p>
      </div>
      <ReportesView />
    </div>
  );
}
