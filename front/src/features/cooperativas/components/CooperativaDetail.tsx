'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import type { Cooperative } from '@/types';
import {
  getCooperativa, approveCooperativa, rejectCooperativa,
  suspendCooperativa, activateCooperativa, setCooperativaFee, deleteCooperativa,
  updateCooperativa,
  getCooperativaMembers, addCooperativaMember, removeCooperativaMember,
  getCooperativaStands, createCooperativaStand, deleteCooperativaStand, toggleStandActivo,
  getCooperativaFleet, getCooperativaVehiculos,
  approveVehiculo, rejectVehiculo, suspendVehiculo, activateVehiculo, deleteVehiculo,
  getCooperativaSocios, aprobarSocio, rechazarSocio,
  type CoopMember, type CoopStand, type FleetDriver, type FleetResponse, type CoopVehicle, type CoopSocio,
} from '../api';
import { dateStr } from '@/lib/format';

// ── Helpers ───────────────────────────────────────────────────────────────────

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
const ROLE_LABEL: Record<string, string> = { admin: 'Admin', operator: 'Operador', supervisor: 'Supervisor' };
const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  operator: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  supervisor: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
};
const ONLINE_BADGE: Record<string, string> = {
  online: 'bg-success-50 text-success-700',
  busy: 'bg-orange-50 text-orange-700',
  offline: 'bg-gray-100 text-gray-500',
};

type Tab = 'info' | 'paradas' | 'vehiculos' | 'equipo' | 'socios' | 'flota';

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Tab: Info ─────────────────────────────────────────────────────────────────

