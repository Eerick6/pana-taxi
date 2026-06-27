'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { dateStr } from '@/lib/format';
import type { Driver } from '@/types';
import {
  getDrivers, approveDriverPlatform, rejectDriverPlatform,
  blockDriver, unblockDriver,
} from '../api';

const APPROVAL_BADGE: Record<string, string> = {
  approved: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  pending: 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400',
  rejected: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
};

const ONLINE_BADGE: Record<string, string> = {
  online: 'bg-success-500',
  busy: 'bg-brand-500',
  looking_for_work: 'bg-blue-500',
  offline: 'bg-gray-300 dark:bg-gray-600',
};

const ONLINE_LABEL: Record<string, string> = {
  online: 'En línea',
  busy: 'Ocupado',
  looking_for_work: 'Buscando',
  offline: 'Fuera de línea',
};

const TYPE_LABEL: Record<string, string> = { driver: 'Conductor', owner_driver: 'Propietario' };

interface Props { cooperativeId?: string }

export default function DriversList({ cooperativeId }: Props) {
  const [items, setItems] = useState<Driver[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterApproval, setFilterApproval] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDrivers({
        page,
        limit: 15,
        search: search || undefined,
        approval_status: filterApproval || undefined,
        cooperative_id: cooperativeId,
      });
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterApproval, cooperativeId]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<void>, id: string) => {
    setActionLoading(id);
    try { await fn(); await load(); } finally { setActionLoading(null); }
  };

  const doReject = async () => {
    if (!rejectId || !rejectReason.trim()) return;
    await act(() => rejectDriverPlatform(rejectId, rejectReason), rejectId);
    setRejectId(null);
    setRejectReason('');
  };

  const pages = Math.max(1, Math.ceil(total / 15));

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {(['all', 'pending'] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setActiveTab(t); setFilterApproval(t === 'pending' ? 'pending' : ''); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === t ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            {t === 'all' ? 'Todos' : 'Pendientes'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre o correo..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        {activeTab === 'all' && (
          <select
            value={filterApproval}
            onChange={(e) => { setFilterApproval(e.target.value); setPage(1); }}
            className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Toda aprobación</option>
            <option value="pending">Pendiente</option>
            <option value="approved">Aprobado</option>
            <option value="rejected">Rechazado</option>
          </select>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <p className="text-sm font-semibold text-gray-800 dark:text-white">
            {loading ? '...' : `${total} conductores`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {['Conductor', 'Tipo', 'Licencia', 'Estado', 'En línea', 'Registrado', 'Acciones'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-5 py-3.5"><div className="h-3.5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : items.map((d) => (
                    <tr key={d.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-700 dark:text-brand-300 flex-shrink-0">
                            {d.full_name?.charAt(0).toUpperCase() ?? '?'}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 dark:text-white">{d.full_name}</p>
                            <p className="text-xs text-gray-400">{d.user?.email ?? '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                          {TYPE_LABEL[d.driver_type] ?? d.driver_type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400">
                        <p>{d.license_number ?? '—'}</p>
                        {d.license_expiry && <p className="text-xs text-gray-400">{dateStr(d.license_expiry)}</p>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${APPROVAL_BADGE[d.approval_status] ?? ''}`}>
                          {d.approval_status === 'approved' ? 'Aprobado' : d.approval_status === 'pending' ? 'Pendiente' : 'Rechazado'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ONLINE_BADGE[d.online_status] ?? 'bg-gray-300'}`} />
                          <span className="text-xs text-gray-500 dark:text-gray-400">{ONLINE_LABEL[d.online_status] ?? d.online_status}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{dateStr(d.created_at)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          {d.approval_status === 'pending' && (
                            <>
                              <button onClick={() => act(() => approveDriverPlatform(d.id), d.id)} disabled={actionLoading === d.id} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50">
                                Aprobar
                              </button>
                              <button onClick={() => setRejectId(d.id)} disabled={actionLoading === d.id} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400 hover:bg-error-100 transition-colors disabled:opacity-50">
                                Rechazar
                              </button>
                            </>
                          )}
                          {d.approval_status === 'approved' && (
                            <button onClick={() => act(() => blockDriver(d.id), d.id)} disabled={actionLoading === d.id} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400 hover:bg-orange-100 transition-colors disabled:opacity-50">
                              Bloquear
                            </button>
                          )}
                          {d.approval_status === 'rejected' && (
                            <button onClick={() => act(() => unblockDriver(d.id), d.id)} disabled={actionLoading === d.id} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50">
                              Desbloquear
                            </button>
                          )}
                          {actionLoading === d.id && (
                            <svg className="w-4 h-4 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!loading && items.length === 0 && <div className="py-12 text-center text-sm text-gray-400">Sin conductores</div>}
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

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">Rechazar Conductor</h3>
            <p className="text-sm text-gray-400 mb-4">Indica el motivo del rechazo</p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ej: Licencia vencida..." rows={3} className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setRejectId(null); setRejectReason(''); }} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
              <button onClick={doReject} disabled={!rejectReason.trim() || !!actionLoading} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-error-500 text-white hover:bg-error-600 disabled:opacity-50 transition-colors">Confirmar rechazo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
