'use client';
import React from 'react';
import { currency, num } from '@/lib/format';
import type { DashboardSummary, DashboardPendingCounts } from '../api';

interface Props {
  summary: DashboardSummary | null;
  pending: DashboardPendingCounts | null;
  loading: boolean;
}

const Skeleton = () => (
  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 animate-pulse">
    <div className="flex items-center justify-between mb-4">
      <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800" />
      <div className="w-12 h-4 rounded bg-gray-100 dark:bg-gray-800" />
    </div>
    <div className="w-28 h-7 rounded bg-gray-100 dark:bg-gray-800 mb-2" />
    <div className="w-20 h-3 rounded bg-gray-100 dark:bg-gray-800" />
  </div>
);

export default function StatCards({ summary, pending, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)}
      </div>
    );
  }

  const totalPending = (pending?.pendingDrivers ?? 0) + (pending?.pendingVehicles ?? 0) + (pending?.pendingCoops ?? 0);
  const sosOpen = pending?.openSos ?? 0;

  const cards = [
    {
      label: 'Viajes',
      value: num(summary?.total_trips ?? 0),
      sub: 'últimos 30 días',
      icon: '🗺️',
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-500/10',
      badge: null,
    },
    {
      label: 'Ingresos',
      value: currency(summary?.total_revenue ?? 0),
      sub: 'facturación bruta',
      icon: '💵',
      color: 'text-success-600 dark:text-success-400',
      bg: 'bg-success-50 dark:bg-success-500/10',
      badge: null,
    },
    {
      label: 'Comisiones',
      value: currency(summary?.total_commissions ?? 0),
      sub: 'ganancia plataforma',
      icon: '📊',
      color: 'text-brand-600 dark:text-brand-400',
      bg: 'bg-brand-50 dark:bg-brand-500/10',
      badge: null,
    },
    {
      label: 'Tarifa Promedio',
      value: currency(summary?.avg_fare ?? 0),
      sub: 'por viaje',
      icon: '⭐',
      color: 'text-warning-600 dark:text-warning-400',
      bg: 'bg-warning-50 dark:bg-warning-500/10',
      badge: null,
    },
    {
      label: 'Pendientes',
      value: num(totalPending),
      sub: `${pending?.pendingDrivers ?? 0} conductores · ${pending?.pendingVehicles ?? 0} vehículos`,
      icon: '⏳',
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-500/10',
      badge: totalPending > 0 ? 'orange' : null,
    },
    {
      label: 'SOS Activos',
      value: num(sosOpen),
      sub: 'alertas abiertas',
      icon: '🆘',
      color: 'text-error-600 dark:text-error-400',
      bg: 'bg-error-50 dark:bg-error-500/10',
      badge: sosOpen > 0 ? 'red' : null,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-2xl border bg-white dark:bg-gray-900 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow ${
            c.badge === 'red'
              ? 'border-error-300 dark:border-error-800 ring-1 ring-error-200 dark:ring-error-800'
              : c.badge === 'orange'
              ? 'border-orange-300 dark:border-orange-800 ring-1 ring-orange-200 dark:ring-orange-800'
              : 'border-gray-200 dark:border-gray-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${c.bg}`}>
              {c.icon}
            </span>
            {c.badge && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${c.badge === 'red' ? 'bg-error-100 text-error-700 dark:bg-error-500/20 dark:text-error-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'}`}>
                ●
              </span>
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
