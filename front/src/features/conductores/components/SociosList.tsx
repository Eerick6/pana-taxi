'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { dateStr } from '@/lib/format';
import type { Driver } from '@/types';
import {
  getCoopMembers,
  getPendingCoopDrivers,
  approveDriverCoop,
  rejectDriverCoop,
} from '../api';
import DriverDocumentsModal from './DriverDocumentsModal';

// Shape returned by GET /drivers/cooperative/pending
interface CoopMembership {
  id: string;
  owner: Driver & { user?: { email?: string; phone?: string; status?: string } };
  approval_status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
}

const MEMBERSHIP_BADGE: Record<string, string> = {
  approved: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  pending:  'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400',
  rejected: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
};
const MEMBERSHIP_LABEL: Record<string, string> = {
  approved: 'Aprobado',
  pending:  'Pendiente',
  rejected: 'Rechazado',
};

const TYPE_LABEL: Record<string, string> = { driver: 'Conductor', owner_driver: 'Propietario' };

interface Props { cooperativeId?: string }

export default function SociosList({ cooperativeId }: Props) {
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');

  // ── Pending tab state ────────────────────────────────────────────────────
  const [pending, setPending]         = useState<CoopMembership[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingLoading, setPendingLoading] = useState(true);

  // ── All tab state ────────────────────────────────────────────────────────
  const [allItems, setAllItems]   = useState<CoopMembership[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [search, setSearch]       = useState('');
  const [allLoading, setAllLoading] = useState(true);

  // ── Shared ───────────────────────────────────────────────────────────────
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError]     = useState<string | null>(null);
  const [rejectId, setRejectId]           = useState<string | null>(null);
  const [rejectReason, setRejectReason]   = useState('');
  const [docsDriverId, setDocsDriverId]   = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    if (!cooperativeId) return;
    setPendingLoading(true);
    try {
      const res = await getPendingCoopDrivers({ page: pendingPage, limit: 15, cooperative_id: cooperativeId });
      setPending((res.items ?? []) as unknown as CoopMembership[]);
      setPendingTotal(res.total ?? 0);
    } catch {
      setPending([]);
    } finally {
      setPendingLoading(false);
    }
  }, [cooperativeId, pendingPage]);

  const loadAll = useCallback(async () => {
    if (!cooperativeId) return;
    setAllLoading(true);
    try {
      const res = await getCoopMembers({ page, limit: 15, search: search || undefined, cooperative_id: cooperativeId });
      setAllItems((res.items ?? []) as unknown as CoopMembership[]);
      setTotal(res.total ?? 0);
    } catch {
      setAllItems([]);
    } finally {
      setAllLoading(false);
    }
  }, [cooperativeId, page, search]);

  useEffect(() => { loadPending(); }, [loadPending]);
  useEffect(() => { if (activeTab === 'all') loadAll(); }, [loadAll, activeTab]);

  const act = async (fn: () => Promise<void>, id: string) => {
    setActionLoading(id);
    setActionError(null);
    try {
      await fn();
      await Promise.all([loadPending(), loadAll()]);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string | string[] } } };
      const raw = e?.response?.data?.message;
      setActionError(Array.isArray(raw) ? raw[0] : raw ?? 'Error al realizar la acción');
    } finally {
      setActionLoading(null);
    }
  };

  const doApprove = (driverId: string) =>
    act(() => approveDriverCoop(driverId), driverId);

  const openReject = (driverId: string) => {
    setRejectId(driverId);
    setRejectReason('');
  };

  const doReject = async () => {
    if (!rejectId || !rejectReason.trim()) return;
    const id = rejectId;
    setRejectId(null);
    await act(() => rejectDriverCoop(id, rejectReason), id);
  };

  const pendingPages = Math.max(1, Math.ceil(pendingTotal / 15));
  const allPages     = Math.max(1, Math.ceil(total / 15));

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {(['pending', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === t
                ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t === 'pending' ? 'Solicitudes pendientes' : 'Todos los socios'}
            {t === 'pending' && pendingTotal > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-bold rounded-full bg-brand-500 text-white leading-none">
                {pendingTotal}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Action error */}
      {actionError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600 transition-colors">✕</button>
        </div>
      )}

      {/* ── Pending tab ─────────────────────────────────────────────────── */}
      {activeTab === 'pending' && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-800 dark:text-white">
              {pendingLoading ? '...' : `${pendingTotal} solicitudes pendientes`}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Socio', 'Tipo', 'Licencia', 'Aprobación plataforma', 'Solicitud', 'Acciones'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendingLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} className="px-5 py-3.5"><div className="h-3.5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  : pending.map((m) => {
                      const d = m.owner;
                      return (
                        <tr key={m.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-700 dark:text-brand-300 flex-shrink-0">
                                {d.full_name?.charAt(0).toUpperCase() ?? '?'}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-800 dark:text-white">{d.full_name}</p>
                                <p className="text-xs text-gray-400">{d.user?.phone ?? d.user?.email ?? '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                              {TYPE_LABEL[d.driver_type] ?? d.driver_type}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                            {d.license_number ?? '—'}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${MEMBERSHIP_BADGE[d.approval_status] ?? ''}`}>
                              {MEMBERSHIP_LABEL[d.approval_status] ?? d.approval_status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{dateStr(m.created_at)}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setDocsDriverId(d.id)}
                                className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                              >
                                Ver docs
                              </button>
                              <button
                                onClick={() => doApprove(d.id)}
                                disabled={!!actionLoading}
                                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50"
                              >
                                {actionLoading === d.id ? '...' : 'Aprobar'}
                              </button>
                              <button
                                onClick={() => openReject(d.id)}
                                disabled={!!actionLoading}
                                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400 hover:bg-error-100 transition-colors disabled:opacity-50"
                              >
                                Rechazar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
          {!pendingLoading && pending.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">No hay solicitudes pendientes</p>
            </div>
          )}
          {pendingPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-400">{pendingTotal} solicitudes · página {pendingPage} de {pendingPages}</p>
              <div className="flex gap-2">
                <button onClick={() => setPendingPage((p) => Math.max(1, p - 1))} disabled={pendingPage === 1} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Anterior</button>
                <button onClick={() => setPendingPage((p) => Math.min(pendingPages, p + 1))} disabled={pendingPage === pendingPages} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Siguiente</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── All tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'all' && (
        <>
          <div className="relative">
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
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <p className="text-sm font-semibold text-gray-800 dark:text-white">
                {allLoading ? '...' : `${total} socios`}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    {['Socio', 'Tipo', 'Membresía', 'Se unió', 'Acciones'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                          {Array.from({ length: 5 }).map((__, j) => (
                            <td key={j} className="px-5 py-3.5"><div className="h-3.5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
                          ))}
                        </tr>
                      ))
                    : allItems.map((m) => {
                        const d = m.owner;
                        return (
                          <tr key={m.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-700 dark:text-brand-300 flex-shrink-0">
                                  {d.full_name?.charAt(0).toUpperCase() ?? '?'}
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-800 dark:text-white">{d.full_name}</p>
                                  <p className="text-xs text-gray-400">{d.user?.phone ?? d.user?.email ?? '—'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                                {TYPE_LABEL[d.driver_type] ?? d.driver_type}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${MEMBERSHIP_BADGE[m.approval_status] ?? ''}`}>
                                {MEMBERSHIP_LABEL[m.approval_status] ?? m.approval_status}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{dateStr(m.created_at)}</td>
                            <td className="px-5 py-3.5">
                              <button
                                onClick={() => setDocsDriverId(d.id)}
                                className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                              >
                                Ver docs
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
            {!allLoading && allItems.length === 0 && <div className="py-12 text-center text-sm text-gray-400">Sin socios</div>}
            {allPages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-800">
                <p className="text-xs text-gray-400">{total} registros · página {page} de {allPages}</p>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Anterior</button>
                  <button onClick={() => setPage((p) => Math.min(allPages, p + 1))} disabled={page === allPages} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Siguiente</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Docs modal */}
      {docsDriverId && (
        <DriverDocumentsModal
          driverId={docsDriverId}
          onClose={() => setDocsDriverId(null)}
          readOnly
        />
      )}

      {/* Reject reason dialog */}
      {rejectId && (
        <div className="fixed inset-0 z-999999 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">Rechazar solicitud</h3>
            <p className="text-sm text-gray-400 mb-4">Indica el motivo del rechazo. El socio podrá solicitar nuevamente.</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ej: Documentos incompletos, vehículo no apto..."
              rows={3}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setRejectId(null); setRejectReason(''); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={doReject}
                disabled={!rejectReason.trim() || !!actionLoading}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-error-500 text-white hover:bg-error-600 disabled:opacity-50 transition-colors"
              >
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
