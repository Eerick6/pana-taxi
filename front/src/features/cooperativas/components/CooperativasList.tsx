'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { dateStr } from '@/lib/format';
import type { Cooperative } from '@/types';
import {
  getCooperativas, suspendCooperativa, activateCooperativa,
  setCooperativaFee, deleteCooperativa,
  getCooperativaTermsVersion, createCooperativa,
} from '../api';
import CoopDocumentsModal from './CoopDocumentsModal';

const APPROVAL_BADGE: Record<string, string> = {
  approved: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  pending: 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400',
  rejected: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
};
const STATUS_BADGE: Record<string, string> = {
  active: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  suspended: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
};
const APPROVAL_LABEL: Record<string, string> = { approved: 'Aprobada', pending: 'Pendiente', rejected: 'Rechazada' };
const STATUS_LABEL: Record<string, string> = { active: 'Activa', inactive: 'Inactiva', suspended: 'Suspendida' };

const PAGE_SIZE = 15;

export default function CooperativasList() {
  const [allItems, setAllItems] = useState<Cooperative[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterApproval, setFilterApproval] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [docsCoopId, setDocsCoopId] = useState<string | null>(null);
  const [feeId, setFeeId] = useState<string | null>(null);
  const [feeValue, setFeeValue] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', ruc: '', address: '', phone: '', commission_override: '' });
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCooperativas();
      setAllItems(res.items ?? []);
    } catch {
      setAllItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, filterApproval, filterStatus]);

  const filtered = allItems.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !c.ruc.includes(q)) return false;
    }
    if (filterApproval && c.approval_status !== filterApproval) return false;
    if (filterStatus && c.status !== filterStatus) return false;
    return true;
  });

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const act = async (fn: () => Promise<void>, id: string) => {
    setActionLoading(id);
    try { await fn(); await load(); } finally { setActionLoading(null); }
  };

  const doSetFee = async () => {
    if (!feeId) return;
    const fee = parseFloat(feeValue);
    if (isNaN(fee) || fee < 0) return;
    await act(() => setCooperativaFee(feeId, fee), feeId);
    setFeeId(null);
    setFeeValue('');
  };

  const doDelete = async () => {
    if (!deleteId) return;
    await act(() => deleteCooperativa(deleteId), deleteId);
    setDeleteId(null);
  };

  const doCreate = async () => {
    if (!createForm.name || !createForm.ruc) return;
    setCreateBusy(true);
    setCreateError('');
    try {
      const termsVersion = await getCooperativaTermsVersion();
      await createCooperativa({
        name: createForm.name,
        ruc: createForm.ruc,
        address: createForm.address || undefined,
        phone: createForm.phone || undefined,
        commission_override: createForm.commission_override ? parseFloat(createForm.commission_override) : undefined,
        terms_version: termsVersion,
      });
      setShowCreate(false);
      setCreateForm({ name: '', ruc: '', address: '', phone: '', commission_override: '' });
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setCreateError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Error al crear'));
    } finally { setCreateBusy(false); }
  };

  return (
    <div className="space-y-5">
      {/* Filters + Create */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-brand-600 text-white hover:bg-brand-700 transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Nueva cooperativa
        </button>
      </div>
      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre o RUC..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select
          value={filterApproval}
          onChange={(e) => { setFilterApproval(e.target.value); setPage(1); }}
          className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Toda aprobación</option>
          <option value="pending">Pendiente</option>
          <option value="approved">Aprobada</option>
          <option value="rejected">Rechazada</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Todo estado</option>
          <option value="active">Activa</option>
          <option value="inactive">Inactiva</option>
          <option value="suspended">Suspendida</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <p className="text-sm font-semibold text-gray-800 dark:text-white">
            {loading ? '...' : `${total} cooperativas`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {['Nombre / RUC', 'Teléfono', 'Aprobación', 'Estado', 'Comisión', 'Cuota mensual', 'Creada', 'Acciones'].map((h) => (
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
                : items.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-gray-800 dark:text-white">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.ruc}</p>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400">{c.phone ?? '—'}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${APPROVAL_BADGE[c.approval_status] ?? ''}`}>
                          {APPROVAL_LABEL[c.approval_status] ?? c.approval_status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[c.status] ?? ''}`}>
                          {STATUS_LABEL[c.status] ?? c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400">
                        {c.commission_override != null ? `${c.commission_override}%` : 'Default'}
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => { setFeeId(c.id); setFeeValue(c.monthly_fee_override != null ? String(c.monthly_fee_override) : ''); }}
                          className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium"
                        >
                          {c.monthly_fee_override != null ? `$${Number(c.monthly_fee_override).toFixed(2)}` : 'Sin cuota'}
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{dateStr(c.created_at)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/cooperativas/${c.id}`}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 transition-colors"
                          >
                            Ver
                          </Link>
                          <button
                            onClick={() => setDocsCoopId(c.id)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                              c.approval_status === 'pending'
                                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400 hover:bg-brand-100'
                                : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                          >
                            {c.approval_status === 'pending' ? 'Revisar docs' : 'Ver docs'}
                          </button>
                          {c.status === 'active' && c.approval_status === 'approved' && (
                            <button
                              onClick={() => act(() => suspendCooperativa(c.id), c.id)}
                              disabled={actionLoading === c.id}
                              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400 hover:bg-orange-100 transition-colors disabled:opacity-50"
                            >
                              Suspender
                            </button>
                          )}
                          {(c.status === 'suspended' || c.status === 'inactive') && (
                            <button
                              onClick={() => act(() => activateCooperativa(c.id), c.id)}
                              disabled={actionLoading === c.id}
                              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50"
                            >
                              Activar
                            </button>
                          )}
                          {c.status !== 'active' && (
                            <button
                              onClick={() => setDeleteId(c.id)}
                              disabled={actionLoading === c.id}
                              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400 hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              Eliminar
                            </button>
                          )}
                          {actionLoading === c.id && (
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
          <div className="py-12 text-center text-sm text-gray-400">Sin cooperativas</div>
        )}

        {/* Pagination */}
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

      {/* Documents modal */}
      {docsCoopId && (() => {
        const coop = allItems.find((c) => c.id === docsCoopId);
        return coop ? (
          <CoopDocumentsModal
            cooperative={coop}
            onClose={() => setDocsCoopId(null)}
            onUpdate={load}
          />
        ) : null;
      })()}

      {/* Modal: costo mensual */}
      {feeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">Cuota mensual</h3>
            <p className="text-sm text-gray-400 mb-4">Ingresa el monto mensual en dólares</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={feeValue}
                onChange={(e) => setFeeValue(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setFeeId(null); setFeeValue(''); }} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={doSetFee}
                disabled={!feeValue || !!actionLoading}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar eliminación */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">¿Eliminar cooperativa?</h3>
            <p className="text-sm text-gray-400 mb-6">Esta acción es permanente y no se puede deshacer. Solo puedes eliminar cooperativas que no estén activas.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={doDelete}
                disabled={!!actionLoading}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: crear cooperativa */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-4">Nueva cooperativa</h3>
            <div className="space-y-3">
              {[
                { key: 'name', label: 'Nombre *', placeholder: 'Cooperativa San Andrés' },
                { key: 'ruc', label: 'RUC * (13 dígitos)', placeholder: '1790123456001' },
                { key: 'address', label: 'Dirección', placeholder: 'Av. Principal y Calle 1' },
                { key: 'phone', label: 'Teléfono', placeholder: '0999123456' },
                { key: 'commission_override', label: 'Comisión % (dejar vacío = default)', placeholder: '10' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{label}</label>
                  <input
                    type={key === 'commission_override' ? 'number' : 'text'}
                    value={createForm[key as keyof typeof createForm]}
                    onChange={(e) => setCreateForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              ))}
              {createError && (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{createError}</p>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setShowCreate(false); setCreateForm({ name: '', ruc: '', address: '', phone: '', commission_override: '' }); setCreateError(''); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={doCreate}
                disabled={createBusy || !createForm.name || createForm.ruc.length !== 13}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {createBusy ? 'Creando...' : 'Crear cooperativa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
