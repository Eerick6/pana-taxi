'use client';
import React from 'react';
import Link from 'next/link';
import type { DashboardPendingCounts } from '../api';

interface Props {
  pending: DashboardPendingCounts | null;
  loading: boolean;
}

interface Item {
  label: string;
  count: number;
  href: string;
  icon: string;
  color: string;
  bg: string;
}

export default function PendingWidget({ pending, loading }: Props) {
  const items: Item[] = [
    {
      label: 'Conductores',
      count: pending?.pendingDrivers ?? 0,
      href: '/conductores?status=pending',
      icon: '👤',
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-500/10',
    },
    {
      label: 'Vehículos',
      count: pending?.pendingVehicles ?? 0,
      href: '/vehiculos?status=pending',
      icon: '🚖',
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-500/10',
    },
    {
      label: 'Cooperativas',
      count: pending?.pendingCoops ?? 0,
      href: '/cooperativas?approval_status=pending',
      icon: '🏢',
      color: 'text-brand-600 dark:text-brand-400',
      bg: 'bg-brand-50 dark:bg-brand-500/10',
    },
    {
      label: 'SOS Activos',
      count: pending?.openSos ?? 0,
      href: '/sos?status=open',
      icon: '🆘',
      color: 'text-error-600 dark:text-error-400',
      bg: 'bg-error-50 dark:bg-error-500/10',
    },
  ];

  const total = items.reduce((s, i) => s + i.count, 0);

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Acciones Pendientes</h3>
          <p className="text-xs text-gray-400 mt-0.5">Requieren tu atención</p>
        </div>
        {total > 0 && (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-error-100 dark:bg-error-500/20 text-error-700 dark:text-error-400 text-xs font-bold">
            {total}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-3 w-24 rounded bg-gray-100 dark:bg-gray-800" />
                </div>
                <div className="h-5 w-8 rounded bg-gray-100 dark:bg-gray-800" />
              </div>
            ))
          : items.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
              >
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${item.bg}`}>
                  {item.icon}
                </span>
                <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">
                  {item.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${item.count > 0 ? item.color : 'text-gray-300 dark:text-gray-600'}`}>
                    {item.count}
                  </span>
                  <svg className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
      </div>

      {!loading && total === 0 && (
        <div className="mt-4 text-center py-4">
          <span className="text-2xl">✅</span>
          <p className="text-sm text-gray-400 mt-1">Todo al día</p>
        </div>
      )}
    </div>
  );
}
