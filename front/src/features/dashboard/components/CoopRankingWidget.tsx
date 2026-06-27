'use client';
import React from 'react';
import { currency, num } from '@/lib/format';
import type { CoopReportRow } from '../api';

interface Props {
  data: CoopReportRow[];
  loading: boolean;
}

export default function CoopRankingWidget({ data, loading }: Props) {
  const sorted = [...data].sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 8);
  const max = sorted[0]?.total_revenue ?? 1;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Ranking de Cooperativas</h3>
          <p className="text-xs text-gray-400 mt-0.5">Por ingresos — últimos 30 días</p>
        </div>
        <span className="text-xs font-medium text-gray-400">{sorted.length} coops</span>
      </div>

      <div className="space-y-3">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-center justify-between mb-1">
                  <div className="h-3 w-32 rounded bg-gray-100 dark:bg-gray-800" />
                  <div className="h-3 w-16 rounded bg-gray-100 dark:bg-gray-800" />
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800" />
              </div>
            ))
          : sorted.map((coop, idx) => {
              const pct = (coop.total_revenue / max) * 100;
              return (
                <div key={coop.cooperative_id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${idx === 0 ? 'text-brand-500' : idx === 1 ? 'text-gray-500' : 'text-gray-300 dark:text-gray-600'}`}>
                        #{idx + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{coop.name}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                      <span className="text-xs text-gray-400">{num(coop.total_trips)}v</span>
                      <span className="text-sm font-bold text-gray-800 dark:text-white">{currency(coop.total_revenue)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-700 ${idx === 0 ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
      </div>

      {!loading && sorted.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">Sin datos disponibles</div>
      )}
    </div>
  );
}
