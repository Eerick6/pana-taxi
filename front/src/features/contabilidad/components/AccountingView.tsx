'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { currency, dateStr, dateTimeStr } from '@/lib/format';
import type { Settlement } from '@/types';
import { useCoop } from '@/context/CoopContext';
import {
  getSettlements, confirmSettlement, cancelSettlement, getRecharges, confirmRecharge, rejectRecharge,
  getCoopAccount, type CoopAccount,
} from '../api';

const SETTLEMENT_BADGE: Record<string, string> = {
  pending: 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400',
  confirmed: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  cancelled: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
};
const SETTLEMENT_LABEL: Record<string, string> = { pending: 'Pendiente', confirmed: 'Confirmado', cancelled: 'Cancelado' };

interface RechargeRow {
  id: string;
  driver?: { full_name?: string };
  amount: number;
  status: string;
  created_at: string;
}

export default function AccountingView() {
  const { selectedCoop } = useCoop();
  const coopId = selectedCoop?.id;

  const [tab, setTab] = useState<'settlements' | 'recharges'>('settlements');
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [recharges, setRecharges] = useState<RechargeRow[]>([]);
  const [account, setAccount] = useState<CoopAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, a] = await Promise.allSettled([
        getSettlements(coopId),
        getRecharges(),
        coopId ? getCoopAccount(coopId) : Promise.resolve(null),
      ]);
      if (s.status === 'fulfilled') setSettlements(s.value.items ?? []);
      if (r.status === 'fulfilled') setRecharges(r.value.items ?? []);
      if (a.status === 'fulfilled' && a.value) setAccount(a.value);
    } finally {
      setLoading(false);
    }
  }, [coopId]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<void>, id: string) => {
    setActionLoading(id);
    try { await fn(); await load(); } finally { setActionLoading(null); }
  };

  return (
    <div className="space-y-5">
      {/* Account balance — only for selected coop */}
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
        {[
          { v: 'settlements', l: '💸 Liquidaciones' },
          { v: 'recharges', l: '💳 Recargas pendientes' },
        ].map(({ v, l }) => (
          <button key={v} onClick={() => setTab(v as typeof tab)} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === v ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {l}
          </button>
        ))}
      </div>

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
                            {actionLoading === s.id && <svg className="w-4 h-4 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {!loading && settlements.length === 0 && <div className="py-12 text-center text-sm text-gray-400">Sin liquidaciones</div>}
        </div>
      )}

      {tab === 'recharges' && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-800 dark:text-white">Recargas de Billetera — Pendientes</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Conductor', 'Monto', 'Fecha', 'Acciones'].map((h) => (
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
                  : recharges.map((r) => (
                      <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-gray-700 dark:text-gray-300">{r.driver?.full_name ?? '—'}</td>
                        <td className="px-5 py-3.5 font-bold text-gray-800 dark:text-white">{currency(r.amount)}</td>
                        <td className="px-5 py-3.5 text-xs text-gray-400">{dateTimeStr(r.created_at)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => act(() => confirmRecharge(r.id), r.id)} disabled={actionLoading === r.id} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50">Confirmar</button>
                            <button onClick={() => act(() => rejectRecharge(r.id), r.id)} disabled={actionLoading === r.id} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400 hover:bg-error-100 transition-colors disabled:opacity-50">Rechazar</button>
                            {actionLoading === r.id && <svg className="w-4 h-4 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {!loading && recharges.length === 0 && <div className="py-12 text-center text-sm text-gray-400">Sin recargas pendientes</div>}
        </div>
      )}
    </div>
  );
}