function InfoTab({
  coop, onAction, canControl, isOwner,
}: {
  coop: Cooperative;
  onAction: (fn: () => Promise<void>) => Promise<void>;
  canControl: boolean;
  isOwner: boolean;
}) {
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [showFee, setShowFee] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [feeValue, setFeeValue] = useState(coop.monthly_fee_override != null ? String(coop.monthly_fee_override) : '');
  const [editForm, setEditForm] = useState({
    name: coop.name,
    ruc: coop.ruc,
    phone: coop.phone ?? '',
    address: coop.address ?? '',
    commission_override: coop.commission_override != null ? String(coop.commission_override) : '',
  });
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await onAction(fn); } finally { setBusy(false); }
  };

  const handleSaveEdit = async () => {
    const body: Partial<Cooperative> = {
      phone: editForm.phone.trim() || undefined,
      address: editForm.address.trim() || undefined,
      commission_override: editForm.commission_override !== '' ? parseFloat(editForm.commission_override) : null,
    };
    if (isOwner) {
      body.name = editForm.name.trim();
      body.ruc = editForm.ruc.trim();
    }
    await act(() => updateCooperativa(coop.id, body));
    setShowEdit(false);
  };

  return (
    <div className="space-y-5">
      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-400 mb-1">Estado operativo</p>
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[coop.status] ?? ''}`}>
            {coop.status === 'active' ? 'Activa' : coop.status === 'suspended' ? 'Suspendida' : 'Inactiva'}
          </span>
        </div>
        <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-400 mb-1">Aprobación</p>
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${APPROVAL_BADGE[coop.approval_status] ?? ''}`}>
            {coop.approval_status === 'approved' ? 'Aprobada' : coop.approval_status === 'pending' ? 'Pendiente' : 'Rechazada'}
          </span>
        </div>
        <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-400 mb-1">Cuota mensual</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-white">
            {coop.monthly_fee_override != null ? `$${Number(coop.monthly_fee_override).toFixed(2)}` : 'Sin cuota'}
          </p>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: 'Nombre', value: coop.name },
          { label: 'RUC', value: coop.ruc },
          { label: 'Teléfono', value: coop.phone ?? '—' },
          { label: 'Dirección', value: coop.address ?? '—' },
          { label: 'Comisión', value: coop.commission_override != null ? `${coop.commission_override}%` : 'Default' },
          { label: 'Registrada', value: dateStr(coop.created_at) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
            <p className="text-xs text-gray-400 mb-0.5">{label}</p>
            <p className="text-sm font-medium text-gray-800 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Actions — solo owner y platform_admin */}
      {canControl && <div className="flex flex-wrap gap-3 pt-2">
        {coop.approval_status === 'pending' && (
          <>
            <button
              onClick={() => act(() => approveCooperativa(coop.id))}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-success-500 text-white hover:bg-success-600 disabled:opacity-50 transition-colors"
            >
              Aprobar cooperativa
            </button>
            <button
              onClick={() => setShowReject(true)}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-error-500 text-white hover:bg-error-600 disabled:opacity-50 transition-colors"
            >
              Rechazar
            </button>
          </>
        )}
        {coop.status === 'active' && coop.approval_status === 'approved' && (
          <button
            onClick={() => act(() => suspendCooperativa(coop.id))}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            Suspender
          </button>
        )}
        {(coop.status === 'suspended' || coop.status === 'inactive') && (
          <button
            onClick={() => act(() => activateCooperativa(coop.id))}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-success-500 text-white hover:bg-success-600 disabled:opacity-50 transition-colors"
          >
            Activar
          </button>
        )}
        <button
          onClick={() => setShowFee(true)}
          disabled={busy}
          className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Editar cuota mensual
        </button>
        <button
          onClick={() => { setEditForm({ name: coop.name, ruc: coop.ruc, phone: coop.phone ?? '', address: coop.address ?? '', commission_override: coop.commission_override != null ? String(coop.commission_override) : '' }); setShowEdit(true); }}
          disabled={busy}
          className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Editar datos
        </button>
        {coop.status !== 'active' && (
          <button
            onClick={() => { if (confirm('¿Eliminar esta cooperativa permanentemente?')) act(() => deleteCooperativa(coop.id)); }}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            Eliminar
          </button>
        )}
        {busy && <Spinner />}
      </div>}

      {/* Reject modal */}
      {showReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">Rechazar cooperativa</h3>
            <p className="text-sm text-gray-400 mb-4">Indica el motivo del rechazo</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ej: Documentación incompleta..."
              rows={3}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowReject(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
              <button
                onClick={() => { act(() => rejectCooperativa(coop.id, rejectReason)); setShowReject(false); }}
                disabled={!rejectReason.trim()}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-error-500 text-white hover:bg-error-600 disabled:opacity-50 transition-colors"
              >Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Fee modal */}
      {showFee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">Cuota mensual</h3>
            <p className="text-sm text-gray-400 mb-4">Monto en dólares (0 = sin cuota)</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number" min="0" step="0.01" value={feeValue}
                onChange={(e) => setFeeValue(e.target.value)} placeholder="0.00"
                className="w-full pl-7 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowFee(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
              <button
                onClick={() => { act(() => setCooperativaFee(coop.id, parseFloat(feeValue) || 0)); setShowFee(false); }}
                disabled={!feeValue}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">Editar cooperativa</h3>
            <p className="text-sm text-gray-400 mb-5">
              {isOwner ? 'Puedes editar todos los campos.' : 'El nombre y RUC solo puede cambiarlos el propietario de la plataforma.'}
            </p>
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Nombre</label>
                {isOwner ? (
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                ) : (
                  <div className="px-3 py-2.5 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <p className="text-sm text-gray-500 dark:text-gray-400">{coop.name}</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Solicitar cambio al propietario</p>
                  </div>
                )}
              </div>
              {/* RUC */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">RUC</label>
                {isOwner ? (
                  <input
                    type="text"
                    value={editForm.ruc}
                    onChange={(e) => setEditForm(f => ({ ...f, ruc: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                ) : (
                  <div className="px-3 py-2.5 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <p className="text-sm text-gray-500 dark:text-gray-400">{coop.ruc}</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Solicitar cambio al propietario</p>
                  </div>
                )}
              </div>
              {/* Phone */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Teléfono</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="Ej: 0998765432"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              {/* Address */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Dirección</label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Ej: Av. Napo y Colón"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              {/* Commission */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Comisión (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={editForm.commission_override}
                  onChange={(e) => setEditForm(f => ({ ...f, commission_override: e.target.value }))}
                  placeholder="Dejar vacío para usar la default"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-xs text-gray-400 mt-1">Dejar vacío para usar la comisión predeterminada</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowEdit(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={busy || (isOwner && !editForm.name.trim())}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {busy ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Paradas ──────────────────────────────────────────────────────────────

function ParadasTab({ coopId }: { coopId: string }) {
  const [stands, setStands] = useState<CoopStand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', address: '', lat: '', lng: '', capacity: '10' });

  const load = useCallback(async () => {
    setLoading(true);
    try { setStands(await getCooperativaStands(coopId)); } finally { setLoading(false); }
  }, [coopId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name || !form.lat || !form.lng) return;
    setBusy('create');
    try {
      await createCooperativaStand({
        name: form.name,
        address: form.address || undefined,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        cooperative_id: coopId,
        capacity: parseInt(form.capacity) || 10,
      });
      setShowCreate(false);
      setForm({ name: '', address: '', lat: '', lng: '', capacity: '10' });
      await load();
    } finally { setBusy(null); }
  };

  const handleToggle = async (s: CoopStand) => {
    setBusy(s.id);
    try { await toggleStandActivo(s.id, !s.is_active); await load(); } finally { setBusy(null); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar parada "${name}"?`)) return;
    setBusy(id);
    try { await deleteCooperativaStand(id); await load(); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{stands.length} parada{stands.length !== 1 ? 's' : ''} registrada{stands.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Nueva parada
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}</div>
      ) : stands.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">No hay paradas. Crea la primera.</div>
      ) : (
        <div className="space-y-2">
          {stands.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <span className="text-xl">📍</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-white">{s.name}</p>
                <p className="text-xs text-gray-400">{s.address ?? `${s.lat}, ${s.lng}`} · Cap. {s.capacity}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {s.active_drivers != null && (
                  <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400 px-2 py-0.5 rounded-full">
                    {s.active_drivers} taxi{s.active_drivers !== 1 ? 's' : ''}
                  </span>
                )}
                <button
                  onClick={() => handleToggle(s)}
                  disabled={busy === s.id}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                    s.is_active
                      ? 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400 hover:bg-warning-100'
                      : 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100'
                  }`}
                >
                  {busy === s.id ? '...' : s.is_active ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  onClick={() => handleDelete(s.id, s.name)}
                  disabled={busy === s.id}
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-4">Nueva parada</h3>
            <div className="space-y-3">
              {[
                { key: 'name', label: 'Nombre *', placeholder: 'Ej: Parada La Mariscal' },
                { key: 'address', label: 'Dirección', placeholder: 'Ej: Av. Napo y Colón' },
                { key: 'lat', label: 'Latitud *', placeholder: '-0.2108' },
                { key: 'lng', label: 'Longitud *', placeholder: '-78.4934' },
                { key: 'capacity', label: 'Capacidad (taxis)', placeholder: '10' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{label}</label>
                  <input
                    type={['lat', 'lng', 'capacity'].includes(key) ? 'number' : 'text'}
                    step={['lat', 'lng'].includes(key) ? '0.0001' : undefined}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
              <button
                onClick={handleCreate}
                disabled={!!busy || !form.name || !form.lat || !form.lng}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {busy ? 'Creando...' : 'Crear parada'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Equipo ───────────────────────────────────────────────────────────────

function EquipoTab({ coopId }: { coopId: string }) {
  const [members, setMembers] = useState<CoopMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: '', full_name: '', role: 'operator' as 'admin' | 'operator' | 'supervisor' });

  const load = useCallback(async () => {
    setLoading(true);
    try { setMembers(await getCooperativaMembers(coopId)); } finally { setLoading(false); }
  }, [coopId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.email || !form.full_name) return;
    setBusy(true);
    try { await addCooperativaMember(coopId, form); setShowAdd(false); setForm({ email: '', full_name: '', role: 'operator' }); await load(); }
    finally { setBusy(false); }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar a "${name}" del equipo? Su cuenta quedará inactiva.`)) return;
    setBusy(true);
    try { await removeCooperativaMember(id); await load(); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{members.length} miembro{members.length !== 1 ? 's' : ''} del equipo</p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Agregar miembro
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}</div>
      ) : members.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">No hay miembros de equipo. Agrega el primero.</div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <span className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-700 dark:text-brand-300 flex-shrink-0">
                {m.full_name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-white">{m.full_name}</p>
                <p className="text-xs text-gray-400">{m.user?.email}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[m.role] ?? ''}`}>
                  {ROLE_LABEL[m.role] ?? m.role}
                </span>
                <button
                  onClick={() => handleRemove(m.id, m.full_name)}
                  disabled={busy}
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-4">Agregar miembro del equipo</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="correo@ejemplo.com"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Nombre completo *</label>
                <input type="text" value={form.full_name} onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Juan Pérez"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Rol</label>
                <select value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value as typeof form.role }))}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="admin">Admin — gestión total de la cooperativa</option>
                  <option value="operator">Operador — gestión de viajes y conductores</option>
                  <option value="supervisor">Supervisor — solo lectura</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
              <button
                onClick={handleAdd}
                disabled={busy || !form.email || !form.full_name}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {busy ? 'Agregando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Vehículos ────────────────────────────────────────────────────────────

const V_APPROVAL_BADGE: Record<string, string> = {
  approved: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  pending:  'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400',
  rejected: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
};
const V_STATUS_BADGE: Record<string, string> = {
  active:    'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  inactive:  'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  suspended: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
};

function VehiculosTab({ coopId }: { coopId: string }) {
  const [vehicles, setVehicles] = useState<CoopVehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCooperativaVehiculos(coopId);
      setVehicles(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch { setVehicles([]); } finally { setLoading(false); }
  }, [coopId]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try { await fn(); await load(); } finally { setBusy(null); }
  };

  const filtered = search.trim()
    ? vehicles.filter(v =>
        v.plate.toLowerCase().includes(search.toLowerCase()) ||
        v.brand.toLowerCase().includes(search.toLowerCase()) ||
        v.model.toLowerCase().includes(search.toLowerCase()) ||
        (v.owner?.full_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : vehicles;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500 dark:text-gray-400">{total} vehículo{total !== 1 ? 's' : ''}</p>
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
          </svg>
          <input type="text" placeholder="Buscar placa, marca, conductor..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 w-52"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">{[0,1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">
          {search ? `Sin resultados para "${search}"` : 'No hay vehículos en esta cooperativa.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => (
            <div key={v.id} className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">🚖</span>
                <div className="flex-1 min-w-0">
                  {/* Info row */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white">{v.plate}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${V_APPROVAL_BADGE[v.approval_status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {v.approval_status === 'approved' ? 'Aprobado' : v.approval_status === 'pending' ? 'Pendiente' : 'Rechazado'}
                    </span>
                    {v.status && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${V_STATUS_BADGE[v.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {v.status === 'active' ? 'Activo' : v.status === 'suspended' ? 'Suspendido' : 'Inactivo'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {v.brand} {v.model}{v.year ? ` · ${v.year}` : ''}{v.color ? ` · ${v.color}` : ''}
                    {v.owner ? ` · Dueño: ${v.owner.full_name}` : ''}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                    {v.approval_status === 'pending' && (
                      <>
                        <button onClick={() => act(v.id, () => approveVehiculo(v.id))} disabled={busy === v.id}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50">
                          Aprobar
                        </button>
                        <button onClick={() => { setRejectTarget(v.id); setRejectReason(''); }} disabled={busy === v.id}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400 hover:bg-error-100 transition-colors disabled:opacity-50">
                          Rechazar
                        </button>
                      </>
                    )}
                    {v.approval_status === 'approved' && v.status !== 'suspended' && (
                      <button onClick={() => act(v.id, () => suspendVehiculo(v.id))} disabled={busy === v.id}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400 hover:bg-orange-100 transition-colors disabled:opacity-50">
                        Suspender
                      </button>
                    )}
                    {v.status === 'suspended' && (
                      <button onClick={() => act(v.id, () => activateVehiculo(v.id))} disabled={busy === v.id}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50">
                        Activar
                      </button>
                    )}
                    {v.status !== 'active' && (
                      <button onClick={() => { if (confirm(`¿Eliminar vehículo ${v.plate}?`)) act(v.id, () => deleteVehiculo(v.id)); }} disabled={busy === v.id}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400 hover:bg-red-100 transition-colors disabled:opacity-50">
                        Eliminar
                      </button>
                    )}
                    {busy === v.id && <Spinner />}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">Rechazar vehículo</h3>
            <p className="text-sm text-gray-400 mb-4">Indica el motivo del rechazo</p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ej: Documentación incompleta..." rows={3}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setRejectTarget(null)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
              <button
                onClick={() => { const id = rejectTarget; setRejectTarget(null); act(id, () => rejectVehiculo(id, rejectReason)); }}
                disabled={!rejectReason.trim()}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-error-500 text-white hover:bg-error-600 disabled:opacity-50 transition-colors">
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Socios (owner-drivers vinculados) ────────────────────────────────────

const SOCIO_STATUS_BADGE: Record<string, string> = {
  approved: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  pending:  'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400',
  rejected: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
};

function SociosTab({ coopId }: { coopId: string }) {
  const [subTab, setSubTab] = useState<'pending' | 'approved'>('pending');
  const [socios, setSocios] = useState<CoopSocio[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCooperativaSocios(coopId, subTab);
      setSocios(res.items ?? []);
    } catch { setSocios([]); } finally { setLoading(false); }
  }, [coopId, subTab]);

  useEffect(() => { load(); }, [load]);

  const act = async (driverId: string, fn: () => Promise<void>) => {
    setBusy(driverId);
    try { await fn(); await load(); } finally { setBusy(null); }
  };

  const pendingCount = subTab === 'pending' ? socios.length : 0;

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {([
          { key: 'pending', label: 'Pendientes' },
          { key: 'approved', label: 'Aprobados' },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-colors ${subTab === t.key ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {t.label}
            {t.key === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-xs font-bold rounded-full bg-orange-500 text-white">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Info banner */}
      {subTab === 'pending' && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs">
          <span className="text-sm mt-0.5">ℹ️</span>
          <span>Conductores-dueños que solicitaron unirse como socios. Al aprobarlos podrán registrar sus taxis en esta cooperativa.</span>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}</div>
      ) : socios.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">
          {subTab === 'pending' ? 'No hay solicitudes pendientes de socios.' : 'No hay socios aprobados aún.'}
        </div>
      ) : (
        <div className="space-y-2">
          {socios.map((s) => (
            <div key={s.id} className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-700 dark:text-brand-300 flex-shrink-0">
                  {s.owner.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white">{s.owner.full_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOCIO_STATUS_BADGE[s.approval_status]}`}>
                      {s.approval_status === 'approved' ? 'Socio aprobado' : s.approval_status === 'pending' ? 'Solicitud pendiente' : 'Rechazado'}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {s.owner.driver_type === 'owner_driver' ? 'Propietario' : 'Conductor'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{s.owner.user.email}</p>
                  {s.owner.license_number && <p className="text-xs text-gray-400 mt-0.5">Lic. {s.owner.license_number}</p>}
                  {s.rejection_reason && (
                    <p className="text-xs text-error-600 dark:text-error-400 mt-1">Motivo rechazo: {s.rejection_reason}</p>
                  )}
                  <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Solicitó: {dateStr(s.created_at)}</p>

                  {/* Actions */}
                  {s.approval_status === 'pending' && (
                    <div className="flex items-center gap-1.5 mt-2.5">
                      <button onClick={() => act(s.owner.id, () => aprobarSocio(s.owner.id, coopId))} disabled={busy === s.owner.id}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50">
                        Aprobar socio
                      </button>
                      <button onClick={() => { setRejectTarget(s.owner.id); setRejectReason(''); }} disabled={busy === s.owner.id}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400 hover:bg-error-100 transition-colors disabled:opacity-50">
                        Rechazar
                      </button>
                      {busy === s.owner.id && <Spinner />}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">Rechazar solicitud de socio</h3>
            <p className="text-sm text-gray-400 mb-4">Indica el motivo del rechazo</p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ej: Documentos incompletos..." rows={3}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setRejectTarget(null)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
              <button
                onClick={() => { const id = rejectTarget; setRejectTarget(null); act(id, () => rechazarSocio(id, coopId, rejectReason)); }}
                disabled={!rejectReason.trim()}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-error-500 text-white hover:bg-error-600 disabled:opacity-50 transition-colors">
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Flota ────────────────────────────────────────────────────────────────

function FlotaTab({ coopId }: { coopId: string }) {
  const [fleet, setFleet] = useState<FleetResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setFleet(await getCooperativaFleet(coopId)); } catch { setFleet(null); } finally { setLoading(false); }
  }, [coopId]);

  useEffect(() => { load(); }, [load]);

  const drivers = fleet?.drivers ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span>{fleet?.total ?? 0} en línea</span>
          <span className="text-success-600 dark:text-success-400">● {fleet?.online ?? 0} libre{fleet?.online !== 1 ? 's' : ''}</span>
          <span className="text-orange-500">● {fleet?.busy ?? 0} en viaje</span>
        </div>
        <button onClick={load} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">Actualizar</button>
      </div>

      {loading ? (
        <div className="space-y-2">{[0,1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}</div>
      ) : drivers.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">No hay conductores en línea en este momento.</div>
      ) : (
        <div className="space-y-2">
          {drivers.map((d) => (
            <div key={d.driver_id} className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <span className="text-xl">{d.active_trip_id ? '🚖' : '🚕'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-white">{d.driver_name}</p>
                <p className="text-xs text-gray-400">
                  {d.vehicle ? `${d.vehicle.brand} ${d.vehicle.model} · ${d.vehicle.plate}` : 'Sin vehículo activo'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {d.active_trip_id && (
                  <span className="text-xs bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400 px-2 py-0.5 rounded-full">En viaje</span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${ONLINE_BADGE[d.online_status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {d.online_status === 'online' ? 'Libre' : d.online_status === 'busy' ? 'Ocupado' : 'Offline'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CooperativaDetail({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [coop, setCoop] = useState<Cooperative | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('info');

  const canControl = user?.role === 'owner' || user?.role === 'platform_admin';
  const isOwner = user?.role === 'owner';

  const loadCoop = useCallback(async () => {
    setLoading(true);
    try { setCoop(await getCooperativa(id)); } catch { router.push('/cooperativas'); } finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => { loadCoop(); }, [loadCoop]);

  const onAction = useCallback(async (fn: () => Promise<void>) => {
    await fn();
    await loadCoop();
  }, [loadCoop]);

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'info', label: 'Información', icon: '📋' },
    { key: 'socios', label: 'Socios', icon: '🤝' },
    { key: 'vehiculos', label: 'Vehículos', icon: '🚖' },
    { key: 'paradas', label: 'Paradas', icon: '📍' },
    { key: 'equipo', label: 'Equipo', icon: '👥' },
    { key: 'flota', label: 'Flota online', icon: '📡' },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
    );
  }

  if (!coop) return null;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <button onClick={() => router.push('/cooperativas')} className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          Cooperativas
        </button>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        <span className="text-gray-700 dark:text-gray-200 font-medium">{coop.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-14 h-14 rounded-2xl bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-2xl font-bold text-brand-700 dark:text-brand-300 flex-shrink-0">
          {coop.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">{coop.name}</h1>
          <p className="text-sm text-gray-400">RUC: {coop.ruc}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[coop.status] ?? ''}`}>
              {coop.status === 'active' ? 'Activa' : coop.status === 'suspended' ? 'Suspendida' : 'Inactiva'}
            </span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${APPROVAL_BADGE[coop.approval_status] ?? ''}`}>
              {coop.approval_status === 'approved' ? 'Aprobada' : coop.approval_status === 'pending' ? 'Pendiente aprobación' : 'Rechazada'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {tab === 'info' && <InfoTab coop={coop} onAction={onAction} canControl={canControl} isOwner={isOwner} />}
        {tab === 'socios' && <SociosTab coopId={id} />}
        {tab === 'vehiculos' && <VehiculosTab coopId={id} />}
        {tab === 'paradas' && <ParadasTab coopId={id} />}
        {tab === 'equipo' && <EquipoTab coopId={id} />}
        {tab === 'flota' && <FlotaTab coopId={id} />}
      </div>
    </div>
  );
}
