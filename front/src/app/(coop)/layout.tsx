import type { Metadata } from 'next';
import '../dashboard-panels.css';
import CoopLayoutClient from './_CoopLayoutClient';

export const metadata: Metadata = {
  title: { template: '%s | Panel Cooperativa', default: 'Panel | Pana Taxi' },
  robots: { index: false, follow: false },
};

export default function CoopLayout({ children }: { children: React.ReactNode }) {
  return <CoopLayoutClient>{children}</CoopLayoutClient>;
}
