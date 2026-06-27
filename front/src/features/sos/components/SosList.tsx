'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { relativeTime, dateTimeStr } from '@/lib/format';
import type { SosAlert } from '@/types';
import { getSosAlerts, resolveSos } from '../api';

export default function SosList() {
  const [items, setItems] = useState<SosAlert[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('open');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSosAlerts({ page, limit: 20, status: filterStatus || undefined });
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const doResolve = async (id: string) => {
    setActionLoading(id);
    try { await resolveSos(id); await load(); } finally { setActionLoading(null); }
  };

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-5">
      {/* Status filter */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {[{ v: 'open', l: '🔴 Abiertas' }, { v: 'resolved', l: '✅ Resueltas' }, { v: '', l: 'Todas' }].map(({ v, l }) => (
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
          : items.map((s) => (
              <div key={s.id} className={`rounded-2xl border bg-white dark:bg-gray-900 p-5 ${s.status === 'open' ? 'border-error-300 dark:border-error-800 ring-1 ring-error-200 dark:ring-error-800' : 'border-gray-200 dark:border-gray-800'}`}>
                <div className="flex items-start gap-3 mb-3">
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${s.status === 'open' ? 'bg-error-50 dark:bg-error-500/10' : 'bg-success-50 dark:bg-success-500/10'}`}>
                    {s.status === 'open' ? '🆘' : '✅'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.status === 'open' ? 'bg-error-100 text-error-700 dark:bg-error-500/20 dark:text-error-400' : 'bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-400'}`}>
                        {s.status === 'open' ? 'ABIERTA' : 'RESUELTA'}
                      </span>
                      <span className="text-xs text-gray-400">{relativeTime(s.created_at)}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{dateTimeStr(s.created_at)}</p>
                  </div>
                </div>

                {s.message && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 line-clamp-2">{s.message}</p>
                )}

                <div className="space-y-1 mb-3">
                  {s.trip && (
                    <p className="text-xs text-gray-400">
                      <span className="font-medium text-gray-600 dark:text-gray-300">Viaje:</span> {s.trip.id.slice(0, 8)}...
                    </p>
                  )}
                  {s.lat && s.lng && (
                    <p className="text-xs text-gray-400">
                      <span className="font-medium text-gray-600 dark:text-gray-300">Coords:</span> {Number(s.lat).toFixed(4)}, {Number(s.lng).toFixed(4)}
                    </p>
                  )}
                  {s.resolved_at && (
                    <p className="text-xs text-gray-400">
                      <span className="font-medium text-gray-600 dark:text-gray-300">Resuelta:</span> {dateTimeStr(s.resolved_at)}
                    </p>
                  )}
                </div>

                {s.status === 'open' && (
                  <button
                    onClick={() => doResolve(s.id)}
                    disabled={actionLoading === s.id}
                    className="w-full py-2 text-sm font-semibold rounded-xl bg-success-500 text-white hover:bg-success-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {actionLoading === s.id ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ) : '✓'} Marcar como resuelta
                  </button>
                )}
              </div>
            ))}
      </div>

      {!loading && items.length === 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-16 text-center">
          <span className="text-4xl">✅</span>
          <p className="text-gray-400 mt-3">{filterStatus === 'open' ? 'Sin alertas activas' : 'Sin registros'}</p>
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
