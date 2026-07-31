'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ECUADORIAN_BANKS, getBankInfo, type EcuadorianBank } from '@/lib/ecuadorianBanks';
import { currency, dateStr, dateTimeStr } from '@/lib/format';
import type { Settlement } from '@/types';
import { useCoop } from '@/context/CoopContext';
import {
  getSettlements, confirmSettlement, cancelSettlement,
  getRecharges, getRechargeProofUrl, confirmRecharge, rejectRecharge,
  getCoopAccount, type CoopAccount,
  getBankAccounts, createBankAccount, updateBankAccount, uploadBankLogo,
  type RechargeRow, type BankAccount,
} from '../api';

// ── Bank logo component ───────────────────────────────────────────────────────

function BankLogo({ bankName, logoUrl, size = 40 }: { bankName: string; logoUrl?: string; size?: number }) {
  const bi = getBankInfo(bankName);
  const [failed, setFailed] = React.useState(false);
  const effective = !failed && logoUrl ? logoUrl : null;

  if (!effective) {
    return (
      <div
        className="flex-shrink-0 rounded-xl flex items-center justify-center text-white font-bold text-xs"
        style={{ width: size, height: size, backgroundColor: bi.color, fontSize: size * 0.27 }}
      >
        {bi.abbr}
      </div>
    );
  }

  return (
    <div
      className="flex-shrink-0 rounded-xl overflow-hidden bg-white border border-gray-100 dark:border-gray-800 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <img
        src={effective}
        alt={bi.name}
        style={{ width: size - 8, height: size - 8, objectFit: 'contain' }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SETTLEMENT_BADGE: Record<string, string> = {
  pending:   'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400',
  confirmed: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  cancelled: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
};
const SETTLEMENT_LABEL: Record<string, string> = {
  pending: 'Pendiente', confirmed: 'Confirmado', cancelled: 'Cancelado',
};

const RECHARGE_BADGE: Record<string, string> = {
  pending:   'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400',
  confirmed: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  rejected:  'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
};
const RECHARGE_LABEL: Record<string, string> = {
  pending: 'Pendiente', confirmed: 'Confirmada', rejected: 'Rechazada',
};

const Spinner = () => (
  <svg className="w-4 h-4 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

// ── Reject dialog ─────────────────────────────────────────────────────────────

function RejectDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white">
          Rechazar recarga
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Indica el motivo del rechazo. El conductor lo verá en su app.
        </p>
        <textarea
          className="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          rows={3}
          placeholder="Ej: Comprobante ilegible, monto incorrecto…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={!reason.trim()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-error-600 text-white hover:bg-error-700 transition-colors disabled:opacity-40"
          >
            Rechazar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bank account form dialog ──────────────────────────────────────────────────

const EMPTY_BANK = {
  bank_name: '', account_number: '', account_holder: '',
  account_type: 'savings' as 'savings' | 'checking', id_number: '', notes: '', logo_url: '',
};

function BankDialog({
  initial,
  onSave,
  onCancel,
}: {
  initial?: BankAccount | null;
  onSave: (dto: typeof EMPTY_BANK) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(
    initial
      ? {
          bank_name: initial.bank_name,
          account_number: initial.account_number,
          account_holder: initial.account_holder,
          account_type: initial.account_type,
          id_number: initial.id_number ?? '',
          notes: initial.notes ?? '',
          logo_url: '', // kept empty on edit — only sent if user changes the logo
        }
      : { ...EMPTY_BANK },
  );
  const [logoPreview, setLogoPreview] = useState(initial?.logo_url ?? '');
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof EMPTY_BANK, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleLogoFile = async (file: File) => {
    setLogoUploading(true);
    setError('');
    try {
      const res = await uploadBankLogo(file);
      setForm((p) => ({ ...p, logo_url: res.logo_url }));
      setLogoPreview(res.resolved_url);
      setLogoUrlInput('');
    } catch {
      setError('Error al subir el logo. Verifica el archivo e intenta de nuevo.');
    } finally {
      setLogoUploading(false);
    }
  };

  const handle = async () => {
    if (!form.bank_name || !form.account_number || !form.account_holder) {
      setError('Completa los campos requeridos');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const bi = getBankInfo(form.bank_name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 overflow-y-auto py-6">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 my-auto">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white">
          {initial ? 'Editar cuenta bancaria' : 'Nueva cuenta bancaria'}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { k: 'account_holder' as const, label: 'Titular *', ph: 'Nombre completo' },
            { k: 'account_number' as const, label: 'Número de cuenta *', ph: '0000000000' },
            { k: 'id_number' as const, label: 'RUC / CI', ph: '1234567890' },
          ].map(({ k, label, ph }) => (
            <div key={k} className="space-y-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
              <input
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder={ph}
                value={form[k]}
                onChange={(e) => set(k, e.target.value)}
              />
            </div>
          ))}

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Banco *</label>
            <select
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.bank_name}
              onChange={(e) => set('bank_name', e.target.value)}
            >
              <option value="">Seleccionar banco…</option>
              {ECUADORIAN_BANKS.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Tipo *</label>
            <select
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.account_type}
              onChange={(e) => set('account_type', e.target.value)}
            >
              <option value="savings">Ahorros</option>
              <option value="checking">Corriente</option>
            </select>
          </div>

          {/* Logo section */}
          <div className="space-y-2 sm:col-span-2">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Logo del banco (opcional)</label>
            <div className="flex items-start gap-3">
              {/* Preview */}
              <div
                className="flex-shrink-0 w-11 h-11 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 flex items-center justify-center"
                style={{ backgroundColor: logoPreview ? '#fff' : bi.color }}
              >
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="logo preview"
                    className="w-9 h-9 object-contain"
                    onError={() => setLogoPreview('')}
                  />
                ) : (
                  <span className="text-white font-bold text-xs">{bi.abbr}</span>
                )}
              </div>

              <div className="flex-1 space-y-2 min-w-0">
                {/* URL input */}
                <input
                  type="url"
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="https://banco.com/logo.png"
                  value={logoUrlInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLogoUrlInput(val);
                    setForm((p) => ({ ...p, logo_url: val }));
                    setLogoPreview(val);
                  }}
                />

                {/* Upload button */}
                <label className="inline-flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  {logoUploading ? (
                    <Spinner />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  )}
                  {logoUploading ? 'Subiendo…' : 'Subir imagen'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/svg+xml"
                    className="hidden"
                    disabled={logoUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoFile(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Notas / instrucciones</label>
            <textarea
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              rows={2}
              placeholder="Ej: Transferir desde mismo banco para evitar comisión"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-xs text-error-600 dark:text-error-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handle}
            disabled={saving || logoUploading}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-40 flex items-center gap-2"
          >
            {saving && <Spinner />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Proof modal ───────────────────────────────────────────────────────────────

function ProofModal({ url, onClose }: { url: string; onClose: () => void }) {
  const isPdf = /\.pdf($|\?)/i.test(url) || url.includes('application%2Fpdf');
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const content = (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/85 p-4"
      style={{ zIndex: 99999 }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-3xl max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/70 text-xs font-medium">Comprobante de recarga</span>
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-white/70 hover:text-white text-xs transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cerrar (Esc)
          </button>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden flex items-center justify-center">
          {isPdf || imgError ? (
            <iframe
              src={url}
              title="Comprobante"
              className="w-full rounded-2xl"
              style={{ height: '80vh', border: 'none' }}
            />
          ) : (
            <img
              src={url}
              alt="Comprobante"
              className="max-w-full max-h-[80vh] object-contain rounded-2xl"
              onError={() => setImgError(true)}
            />
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(content, document.body)
    : null;
}

// ── Main view ─────────────────────────────────────────────────────────────────

type Tab = 'settlements' | 'recharges' | 'banks';

export default function AccountingView({ initialTab = 'settlements' }: { initialTab?: Tab }) {
  const { selectedCoop } = useCoop();
  const coopId = selectedCoop?.id;

  const [tab, setTab] = useState<Tab>(initialTab);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [recharges, setRecharges] = useState<RechargeRow[]>([]);
  const [rechargeFilter, setRechargeFilter] = useState<string>('');
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [account, setAccount] = useState<CoopAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Dialogs
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [bankDialog, setBankDialog] = useState<'new' | BankAccount | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState<string | null>(null); // stores recharge id while loading

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, a, b] = await Promise.allSettled([
        getSettlements(coopId),
        getRecharges(rechargeFilter || undefined),
        coopId ? getCoopAccount(coopId) : Promise.resolve(null),
        getBankAccounts(),
      ]);
      if (s.status === 'fulfilled') setSettlements(s.value.items ?? []);
      if (r.status === 'fulfilled') setRecharges(r.value.items ?? []);
      if (a.status === 'fulfilled' && a.value) setAccount(a.value);
      if (b.status === 'fulfilled') setBanks(b.value);
    } finally {
      setLoading(false);
    }
  }, [coopId, rechargeFilter]);

  // Silent poll — solo recargas, sin spinner global
  const pollRecharges = useCallback(async () => {
    try {
      const r = await getRecharges(rechargeFilter || undefined);
      setRecharges(r.items ?? []);
    } catch { /* silent */ }
  }, [rechargeFilter]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh cada 15s cuando estamos en la pestaña de recargas
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (tab !== 'recharges') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(pollRecharges, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [tab, pollRecharges]);

  const act = async (fn: () => Promise<unknown>, id: string) => {
    setActionLoading(id);
    try {
      await fn();
      await load();
      // Notifica al sidebar para que limpie el badge inmediatamente
      window.dispatchEvent(new Event('recharge-updated'));
    } finally { setActionLoading(null); }
  };

  const openProof = async (id: string) => {
    setProofLoading(id);
    try {
      const url = await getRechargeProofUrl(id);
      setProofUrl(url);
    } catch {
      alert('No se pudo obtener el comprobante');
    } finally {
      setProofLoading(null);
    }
  };

  const handleReject = (id: string) => setRejectTarget(id);

  const doReject = async (reason: string) => {
    if (!rejectTarget) return;
    const id = rejectTarget;
    setRejectTarget(null);
    await act(() => rejectRecharge(id, reason), id);
  };

  const saveBankAccount = async (dto: typeof EMPTY_BANK) => {
    const { logo_url, ...rest } = dto;
    const logoPayload = logo_url ? { logo_url } : {};
    if (bankDialog === 'new') {
      await createBankAccount({ ...rest, ...logoPayload });
    } else if (bankDialog && typeof bankDialog === 'object') {
      await updateBankAccount(bankDialog.id, { ...rest, ...logoPayload });
    }
    setBankDialog(null);
    await load();
  };

  const toggleBank = async (bank: BankAccount) => {
    await act(() => updateBankAccount(bank.id, { is_active: !bank.is_active }), bank.id);
  };

  return (
    <>
      {proofUrl && <ProofModal url={proofUrl} onClose={() => setProofUrl(null)} />}
      {rejectTarget && (
        <RejectDialog onConfirm={doReject} onCancel={() => setRejectTarget(null)} />
      )}
      {bankDialog !== null && (
        <BankDialog
          initial={bankDialog === 'new' ? null : bankDialog}
          onSave={saveBankAccount}
          onCancel={() => setBankDialog(null)}
        />
      )}

      <div className="space-y-5">
        {/* Account balance */}
        {coopId && account && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Saldo Actual', value: currency(account.balance), highlight: account.balance < 0, icon: '💰' },
              { label: 'Total Generado', value: currency(account.total_earned), icon: '📈' },
              { label: 'Total Liquidado', value: currency(account.total_settled), icon: '✅' },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{c.icon}</span>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{c.label}</p>
                </div>
                <p className={`text-2xl font-bold ${c.highlight ? 'text-error-600 dark:text-error-400' : 'text-gray-800 dark:text-white'}`}>
                  {c.value}
                </p>
                {c.label === 'Saldo Actual' && (
                  <p className="text-xs text-gray-400 mt-1">{selectedCoop?.name}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
          {([
            { v: 'settlements', l: '💸 Liquidaciones' },
            { v: 'recharges',   l: '💳 Recargas' },
            { v: 'banks',       l: '🏦 Cuentas bancarias' },
          ] as { v: Tab; l: string }[]).map(({ v, l }) => (
            <button
              key={v}
              onClick={() => setTab(v)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === v ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* ── Settlements ────────────────────────────────────────────────────── */}
        {tab === 'settlements' && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <p className="text-sm font-semibold text-gray-800 dark:text-white">Liquidaciones</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    {['Cooperativa', 'Monto', 'Período', 'Estado', 'Creada', 'Acciones'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                          {Array.from({ length: 6 }).map((__, j) => (
                            <td key={j} className="px-5 py-3.5"><div className="h-3.5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
                          ))}
                        </tr>
                      ))
                    : settlements.map((s) => (
                        <tr key={s.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-gray-700 dark:text-gray-300">{s.cooperative?.name ?? '—'}</td>
                          <td className="px-5 py-3.5 font-bold text-gray-800 dark:text-white">{currency(s.amount)}</td>
                          <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{dateStr(s.period_from)} – {dateStr(s.period_to)}</td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SETTLEMENT_BADGE[s.status] ?? ''}`}>
                              {SETTLEMENT_LABEL[s.status] ?? s.status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{dateStr(s.created_at)}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1.5">
                              {s.status === 'pending' && (
                                <>
                                  <button onClick={() => act(() => confirmSettlement(s.id), s.id)} disabled={actionLoading === s.id} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50">Confirmar</button>
                                  <button onClick={() => act(() => cancelSettlement(s.id), s.id)} disabled={actionLoading === s.id} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400 hover:bg-error-100 transition-colors disabled:opacity-50">Cancelar</button>
                                </>
                              )}
                              {actionLoading === s.id && <Spinner />}
                            </div>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            {!loading && settlements.length === 0 && (
              <div className="py-12 text-center text-sm text-gray-400">Sin liquidaciones</div>
            )}
          </div>
        )}

        {/* ── Recharges ──────────────────────────────────────────────────────── */}
        {tab === 'recharges' && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-800 dark:text-white">Recargas de Billetera</p>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-success-500 animate-pulse inline-block" />
                  EN VIVO
                </span>
              </div>
              <select
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={rechargeFilter}
                onChange={(e) => setRechargeFilter(e.target.value)}
              >
                <option value="">Todas</option>
                <option value="pending">Pendientes</option>
                <option value="confirmed">Confirmadas</option>
                <option value="rejected">Rechazadas</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    {['Conductor', 'Monto', 'Estado', 'Banco', 'Notas', 'Fecha', 'Acciones'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                          {Array.from({ length: 7 }).map((__, j) => (
                            <td key={j} className="px-5 py-3.5"><div className="h-3.5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
                          ))}
                        </tr>
                      ))
                    : recharges.map((r) => (
                        <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-gray-700 dark:text-gray-300">
                            {r.driver_name ?? '—'}
                          </td>
                          <td className="px-5 py-3.5 font-bold text-gray-800 dark:text-white">
                            {currency(r.amount)}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${RECHARGE_BADGE[r.status] ?? ''}`}>
                              {RECHARGE_LABEL[r.status] ?? r.status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-400">
                            {r.bank_account?.bank_name ?? '—'}
                          </td>
                          <td className="px-5 py-3.5 max-w-[180px]">
                            {r.driver_notes && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={r.driver_notes}>
                                {r.driver_notes}
                              </p>
                            )}
                            {r.status === 'rejected' && r.rejection_reason && (
                              <p className="text-xs text-error-600 dark:text-error-400 truncate mt-0.5" title={r.rejection_reason}>
                                ✕ {r.rejection_reason}
                              </p>
                            )}
                            {!r.driver_notes && !(r.status === 'rejected' && r.rejection_reason) && (
                              <span className="text-gray-300 dark:text-gray-700">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                            {dateTimeStr(r.created_at)}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => openProof(r.id)}
                                disabled={proofLoading === r.id}
                                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                                title="Ver comprobante"
                              >
                                {proofLoading === r.id && <Spinner />}
                                Comprobante
                              </button>

                              {r.status === 'pending' && (
                                <>
                                  <button
                                    onClick={() => act(() => confirmRecharge(r.id), r.id)}
                                    disabled={actionLoading === r.id}
                                    className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50"
                                  >
                                    Confirmar
                                  </button>
                                  <button
                                    onClick={() => handleReject(r.id)}
                                    disabled={actionLoading === r.id}
                                    className="px-2.5 py-1 text-xs font-medium rounded-lg bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400 hover:bg-error-100 transition-colors disabled:opacity-50"
                                  >
                                    Rechazar
                                  </button>
                                </>
                              )}
                              {actionLoading === r.id && <Spinner />}
                            </div>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            {!loading && recharges.length === 0 && (
              <div className="py-12 text-center text-sm text-gray-400">
                Sin recargas {rechargeFilter ? RECHARGE_LABEL[rechargeFilter]?.toLowerCase() + 's' : ''}
              </div>
            )}
          </div>
        )}

        {/* ── Bank accounts ──────────────────────────────────────────────────── */}
        {tab === 'banks' && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800 dark:text-white">Cuentas bancarias</p>
              <button
                onClick={() => setBankDialog('new')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nueva cuenta
              </button>
            </div>

            {loading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
                ))}
              </div>
            ) : banks.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">
                No hay cuentas bancarias. Crea la primera.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {banks.map((b) => (
                  <div key={b.id} className="px-5 py-4 flex items-start gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <BankLogo bankName={b.bank_name} logoUrl={b.logo_url} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800 dark:text-white">
                          {b.bank_name}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                          {b.account_type === 'savings' ? 'Ahorros' : 'Corriente'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.is_active ? 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                          {b.is_active ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {b.account_holder} · {b.account_number}
                        {b.id_number ? ` · ${b.id_number}` : ''}
                      </p>
                      {b.notes && (
                        <p className="text-xs text-gray-400 mt-0.5">{b.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => setBankDialog(b)}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleBank(b)}
                        disabled={actionLoading === b.id}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${b.is_active ? 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400 hover:bg-error-100' : 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100'}`}
                      >
                        {b.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                      {actionLoading === b.id && <Spinner />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
