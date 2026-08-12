'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { currency, dateTimeStr } from '@/lib/format';
import type { Trip } from '@/types';
import { getTrips, cancelTrip } from '../api';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

const TRIP_EVENTS = [
  'trip.created', 'trip.accepted', 'trip.driver_arrived',
  'trip.started', 'trip.cancelled', 'trip.completed',
];

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  completed: { label: 'Completado', cls: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400' },
  cancelled: { label: 'Cancelado', cls: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400' },
  in_progress: { label: 'En curso', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  accepted: { label: 'Aceptado', cls: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400' },
  requested: { label: 'Solicitado', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  driver_arrived: { label: 'Conductor llegó', cls: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400' },
  negotiating: { label: 'Negociando', cls: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400' },
};

const FARE_LABEL: Record<string, string> = { meter: 'Taxímetro', negotiated: 'Negociado' };
const SOURCE_LABEL: Record<string, string> = { client: 'App Cliente', cooperative: 'Cooperativa' };

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'requested', label: 'Solicitados' },
  { value: 'accepted', label: 'Aceptados' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'completed', label: 'Completados' },
  { value: 'cancelled', label: 'Cancelados' },
];

const ACTIVE_STATUSES = new Set(['requested', 'negotiating', 'accepted', 'driver_arrived', 'in_progress']);

interface Props { cooperativeId?: string; canCancel?: boolean; refreshKey?: number }

export default function TripsList({ cooperativeId, canCancel = false, refreshKey }: Props) {
  const [items, setItems] = useState<Trip[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTrips({
        page,
        limit: 20,
        status: filterStatus || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        cooperative_id: cooperativeId,
      });
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, fromDate, toDate, cooperativeId]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useRealtimeRefresh(TRIP_EVENTS, load);

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-400 whitespace-nowrap">Desde</span>
          <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <span className="text-xs text-gray-400">hasta</span>
          <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
          {(fromDate || toDate) && (
            <button onClick={() => { setFromDate(''); setToDate(''); setPage(1); }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline">Limpiar</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <p className="text-sm font-semibold text-gray-800 dark:text-white">{loading ? '...' : `${total} viajes`}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {['Fecha', 'Origen → Destino', 'Conductor', 'Cooperativa', 'Modalidad', 'Tarifa', 'Comisión', 'Fuente', 'Estado', ...(canCancel ? [''] : [])].map((h, i) => (
                  <th key={i} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                      {Array.from({ length: 9 }).map((__, j) => (
                        <td key={j} className="px-5 py-3.5"><div className="h-3.5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : items.map((t) => {
                    const status = STATUS_MAP[t.status] ?? { label: t.status, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' };
                    return (
                      <tr key={t.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {dateTimeStr(t.completed_at ?? t.created_at)}
                        </td>
                        <td className="px-5 py-3.5 max-w-[200px]">
                          <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{t.origin_address ?? '—'}</p>
                          <p className="text-xs text-gray-400 truncate">{t.destination_address ?? '—'}</p>
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">{t.driver?.full_name ?? '—'}</td>
                        <td className="px-5 py-3.5 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{t.cooperative?.name ?? '—'}</td>
                        <td className="px-5 py-3.5">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                            {FARE_LABEL[t.fare_mode] ?? t.fare_mode}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-gray-800 dark:text-white whitespace-nowrap">
                          {currency(t.fare_amount ?? 0)}
                        </td>
                        <td className="px-5 py-3.5 text-brand-600 dark:text-brand-400 font-medium whitespace-nowrap">
                          {currency(t.commission_amount ?? 0)}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                          {SOURCE_LABEL[t.source] ?? t.source}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${status.cls}`}>
                            {status.label}
                          </span>
                        </td>
                        {canCancel && (
                          <td className="px-5 py-3.5">
                            {ACTIVE_STATUSES.has(t.status) && (
                              <button
                                onClick={() => { setCancelId(t.id); setCancelReason(''); }}
                                className="px-2.5 py-1 text-xs font-medium rounded-lg border border-error-200 dark:border-error-800 text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-500/10 transition-colors whitespace-nowrap"
                              >
                                Cancelar
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
        {!loading && items.length === 0 && <div className="py-12 text-center text-sm text-gray-400">Sin viajes en este período</div>}
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400">{total} registros · página {page} de {pages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Anterior</button>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Siguiente</button>
            </div>
          </div>
        )}
      </div>
      {cancelId && (
        <div className="fixed inset-0 z-999999 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setCancelId(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-2">Cancelar viaje</h3>
            <p className="text-sm text-gray-400 mb-4">Indica el motivo de la cancelación.</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo de cancelación..."
              rows={3}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setCancelId(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Volver
              </button>
              <button
                onClick={async () => {
                  if (!cancelReason.trim()) return;
                  setCancelLoading(true);
                  try { await cancelTrip(cancelId, cancelReason.trim()); setCancelId(null); await load(); }
                  finally { setCancelLoading(false); }
                }}
                disabled={!cancelReason.trim() || cancelLoading}
                className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-error-500 text-white hover:bg-error-600 disabled:opacity-50 transition-colors"
              >
                {cancelLoading ? 'Cancelando...' : 'Cancelar viaje'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
