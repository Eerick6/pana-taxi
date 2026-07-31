import api from '@/lib/api';
import type { GlobalReportSummary, ReportCoopRow, ReportDailyPoint } from '@/types';

export async function getGlobalSummary(from?: string, to?: string): Promise<GlobalReportSummary> {
  const { data } = await api.get('/reports/global', { params: { from, to } });
  return data;
}

export async function getDailyPoints(from?: string, to?: string): Promise<ReportDailyPoint[]> {
  const { data } = await api.get('/reports/daily', { params: { from, to } });
  return data?.items ?? data ?? [];
}

export async function getCoopActivity(from?: string, to?: string): Promise<ReportCoopRow[]> {
  const { data } = await api.get('/reports/cooperatives', { params: { from, to, limit: 20 } });
  return data?.items ?? data ?? [];
}
