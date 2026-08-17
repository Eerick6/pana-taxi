'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  getDashboardStats,
  type DashboardStats,
} from '../api';
import { getStandsSummary } from '@/features/cooperativas/api';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

const DASHBOARD_EVENTS = [
  'trip.created', 'trip.accepted', 'trip.completed', 'trip.cancelled',
  'driver.registered', 'driver.approved', 'driver.online_status_changed',
  'vehicle.registered', 'vehicle.approved',
  'cooperative.registered', 'cooperative.approved',
  'client.registered',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt$ = (v: number) => `$${v.toFixed(2)}`;
const fmtN = (v: number) => v.toLocaleString('es-EC');

type Range = 'today' | 'week' | 'month' | 'all';
const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: '7 días' },
  { key: 'month', label: '30 días' },
  { key: 'all', label: 'Total' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function Skeleton({ w = 'w-20', h = 'h-6' }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} rounded bg-gray-200 dark:bg-gray-700 animate-pulse`} />;
}

function KpiCard({
  label, value, sub, icon, color, loading,
}: {
  label: string; value: string | number; sub?: string;
  icon: string; color: string; loading: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
        {loading ? <Skeleton /> : (
          <p className="text-2xl font-bold text-gray-800 dark:text-white leading-tight">
            {typeof value === 'number' ? fmtN(value) : value}
          </p>
        )}
        {sub && !loading && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>
        )}
      </div>
    </div>
  );
}

function TripMetricCard({
  label, value, icon, color, loading, currency,
}: {
  label: string; value: number; icon: string; color: string; loading: boolean; currency?: boolean;
}) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
      </div>
      {loading ? <Skeleton /> : (
        <p className={`text-xl font-bold ${color}`}>
          {currency ? fmt$(value) : fmtN(value)}
        </p>
      )}
    </div>
  );
}

function TopCard({
  title, items, loading, renderItem,
}: {
  title: string;
  items: unknown[];
  loading: boolean;
  renderItem: (item: unknown, idx: number) => React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">{title}</h3>
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => <Skeleton key={i} w="w-full" h="h-10" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">Sin datos aún</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => renderItem(item, idx))}
        </div>
      )}
    </div>
  );
}

const MEDAL = ['🥇', '🥈', '🥉'];

function StandsWidget({
  loading,
  standsSummary,
}: {
  loading: boolean;
  standsSummary: Array<{ coop_id: string; coop_name: string; stands: number; drivers_at_stands: number }>;
}) {
  const [search, setSearch] = React.useState('');

  const filtered = search.trim()
    ? standsSummary.filter((s) => s.coop_name.toLowerCase().includes(search.toLowerCase()))
    : standsSummary;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white">
          Paradas por cooperativa
          <span className="ml-2 text-xs font-normal text-gray-400">taxis en parada ahora</span>
        </h3>
        {!loading && standsSummary.length > 0 && (
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
            </svg>
            <input
              type="text"
              placeholder="Filtrar cooperativa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 w-44"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : standsSummary.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
          No hay paradas registradas. Crea paradas desde el menú de cooperativas.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
          Sin resultados para &quot;{search}&quot;
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <div key={s.coop_id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-white">{s.coop_name}</p>
                <p className="text-xs text-gray-400">{s.stands} parada{s.stands !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-lg font-bold ${s.drivers_at_stands > 0 ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400'}`}>
                  {s.drivers_at_stands}
                </span>
                <span className="text-xs text-gray-400">taxi{s.drivers_at_stands !== 1 ? 's' : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  const r = Math.round(rating);
  return (
    <span className="text-xs text-yellow-500">{'★'.repeat(r)}{'☆'.repeat(5 - r)}</span>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function DashboardClient() {
  const { user, isLoading: authLoading } = useAuth();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [standsSummary, setStandsSummary] = useState<Array<{ coop_id: string; coop_name: string; stands: number; drivers_at_stands: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('today');
  const [now, setNow] = useState('');
  const [lastRefresh, setLastRefresh] = useState('');

  useEffect(() => {
    setNow(new Date().toLocaleDateString('es-EC', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, stands] = await Promise.all([
        getDashboardStats().catch(() => null),
        getStandsSummary().catch(() => []),
      ]);
      if (s) setStats(s);
      setStandsSummary(stands);
      setLastRefresh(new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    load();
  }, [user, authLoading, load]);
  useRealtimeRefresh(DASHBOARD_EVENTS, load);

  const R = range;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Dashboard</h1>
          {now && <p className="text-sm text-gray-500 dark:text-gray-400 capitalize mt-0.5">{now}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {lastRefresh && (
            <p className="text-xs text-gray-400 hidden sm:block">Actualizado: {lastRefresh}</p>
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

      {/* ── Row 1: Overview KPIs ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="Cooperativas" value={stats?.overview.cooperatives ?? 0} icon="🏢" color="bg-blue-50 dark:bg-blue-500/10" loading={loading} />
        <KpiCard label="Vehículos activos" value={stats?.overview.vehicles ?? 0} icon="🚗" color="bg-amber-50 dark:bg-amber-500/10" loading={loading} />
        <KpiCard label="Conductores" value={stats?.overview.drivers ?? 0} icon="👤" color="bg-violet-50 dark:bg-violet-500/10" loading={loading}
          sub={`${fmtN(stats?.overview.online_now ?? 0)} online ahora`} />
        <KpiCard label="Clientes" value={stats?.overview.clients ?? 0} icon="👥" color="bg-green-50 dark:bg-green-500/10" loading={loading} />
        <KpiCard label="Online ahora" value={stats?.overview.online_now ?? 0} icon="🟢" color="bg-emerald-50 dark:bg-emerald-500/10" loading={loading}
          sub={`${fmtN(stats?.trips.in_progress ?? 0)} en viaje`} />
      </div>

      {/* ── Row 2: Real-time trip status ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/20 p-5">
          <p className="text-xs text-blue-500 dark:text-blue-400 mb-1">Viajes en curso</p>
          {loading ? <Skeleton /> : (
            <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{fmtN(stats?.trips.in_progress ?? 0)}</p>
          )}
          <p className="text-xs text-blue-400 mt-1">aceptados + en progreso</p>
        </div>
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-5">
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">Esperando conductor</p>
          {loading ? <Skeleton /> : (
            <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">{fmtN(stats?.trips.waiting ?? 0)}</p>
          )}
          <p className="text-xs text-amber-400 mt-1">solicitados sin asignar</p>
        </div>
      </div>

      {/* ── Row 3: Period metrics ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        {/* Range tabs */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 mr-2">Período:</span>
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                range === r.key
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <TripMetricCard label="Viajes completados" value={stats?.trips.completed[R] ?? 0} icon="✅" color="text-green-600 dark:text-green-400" loading={loading} />
          <TripMetricCard label="Cancelados" value={stats?.trips.cancelled[R] ?? 0} icon="❌" color="text-red-500 dark:text-red-400" loading={loading} />
          <TripMetricCard label="Ingresos generados" value={stats?.trips.revenue[R] ?? 0} icon="💰" color="text-emerald-600 dark:text-emerald-400" loading={loading} currency />
          <TripMetricCard label="Comisión plataforma" value={stats?.trips.commission[R] ?? 0} icon="🏦" color="text-blue-600 dark:text-blue-400" loading={loading} currency />
        </div>
      </div>

      {/* ── Row 4: Wallet financials ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">Wallet — Historial</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-4">
            <p className="text-xs text-green-600 dark:text-green-400 mb-1">Recargas totales</p>
            {loading ? <Skeleton /> : (
              <p className="text-xl font-bold text-green-700 dark:text-green-300">{fmt$(stats?.financials.total_recharges ?? 0)}</p>
            )}
            <p className="text-xs text-green-500/70 mt-1">cuánto han comprado</p>
          </div>
          <div className="rounded-xl bg-orange-50 dark:bg-orange-900/20 p-4">
            <p className="text-xs text-orange-600 dark:text-orange-400 mb-1">Comisiones cobradas</p>
            {loading ? <Skeleton /> : (
              <p className="text-xl font-bold text-orange-700 dark:text-orange-300">{fmt$(stats?.financials.total_commissions_deducted ?? 0)}</p>
            )}
            <p className="text-xs text-orange-500/70 mt-1">cuánto han gastado</p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
            <p className="text-xs text-gray-400 mb-1">Recargas este mes</p>
            {loading ? <Skeleton /> : (
              <p className="text-lg font-bold text-gray-700 dark:text-gray-200">{fmt$(stats?.financials.month_recharges ?? 0)}</p>
            )}
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
            <p className="text-xs text-gray-400 mb-1">Comisiones este mes</p>
            {loading ? <Skeleton /> : (
              <p className="text-lg font-bold text-gray-700 dark:text-gray-200">{fmt$(stats?.financials.month_commissions_deducted ?? 0)}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 5: Top 3 rankings ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TopCard
          title="Top 3 Cooperativas"
          items={stats?.top_cooperatives ?? []}
          loading={loading}
          renderItem={(item, idx) => {
            const c = item as DashboardStats['top_cooperatives'][0];
            return (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                <span className="text-xl">{MEDAL[idx]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{c.name}</p>
                  <p className="text-xs text-gray-400">{fmtN(c.total_trips)} viajes · {fmt$(c.total_revenue)}</p>
                </div>
              </div>
            );
          }}
        />
        <TopCard
          title="Top 3 Taxistas"
          items={stats?.top_drivers ?? []}
          loading={loading}
          renderItem={(item, idx) => {
            const d = item as DashboardStats['top_drivers'][0];
            return (
              <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                <span className="text-xl">{MEDAL[idx]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{d.full_name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-400">{fmtN(d.total_trips)} viajes</p>
                    {d.avg_rating > 0 && <Stars rating={d.avg_rating} />}
                  </div>
                </div>
              </div>
            );
          }}
        />
        <TopCard
          title="Top 3 Clientes"
          items={stats?.top_clients ?? []}
          loading={loading}
          renderItem={(item, idx) => {
            const c = item as DashboardStats['top_clients'][0];
            return (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                <span className="text-xl">{MEDAL[idx]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{c.full_name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-400">{fmtN(c.total_trips)} viajes</p>
                    {c.rating > 0 && <Stars rating={c.rating} />}
                  </div>
                </div>
              </div>
            );
          }}
        />
      </div>

      {/* ── Row 6: Paradas por cooperativa ───────────────────────────────── */}
      <StandsWidget loading={loading} standsSummary={standsSummary} />

    </div>
  );
}
