'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { dateStr } from '@/lib/format';
import type { Driver } from '@/types';
import { getDrivers, blockDriver, unblockDriver, deleteDriver, adminOtpLookup, type OtpLookupResult } from '../api';
import DriverDocumentsModal from './DriverDocumentsModal';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

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
  online: 'Activo',
  busy: 'En viaje',
  looking_for_work: 'Buscando',
  offline: 'Inactivo',
};

const TYPE_LABEL: Record<string, string> = { driver: 'Conductor', owner_driver: 'Propietario' };

function OtpLookup() {
  const [phone, setPhone]     = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<OtpLookupResult | null>(null);
  const [error, setError]     = useState('');

  async function lookup() {
    if (!phone.trim()) return;
    setLoading(true); setResult(null); setError('');
    try {
      const full = phone.startsWith('+') ? phone : `+593${phone.replace(/^0/, '')}`;
      setResult(await adminOtpLookup(full));
    } catch {
      setError('Error al consultar. Verifica el número.');
    } finally {
      setLoading(false);
    }
  }

  const expiresIn = result?.expires_at
    ? Math.max(0, Math.floor((new Date(result.expires_at).getTime() - Date.now()) / 1000))
    : 0;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🔐</span>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Consultar OTP de conductor</h2>
        <span className="ml-auto text-xs text-gray-400">Soporte — registro o recuperación de contraseña</span>
      </div>
      <div className="flex gap-2">
        <input
          type="tel"
          placeholder="Ej: 0987216789 o +593987216789"
          value={phone}
          onChange={e => { setPhone(e.target.value); setResult(null); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && lookup()}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          onClick={lookup}
          disabled={loading || !phone.trim()}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {result && !result.found && (
        <p className="mt-3 text-sm text-gray-500">No hay OTP pendiente para ese número (ya verificó, número no registrado, o el código expiró hace tiempo).</p>
      )}
      {result?.found && (
        <div className={`mt-3 flex items-center gap-3 p-3 rounded-lg ${result.expired ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'}`}>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Código OTP</p>
            <p className="text-2xl font-bold tracking-widest text-gray-900 dark:text-white font-mono">{result.otp_code}</p>
            {result.expired
              ? <p className="text-xs text-red-500 mt-0.5">Código expirado — pide al conductor que reenvíe</p>
              : <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Válido por {expiresIn}s más</p>
            }
          </div>
          <a
            href={`https://wa.me/593${result.phone?.replace(/^\+593/, '').replace(/^0/, '')}?text=Hola, tu código OTP de Pana Taxi es: ${result.otp_code}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] text-white text-xs font-medium hover:bg-[#1ebe5d] transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Enviar por WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}

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
  const [actionError, setActionError] = useState<string | null>(null);
  const [docsDriverId, setDocsDriverId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
  useRealtimeRefresh(['driver.registered', 'driver.approved', 'driver.rejected', 'driver.online_status_changed'], load);

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
      <OtpLookup />
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
            {loading ? '...' : `${total} conductores`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {['Conductor', 'Tipo', 'Lic. / Caduca', 'Estado', 'En línea', 'Registrado', 'Acciones'].map((h) => (
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
                          {d.profile_photo_url ? (
                            <img
                              src={d.profile_photo_url}
                              alt={d.full_name}
                              className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-700 dark:text-brand-300 flex-shrink-0">
                              {d.full_name?.charAt(0).toUpperCase() ?? '?'}
                            </div>
                          )}
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
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400">
                        <p>{d.license_number ?? '—'}</p>
                        {d.license_expiry && (() => {
                          const exp = new Date(d.license_expiry);
                          const daysLeft = Math.ceil((exp.getTime() - Date.now()) / 86_400_000);
                          const cls = daysLeft < 0
                            ? 'text-red-500 dark:text-red-400 font-medium'
                            : daysLeft <= 60
                            ? 'text-orange-500 dark:text-orange-400 font-medium'
                            : 'text-gray-400';
                          return (
                            <p className={`text-xs ${cls}`}>
                              {daysLeft < 0 ? '⚠ Vencida ' : daysLeft <= 60 ? '⚠ Vence ' : 'Vence '}{dateStr(d.license_expiry)}
                            </p>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${APPROVAL_BADGE[d.approval_status] ?? ''}`}>
                            {d.approval_status === 'approved' ? 'Aprobado' : d.approval_status === 'pending' ? 'Pendiente' : 'Rechazado'}
                          </span>
                          {d.user?.status === 'suspended' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">
                              Bloqueado
                            </span>
                          )}
                        </div>
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
                          {/* Documentos — abre modal con revisión y aprobación integrada */}
                          <button
                            onClick={() => setDocsDriverId(d.id)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                              d.approval_status === 'pending'
                                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400 hover:bg-brand-100'
                                : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                          >
                            {d.approval_status === 'pending' ? 'Revisar docs' : 'Ver docs'}
                          </button>
                          {d.user?.status !== 'suspended' ? (
                            <button onClick={() => act(() => blockDriver(d.id), d.id)} disabled={actionLoading === d.id} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400 hover:bg-orange-100 transition-colors disabled:opacity-50">
                              Bloquear
                            </button>
                          ) : (
                            <button onClick={() => act(() => unblockDriver(d.id), d.id)} disabled={actionLoading === d.id} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50">
                              Desbloquear
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteId(d.id)}
                            disabled={actionLoading === d.id}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400 hover:bg-red-100 transition-colors disabled:opacity-50"
                          >
                            Eliminar
                          </button>
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

      {/* Documents modal */}
      {docsDriverId && (
        <DriverDocumentsModal
          driverId={docsDriverId}
          onClose={() => setDocsDriverId(null)}
          onUpdate={load}
        />
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-999999 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setDeleteId(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">¿Eliminar conductor?</h3>
            <p className="text-sm text-gray-400 mb-6">Esta acción es permanente. El conductor y su cuenta serán eliminados del sistema.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const id = deleteId;
                  setDeleteId(null);
                  await act(() => deleteDriver(id), id);
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
