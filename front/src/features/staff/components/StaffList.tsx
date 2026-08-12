'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { dateStr } from '@/lib/format';
import type { PlatformMember, UserRole } from '@/types';
import { getStaff, inviteStaff, deleteStaff } from '../api';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'platform_admin', label: 'Admin Plataforma' },
  { value: 'finance', label: 'Finanzas' },
  { value: 'monitoring', label: 'Monitoreo' },
  { value: 'support', label: 'Soporte' },
];

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400',
  platform_admin: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  finance: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  monitoring: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  support: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
};

export default function StaffList() {
  const [items, setItems] = useState<PlatformMember[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', full_name: '', role: 'support' as UserRole });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getStaff(page);
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const doInvite = async () => {
    if (!form.email || !form.full_name) return;
    setInviteLoading(true);
    try {
      await inviteStaff(form);
      setShowInvite(false);
      setForm({ email: '', full_name: '', role: 'support' });
      await load();
    } finally {
      setInviteLoading(false);
    }
  };

  const doDelete = async () => {
    if (!deleteId) return;
    try { await deleteStaff(deleteId); await load(); } finally { setDeleteId(null); }
  };

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => setShowInvite(true)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Invitar miembro
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <p className="text-sm font-semibold text-gray-800 dark:text-white">{loading ? '...' : `${total} miembros`}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {['Miembro', 'Rol', 'Registrado', 'Acciones'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                      {Array.from({ length: 4 }).map((__, j) => (
                        <td key={j} className="px-5 py-3.5"><div className="h-3.5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : items.map((m) => (
                    <tr key={m.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-700 dark:text-brand-300">
                            {m.full_name?.charAt(0).toUpperCase() ?? '?'}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 dark:text-white">{m.full_name}</p>
                            <p className="text-xs text-gray-400">{m.user?.email ?? '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[m.role] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ROLE_OPTIONS.find(r => r.value === m.role)?.label ?? m.role}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400">{dateStr(m.created_at)}</td>
                      <td className="px-5 py-3.5">
                        {m.role !== 'owner' && (
                          <button onClick={() => setDeleteId(m.id)} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400 hover:bg-error-100 transition-colors">
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!loading && items.length === 0 && <div className="py-12 text-center text-sm text-gray-400">Sin miembros de staff</div>}
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400">{total} registros · página {page} de {pages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">Anterior</button>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-999999 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowInvite(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-4">Invitar miembro de staff</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Nombre completo" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <input type="email" placeholder="Correo electrónico" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))} className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowInvite(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
              <button onClick={doInvite} disabled={!form.email || !form.full_name || inviteLoading} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50">
                {inviteLoading ? 'Invitando...' : 'Invitar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteId && (
        <div className="fixed inset-0 z-999999 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setDeleteId(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-2">Eliminar miembro</h3>
            <p className="text-sm text-gray-400 mb-6">¿Confirmar la eliminación del miembro?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">Cancelar</button>
              <button onClick={doDelete} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-error-500 text-white hover:bg-error-600">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
