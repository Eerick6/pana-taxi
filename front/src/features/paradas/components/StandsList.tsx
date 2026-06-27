'use client';
import React, { useState, useEffect, useCallback } from 'react';
import type { Stand } from '@/types';
import { useCoop } from '@/context/CoopContext';
import { getStands, deleteStand, createStand } from '../api';

const EMPTY_FORM = { name: '', address: '', lat: '', lng: '', capacity: '20' };

export default function StandsList() {
  const { selectedCoop } = useCoop();
  const coopId = selectedCoop?.id;

  const [items, setItems] = useState<Stand[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getStands({ cooperative_id: coopId });
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [coopId]);

  useEffect(() => { load(); }, [load]);

  const doDelete = async () => {
    if (!deleteId) return;
    setActionLoading(deleteId);
    try { await deleteStand(deleteId); await load(); } finally { setActionLoading(null); setDeleteId(null); }
  };

  const doCreate = async () => {
    if (!form.name.trim() || !form.lat || !form.lng || !coopId) return;
    setCreateLoading(true);
    try {
      await createStand({
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        capacity: parseInt(form.capacity) || 20,
        cooperative_id: coopId,
      });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      await load();
    } catch { /* silent */ }
    finally { setCreateLoading(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {coopId ? `Paradas de ${selectedCoop?.name}` : 'Selecciona una cooperativa para gestionar sus paradas'}
        </p>
        {coopId && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nueva Parada
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 animate-pulse">
                <div className="h-5 w-32 rounded bg-gray-100 dark:bg-gray-800 mb-3" />
                <div className="h-3 w-24 rounded bg-gray-100 dark:bg-gray-800 mb-2" />
                <div className="h-3 w-20 rounded bg-gray-100 dark:bg-gray-800" />
              </div>
            ))
          : items.map((s) => (
              <div key={s.id} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📍</span>
                    <div>
                      <p className="font-semibold text-gray-800 dark:text-white">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.cooperative?.name ?? '—'}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.is_active ? 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                    {s.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>

                {s.address && <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{s.address}</p>}

                <div className="flex items-center gap-4 text-xs text-gray-400 mb-4">
                  <span>Cap: <strong className="text-gray-600 dark:text-gray-300">{s.capacity}</strong></span>
                  <span>Lat: <strong className="text-gray-600 dark:text-gray-300">{Number(s.lat).toFixed(4)}</strong></span>
                  <span>Lng: <strong className="text-gray-600 dark:text-gray-300">{Number(s.lng).toFixed(4)}</strong></span>
                </div>

                <button
                  onClick={() => setDeleteId(s.id)}
                  className="w-full py-1.5 text-xs font-medium rounded-lg border border-error-200 dark:border-error-800 text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-500/10 transition-colors"
                >
                  Eliminar
                </button>
              </div>
            ))}
      </div>

      {!loading && items.length === 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-16 text-center">
          <span className="text-4xl">📍</span>
          <p className="text-gray-400 mt-3">Sin paradas registradas</p>
          {!coopId && <p className="text-xs text-gray-400 mt-1">Selecciona una cooperativa para ver sus paradas</p>}
        </div>
      )}

      {!loading && total > 0 && (
        <p className="text-xs text-gray-400">{total} paradas registradas</p>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-4">Nueva Parada</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nombre *</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ej: Parada Central" className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Dirección</label>
                <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Ej: Av. Amazonas y Colón" className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Latitud *</label>
                  <input type="number" step="0.000001" value={form.lat} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))} placeholder="-0.1807" className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Longitud *</label>
                  <input type="number" step="0.000001" value={form.lng} onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))} placeholder="-78.4678" className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Capacidad</label>
                <input type="number" min="1" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); }} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
              <button onClick={doCreate} disabled={!form.name.trim() || !form.lat || !form.lng || createLoading} className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors">
                {createLoading ? 'Creando...' : 'Crear parada'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-2">Eliminar parada</h3>
            <p className="text-sm text-gray-400 mb-6">¿Estás seguro? Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
              <button onClick={doDelete} disabled={!!actionLoading} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-error-500 text-white hover:bg-error-600 disabled:opacity-50 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
