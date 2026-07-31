'use client';
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import TripsList from '@/features/viajes/components/TripsList';
import { createTrip } from '@/features/viajes/api';
import { getStands } from '@/features/paradas/api';
import type { Stand } from '@/types';

const EMPTY = {
  walk_in_client_name: '',
  stand_id: '',
  origin_address: '',
  origin_lat: '',
  origin_lng: '',
  destination_address: '',
  destination_lat: '',
  destination_lng: '',
  fare_mode: 'meter' as 'meter' | 'negotiated',
  client_offer: '',
};

export default function CoopViajesPage() {
  const { user } = useAuth();
  const coopId = user?.cooperative_id ?? undefined;

  const [refreshKey, setRefreshKey] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [stands, setStands] = useState<Stand[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!coopId || !showForm) return;
    getStands({ cooperative_id: coopId, limit: 100 })
      .then((r) => setStands(r.items ?? []))
      .catch(() => {});
  }, [coopId, showForm]);

  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onStandChange = (standId: string) => {
    set('stand_id', standId);
    if (standId) {
      const s = stands.find((x) => x.id === standId);
      if (s) {
        setForm((f) => ({
          ...f,
          stand_id: standId,
          origin_address: s.address ?? s.name,
          origin_lat: String(s.lat),
          origin_lng: String(s.lng),
        }));
      }
    }
  };

  const canSubmit =
    form.destination_address.trim().length >= 3 &&
    form.destination_lat &&
    form.destination_lng &&
    (form.stand_id || (form.origin_address.trim().length >= 3 && form.origin_lat && form.origin_lng)) &&
    (form.fare_mode === 'meter' || (form.fare_mode === 'negotiated' && parseFloat(form.client_offer) > 0));

  const submit = async () => {
    if (!canSubmit || !coopId) return;
    setLoading(true);
    setError('');
    try {
      await createTrip({
        cooperative_id: coopId,
        walk_in_client_name: form.walk_in_client_name.trim() || undefined,
        stand_id: form.stand_id || undefined,
        origin_address: form.stand_id ? undefined : form.origin_address.trim(),
        origin_lat: form.stand_id ? undefined : parseFloat(form.origin_lat),
        origin_lng: form.stand_id ? undefined : parseFloat(form.origin_lng),
        destination_address: form.destination_address.trim(),
        destination_lat: parseFloat(form.destination_lat),
        destination_lng: parseFloat(form.destination_lng),
        fare_mode: form.fare_mode,
        client_offer: form.fare_mode === 'negotiated' ? parseFloat(form.client_offer) : undefined,
      });
      setShowForm(false);
      setForm(EMPTY);
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Error al crear el viaje');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Viajes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Historial y viajes activos de tu cooperativa</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(''); setForm(EMPTY); }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Viaje
        </button>
      </div>

      <TripsList cooperativeId={coopId} canCancel refreshKey={refreshKey} />

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-5">Despachar viaje</h3>

              <div className="space-y-4">
                {/* Cliente */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nombre del pasajero (opcional)</label>
                  <input
                    value={form.walk_in_client_name}
                    onChange={(e) => set('walk_in_client_name', e.target.value)}
                    placeholder="Ej: Juan Pérez"
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                {/* Origen */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Origen</label>
                  {stands.length > 0 && (
                    <select
                      value={form.stand_id}
                      onChange={(e) => onStandChange(e.target.value)}
                      className="w-full mb-2 px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">— Sin parada (ingresar manualmente) —</option>
                      {stands.filter((s) => s.is_active).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                  {!form.stand_id && (
                    <div className="space-y-2">
                      <input
                        value={form.origin_address}
                        onChange={(e) => set('origin_address', e.target.value)}
                        placeholder="Dirección de origen"
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="number" step="0.000001" value={form.origin_lat} onChange={(e) => set('origin_lat', e.target.value)} placeholder="Latitud" className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        <input type="number" step="0.000001" value={form.origin_lng} onChange={(e) => set('origin_lng', e.target.value)} placeholder="Longitud" className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      </div>
                    </div>
                  )}
                  {form.stand_id && (
                    <p className="text-xs text-gray-400 mt-1">📍 {form.origin_address}</p>
                  )}
                </div>

                {/* Destino */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Destino *</label>
                  <input
                    value={form.destination_address}
                    onChange={(e) => set('destination_address', e.target.value)}
                    placeholder="Dirección de destino"
                    className="w-full mb-2 px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" step="0.000001" value={form.destination_lat} onChange={(e) => set('destination_lat', e.target.value)} placeholder="Latitud" className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    <input type="number" step="0.000001" value={form.destination_lng} onChange={(e) => set('destination_lng', e.target.value)} placeholder="Longitud" className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>

                {/* Modalidad */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Modalidad de tarifa</label>
                  <div className="flex gap-2">
                    {(['meter', 'negotiated'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => set('fare_mode', m)}
                        className={`flex-1 py-2 text-xs font-medium rounded-xl border transition-colors ${
                          form.fare_mode === m
                            ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400'
                            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        {m === 'meter' ? '⏱ Taxímetro' : '💬 Negociado'}
                      </button>
                    ))}
                  </div>
                  {form.fare_mode === 'negotiated' && (
                    <div className="mt-2">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Precio ofrecido ($)</label>
                      <input
                        type="number" min="0.01" step="0.01"
                        value={form.client_offer}
                        onChange={(e) => set('client_offer', e.target.value)}
                        placeholder="Ej: 5.50"
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  )}
                </div>

                {error && <p className="text-xs text-error-500">{error}</p>}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={submit}
                  disabled={!canSubmit || loading}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Despachando...' : 'Despachar viaje'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
