'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { currency, dateStr } from '@/lib/format';
import type { Invoice, BillingPayment, Renewal } from '@/types';
import {
  getInvoices, getPayments, getRenewals, getBillingStats,
  confirmPayment, rejectPayment, markInvoicePaid,
} from '../api';

type Tab = 'invoices' | 'payments' | 'renewals';

const INVOICE_STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  sent: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  paid: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  overdue: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-500',
};
const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', sent: 'Enviada', paid: 'Pagada', overdue: 'Vencida', cancelled: 'Cancelada',
};
const PAYMENT_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400',
  confirmed: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  failed: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
};
const PAYMENT_STATUS_LABEL: Record<string, string> = { pending: 'Pendiente', confirmed: 'Confirmado', failed: 'Fallido' };
const RENEWAL_STATUS_BADGE: Record<string, string> = {
  upcoming: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  overdue: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};
const RENEWAL_STATUS_LABEL: Record<string, string> = { upcoming: 'Próxima', overdue: 'Vencida', cancelled: 'Cancelada' };
const METHOD_LABEL: Record<string, string> = { transfer: 'Transferencia', card: 'Tarjeta', cash: 'Efectivo', other: 'Otro' };

export default function FacturacionView() {
  const [tab, setTab] = useState<Tab>('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [stats, setStats] = useState<{
    total_billed: number; total_paid: number; total_pending: number; total_overdue: number; active_subscriptions: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, pay, ren, st] = await Promise.allSettled([
        getInvoices(),
        getPayments(),
        getRenewals(),
        getBillingStats(),
      ]);
      if (inv.status === 'fulfilled') setInvoices(inv.value.items ?? []);
      if (pay.status === 'fulfilled') setPayments(pay.value.items ?? []);
      if (ren.status === 'fulfilled') setRenewals(ren.value);
      if (st.status === 'fulfilled') setStats(st.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<void>, id: string) => {
    setActionLoading(id);
    try { await fn(); await load(); } finally { setActionLoading(null); }
  };

  const filteredInvoices = filterStatus ? invoices.filter((i) => i.status === filterStatus) : invoices;
  const filteredPayments = filterStatus ? payments.filter((p) => p.status === filterStatus) : payments;

  const Spinner = () => (
    <svg className="w-4 h-4 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 animate-pulse">
                <div className="h-3 w-20 rounded bg-gray-100 dark:bg-gray-800 mb-3" />
                <div className="h-7 w-16 rounded bg-gray-100 dark:bg-gray-800" />
              </div>
            ))
          : [
              { label: 'Total Facturado', value: currency(stats?.total_billed ?? 0), icon: '📄', color: 'text-gray-800 dark:text-white' },
              { label: 'Cobrado', value: currency(stats?.total_paid ?? 0), icon: '✅', color: 'text-success-600 dark:text-success-400' },
              { label: 'Pendiente', value: currency(stats?.total_pending ?? 0), icon: '⏳', color: 'text-warning-600 dark:text-orange-400' },
              { label: 'Vencido', value: currency(stats?.total_overdue ?? 0), icon: '🚨', color: 'text-error-600 dark:text-error-400' },
              { label: 'Suscripciones', value: String(stats?.active_subscriptions ?? 0), icon: '🏢', color: 'text-brand-600 dark:text-brand-400' },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-base">{s.icon}</span>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{s.label}</p>
                </div>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
      </div>

      {/* Tabs + filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
          {([
            { v: 'invoices', l: '📄 Facturas' },
            { v: 'payments', l: '💳 Pagos' },
            { v: 'renewals', l: '🔄 Renovaciones' },
          ] as { v: Tab; l: string }[]).map(({ v, l }) => (
            <button
              key={v}
              onClick={() => { setTab(v); setFilterStatus(''); }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${tab === v ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {l}
            </button>
          ))}
        </div>

        {tab !== 'renewals' && (
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Todo estado</option>
            {tab === 'invoices'
              ? [['draft', 'Borrador'], ['sent', 'Enviada'], ['paid', 'Pagada'], ['overdue', 'Vencida'], ['cancelled', 'Cancelada']].map(([v, l]) => <option key={v} value={v}>{l}</option>)
              : [['pending', 'Pendiente'], ['confirmed', 'Confirmado'], ['failed', 'Fallido']].map(([v, l]) => <option key={v} value={v}>{l}</option>)
            }
          </select>
        )}
      </div>

      {/* Invoices */}
      {tab === 'invoices' && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800 dark:text-white">
              {loading ? '...' : `${filteredInvoices.length} facturas`}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Cooperativa', 'Plan', 'Período', 'Total', 'Vence', 'Estado', 'Acciones'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j} className="px-5 py-3.5"><div className="h-3.5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  : filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-gray-800 dark:text-white">{inv.cooperative?.name ?? '—'}</td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400">{inv.plan?.name ?? '—'}</td>
                        <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{dateStr(inv.period_from)} – {dateStr(inv.period_to)}</td>
                        <td className="px-5 py-3.5 font-bold text-gray-800 dark:text-white">{currency(inv.total)}</td>
                        <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{dateStr(inv.due_date)}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${INVOICE_STATUS_BADGE[inv.status] ?? ''}`}>
                            {INVOICE_STATUS_LABEL[inv.status] ?? inv.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                              <button
                                onClick={() => act(() => markInvoicePaid(inv.id), inv.id)}
                                disabled={actionLoading === inv.id}
                                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50"
                              >
                                Marcar pagada
                              </button>
                            )}
                            {inv.pdf_url && (
                              <a href={inv.pdf_url} target="_blank" rel="noreferrer"
                                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-100 transition-colors">
                                PDF
                              </a>
                            )}
                            {actionLoading === inv.id && <Spinner />}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {!loading && filteredInvoices.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">Sin facturas</div>
          )}
        </div>
      )}

      {/* Payments */}
      {tab === 'payments' && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-800 dark:text-white">
              {loading ? '...' : `${filteredPayments.length} pagos`}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Cooperativa', 'Monto', 'Método', 'Referencia', 'Estado', 'Fecha', 'Acciones'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j} className="px-5 py-3.5"><div className="h-3.5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  : filteredPayments.map((p) => (
                      <tr key={p.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-gray-800 dark:text-white">{p.cooperative?.name ?? '—'}</td>
                        <td className="px-5 py-3.5 font-bold text-gray-800 dark:text-white">{currency(p.amount)}</td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400">{METHOD_LABEL[p.method] ?? p.method}</td>
                        <td className="px-5 py-3.5 text-xs text-gray-400 font-mono">{p.reference ?? '—'}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_STATUS_BADGE[p.status] ?? ''}`}>
                            {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{dateStr(p.created_at)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {p.status === 'pending' && (
                              <>
                                <button onClick={() => act(() => confirmPayment(p.id), p.id)} disabled={actionLoading === p.id}
                                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400 hover:bg-success-100 transition-colors disabled:opacity-50">
                                  Confirmar
                                </button>
                                <button onClick={() => act(() => rejectPayment(p.id), p.id)} disabled={actionLoading === p.id}
                                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400 hover:bg-error-100 transition-colors disabled:opacity-50">
                                  Rechazar
                                </button>
                              </>
                            )}
                            {actionLoading === p.id && <Spinner />}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {!loading && filteredPayments.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">Sin pagos</div>
          )}
        </div>
      )}

      {/* Renewals */}
      {tab === 'renewals' && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-800 dark:text-white">
              {loading ? '...' : `${renewals.length} renovaciones próximas`}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Cooperativa', 'Plan', 'Monto', 'Fecha renovación', 'Estado'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                        {Array.from({ length: 5 }).map((__, j) => (
                          <td key={j} className="px-5 py-3.5"><div className="h-3.5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  : renewals.map((r) => (
                      <tr key={r.cooperative_id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-gray-800 dark:text-white">{r.cooperative_name}</td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400">{r.plan_name}</td>
                        <td className="px-5 py-3.5 font-bold text-gray-800 dark:text-white">{currency(r.amount)}</td>
                        <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{dateStr(r.renews_at)}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${RENEWAL_STATUS_BADGE[r.status] ?? ''}`}>
                            {RENEWAL_STATUS_LABEL[r.status] ?? r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {!loading && renewals.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">Sin renovaciones próximas</div>
          )}
        </div>
      )}
    </div>
  );
}
