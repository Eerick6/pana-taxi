import type { Metadata } from 'next';
import AdminLayoutClient from './_AdminLayoutClient';

export const metadata: Metadata = {
  title: { template: '%s | Panel Pana Taxi', default: 'Panel | Pana Taxi' },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
