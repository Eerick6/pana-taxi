import type { Metadata } from 'next';
import AccountingView from '@/features/contabilidad/components/AccountingView';

export const metadata: Metadata = { title: 'Contabilidad | Pana Taxi' };

export default function Page({ searchParams }: { searchParams: { tab?: string } }) {
  const tab = searchParams.tab;
  const initialTab =
    tab === 'recharges' || tab === 'banks' || tab === 'settlements' ? tab : 'settlements';
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Contabilidad</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Liquidaciones, recargas de billetera y estados financieros</p>
      </div>
      <AccountingView initialTab={initialTab as 'settlements' | 'recharges' | 'banks'} />
    </div>
  );
}
