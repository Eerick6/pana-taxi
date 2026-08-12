'use client';
import React, { useState, useEffect, useCallback } from 'react';
import type { Driver } from '@/types';
import {
  getDriver,
  getDocumentUrl,
  approveDocument,
  rejectDocument,
  approveDriverPlatform,
  rejectDriverPlatform,
  type DriverDocument,
} from '../api';

const TYPE_LABEL: Record<string, string> = {
  cedula_front: 'Cédula (frente)',
  cedula_back: 'Cédula (reverso)',
  license_front: 'Licencia (frente)',
  license_back: 'Licencia (reverso)',
  background_check: 'Récord policial',
  profile_photo: 'Foto de perfil',
};

// Documentos obligatorios para aprobar al conductor (cédula + licencia)
const REQUIRED_TYPES = ['cedula_front', 'cedula_back', 'license_front', 'license_back'];

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
  driverId: string;
  onClose: () => void;
  onUpdate?: () => void;
  readOnly?: boolean;
}

export default function DriverDocumentsModal({ driverId, onClose, onUpdate, readOnly = false }: Props) {
  const [driver, setDriver] = useState<(Driver & { documents?: DriverDocument[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectDocId, setRejectDocId]   = useState<string | null>(null);
  const [rejectDriverOpen, setRejectDriverOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getDriver(driverId);
      setDriver(d);
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<void>, id: string) => {
    setActionLoading(id);
    try { await fn(); await load(); onUpdate?.(); } finally { setActionLoading(null); }
  };

  const openPreview = async (doc: DriverDocument) => {
    setPreviewLoading(doc.id);
    try { setPreviewUrl(await getDocumentUrl(driverId, doc.id)); }
    finally { setPreviewLoading(null); }
  };

  const doRejectDoc = async () => {
    if (!rejectDocId || !rejectReason.trim()) return;
    await act(() => rejectDocument(driverId, rejectDocId, rejectReason), rejectDocId);
    setRejectDocId(null);
    setRejectReason('');
  };

  const doRejectDriver = async () => {
    if (!rejectReason.trim()) return;
    await act(() => rejectDriverPlatform(driverId, rejectReason), 'driver');
    setRejectDriverOpen(false);
    setRejectReason('');
    onClose();
  };

  const doApproveDriver = async () => {
    await act(() => approveDriverPlatform(driverId), 'driver');
    onClose();
  };

  const docs = driver?.documents ?? [];
  // Backend devuelve DESC (más nuevo primero) — guardamos solo el primero por tipo
  const docMap: Record<string, DriverDocument> = {};
  docs.forEach((d) => { if (!docMap[d.type]) docMap[d.type] = d; });

  // El conductor puede ser aprobado solo si todos los docs requeridos están aprobados
  const requiredApproved = REQUIRED_TYPES.every((t) => docMap[t]?.status === 'approved');
  // Solo docs del más reciente por tipo cuentan como pendientes
  const hasPendingDocs = Object.values(docMap).some((d) => d.status === 'pending');
  const isPending        = driver?.approval_status === 'pending';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-999999 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              {driver && (
                driver.profile_photo_url ? (
                  <img
                    src={driver.profile_photo_url}
                    alt={driver.full_name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700 flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-lg font-bold text-brand-700 dark:text-brand-300 flex-shrink-0">
                    {driver.full_name?.charAt(0).toUpperCase() ?? '?'}
                  </div>
                )
              )}
              <div>
                <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                  Revisión de documentos
                </h2>
                {driver && (
                  <p className="text-sm text-gray-400 mt-0.5">
                    {driver.full_name} ·{' '}
                    <span className={`font-medium ${
                      driver.approval_status === 'approved' ? 'text-success-600 dark:text-success-400' :
                      driver.approval_status === 'rejected' ? 'text-error-600 dark:text-error-400' :
                      'text-warning-600 dark:text-orange-400'
                    }`}>
                      {driver.approval_status === 'approved' ? 'Aprobado' :
                       driver.approval_status === 'rejected' ? 'Rechazado' : 'Pendiente de aprobación'}
                    </span>
                  </p>
                )}
              </div>
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

          {/* ── Documents list ── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
              ))
            ) : docs.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-400">El conductor aún no ha subido documentos</p>
              </div>
            ) : (
              docs.map((doc) => (
                <div
                  key={doc.id}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-xl border transition-colors ${
                    doc.status === 'rejected'  ? 'border-error-200 dark:border-error-500/30 bg-error-50/30 dark:bg-error-500/5' :
                    doc.status === 'approved'  ? 'border-success-200 dark:border-success-500/30 bg-success-50/30 dark:bg-success-500/5' :
                    'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
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
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 sm:ml-auto sm:flex-shrink-0">
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
                      {!readOnly && doc.status !== 'approved' && (
                        <button
                          onClick={() => act(() => approveDocument(driverId, doc.id), doc.id)}
                          disabled={!!actionLoading}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === doc.id ? '...' : 'Aprobar'}
                        </button>
                      )}
                      {!readOnly && doc.status !== 'rejected' && (
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
                </div>
              ))
            )}
          </div>

          {/* ── Footer: stats + driver approval ── */}
          {!loading && !readOnly && (
            <div className="border-t border-gray-100 dark:border-gray-800">
              {/* Stats row */}
              {docs.length > 0 && (
                <div className="px-6 py-3 flex gap-4 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <span>
                    <span className="font-semibold text-success-600 dark:text-success-400">
                      {docs.filter((d) => d.status === 'approved').length}
                    </span>{' '}aprobados
                  </span>
                  <span>
                    <span className="font-semibold text-warning-600 dark:text-orange-400">
                      {docs.filter((d) => d.status === 'pending').length}
                    </span>{' '}en revisión
                  </span>
                  <span>
                    <span className="font-semibold text-error-600 dark:text-error-400">
                      {docs.filter((d) => d.status === 'rejected').length}
                    </span>{' '}rechazados
                  </span>
                  <span className="ml-auto">{docs.filter((d) => REQUIRED_TYPES.includes(d.type)).length} / 4 obligatorios subidos</span>
                </div>
              )}

              {/* Driver approval actions — solo si está pendiente */}
              {isPending && (
                <div className="px-6 py-4">
                  {/* Aviso si faltan docs requeridos */}
                  {!requiredApproved && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 mb-4">
                      <svg className="w-4 h-4 text-warning-600 dark:text-orange-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <div>
                        <p className="text-xs font-medium text-warning-700 dark:text-orange-400">
                          {hasPendingDocs
                            ? 'Hay documentos aún en revisión. Aprueba o rechaza cada uno antes de tomar una decisión sobre el conductor.'
                            : 'Faltan documentos obligatorios aprobados: cédula (frente y reverso) y licencia (frente y reverso).'}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Decisión final sobre el conductor</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {requiredApproved
                          ? 'Cédula y licencia aprobadas. Puedes aprobar al conductor.'
                          : 'Aprueba la cédula y la licencia del conductor antes de continuar.'}
                      </p>
                    </div>
                    <button
                      onClick={() => { setRejectDriverOpen(true); setRejectReason(''); }}
                      disabled={!!actionLoading}
                      className="px-4 py-2 text-sm font-medium rounded-xl bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400 hover:bg-error-100 transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      Rechazar conductor
                    </button>
                    <button
                      onClick={doApproveDriver}
                      disabled={!requiredApproved || !!actionLoading}
                      className="px-4 py-2 text-sm font-medium rounded-xl bg-success-500 text-white hover:bg-success-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    >
                      {actionLoading === 'driver' ? 'Aprobando...' : 'Aprobar conductor'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Preview image ── */}
      {previewUrl && (
        <div className="fixed inset-0 z-999999 flex items-center justify-center bg-black/80" onClick={() => setPreviewUrl(null)}>
          <div className="relative max-w-3xl max-h-[90vh] p-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-white dark:bg-gray-900 shadow-lg flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img src={previewUrl} alt="Documento" className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl" />
          </div>
        </div>
      )}

      {/* ── Reject document reason ── */}
      {rejectDocId && (
        <div className="fixed inset-0 z-999999 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setRejectDocId(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">Rechazar documento</h3>
            <p className="text-sm text-gray-400 mb-4">Indica el motivo para que el conductor pueda corregirlo</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ej: Foto borrosa, documento vencido..."
              rows={3}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setRejectDocId(null); setRejectReason(''); }} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
              <button onClick={doRejectDoc} disabled={!rejectReason.trim() || !!actionLoading} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-error-500 text-white hover:bg-error-600 disabled:opacity-50 transition-colors">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject driver reason ── */}
      {rejectDriverOpen && (
        <div className="fixed inset-0 z-999999 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setRejectDriverOpen(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">Rechazar conductor</h3>
            <p className="text-sm text-gray-400 mb-4">El conductor recibirá una notificación con este motivo</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ej: Documentos no válidos, antecedentes penales incompatibles..."
              rows={3}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setRejectDriverOpen(false); setRejectReason(''); }} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
              <button onClick={doRejectDriver} disabled={!rejectReason.trim() || !!actionLoading} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-error-500 text-white hover:bg-error-600 disabled:opacity-50 transition-colors">Confirmar rechazo</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
