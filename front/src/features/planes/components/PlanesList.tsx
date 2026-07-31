'use client';
import React, { useState, useEffect, useCallback } from 'react';
import type { Plan } from '@/types';
import { getPlanes, createPlan, updatePlan, deletePlan, togglePlanStatus } from '../api';

const DEFAULT_FEATURES = [
  'Mapa en tiempo real',
  'Modo taxímetro',
  'Modo negociado',
  'SOS integrado',
  'Paradas (stands)',
  'Reportes básicos',
  'Reportes avanzados',
  'API personalizada',
  'Soporte prioritario',
  'Marca blanca',
];

type FormData = {
  name: string;
  description: string;
  price_monthly: string;
  price_yearly: string;
  commission_pct: string;
  max_drivers: string;
  max_vehicles: string;
  max_stands: string;
  features: string[];
  is_active: boolean;
};

const EMPTY_FORM: FormData = {
  name: '',
  description: '',
  price_monthly: '',
  price_yearly: '',
  commission_pct: '',
  max_drivers: '',
  max_vehicles: '',
  max_stands: '',
  features: [],
  is_active: true,
};

function planToForm(p: Plan): FormData {
  return {
    name: p.name,
    description: p.description ?? '',
    price_monthly: String(p.price_monthly),
    price_yearly: p.price_yearly != null ? String(p.price_yearly) : '',
    commission_pct: String(p.commission_pct),
    max_drivers: p.max_drivers != null ? String(p.max_drivers) : '',
    max_vehicles: p.max_vehicles != null ? String(p.max_vehicles) : '',
    max_stands: p.max_stands != null ? String(p.max_stands) : '',
    features: p.features ?? [],
    is_active: p.is_active,
  };
}

function formToPayload(f: FormData) {
  return {
    name: f.name.trim(),
    description: f.description.trim() || null,
    price_monthly: parseFloat(f.price_monthly) || 0,
    price_yearly: f.price_yearly ? parseFloat(f.price_yearly) : null,
    commission_pct: parseFloat(f.commission_pct) || 0,
    max_drivers: f.max_drivers ? parseInt(f.max_drivers) : null,
    max_vehicles: f.max_vehicles ? parseInt(f.max_vehicles) : null,
    max_stands: f.max_stands ? parseInt(f.max_stands) : null,
    features: f.features,
    is_active: f.is_active,
  };
}

