"use client";
import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/context/AuthContext";
import CoopSidebar from "@/layout/CoopSidebar";
import AppHeader from "@/layout/AppHeader";
import Backdrop from "@/layout/Backdrop";
import { CoopChatWidget } from "@/features/chat/CoopChatWidget";
import Link from "next/link";
import React, { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const COOP_ROLES = ['cooperative_admin', 'cooperative_operator', 'cooperative_supervisor'];

const ALL_DOC_TYPES = [
  { type: 'ruc',        label: 'RUC de la cooperativa' },
  { type: 'ant_permit', label: 'Permiso de operación ANT/GADM' },
];

const Y = '#fcbd13';

interface CoopDoc { id: string; type: string; status: string; rejection_reason: string | null }
interface CoopInfo { approval_status: string; name: string }

// ── Pending approval wall ─────────────────────────────────────────────────────

function PendingApprovalWall({ coopId, onLogout }: { coopId: string; onLogout: () => void }) {
  const [coop, setCoop] = useState<CoopInfo | null>(null);
  const [docs, setDocs] = useState<CoopDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadErr, setUploadErr] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [coopRes, docsRes] = await Promise.all([
        api.get(`/cooperatives/${coopId}`),
        api.get(`/cooperatives/${coopId}/documents`),
      ]);
      setCoop(coopRes.data);
      setDocs(docsRes.data ?? []);
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, [coopId]);

  useEffect(() => { load(); }, [load]);

  const upload = async (type: string, file: File) => {
    setUploading((u) => ({ ...u, [type]: true }));
    setUploadErr((e) => { const n = { ...e }; delete n[type]; return n; });
    try {
      const fd = new FormData();
      fd.append('type', type);
      fd.append('file', file);
      await api.post(`/cooperatives/${coopId}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
      const text = Array.isArray(msg) ? msg[0] : (msg as string) ?? 'Error al subir';
      setUploadErr((e) => ({ ...e, [type]: text }));
    } finally {
      setUploading((u) => ({ ...u, [type]: false }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: Y, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const isRejected = coop?.approval_status === 'rejected';
  const approvedCount = docs.filter((d) => d.status === 'approved').length;
  const totalTypes = ALL_DOC_TYPES.length;

  // Build a map of type → doc for fast lookup
  const docByType = Object.fromEntries(docs.map((d) => [d.type, d]));

  return (
    <div className="min-h-screen bg-gray-950 overflow-y-auto py-10 px-4">
      <div className="w-full max-w-xl mx-auto space-y-5">

        {/* Header */}
        <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-8 text-center space-y-3">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto text-3xl ${isRejected ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
            {isRejected ? '❌' : '⏳'}
          </div>
          <h1 className="text-xl font-black text-white">
            {isRejected ? 'Solicitud rechazada' : 'Pendiente de aprobación'}
          </h1>
          {coop && (
            <p className="text-sm text-gray-400">
              {isRejected
                ? `La cooperativa ${coop.name} fue rechazada. Revisa los documentos rechazados, corríjelos y comunícate con soporte.`
                : `La cooperativa ${coop.name} está en revisión. Sube todos los documentos requeridos para agilizar el proceso. Te notificaremos por correo cuando sea aprobada.`}
            </p>
          )}
          {!isRejected && (
            <div className="inline-flex items-center gap-2 text-xs font-medium text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              {approvedCount}/{totalTypes} documentos aprobados
            </div>
          )}
        </div>

        {/* Document upload list */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Documentos requeridos</p>
          <p className="text-xs text-gray-500">
            Sube cada documento. Los aprobados quedan fijos; los rechazados deben volver a subirse con las correcciones indicadas.
          </p>

          <div className="space-y-3">
            {ALL_DOC_TYPES.map(({ type, label }) => {
              const doc = docByType[type];
              const status = doc?.status;
              const isUploading = uploading[type];
              const err = uploadErr[type];
              const canUpload = !status || status === 'rejected';

              return (
                <div
                  key={type}
                  className={`rounded-xl border p-3.5 transition-colors ${
                    status === 'approved' ? 'border-green-500/25 bg-green-500/5' :
                    status === 'rejected' ? 'border-red-500/25 bg-red-500/5' :
                    status === 'pending'  ? 'border-yellow-500/20 bg-yellow-500/5' :
                                           'border-white/8 bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Status icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      status === 'approved' ? 'bg-green-500/20' :
                      status === 'rejected' ? 'bg-red-500/20' :
                      status === 'pending'  ? 'bg-yellow-500/20' :
                                             'bg-white/5'
                    }`}>
                      {isUploading
                        ? <svg className="w-4 h-4 animate-spin" style={{ color: Y }} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        : status === 'approved'
                        ? <svg className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        : status === 'rejected'
                        ? <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        : status === 'pending'
                        ? <svg className="w-4 h-4 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" /></svg>
                        : <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      }
                    </div>

                    {/* Label + rejection reason */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-200">{label}</p>
                      {status === 'rejected' && doc?.rejection_reason && (
                        <p className="text-[10px] text-red-400 mt-0.5">Motivo: {doc.rejection_reason}</p>
                      )}
                      {status === 'pending' && (
                        <p className="text-[10px] text-yellow-400/70 mt-0.5">En revisión por la plataforma</p>
                      )}
                      {err && <p className="text-[10px] text-red-400 mt-0.5">{err}</p>}
                    </div>

                    {/* Badge or upload button */}
                    {status === 'approved' ? (
                      <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
                        Aprobado
                      </span>
                    ) : (
                      <label className={`cursor-pointer text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex-shrink-0 ${
                        isUploading ? 'opacity-50 cursor-not-allowed bg-white/5 text-gray-400' : 'text-black hover:opacity-90'
                      }`} style={!isUploading ? { backgroundColor: Y } : undefined}>
                        {isUploading ? '...' : status === 'rejected' ? 'Re-subir' : status === 'pending' ? 'Reemplazar' : 'Subir'}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          disabled={isUploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) upload(type, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Info callout */}
        <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-4">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-gray-500">
            Una vez que el equipo de Pana Taxi apruebe todos los documentos y active tu cooperativa, podrás acceder al panel completo. Recibirás una notificación por correo con cada actualización.
          </p>
        </div>

        <button
          onClick={onLogout}
          className="w-full h-11 rounded-xl text-sm font-semibold text-gray-500 border border-white/8 hover:border-white/15 hover:text-gray-300 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

// ── Layout guard ──────────────────────────────────────────────────────────────

export default function CoopLayoutClient({ children }: { children: React.ReactNode }) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const { user, isLoading, logout } = useAuth();

  const mainMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  if (!COOP_ROLES.includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900 p-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Portal de Cooperativas</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Este portal es exclusivo para el personal de cooperativas afiliadas.
            Tu cuenta <span className="font-semibold text-gray-700 dark:text-gray-200">({user.role})</span> no tiene acceso aquí.
          </p>
          <Link href="/dashboard" className="text-sm text-brand-500 hover:underline">
            Ir al panel de administración →
          </Link>
        </div>
      </div>
    );
  }

  const coopId = user.cooperative_id;
  if (!coopId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950 p-6">
        <div className="text-center max-w-sm space-y-4">
          <div className="text-5xl">⚠️</div>
          <h2 className="text-lg font-bold text-white">Sin cooperativa vinculada</h2>
          <p className="text-sm text-gray-400">Tu cuenta no está vinculada a ninguna cooperativa. Comunícate con soporte.</p>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-white underline">Cerrar sesión</button>
        </div>
      </div>
    );
  }

  return <CoopLayoutInner coopId={coopId} mainMargin={mainMargin} onLogout={logout}>{children}</CoopLayoutInner>;
}

function CoopLayoutInner({
  coopId, mainMargin, onLogout, children,
}: {
  coopId: string; mainMargin: string; onLogout: () => void; children: React.ReactNode;
}) {
  const [approvalStatus, setApprovalStatus] = useState<'loading' | 'approved' | 'pending' | 'rejected'>('loading');

  useEffect(() => {
    api.get(`/cooperatives/${coopId}`)
      .then(({ data }) => setApprovalStatus(data.approval_status ?? 'pending'))
      .catch(() => setApprovalStatus('pending'));
  }, [coopId]);

  if (approvalStatus === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#fcbd13', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (approvalStatus !== 'approved') {
    return <PendingApprovalWall coopId={coopId} onLogout={onLogout} />;
  }

  return (
    <div className="min-h-screen xl:flex overflow-x-hidden">
      <CoopSidebar />
      <Backdrop />
      <div className={`flex-1 min-w-0 transition-all duration-300 ease-in-out ${mainMargin}`}>
        <AppHeader />
        <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">{children}</div>
      </div>
      <CoopChatWidget />
    </div>
  );
}
