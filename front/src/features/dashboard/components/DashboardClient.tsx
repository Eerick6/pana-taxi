'use client';

import React, { useEffect, useState, useCallback } from 'react';
import StatCards from './StatCards';
import TrendChart from './TrendChart';
import PendingWidget from './PendingWidget';
import CoopRankingWidget from './CoopRankingWidget';
import RecentTripsTable from './RecentTripsTable';
import { useAuth } from '@/context/AuthContext';
import { useCoop } from '@/context/CoopContext';
import {
  getSummary, getTrendData, getRecentTrips, getCoopRanking, getPendingCounts,
  type DashboardSummary, type DailyPoint, type TripRow, type CoopReportRow, type DashboardPendingCounts,
} from '../api';

export default function DashboardClient() {
  const { user, isLoading: authLoading, isPlatformStaff: isPlat } = useAuth();
  const { selectedCoop } = useCoop();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trend, setTrend] = useState<DailyPoint[]>([]);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [coopRanking, setCoopRanking] = useState<CoopReportRow[]>([]);
  const [pending, setPending] = useState<DashboardPendingCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState('');
  const [lastRefreshStr, setLastRefreshStr] = useState('');

  useEffect(() => {
    setNow(new Date().toLocaleDateString('es-EC', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }));
  }, []);

  const coopId = selectedCoop?.id;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t, r, p] = await Promise.allSettled([
        getSummary(coopId),
        getTrendData(coopId),
        getRecentTrips(10, coopId),
        getPendingCounts(coopId),
      ]);

      if (s.status === 'fulfilled') setSummary(s.value);
      if (t.status === 'fulfilled') setTrend(t.value);
      if (r.status === 'fulfilled') setTrips(r.value.data ?? []);
      if (p.status === 'fulfilled') setPending(p.value);

      // Only fetch coop ranking when in platform-wide view
      if (!coopId && isPlat) {
        const cr = await getCoopRanking().catch(() => []);
        setCoopRanking(cr);
      } else {
        setCoopRanking([]);
      }
    } finally {
      setLoading(false);
      setLastRefreshStr(new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }));
    }
  }, [coopId, isPlat]);

  useEffect(() => {
    if (authLoading || !user) return;
    load();
  }, [user, authLoading, load]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            {selectedCoop ? selectedCoop.name : 'Dashboard'}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {now && <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{now}</p>}
            {selectedCoop && (
              <>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 px-2 py-0.5 rounded-full">
                  RUC: {selectedCoop.ruc}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  selectedCoop.status === 'active'
                    ? 'text-success-700 bg-success-50 dark:text-success-400 dark:bg-success-500/10'
                    : selectedCoop.status === 'suspended'
                    ? 'text-error-700 bg-error-50 dark:text-error-400 dark:bg-error-500/10'
                    : 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700'
                }`}>
                  {selectedCoop.status === 'active' ? '● Activa' : selectedCoop.status === 'suspended' ? '● Suspendida' : '● Inactiva'}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {lastRefreshStr && (
            <p className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
              Actualizado: {lastRefreshStr}
            </p>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <StatCards summary={summary} pending={pending} loading={loading} />

      {/* Charts row */}
      <div className={`grid gap-5 ${!coopId && isPlat ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
        <div className={!coopId && isPlat ? 'lg:col-span-2' : ''}>
          <TrendChart data={trend} loading={loading} />
        </div>
        {!coopId && isPlat && (
          <CoopRankingWidget data={coopRanking} loading={loading} />
        )}
      </div>

      {/* Pending + Coop-specific widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <PendingWidget pending={pending} loading={loading} />

        {/* Context info card */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">
            {selectedCoop ? `Resumen — ${selectedCoop.name}` : 'Resumen de Plataforma'}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Viajes', value: summary?.total_trips ?? 0, fmt: (v: number) => String(v) },
              { label: 'Ingresos', value: summary?.total_revenue ?? 0, fmt: (v: number) => `$${Number(v).toFixed(2)}` },
              { label: 'Comisiones', value: summary?.total_commissions ?? 0, fmt: (v: number) => `$${Number(v).toFixed(2)}` },
              { label: 'Tarifa Prom.', value: summary?.avg_fare ?? 0, fmt: (v: number) => `$${Number(v).toFixed(2)}` },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
                <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                {loading ? (
                  <div className="h-6 w-20 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                ) : (
                  <p className="text-xl font-bold text-gray-800 dark:text-white">{item.fmt(item.value)}</p>
                )}
              </div>
            ))}
          </div>
          {!loading && summary?.period?.from && (
            <p className="text-xs text-gray-400 mt-3">
              Período: {summary.period.from?.slice(0, 10)} al {summary.period.to?.slice(0, 10) ?? 'hoy'}
            </p>
          )}
        </div>
      </div>

      {/* Recent trips */}
      <RecentTripsTable trips={trips} loading={loading} />
    </div>
  );
}
