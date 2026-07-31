'use client';
import React, { useState, useEffect, useCallback } from 'react';
import type { Vehicle, VehicleDocument } from '@/types';
import {
  getVehicle,
  getVehicleDocumentUrl,
  approveVehicleDocument,
  rejectVehicleDocument,
  approveVehicle,
  rejectVehicle,
} from '../api';

const TYPE_LABEL: Record<string, string> = {
  matricula:        'Matrícula',
  soat:             'SOAT',
  technical_review: 'Revisión técnica',
  vehicle_photo:    'Foto del vehículo',
};

const REQUIRED_TYPES = ['matricula', 'soat', 'technical_review'];

const STATUS_BADGE: Record<string, string> = {
  approved: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  pending:  'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400',
  rejected: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
};
const STATUS_LABEL: Record<string, string> = {
  approved: 'Aprobado',
  pending:  'En revisión',
  rejected: 'Rechazado',
};

interface Props {
  vehicleId: string;
  onClose: () => void;
  onUpdate?: () => void;
}

export default function VehicleDocumentsModal({ vehicleId, onClose, onUpdate }: Props) {
  const [vehicle, setVehicle] = useState<(Vehicle & { documents?: VehicleDocument[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectDocId, setRejectDocId]     = useState<string | null>(null);
  const [rejectVehicleOpen, setRejectVehicleOpen] = useState(false);
  const [rejectReason, setRejectReason]   = useState('');
  const [previewUrl, setPreviewUrl]       = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setVehicle(await getVehicle(vehicleId));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string | string[] } } };
      const raw = e?.response?.data?.message;
      setLoadError(Array.isArray(raw) ? raw[0] : raw ?? 'Error al cargar el vehículo');
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<void>, id: string) => {
    setActionLoading(id);
    try { await fn(); await load(); onUpdate?.(); } finally { setActionLoading(null); }
  };

  const openPreview = async (doc: VehicleDocument) => {
    setPreviewLoading(doc.id);
    try { setPreviewUrl(await getVehicleDocumentUrl(vehicleId, doc.id)); }
    finally { setPreviewLoading(null); }
  };

  const doRejectDoc = async () => {
    if (!rejectDocId || !rejectReason.trim()) return;
    await act(() => rejectVehicleDocument(vehicleId, rejectDocId, rejectReason), rejectDocId);
    setRejectDocId(null);
    setRejectReason('');
  };

  const doRejectVehicle = async () => {
    if (!rejectReason.trim()) return;
    await act(() => rejectVehicle(vehicleId, rejectReason), 'vehicle');
    setRejectVehicleOpen(false);
    setRejectReason('');
    onClose();
  };

  const doApproveVehicle = async () => {
    await act(() => approveVehicle(vehicleId), 'vehicle');
    onClose();
  };

  const docs = vehicle?.documents ?? [];
  const docMap: Record<string, VehicleDocument> = {};
  docs.forEach((d) => { docMap[d.type] = d; });

  const requiredApproved = REQUIRED_TYPES.every((t) => docMap[t]?.status === 'approved');
  const hasPendingDocs   = docs.some((d) => d.status === 'pending');
  const isPending        = vehicle?.approval_status === 'pending';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        style={{ zIndex: 100000 }}
        onClick={onClose}
      >
        <div
          className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-white">Documentos del vehículo</h2>
              {vehicle && (
                <p className="text-sm text-gray-400 mt-0.5">
                  {vehicle.brand} {vehicle.model} · <span className="font-mono">{vehicle.plate}</span> ·{' '}
                  <span className={`font-medium ${
                    vehicle.approval_status === 'approved' ? 'text-success-600 dark:text-success-400' :
                    vehicle.approval_status === 'rejected' ? 'text-error-600 dark:text-error-400' :
                    'text-warning-600 dark:text-orange-400'
                  }`}>
                    {vehicle.approval_status === 'approved' ? 'Aprobado' :
                     vehicle.approval_status === 'rejected' ? 'Rechazado' : 'Pendiente de aprobación'}
                  </span>
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Documents list */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
              ))
            ) : loadError ? (
              <div className="py-10 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/15 flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">{loadError}</p>
                <button onClick={load} className="px-4 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  Reintentar
                </button>
              </div>
            ) : docs.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-400">El propietario aún no ha subido documentos</p>
              </div>
            ) : (
              docs.map((doc) => (
                <div
                  key={doc.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                    doc.status === 'rejected'  ? 'border-error-200 dark:border-error-500/30 bg-error-50/30 dark:bg-error-500/5' :
                    doc.status === 'approved'  ? 'border-success-200 dark:border-success-500/30 bg-success-50/30 dark:bg-success-500/5' :
                    'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-white">
                      {TYPE_LABEL[doc.type] ?? doc.type}
                      {REQUIRED_TYPES.includes(doc.type) && (
                        <span className="ml-1.5 text-xs text-gray-400">(requerido)</span>
                      )}
                    </p>
                    {doc.rejection_reason && (
                      <p className="text-xs text-error-600 dark:text-error-400 mt-0.5 truncate">
                        Motivo: {doc.rejection_reason}
                      </p>
                    )}
                    {doc.expires_at && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Vence: {new Date(doc.expires_at).toLocaleDateString('es-EC')}
                      </p>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_BADGE[doc.status]}`}>
                    {STATUS_LABEL[doc.status]}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => openPreview(doc)}
                      disabled={previewLoading === doc.id}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                      {previewLoading === doc.id ? '...' : 'Ver'}
                    </button>
                    {doc.status !== 'approved' && (
                      <button
                        onClick={() => act(() => approveVehicleDocument(vehicleId, doc.id), doc.id)}
                        disabled={!!actionLoading}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === doc.id ? '...' : 'Aprobar'}
                      </button>
                    )}
                    {doc.status === 'pending' && (
                      <button
                        onClick={() => { setRejectDocId(doc.id); setRejectReason(''); }}
                        disabled={!!actionLoading}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400 hover:bg-error-100 transition-colors disabled:opacity-50"
                      >
                        Rechazar
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {!loading && !loadError && (
            <div className="border-t border-gray-100 dark:border-gray-800">
              {docs.length > 0 && (
                <div className="px-6 py-3 flex gap-4 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <span><span className="font-semibold text-success-600 dark:text-success-400">{docs.filter((d) => d.status === 'approved').length}</span> aprobados</span>
                  <span><span className="font-semibold text-warning-600 dark:text-orange-400">{docs.filter((d) => d.status === 'pending').length}</span> en revisión</span>
                  <span><span className="font-semibold text-error-600 dark:text-error-400">{docs.filter((d) => d.status === 'rejected').length}</span> rechazados</span>
                  <span className="ml-auto">{docs.length} documentos</span>
                </div>
              )}

              {isPending && (
                <div className="px-6 py-4">
                  {!requiredApproved && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 mb-4">
                      <svg className="w-4 h-4 text-warning-600 dark:text-orange-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <p className="text-xs font-medium text-warning-700 dark:text-orange-400">
                        {hasPendingDocs
                          ? 'Hay documentos en revisión. Aprueba o rechaza cada uno antes de aprobar el vehículo.'
                          : 'Faltan documentos requeridos aprobados (matrícula, SOAT, revisión técnica).'}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Decisión sobre el vehículo</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {requiredApproved
                          ? 'Todos los documentos requeridos están aprobados.'
                          : 'Aprueba los documentos requeridos antes de aprobar el vehículo.'}
                      </p>
                    </div>
                    <button
                      onClick={() => { setRejectVehicleOpen(true); setRejectReason(''); }}
                      disabled={!!actionLoading}
                      className="px-4 py-2 text-sm font-medium rounded-xl bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400 hover:bg-error-100 transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      Rechazar vehículo
                    </button>
                    <button
                      onClick={doApproveVehicle}
                      disabled={!requiredApproved || !!actionLoading}
                      className="px-4 py-2 text-sm font-medium rounded-xl bg-success-500 text-white hover:bg-success-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    >
                      {actionLoading === 'vehicle' ? 'Aprobando...' : 'Aprobar vehículo'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      {previewUrl && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80" style={{ zIndex: 100001 }} onClick={() => setPreviewUrl(null)}>
          <div className="relative max-w-3xl max-h-[90vh] p-2" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewUrl(null)} className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-white dark:bg-gray-900 shadow-lg flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <img src={previewUrl} alt="Documento" className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl" />
          </div>
        </div>
      )}

      {/* Reject doc reason */}
      {rejectDocId && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm" style={{ zIndex: 100001 }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">Rechazar documento</h3>
            <p className="text-sm text-gray-400 mb-4">Indica el motivo para que el propietario pueda corregirlo</p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ej: Documento vencido, foto ilegible..." rows={3} className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setRejectDocId(null); setRejectReason(''); }} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
              <button onClick={doRejectDoc} disabled={!rejectReason.trim() || !!actionLoading} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-error-500 text-white hover:bg-error-600 disabled:opacity-50 transition-colors">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject vehicle reason */}
      {rejectVehicleOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm" style={{ zIndex: 100001 }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">Rechazar vehículo</h3>
            <p className="text-sm text-gray-400 mb-4">El propietario será notificado con este motivo</p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ej: Documentos no válidos, vehículo no apto..." rows={3} className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setRejectVehicleOpen(false); setRejectReason(''); }} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
              <button onClick={doRejectVehicle} disabled={!rejectReason.trim() || !!actionLoading} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-error-500 text-white hover:bg-error-600 disabled:opacity-50 transition-colors">Confirmar rechazo</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
