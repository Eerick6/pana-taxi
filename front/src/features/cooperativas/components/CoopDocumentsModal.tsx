'use client';
import React, { useEffect, useState } from 'react';
import type { Cooperative } from '@/types';
import {
  getCoopDocuments,
  getCoopDocumentUrl,
  approveCoopDocument,
  rejectCoopDocument,
  approveCooperativa,
  rejectCooperativa,
  getCoopFareConfig,
  setCoopFareConfig,
  type CoopDocument,
} from '../api';

// Doc types that must be approved before approving the cooperative
const REQUIRED_TYPES = ['ruc', 'ant_permit'];

const TYPE_LABEL: Record<string, string> = {
  ruc: 'RUC de la cooperativa',
  ant_permit: 'Permiso de operación ANT/GADM',
  seps_resolution: 'Resolución SEPS',
  statutes: 'Estatutos',
  representative_id: 'Cédula del representante',
  representative_appointment: 'Nombramiento del representante',
  other: 'Otro',
};

const STATUS_BADGE: Record<string, string> = {
  approved: 'bg-green-500/15 text-green-400 border-green-500/20',
  rejected: 'bg-red-500/15 text-red-400 border-red-500/20',
  pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
};

const STATUS_LABEL: Record<string, string> = {
  approved: 'Aprobado',
  rejected: 'Rechazado',
  pending: 'Pendiente',
};

interface Props {
  cooperative: Cooperative;
  onClose: () => void;
  onUpdate: () => void;
}

