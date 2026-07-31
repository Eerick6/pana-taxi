import type { Metadata } from 'next';
import CooperativaDetail from '@/features/cooperativas/components/CooperativaDetail';

export const metadata: Metadata = { title: 'Cooperativa | Pana Taxi' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CooperativaDetail id={id} />;
}
