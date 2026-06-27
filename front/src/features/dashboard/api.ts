import api from '@/lib/api';
import { isoDate, nDaysAgo } from '@/lib/format';

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

export interface CoopReportRow {
  cooperative_id: string;
  name: string;
  total_trips: number;
  total_revenue: number;
  total_commissions: number;
  avg_fare: number;
}

export interface DailyPoint {
  date: string;
  revenue: number;
  trips: number;
  commissions: number;
}

export interface DashboardPendingCounts {
  pendingDrivers: number;
  pendingVehicles: number;
  pendingCoops: number;
  openSos: number;
}

export interface TripsReport {
  data: TripRow[];
  total: number;
  page: number;
  limit: number;
}

export async function getSummary(cooperative_id?: string): Promise<DashboardSummary> {
  const { data } = await api.get('/reports/summary', {
    params: {
      from_date: isoDate(nDaysAgo(29)),
      ...(cooperative_id ? { cooperative_id } : {}),
    },
  });
  return data;
}

export async function getTrendData(cooperative_id?: string): Promise<DailyPoint[]> {
  const from = nDaysAgo(29);
  const { data } = await api.get('/reports/trips', {
    params: {
      limit: 500,
      page: 1,
      from_date: isoDate(from),
      ...(cooperative_id ? { cooperative_id } : {}),
    },
  });

  const rows: TripRow[] = data.data ?? [];
  const byDate: Record<string, DailyPoint> = {};

  for (let i = 0; i < 30; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    const key = isoDate(d);
    byDate[key] = { date: key, revenue: 0, trips: 0, commissions: 0 };
  }

  for (const row of rows) {
    const key = (row.completed_at ?? row.created_at)?.slice(0, 10);
    if (key && byDate[key]) {
      byDate[key].revenue += Number(row.fare_amount ?? 0);
      byDate[key].commissions += Number(row.commission_amount ?? 0);
      byDate[key].trips += 1;
    }
  }

  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getRecentTrips(limit = 10, cooperative_id?: string): Promise<TripsReport> {
  const { data } = await api.get('/reports/trips', {
    params: { limit, page: 1, ...(cooperative_id ? { cooperative_id } : {}) },
  });
  return data;
}

export async function getCoopRanking(): Promise<CoopReportRow[]> {
  try {
    const { data } = await api.get('/reports/cooperatives', {
      params: { from_date: isoDate(nDaysAgo(29)) },
    });
    return data.data ?? data ?? [];
  } catch {
    return [];
  }
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
