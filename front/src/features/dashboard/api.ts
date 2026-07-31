import api from '@/lib/api';
import { isoDate, nDaysAgo } from '@/lib/format';

// ── Legacy types (kept for existing sub-components still in use) ──────────────

export interface DashboardSummary {
  total_trips: number;
  total_revenue: number;
  total_commissions: number;
  avg_fare: number;
  period: { from: string | null; to: string | null };
}

export interface TripRow {
  id: string;
  status?: string;
  fare_mode?: string;
  fare_amount: number | null;
  commission_amount: number | null;
  completed_at: string | null;
  created_at?: string;
  driver?: { full_name?: string } | null;
  cooperative?: { id?: string; name?: string } | null;
  origin_address?: string | null;
  destination_address?: string | null;
}

export interface TripsReport {
  items: TripRow[];
  total: number;
  page: number;
  limit: number;
}

export interface DashboardPendingCounts {
  pendingDrivers: number;
  pendingVehicles: number;
  pendingCoops: number;
  openSos: number;
}

// ── New dashboard stats ───────────────────────────────────────────────────────

export interface PeriodMetric {
  today: number;
  week: number;
  month: number;
  all: number;
}

export interface DashboardStats {
  overview: {
    cooperatives: number;
    vehicles: number;
    drivers: number;
    clients: number;
    online_now: number;
  };
  trips: {
    in_progress: number;
    waiting: number;
    completed: PeriodMetric;
    cancelled: PeriodMetric;
    revenue: PeriodMetric;
    commission: PeriodMetric;
  };
  financials: {
    total_recharges: number;
    total_commissions_deducted: number;
    month_recharges: number;
    month_commissions_deducted: number;
  };
  top_cooperatives: { id: string; name: string; total_trips: number; total_revenue: number; total_commission: number }[];
  top_drivers: { id: string; full_name: string; total_trips: number; avg_rating: number }[];
  top_clients: { id: string; full_name: string; total_trips: number; rating: number }[];
  coop_breakdown: { id: string; name: string; status: string; vehicle_count: number; owner_count: number; active_now: number }[];
}

export async function getDashboardStats(cooperativeId?: string): Promise<DashboardStats> {
  const { data } = await api.get('/reports/dashboard-stats', {
    params: cooperativeId ? { cooperative_id: cooperativeId } : undefined,
  });
  return data;
}

// ── Legacy helpers ────────────────────────────────────────────────────────────

export async function getRecentTrips(limit = 10, cooperative_id?: string): Promise<TripsReport> {
  const { data } = await api.get('/reports/trips', {
    params: { limit, page: 1, ...(cooperative_id ? { cooperative_id } : {}) },
  });
  return data;
}

export async function getPendingCounts(cooperative_id?: string): Promise<DashboardPendingCounts> {
  const results = await Promise.allSettled([
    cooperative_id
      ? api.get('/drivers/cooperative/pending', { params: { limit: 1, page: 1 } })
      : api.get('/drivers/platform/pending', { params: { limit: 1, page: 1 } }),
    api.get('/vehicles/pending', {
      params: { limit: 1, page: 1, ...(cooperative_id ? { cooperative_id } : {}) },
    }),
    cooperative_id
      ? Promise.resolve({ data: { total: 0 } })
      : api.get('/cooperatives/pending', { params: { limit: 1, page: 1 } }),
    api.get('/sos', { params: { status: 'open', limit: 1, page: 1 } }),
  ]);

  const extract = (r: PromiseSettledResult<{ data: { total?: number; data?: unknown[] } }>) => {
    if (r.status === 'rejected') return 0;
    const d = r.value.data;
    return Number(d?.total ?? d?.data?.length ?? 0);
  };

  const [drivers, vehicles, coops, sos] = results as PromiseSettledResult<{ data: { total?: number; data?: unknown[] } }>[];

  return {
    pendingDrivers: extract(drivers),
    pendingVehicles: extract(vehicles),
    pendingCoops: extract(coops),
    openSos: extract(sos),
  };
}

// ── Types used by sub-components ─────────────────────────────────────────────

export interface CoopReportRow {
  cooperative_id: string;
  name: string;
  total_revenue: number;
  total_trips: number;
}

export interface EntityCounts {
  cooperativas: number;
  conductores: number;
  conductores_online: number;
  vehiculos: number;
  clientes: number;
  viajes_hoy: number;
}

export interface DailyPoint {
  date: string;
  revenue: number;
  trips: number;
}

// Keep for compat
export type { };
export const isoDateExport = isoDate;
export const nDaysAgoExport = nDaysAgo;
