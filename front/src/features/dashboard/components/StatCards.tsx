'use client';
import React from 'react';
import { currency, num } from '@/lib/format';
import type { DashboardSummary, DashboardPendingCounts, EntityCounts } from '../api';

interface Props {
  summary: DashboardSummary | null;
  pending: DashboardPendingCounts | null;
  counts: EntityCounts | null;
  loading: boolean;
}

const Skeleton = () => (
  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 animate-pulse">
    <div className="flex items-center justify-between mb-4">
      <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800" />
    </div>
    <div className="w-24 h-7 rounded bg-gray-100 dark:bg-gray-800 mb-2" />
    <div className="w-28 h-3 rounded bg-gray-100 dark:bg-gray-800" />
  </div>
);

export default function StatCards({ summary, pending, counts, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} />)}
      </div>
    );
  }

  const totalPending = (pending?.pendingDrivers ?? 0) + (pending?.pendingVehicles ?? 0) + (pending?.pendingCoops ?? 0);
  const sosOpen = pending?.openSos ?? 0;

  const cards = [
    {
      label: 'Cooperativas',
      value: num(counts?.cooperativas ?? 0),
      sub: 'registradas en la plataforma',
      icon: '🏢',
      color: 'text-brand-600 dark:text-brand-400',
      bg: 'bg-brand-50 dark:bg-brand-500/10',
      badge: null,
      href: '/cooperativas',
    },
    {
      label: 'Conductores',
      value: num(counts?.conductores ?? 0),
      sub: `${num(counts?.conductores_online ?? 0)} en línea ahora`,
      icon: '👤',
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-500/10',
      badge: null,
      href: '/conductores',
    },
    {
      label: 'Vehículos',
      value: num(counts?.vehiculos ?? 0),
      sub: 'registrados',
      icon: '🚖',
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-500/10',
      badge: null,
      href: '/vehiculos',
    },
    {
      label: 'Clientes',
      value: num(counts?.clientes ?? 0),
      sub: 'usuarios registrados',
      icon: '👥',
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-500/10',
      badge: null,
      href: null,
    },
    {
      label: 'Carreras hoy',
      value: num(counts?.viajes_hoy ?? 0),
      sub: 'viajes completados hoy',
      icon: '🗺️',
      color: 'text-cyan-600 dark:text-cyan-400',
      bg: 'bg-cyan-50 dark:bg-cyan-500/10',
      badge: null,
      href: '/viajes',
    },
    {
      label: 'Carreras del mes',
      value: num(summary?.total_trips ?? 0),
      sub: 'últimos 30 días',
      icon: '📅',
      color: 'text-sky-600 dark:text-sky-400',
      bg: 'bg-sky-50 dark:bg-sky-500/10',
      badge: null,
      href: '/viajes',
    },
    {
      label: 'Ingresos del mes',
      value: currency(summary?.total_revenue ?? 0),
      sub: `comisiones: ${currency(summary?.total_commissions ?? 0)}`,
      icon: '💵',
      color: 'text-success-600 dark:text-success-400',
      bg: 'bg-success-50 dark:bg-success-500/10',
      badge: null,
      href: '/contabilidad',
    },
    {
      label: 'Pendientes / SOS',
      value: num(totalPending),
      sub: sosOpen > 0 ? `🆘 ${sosOpen} alerta${sosOpen > 1 ? 's' : ''} abierta${sosOpen > 1 ? 's' : ''}` : `${pending?.pendingDrivers ?? 0} conductores · ${pending?.pendingVehicles ?? 0} vehículos`,
      icon: sosOpen > 0 ? '🆘' : '⏳',
      color: sosOpen > 0 ? 'text-error-600 dark:text-error-400' : 'text-orange-600 dark:text-orange-400',
      bg: sosOpen > 0 ? 'bg-error-50 dark:bg-error-500/10' : 'bg-orange-50 dark:bg-orange-500/10',
      badge: sosOpen > 0 ? 'red' : totalPending > 0 ? 'orange' : null,
      href: sosOpen > 0 ? '/sos' : null,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-2xl border bg-white dark:bg-gray-900 p-5 flex flex-col gap-3 transition-shadow hover:shadow-md ${
            c.badge === 'red'
              ? 'border-error-200 dark:border-error-800 ring-1 ring-error-100 dark:ring-error-900'
              : c.badge === 'orange'
              ? 'border-orange-200 dark:border-orange-800 ring-1 ring-orange-100 dark:ring-orange-900'
              : 'border-gray-200 dark:border-gray-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${c.bg}`}>
              {c.icon}
            </span>
            {c.badge && (
              <span className={`w-2 h-2 rounded-full animate-pulse ${c.badge === 'red' ? 'bg-error-500' : 'bg-orange-500'}`} />
            )}
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800 dark:text-white leading-tight">{c.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{c.sub}</p>
          </div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
