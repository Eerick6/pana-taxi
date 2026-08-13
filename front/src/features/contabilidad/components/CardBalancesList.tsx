'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { currency, dateTimeStr } from '@/lib/format';
import { getCardBalances, payoutCardBalance, type CardBalanceRow } from '../api';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

export default function CardBalancesList({ cooperativeId }: { cooperativeId?: string }) {
  const [rows, setRows] = useState<CardBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState<CardBalanceRow | null>(null);
  const [notes, setNotes] = useState('');
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getCardBalances(cooperativeId));
    } finally {
      setLoading(false);
    }
  }, [cooperativeId]);

  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(['wallet.card_payout'], load);

  const doPayout = async () => {
    if (!payTarget) return;
    setPaying(true);
    try {
      await payoutCardBalance(payTarget.wallet_id, notes.trim() || undefined);
      setPayTarget(null);
      setNotes('');
      await load();
    } catch {
      alert('No se pudo registrar el pago. Intenta de nuevo.');
    } finally {
      setPaying(false);
    }
  };

  const total = rows.reduce((sum, r) => sum + parseFloat(r.card_balance), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <p className="text-xs text-gray-400 mb-1">Total pendiente por pagar</p>
        <p className="text-2xl font-bold text-gray-800 dark:text-white">{currency(total)}</p>
        <p className="text-xs text-gray-400 mt-1">
          Lo que la plataforma les debe a los conductores por viajes cobrados con tarjeta.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Cargando...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No hay saldos pendientes por tarjeta.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-left text-xs text-gray-400">
                  <th className="px-5 py-3 font-medium">Conductor</th>
                  <th className="px-5 py-3 font-medium">Teléfono</th>
                  <th className="px-5 py-3 font-medium">Saldo</th>
                  <th className="px-5 py-3 font-medium">Actualizado</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.wallet_id} className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                    <td className="px-5 py-3 font-medium text-gray-800 dark:text-white">{r.driver_name}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{r.driver_phone ?? '—'}</td>
                    <td className="px-5 py-3 font-semibold text-gray-800 dark:text-white">{currency(parseFloat(r.card_balance))}</td>
                    <td className="px-5 py-3 text-gray-400">{dateTimeStr(r.updated_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setPayTarget(r)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
                      >
                        Pagar y cerrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payTarget && (
        <div
          className="fixed inset-0 z-999999 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => !paying && setPayTarget(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">Confirmar pago</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Confirmá que ya le pagaste <strong>{currency(parseFloat(payTarget.card_balance))}</strong> a{' '}
              <strong>{payTarget.driver_name}</strong> por fuera del sistema (transferencia, efectivo, etc.).
              Esto solo registra el pago y cierra el período — no envía plata.
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Nota opcional (ej. número de transferencia)"
              rows={2}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setPayTarget(null)}
                disabled={paying}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={doPayout}
                disabled={paying}
                className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                {paying ? 'Registrando...' : 'Confirmar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
