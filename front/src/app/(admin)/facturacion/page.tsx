import type { Metadata } from 'next';
import FacturacionView from '@/features/facturacion/components/FacturacionView';

export const metadata: Metadata = { title: 'Facturación | Pana Taxi' };

export default function FacturacionPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Facturación</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Gestiona facturas, pagos y renovaciones de suscripciones de las cooperativas
        </p>
      </div>
      <FacturacionView />
    </div>
  );
}