export default function PlanesList() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlans(await getPlanes());
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm(planToForm(p));
    setError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return; }
    if (!form.price_monthly) { setError('El precio mensual es obligatorio'); return; }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updatePlan(editing.id, formToPayload(form));
      } else {
        await createPlan(formToPayload(form));
      }
      setModalOpen(false);
      await load();
    } catch {
      setError('Error al guardar el plan. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await deletePlan(deleteConfirm.id);
      setDeleteConfirm(null);
      await load();
    } catch {
      // keep modal open on error
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async (p: Plan) => {
    setActionLoading(p.id);
    try {
      await togglePlanStatus(p.id, !p.is_active);
      await load();
    } finally {
      setActionLoading(null);
    }
  };

  const toggleFeature = (f: string) => {
    setForm((prev) => ({
      ...prev,
      features: prev.features.includes(f)
        ? prev.features.filter((x) => x !== f)
        : [...prev.features, f],
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {loading ? '...' : `${plans.length} planes configurados`}
        </p>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo plan
        </button>
      </div>

      {/* Plans grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 animate-pulse">
              <div className="h-5 w-32 rounded bg-gray-100 dark:bg-gray-800 mb-3" />
              <div className="h-8 w-24 rounded bg-gray-100 dark:bg-gray-800 mb-4" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((__, j) => (
                  <div key={j} className="h-3 rounded bg-gray-100 dark:bg-gray-800" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sin planes creados</p>
          <p className="text-xs text-gray-400 mb-4">Crea el primer plan para que las cooperativas puedan suscribirse</p>
          <button onClick={openCreate} className="px-4 py-2 text-sm font-medium rounded-xl bg-brand-500 text-white hover:bg-brand-600 transition-colors">
            Crear primer plan
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {plans.map((p) => (
            <div key={p.id} className={`rounded-2xl border bg-white dark:bg-gray-900 p-6 flex flex-col gap-4 transition-all ${p.is_active ? 'border-gray-200 dark:border-gray-800' : 'border-gray-100 dark:border-gray-800/50 opacity-60'}`}>
              {/* Plan header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-bold text-gray-800 dark:text-white">{p.name}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.is_active ? 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                      {p.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  {p.description && <p className="text-xs text-gray-400 leading-relaxed">{p.description}</p>}
                </div>
              </div>

              {/* Pricing */}
              <div className="flex items-end gap-1">
                <span className="text-3xl font-bold text-gray-800 dark:text-white">${Number(p.price_monthly).toFixed(2)}</span>
                <span className="text-sm text-gray-400 mb-1">/mes</span>
              </div>
              {p.price_yearly && (
                <p className="text-xs text-brand-600 dark:text-brand-400 -mt-2">
                  ${Number(p.price_yearly).toFixed(2)}/año · ahorra {Math.round((1 - p.price_yearly / (p.price_monthly * 12)) * 100)}%
                </p>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 py-3 border-y border-gray-100 dark:border-gray-800">
                {[
                  { label: 'Comisión', value: `${p.commission_pct}%` },
                  { label: 'Conductores', value: p.max_drivers != null ? String(p.max_drivers) : '∞' },
                  { label: 'Vehículos', value: p.max_vehicles != null ? String(p.max_vehicles) : '∞' },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-sm font-bold text-gray-800 dark:text-white">{s.value}</p>
                    <p className="text-xs text-gray-400">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Features */}
              {p.features?.length > 0 && (
                <ul className="space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <svg className="w-3.5 h-3.5 text-success-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              )}

              {/* Coop count */}
              {p.cooperative_count != null && (
                <p className="text-xs text-gray-400">
                  {p.cooperative_count} cooperativa{p.cooperative_count !== 1 ? 's' : ''} suscritas
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-auto pt-2">
                <button
                  onClick={() => openEdit(p)}
                  className="flex-1 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleToggle(p)}
                  disabled={actionLoading === p.id}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${p.is_active ? 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400 hover:bg-warning-100' : 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100'}`}
                >
                  {actionLoading === p.id ? '...' : p.is_active ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  onClick={() => setDeleteConfirm(p)}
                  className="px-3 py-2 text-xs font-medium rounded-lg bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400 hover:bg-error-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-8 px-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-800 dark:text-white">
                {editing ? 'Editar plan' : 'Nuevo plan SaaS'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Basic info */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre del plan *</label>
                  <input
                    type="text"
                    placeholder="Ej: Básico, Profesional, Enterprise"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Descripción</label>
                  <textarea
                    placeholder="Descripción breve del plan..."
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  />
                </div>
              </div>

              {/* Pricing */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Precios</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Precio mensual (USD) *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                      <input type="number" step="0.01" min="0" placeholder="0.00" value={form.price_monthly} onChange={(e) => setForm((p) => ({ ...p, price_monthly: e.target.value }))}
                        className="w-full pl-7 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Precio anual (USD)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                      <input type="number" step="0.01" min="0" placeholder="0.00" value={form.price_yearly} onChange={(e) => setForm((p) => ({ ...p, price_yearly: e.target.value }))}
                        className="w-full pl-7 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Comisión plataforma (%)</label>
                    <div className="relative">
                      <input type="number" step="0.1" min="0" max="100" placeholder="0.0" value={form.commission_pct} onChange={(e) => setForm((p) => ({ ...p, commission_pct: e.target.value }))}
                        className="w-full pl-3 pr-7 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Limits */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Límites <span className="font-normal normal-case text-gray-400">(vacío = ilimitado)</span></p>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Conductores', key: 'max_drivers' as const },
                    { label: 'Vehículos', key: 'max_vehicles' as const },
                    { label: 'Paradas', key: 'max_stands' as const },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
                      <input type="number" min="0" placeholder="∞" value={form[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Features */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Funciones habilitadas</p>
                <div className="grid grid-cols-2 gap-2">
                  {DEFAULT_FEATURES.map((f) => (
                    <label key={f} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={form.features.includes(f)}
                        onChange={() => toggleFeature(f)}
                        className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                      />
                      <span className="text-xs text-gray-700 dark:text-gray-300 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{f}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-gray-50 dark:bg-gray-800">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Plan activo</p>
                  <p className="text-xs text-gray-400">Las cooperativas pueden suscribirse a este plan</p>
                </div>
                <button
                  onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.is_active ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {error && <p className="text-xs text-error-600 dark:text-error-400">{error}</p>}
            </div>

            <div className="flex gap-3 px-6 py-5 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {saving && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="text-3xl mb-3">⚠️</div>
            <h3 className="text-base font-bold text-gray-800 dark:text-white mb-1">Eliminar plan</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              ¿Estás seguro de eliminar <strong>{deleteConfirm.name}</strong>? Las cooperativas con este plan activo podrían verse afectadas.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-error-500 text-white hover:bg-error-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {deleting && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
