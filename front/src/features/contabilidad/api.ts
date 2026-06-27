import api from '@/lib/api';
import type { Settlement, PaginatedResponse } from '@/types';
import { isoDate, nDaysAgo } from '@/lib/format';

export interface CoopAccount {
  balance: number;
  total_earned: number;
  total_settled: number;
}

export interface StatementRow {
  id: string;
  type: string;
  amount: number;
  description: string;
  created_at: string;
}

export async function getCoopAccount(cooperative_id?: string): Promise<CoopAccount> {
  const { data } = await api.get('/accounting/coop-account', {
    params: cooperative_id ? { cooperative_id } : {},
  });
  return data;
}

export async function getCoopStatement(cooperative_id?: string, from_date?: string, to_date?: string): Promise<PaginatedResponse<StatementRow>> {
  const { data } = await api.get('/accounting/coop-statement', {
    params: {
      cooperative_id,
      from_date: from_date ?? isoDate(nDaysAgo(29)),
      to_date,
      limit: 50,
      page: 1,
    },
  });
  return data;
}

export async function getSettlements(cooperative_id?: string): Promise<PaginatedResponse<Settlement>> {
  const { data } = await api.get('/accounting/settlements', {
    params: { cooperative_id, limit: 20, page: 1 },
  });
  return data;
}

export async function createSettlement(body: {
  cooperative_id: string;
  amount: number;
  period_from: string;
  period_to: string;
}): Promise<Settlement> {
  const { data } = await api.post('/accounting/settlements', body);
  return data;
}

export async function confirmSettlement(id: string): Promise<void> {
  await api.patch(`/accounting/settlements/${id}/confirm`);
}

export async function cancelSettlement(id: string): Promise<void> {
  await api.delete(`/accounting/settlements/${id}`);
}

export async function getPlatformFee(): Promise<{ commission_pct: number }> {
  const { data } = await api.get('/accounting/platform-fee');
  return data;
}

export async function getRecharges(status?: string): Promise<PaginatedResponse<{ id: string; driver?: { full_name?: string }; amount: number; status: string; created_at: string }>> {
  const { data } = await api.get('/wallet/recharges/pending', {
    params: { status: status ?? 'pending', limit: 20, page: 1 },
  });
  return data;
}

export async function confirmRecharge(id: string): Promise<void> {
  await api.patch(`/wallet/recharges/${id}/confirm`);
}

export async function rejectRecharge(id: string): Promise<void> {
  await api.patch(`/wallet/recharges/${id}/reject`);
}
