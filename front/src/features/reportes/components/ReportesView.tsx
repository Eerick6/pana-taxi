'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { currency, num, isoDate, nDaysAgo } from '@/lib/format';
import type { GlobalReportSummary, ReportCoopRow, ReportDailyPoint } from '@/types';
import { getGlobalSummary, getDailyPoints, getCoopActivity } from '../api';

const RANGES = [
  { label: 'Hoy', days: 0 },
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
  { label: '90 días', days: 90 },
];

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

function SimpleChart({ data }: { data: ReportDailyPoint[] }) {
  if (data.length === 0) return null;
  const maxTrips = Math.max(...data.map((d) => d.trips), 1);
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {/* Trips chart */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Viajes por día</p>
        <div className="flex items-end gap-1 h-32">
          {data.map((d, i) => (
            <div
              key={d.date}
              className="flex-1 flex flex-col items-center justify-end gap-1 group cursor-pointer"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {hovered === i && (
                <div className="absolute -translate-y-8 bg-gray-800 dark:bg-gray-700 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
                  {d.date}: {d.trips} viajes · {currency(d.revenue)}
                </div>
              )}
              <div
                className="w-full rounded-t-sm bg-brand-500 group-hover:bg-brand-600 transition-colors"
                style={{ height: `${Math.max((d.trips / maxTrips) * 100, 2)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          {data.length > 0 && (
            <>
              <span className="text-xs text-gray-400">{data[0].date.slice(5)}</span>
              <span className="text-xs text-gray-400">{data[data.length - 1].date.slice(5)}</span>
            </>
          )}
        </div>
      </div>

      {/* Revenue chart */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Ingresos por día</p>
        <div className="flex items-end gap-1 h-24">
          {data.map((d, i) => (
            <div
              key={d.date}
              className="flex-1 flex flex-col items-center justify-end group cursor-pointer"
              onMouseEnter={() => setHovered(i + data.length)}
              onMouseLeave={() => setHovered(null)}
            >
              <div
                className="w-full rounded-t-sm bg-success-400 group-hover:bg-success-500 transition-colors"
                style={{ height: `${Math.max((d.revenue / maxRevenue) * 100, 2)}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ReportesView() {
  const [range, setRange] = useState(30);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [summary, setSummary] = useState<GlobalReportSummary | null>(null);
  const [daily, setDaily] = useState<ReportDailyPoint[]>([]);
  const [coops, setCoops] = useState<ReportCoopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState<'trips' | 'revenue' | 'cancellations'>('trips');

  const computeDates = useCallback(() => {
    if (customFrom && customTo) return { from: customFrom, to: customTo };
    if (range === 0) {
      const t = isoDate(new Date());
      return { from: t, to: t };
    }
    return { from: isoDate(nDaysAgo(range)), to: isoDate(new Date()) };
  }, [range, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = computeDates();
    try {
      const [s, d, c] = await Promise.allSettled([
        getGlobalSummary(from, to),
        getDailyPoints(from, to),
        getCoopActivity(from, to),
      ]);
      if (s.status === 'fulfilled') setSummary(s.value);
      if (d.status === 'fulfilled') setDaily(d.value);
      if (c.status === 'fulfilled') setCoops(c.value);
    } finally {
      setLoading(false);
    }
  }, [computeDates]);

  useEffect(() => { load(); }, [load]);

  const sortedCoops = [...coops].sort((a, b) => b[sortCol] - a[sortCol]);
  const maxTrips = Math.max(...coops.map((c) => c.trips), 1);

  return (
    <div className="space-y-6">
      {/* Date range selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => { setRange(r.days); setCustomFrom(''); setCustomTo(''); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${range === r.days && !customFrom ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <span className="text-xs text-gray-400">al</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 animate-pulse">
                <div className="h-3 w-24 rounded bg-gray-100 dark:bg-gray-800 mb-3" />
                <div className="h-8 w-20 rounded bg-gray-100 dark:bg-gray-800" />
              </div>
            ))
          : [
              { label: 'Viajes Totales', value: num(summary?.total_trips), icon: '🗺️', sub: `${num(summary?.completed_trips)} completados` },
              { label: 'Cancelaciones', value: num(summary?.cancelled_trips), icon: '❌', sub: `${Number(summary?.cancellation_rate ?? 0).toFixed(1)}% tasa` },
              { label: 'Tiempo Promedio', value: `${Number(summary?.avg_duration_min ?? 0).toFixed(0)} min`, icon: '⏱️', sub: 'por viaje' },
              { label: 'Tarifa Promedio', value: currency(summary?.avg_fare ?? 0), icon: '💵', sub: 'por viaje' },
              { label: 'Ingresos Brutos', value: currency(summary?.total_revenue ?? 0), icon: '📈', sub: 'período seleccionado' },
              { label: 'Comisiones', value: currency(summary?.total_commissions ?? 0), icon: '💰', sub: 'para la plataforma' },
              { label: 'Conductores Activos', value: num(summary?.active_drivers), icon: '👤', sub: 'han hecho ≥1 viaje' },
              { label: 'Coops Activas', value: num(summary?.active_cooperatives), icon: '🏢', sub: 'han tenido actividad' },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{s.icon}</span>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider leading-tight">{s.label}</p>
                </div>
                <p className="text-2xl font-bold text-gray-800 dark:text-white mb-0.5">{s.value}</p>
                <p className="text-xs text-gray-400">{s.sub}</p>
              </div>
            ))}
      </div>

      {/* Charts + coop table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Daily chart */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Tendencia de viajes</h3>
            <p className="text-xs text-gray-400 mt-0.5">Viajes e ingresos por día en el período</p>
          </div>
          {loading ? (
            <div className="h-48 rounded-xl bg-gray-50 dark:bg-gray-800 animate-pulse" />
          ) : daily.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-400">Sin datos para el período</div>
          ) : (
            <div className="relative">
              <SimpleChart data={daily} />
            </div>
          )}
        </div>

        {/* Top coops */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Top cooperativas</h3>
              <p className="text-xs text-gray-400 mt-0.5">Ordenadas por actividad</p>
            </div>
            <div className="flex gap-1">
              {(['trips', 'revenue', 'cancellations'] as const).map((col) => (
                <button
                  key={col}
                  onClick={() => setSortCol(col)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${sortCol === col ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  {col === 'trips' ? 'Viajes' : col === 'revenue' ? 'Ingresos' : 'Cancelac.'}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex justify-between mb-1">
                    <div className="h-3 w-32 rounded bg-gray-100 dark:bg-gray-800" />
                    <div className="h-3 w-12 rounded bg-gray-100 dark:bg-gray-800" />
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800" />
                </div>
              ))}
            </div>
          ) : sortedCoops.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">Sin actividad en el período</div>
          ) : (
            <div className="space-y-4">
              {sortedCoops.slice(0, 8).map((c, i) => (
                <div key={c.cooperative_id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-gray-400 w-4 flex-shrink-0">{i + 1}</span>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{c.cooperative_name}</span>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <span className="text-sm font-bold text-gray-800 dark:text-white">
                        {sortCol === 'trips' ? num(c.trips) : sortCol === 'revenue' ? currency(c.revenue) : num(c.cancellations)}
                      </span>
                    </div>
                  </div>
                  <MiniBar value={c.trips} max={maxTrips} />
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-gray-400">{num(c.drivers)} conductores</span>
                    <span className="text-xs text-gray-400">{currency(c.revenue)} ingresos</span>
                    <span className="text-xs text-error-400">{num(c.cancellations)} cancel.</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full coop table */}
      {coops.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-800 dark:text-white">Detalle por cooperativa</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['#', 'Cooperativa', 'Viajes', 'Ingresos', 'Comisiones', 'Conductores', 'Cancelaciones'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedCoops.map((c, i) => (
                  <tr key={c.cooperative_id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-3.5 text-xs text-gray-400 font-medium">{i + 1}</td>
                    <td className="px-5 py-3.5 font-medium text-gray-800 dark:text-white">{c.cooperative_name}</td>
                    <td className="px-5 py-3.5 font-bold text-gray-800 dark:text-white">{num(c.trips)}</td>
                    <td className="px-5 py-3.5 font-bold text-success-600 dark:text-success-400">{currency(c.revenue)}</td>
                    <td className="px-5 py-3.5 text-brand-600 dark:text-brand-400">{currency(c.commissions)}</td>
                    <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400">{num(c.drivers)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.cancellations > 0 ? 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                        {num(c.cancellations)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
