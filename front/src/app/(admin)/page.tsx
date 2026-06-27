import type { Metadata } from 'next';
import DashboardClient from '@/features/dashboard/components/DashboardClient';

export const metadata: Metadata = {
  title: 'Dashboard | Pana Taxi',
};

export default function DashboardPage() {
  return <DashboardClient />;
}
