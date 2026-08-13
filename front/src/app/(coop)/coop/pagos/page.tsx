import type { Metadata } from 'next';
import CardBalancesList from '@/features/contabilidad/components/CardBalancesList';

export const metadata: Metadata = { title: 'Pagos | Pana Taxi' };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Pagos a conductores</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Saldo pendiente por viajes cobrados con tarjeta — pagos semanales
        </p>
      </div>
      <CardBalancesList />
    </div>
  );
}
