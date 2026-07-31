import { Metadata } from 'next';
import ClientesView from '@/features/clientes/components/ClientesView';

export const metadata: Metadata = { title: 'Clientes | Pana Taxi' };

export default function ClientesPage() {
  return <ClientesView />;
}
