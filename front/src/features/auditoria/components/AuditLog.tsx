'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { dateTimeStr } from '@/lib/format';
import type { AuditLog } from '@/types';
import { getAuditLogs } from '../api';

const METHOD_BADGE: Record<string, string> = {
  GET: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  POST: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  PATCH: 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400',
  DELETE: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
  PUT: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
};

const STATUS_BADGE = (code: number) => {
  if (code >= 200 && code < 300) return 'text-success-600 dark:text-success-400';
  if (code >= 400 && code < 500) return 'text-warning-600 dark:text-orange-400';
  if (code >= 500) return 'text-error-600 dark:text-error-400';
  return 'text-gray-500 dark:text-gray-400';
};

export default function AuditLogView() {
  const [items, setItems] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAuditLogs({
        page,
        limit: 30,
        entity_type: entityType || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      });
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, entityType, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / 30));

  const ENTITY_OPTIONS = ['', 'cooperatives', 'drivers', 'vehicles', 'trips', 'users', 'sos', 'stands', 'accounting'];

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">Toda entidad</option>
          {ENTITY_OPTIONS.slice(1).map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <p className="text-sm font-semibold text-gray-800 dark:text-white">{loading ? '...' : `${total} registros`}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {['Fecha', 'Actor', 'Rol', 'Acción', 'Entidad', 'ID', 'Estado'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-5 py-3.5"><div className="h-3.5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : items.map((log) => {
                    const [method, ...pathParts] = log.action.split(' ');
                    const path = pathParts.join(' ');
                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors cursor-pointer"
                          onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                        >
                          <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{dateTimeStr(log.created_at)}</td>
                          <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400 font-mono">{log.actor_id?.slice(0, 8) ?? '—'}…</td>
                          <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">{log.actor_role ?? '—'}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${METHOD_BADGE[method] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{method}</span>
                              <span className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate max-w-[180px]">{path}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">{log.entity_type ?? '—'}</td>
                          <td className="px-5 py-3.5 text-xs font-mono text-gray-400">{log.entity_id?.slice(0, 8) ?? '—'}</td>
                          <td className="px-5 py-3.5">
                            <span className={`text-sm font-bold ${STATUS_BADGE(log.status_code)}`}>{log.status_code}</span>
                          </td>
                        </tr>
                        {expanded === log.id && log.metadata && (
                          <tr className="bg-gray-50 dark:bg-gray-800/50">
                            <td colSpan={7} className="px-5 py-3">
                              <pre className="text-xs font-mono text-gray-600 dark:text-gray-300 overflow-x-auto max-h-32">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
            </tbody>
          </table>
        </div>
        {!loading && items.length === 0 && <div className="py-12 text-center text-sm text-gray-400">Sin registros de auditoría</div>}
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
    </div>
  );
}
