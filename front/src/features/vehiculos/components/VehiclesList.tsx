'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { dateStr } from '@/lib/format';
import type { Vehicle } from '@/types';
import { getVehicles, suspendVehicle, activateVehicle, deleteVehicle } from '../api';
import VehicleDocumentsModal from './VehicleDocumentsModal';

const APPROVAL_BADGE: Record<string, string> = {
  approved: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  pending:  'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400',
  rejected: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
};
const APPROVAL_LABEL: Record<string, string> = { approved: 'Aprobado', pending: 'Pendiente', rejected: 'Rechazado' };

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  inactive:  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  suspended: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
};
const STATUS_LABEL: Record<string, string> = { active: 'Activo', inactive: 'Inactivo', suspended: 'Suspendido' };

interface Props { cooperativeId?: string }

export default function VehiclesList({ cooperativeId }: Props) {
  const [items, setItems] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterApproval, setFilterApproval] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [docsVehicleId, setDocsVehicleId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getVehicles({
        page,
        limit: 15,
        search: search || undefined,
        status: filterApproval || undefined,
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
    setActionError(null);
    try {
      await fn();
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string | string[] } } };
      const raw = e?.response?.data?.message;
      setActionError(Array.isArray(raw) ? raw[0] : raw ?? 'Error al realizar la acción');
    } finally {
      setActionLoading(null);
    }
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
            placeholder="Buscar por placa, marca, propietario..."
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

      {/* Action error */}
      {actionError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600 transition-colors">✕</button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <p className="text-sm font-semibold text-gray-800 dark:text-white">
            {loading ? '...' : `${total} vehículos`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {['Vehículo', 'Placa', 'Propietario', 'Cooperativa', 'Aprobación', 'Estado op.', 'Registrado', 'Acciones'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-5 py-3.5"><div className="h-3.5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : items.map((v) => (
                    <tr key={v.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-gray-800 dark:text-white">{v.brand} {v.model}</p>
                        <p className="text-xs text-gray-400">{v.year} · {v.color}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-sm font-semibold text-gray-800 dark:text-white bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                          {v.plate}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400">{v.owner?.full_name ?? '—'}</td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400">{v.cooperative?.name ?? '—'}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${APPROVAL_BADGE[v.approval_status] ?? ''}`}>
                          {APPROVAL_LABEL[v.approval_status] ?? v.approval_status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[v.status] ?? ''}`}>
                          {STATUS_LABEL[v.status] ?? v.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{dateStr(v.created_at)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          {/* Docs — siempre visible */}
                          <button
                            onClick={() => setDocsVehicleId(v.id)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                              v.approval_status === 'pending'
                                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400 hover:bg-brand-100'
                                : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                          >
                            {v.approval_status === 'pending' ? 'Revisar docs' : 'Ver docs'}
                          </button>

                          {/* Suspender — solo si aprobado y activo */}
                          {v.approval_status === 'approved' && v.status === 'active' && (
                            <button
                              onClick={() => act(() => suspendVehicle(v.id), v.id)}
                              disabled={actionLoading === v.id}
                              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400 hover:bg-orange-100 transition-colors disabled:opacity-50"
                            >
                              Suspender
                            </button>
                          )}

                          {/* Activar — si aprobado y suspendido/inactivo */}
                          {v.approval_status === 'approved' && v.status !== 'active' && (
                            <button
                              onClick={() => act(() => activateVehicle(v.id), v.id)}
                              disabled={actionLoading === v.id}
                              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50"
                            >
                              Activar
                            </button>
                          )}

                          {/* Eliminar — solo si no activo */}
                          {v.status !== 'active' && (
                            <button
                              onClick={() => setDeleteId(v.id)}
                              disabled={actionLoading === v.id}
                              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400 hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              Eliminar
                            </button>
                          )}

                          {actionLoading === v.id && (
                            <svg className="w-4 h-4 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {!loading && items.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">Sin vehículos</div>
        )}

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

      {/* Vehicle documents modal */}
      {docsVehicleId && (
        <VehicleDocumentsModal
          vehicleId={docsVehicleId}
          onClose={() => setDocsVehicleId(null)}
          onUpdate={load}
        />
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-999999 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">¿Eliminar vehículo?</h3>
            <p className="text-sm text-gray-400 mb-6">Esta acción es permanente. Solo se pueden eliminar vehículos que no estén activos.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const id = deleteId;
                  setDeleteId(null);
                  await act(() => deleteVehicle(id), id);
                }}
                disabled={!!actionLoading}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