export default function CoopDocumentsModal({ cooperative, onClose, onUpdate }: Props) {
  const [docs, setDocs] = useState<CoopDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Reject doc sub-modal
  const [rejectDocId, setRejectDocId] = useState<string | null>(null);
  const [rejectDocReason, setRejectDocReason] = useState('');
  const [rejectDocLoading, setRejectDocLoading] = useState(false);

  // Reject cooperative sub-modal
  const [rejectCoopOpen, setRejectCoopOpen] = useState(false);
  const [rejectCoopReason, setRejectCoopReason] = useState('');
  const [rejectCoopLoading, setRejectCoopLoading] = useState(false);
  const [coopActionLoading, setCoopActionLoading] = useState(false);

  // Fare config step (shown before approving)
  const [fareStep, setFareStep] = useState(false);
  const [fareLoading, setFareLoading] = useState(false);
  const [fareValues, setFareValues] = useState({
    base_fare: '0.50',
    price_per_km: '0.4000',
    price_per_minute: '0.1000',
    minimum_fare: '1.50',
    night_price_per_km: '0.4500',
    night_minimum_fare: '1.70',
    night_start_hour: '22',
    night_end_hour: '6',
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await getCoopDocuments(cooperative.id);
      setDocs(data);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [cooperative.id]);

  const openUrl = async (docId: string) => {
    setViewLoading(docId);
    try {
      const url = await getCoopDocumentUrl(cooperative.id, docId);
      setViewUrl(url);
    } finally {
      setViewLoading(null);
    }
  };

  const approveDoc = async (docId: string) => {
    setActionLoading(docId);
    try { await approveCoopDocument(cooperative.id, docId); await load(); } finally { setActionLoading(null); }
  };

  const rejectDoc = async () => {
    if (!rejectDocId) return;
    setRejectDocLoading(true);
    try {
      await rejectCoopDocument(cooperative.id, rejectDocId, rejectDocReason);
      setRejectDocId(null);
      setRejectDocReason('');
      await load();
    } finally {
      setRejectDocLoading(false);
    }
  };

  const enterFareStep = async () => {
    setFareLoading(true);
    try {
      const cfg = await getCoopFareConfig(cooperative.id);
      setFareValues({
        base_fare: String(cfg.base_fare),
        price_per_km: String(cfg.price_per_km),
        price_per_minute: String(cfg.price_per_minute),
        minimum_fare: String(cfg.minimum_fare),
        night_price_per_km: String(cfg.night_price_per_km),
        night_minimum_fare: String(cfg.night_minimum_fare),
        night_start_hour: String(cfg.night_start_hour),
        night_end_hour: String(cfg.night_end_hour),
      });
    } catch { /* keep defaults */ }
    setFareLoading(false);
    setFareStep(true);
  };

  const approveCoop = async () => {
    setCoopActionLoading(true);
    try {
      await setCoopFareConfig(cooperative.id, {
        base_fare: parseFloat(fareValues.base_fare),
        price_per_km: parseFloat(fareValues.price_per_km),
        price_per_minute: parseFloat(fareValues.price_per_minute),
        minimum_fare: parseFloat(fareValues.minimum_fare),
        night_price_per_km: parseFloat(fareValues.night_price_per_km),
        night_minimum_fare: parseFloat(fareValues.night_minimum_fare),
        night_start_hour: parseInt(fareValues.night_start_hour),
        night_end_hour: parseInt(fareValues.night_end_hour),
      });
      await approveCooperativa(cooperative.id);
      window.dispatchEvent(new Event('coop-updated'));
      onUpdate();
      onClose();
    } finally { setCoopActionLoading(false); }
  };

  const rejectCoop = async () => {
    setRejectCoopLoading(true);
    try {
      await rejectCooperativa(cooperative.id, rejectCoopReason);
      window.dispatchEvent(new Event('coop-updated'));
      onUpdate();
      onClose();
    } finally {
      setRejectCoopLoading(false);
    }
  };

  // Stats
  const approvedCount = docs.filter((d) => d.status === 'approved').length;
  const pendingCount = docs.filter((d) => d.status === 'pending').length;
  const rejectedCount = docs.filter((d) => d.status === 'rejected').length;

  const requiredApproved = REQUIRED_TYPES.every((t) =>
    docs.some((d) => d.type === t && d.status === 'approved'),
  );

  const isPending = cooperative.approval_status === 'pending';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-8 px-4" style={{ zIndex: 100000 }} onClick={onClose}>
        <div className="relative w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-3xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-800">
            <div>
              <h2 className="text-lg font-black text-white">{cooperative.name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {fareStep ? 'Paso 2 de 2 — Configurar tarifas de la cooperativa' : 'Documentos de la cooperativa'}
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-800 text-gray-400 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          {fareStep ? (
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-blue-300">Configura las tarifas de taxímetro según la regulación ANT de la zona. Se aplicarán exclusivamente a los viajes de esta cooperativa.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'base_fare', label: 'Bajada de bandera', prefix: '$', step: '0.01' },
                  { key: 'price_per_km', label: 'Precio por km (día)', prefix: '$', step: '0.001' },
                  { key: 'minimum_fare', label: 'Carrera mínima (día)', prefix: '$', step: '0.01' },
                  { key: 'price_per_minute', label: 'Precio por minuto', prefix: '$', step: '0.001' },
                  { key: 'night_price_per_km', label: 'Precio por km (noche)', prefix: '$', step: '0.001' },
                  { key: 'night_minimum_fare', label: 'Carrera mínima (noche)', prefix: '$', step: '0.01' },
                  { key: 'night_start_hour', label: 'Inicio tarifa nocturna', suffix: 'h', step: '1' },
                  { key: 'night_end_hour', label: 'Fin tarifa nocturna', suffix: 'h', step: '1' },
                ].map(({ key, label, prefix, suffix, step }) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5">{label}</label>
                    <div className="flex items-center rounded-xl border border-gray-700 bg-gray-800 overflow-hidden focus-within:border-gray-500">
                      {prefix && <span className="px-3 text-xs text-gray-500 border-r border-gray-700">{prefix}</span>}
                      <input
                        type="number"
                        step={step}
                        min={0}
                        value={fareValues[key as keyof typeof fareValues]}
                        onChange={(e) => setFareValues((v) => ({ ...v, [key]: e.target.value }))}
                        className="flex-1 px-3 py-2.5 text-sm text-white bg-transparent focus:outline-none"
                      />
                      {suffix && <span className="px-3 text-xs text-gray-500 border-l border-gray-700">{suffix}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-4">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-gray-800 animate-pulse" />
                  ))}
                </div>
              ) : docs.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-gray-400">No hay documentos subidos aún.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {docs.map((doc) => (
                    <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 p-4 rounded-xl border border-gray-800 bg-gray-800/40 hover:bg-gray-800/60 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Icon */}
                        <div className="w-9 h-9 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {TYPE_LABEL[doc.type] ?? doc.type}
                            {REQUIRED_TYPES.includes(doc.type) && (
                              <span className="ml-1.5 text-[10px] font-bold text-yellow-500/70 uppercase tracking-wide">requerido</span>
                            )}
                          </p>
                          {doc.rejection_reason && (
                            <p className="text-xs text-red-400 mt-0.5 truncate">Motivo: {doc.rejection_reason}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2 sm:ml-auto sm:flex-shrink-0">
                        {/* Status badge */}
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_BADGE[doc.status]}`}>
                          {STATUS_LABEL[doc.status]}
                        </span>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => openUrl(doc.id)}
                            disabled={viewLoading === doc.id}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
                          >
                            {viewLoading === doc.id ? '...' : 'Ver'}
                          </button>
                          {doc.status !== 'approved' && (
                            <button
                              onClick={() => approveDoc(doc.id)}
                              disabled={actionLoading === doc.id}
                              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-green-500/15 text-green-400 border border-green-500/20 hover:bg-green-500/25 transition-colors disabled:opacity-50"
                            >
                              Aprobar
                            </button>
                          )}
                          {doc.status !== 'rejected' && (
                            <button
                              onClick={() => { setRejectDocId(doc.id); setRejectDocReason(''); }}
                              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25 transition-colors"
                            >
                              Rechazar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          {fareStep ? (
            <div className="p-6 pt-0 space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={() => setFareStep(false)}
                  className="flex-1 h-11 rounded-xl font-semibold text-sm border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  Volver a documentos
                </button>
                <button
                  onClick={approveCoop}
                  disabled={coopActionLoading}
                  className="flex-1 h-11 rounded-xl font-bold text-sm bg-green-600 text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {coopActionLoading && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                  Guardar tarifas y aprobar
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 pt-0 space-y-4">
              {/* Stats */}
              <div className="flex gap-3">
                {[
                  { label: 'Aprobados', count: approvedCount, cls: 'text-green-400 bg-green-500/10' },
                  { label: 'Pendientes', count: pendingCount, cls: 'text-yellow-400 bg-yellow-500/10' },
                  { label: 'Rechazados', count: rejectedCount, cls: 'text-red-400 bg-red-500/10' },
                ].map(({ label, count, cls }) => (
                  <div key={label} className={`flex-1 rounded-xl p-3 text-center ${cls}`}>
                    <p className="text-lg font-black">{count}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
                  </div>
                ))}
              </div>

              {/* Cooperative approval — only for pending cooperatives */}
              {isPending && (
                <div className="border-t border-gray-800 pt-4 space-y-3">
                  {!requiredApproved && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                      <svg className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <p className="text-xs text-yellow-300">
                        Faltan documentos requeridos por aprobar antes de poder aprobar la cooperativa
                        ({REQUIRED_TYPES.filter((t) => !docs.some((d) => d.type === t && d.status === 'approved')).map((t) => TYPE_LABEL[t] ?? t).join(', ')}).
                      </p>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setRejectCoopOpen(true)}
                      className="flex-1 h-11 rounded-xl font-semibold text-sm bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25 transition-colors"
                    >
                      Rechazar cooperativa
                    </button>
                    <button
                      onClick={enterFareStep}
                      disabled={!requiredApproved || fareLoading}
                      className="flex-1 h-11 rounded-xl font-bold text-sm bg-green-600 text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {fareLoading && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                      Aprobar cooperativa →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Image overlay viewer */}
      {viewUrl && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setViewUrl(null)}>
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setViewUrl(null)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-gray-900 border border-gray-700 flex items-center justify-center text-white z-10 hover:bg-gray-800">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <img src={viewUrl} alt="Documento" className="max-w-full max-h-[85vh] rounded-xl object-contain" />
          </div>
        </div>
      )}

      {/* Reject document sub-modal */}
      {rejectDocId && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setRejectDocId(null)}>
          <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-white">Rechazar documento</h3>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Motivo de rechazo</label>
              <textarea
                rows={3}
                value={rejectDocReason}
                onChange={(e) => setRejectDocReason(e.target.value)}
                placeholder="Explica el motivo del rechazo..."
                className="w-full px-4 py-3 rounded-xl border border-gray-700 bg-gray-800 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRejectDocId(null)} className="flex-1 h-10 rounded-xl text-sm font-semibold text-gray-400 border border-gray-700 hover:border-gray-600 transition-colors">
                Cancelar
              </button>
              <button
                onClick={rejectDoc}
                disabled={!rejectDocReason.trim() || rejectDocLoading}
                className="flex-1 h-10 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {rejectDocLoading && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject cooperative sub-modal */}
      {rejectCoopOpen && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setRejectCoopOpen(false)}>
          <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-white">Rechazar cooperativa</h3>
            <p className="text-xs text-gray-400">Indica el motivo del rechazo para notificar al administrador de la cooperativa.</p>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Motivo</label>
              <textarea
                rows={3}
                value={rejectCoopReason}
                onChange={(e) => setRejectCoopReason(e.target.value)}
                placeholder="Explica el motivo del rechazo..."
                className="w-full px-4 py-3 rounded-xl border border-gray-700 bg-gray-800 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRejectCoopOpen(false)} className="flex-1 h-10 rounded-xl text-sm font-semibold text-gray-400 border border-gray-700 hover:border-gray-600 transition-colors">
                Cancelar
              </button>
              <button
                onClick={rejectCoop}
                disabled={!rejectCoopReason.trim() || rejectCoopLoading}
                className="flex-1 h-10 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {rejectCoopLoading && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
