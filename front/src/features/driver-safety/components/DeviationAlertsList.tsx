'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { relativeTime, dateTimeStr } from '@/lib/format';
import type { DeviationAlert } from '@/types';
import { getDeviationAlerts, resolveDeviationAlert } from '../api';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

export default function DeviationAlertsList() {
  const [items, setItems] = useState<DeviationAlert[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'open' | 'resolved' | ''>('open');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDeviationAlerts({ page, limit: 20, status: filterStatus });
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus]);

  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(['driver.deviation_alert'], load);

  const doResolve = async (id: string) => {
    setActionLoading(id);
    try { await resolveDeviationAlert(id); await load(); } finally { setActionLoading(null); }
  };

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-5">
      {/* Status filter */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {[{ v: 'open' as const, l: '🧭 Abiertas' }, { v: 'resolved' as const, l: '✅ Resueltas' }, { v: '' as const, l: 'Todas' }].map(({ v, l }) => (
          <button key={v} onClick={() => { setFilterStatus(v); setPage(1); }} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${filterStatus === v ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 animate-pulse">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800" />
                  <div className="flex-1">
                    <div className="h-4 w-24 rounded bg-gray-100 dark:bg-gray-800 mb-2" />
                    <div className="h-3 w-32 rounded bg-gray-100 dark:bg-gray-800" />
                  </div>
                </div>
                <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-800 mb-2" />
                <div className="h-8 w-full rounded-lg bg-gray-100 dark:bg-gray-800 mt-4" />
              </div>
            ))
          : items.map((a) => (
              <div key={a.id} className={`rounded-2xl border bg-white dark:bg-gray-900 p-5 ${a.status === 'open' ? 'border-warning-300 dark:border-warning-800 ring-1 ring-warning-200 dark:ring-warning-800' : 'border-gray-200 dark:border-gray-800'}`}>
                <div className="flex items-start gap-3 mb-3">
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${a.status === 'open' ? 'bg-warning-50 dark:bg-warning-500/10' : 'bg-success-50 dark:bg-success-500/10'}`}>
                    {a.status === 'open' ? '🧭' : '✅'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${a.status === 'open' ? 'bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-orange-400' : 'bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-400'}`}>
                        {a.status === 'open' ? 'DESVIADO' : 'RESUELTA'}
                      </span>
                      <span className="text-xs text-gray-400">{relativeTime(a.triggered_at)}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{dateTimeStr(a.triggered_at)}</p>
                  </div>
                </div>

                <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                  {a.driver?.full_name ?? 'Conductor'} lleva más de 15 min fuera de la ruta planeada.
                </p>

                <div className="space-y-1 mb-3">
                  <p className="text-xs text-gray-400">
                    <span className="font-medium text-gray-600 dark:text-gray-300">Viaje:</span> {a.trip_id.slice(0, 8)}...
                  </p>
                  <p className="text-xs text-gray-400">
                    <span className="font-medium text-gray-600 dark:text-gray-300">Última posición:</span> {Number(a.lat).toFixed(4)}, {Number(a.lng).toFixed(4)}
                  </p>
                  {a.resolved_at && (
                    <p className="text-xs text-gray-400">
                      <span className="font-medium text-gray-600 dark:text-gray-300">Resuelta:</span> {dateTimeStr(a.resolved_at)}
                    </p>
                  )}
                </div>

                {a.status === 'open' && (
                  <button
                    onClick={() => doResolve(a.id)}
                    disabled={actionLoading === a.id}
                    className="w-full py-2 text-sm font-semibold rounded-xl bg-success-500 text-white hover:bg-success-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {actionLoading === a.id ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ) : '✓'} Ya verifiqué, marcar como resuelta
                  </button>
                )}
              </div>
            ))}
      </div>

      {!loading && items.length === 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-16 text-center">
          <span className="text-4xl">✅</span>
          <p className="text-gray-400 mt-3">{filterStatus === 'open' ? 'Sin desvíos activos' : 'Sin registros'}</p>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">{total} alertas · página {page} de {pages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Anterior</button>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Siguiente</button>
          </div>
        </div>
      )}
    </div>
  );
}
