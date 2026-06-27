'use client';
import React from 'react';
import Link from 'next/link';
import { currency, dateTimeStr } from '@/lib/format';
import type { TripRow } from '../api';

interface Props {
  trips: TripRow[];
  loading: boolean;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  completed: { label: 'Completado', cls: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400' },
  cancelled: { label: 'Cancelado', cls: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400' },
  in_progress: { label: 'En curso', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  accepted: { label: 'Aceptado', cls: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400' },
  requested: { label: 'Solicitado', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  driver_arrived: { label: 'Conductor llegó', cls: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400' },
  negotiating: { label: 'Negociando', cls: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400' },
};

export default function RecentTripsTable({ trips, loading }: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Viajes Recientes</h3>
          <p className="text-xs text-gray-400 mt-0.5">Últimos registros del período</p>
        </div>
        <Link href="/viajes" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
          Ver todos →
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              {['Fecha', 'Cooperativa', 'Conductor', 'Ruta', 'Tarifa', 'Comisión', 'Estado'].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3.5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : trips.map((t) => {
                  const status = STATUS_MAP[t.status ?? ''] ?? { label: t.status ?? '—', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' };
                  return (
                    <tr key={t.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                        {dateTimeStr(t.completed_at ?? t.created_at ?? '')}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-gray-700 dark:text-gray-300">
                        {t.cooperative?.name ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400">
                        {t.driver?.full_name ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-500 max-w-[200px]">
                        <p className="truncate text-xs">{t.origin_address ?? '—'}</p>
                        {t.destination_address && (
                          <p className="truncate text-xs text-gray-400">{t.destination_address}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-gray-800 dark:text-white whitespace-nowrap">
                        {currency(t.fare_amount ?? 0)}
                      </td>
                      <td className="px-5 py-3.5 text-brand-600 dark:text-brand-400 font-medium whitespace-nowrap">
                        {currency(t.commission_amount ?? 0)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {!loading && trips.length === 0 && (
        <div className="py-12 text-center text-sm text-gray-400">Sin viajes registrados</div>
      )}
    </div>
  );
}
