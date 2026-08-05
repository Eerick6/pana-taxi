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

export interface RechargeRow {
  id: string;
  driver_name?: string;
  amount: number;
  status: string;
  created_at: string;
  bank_account?: { bank_name?: string; account_number?: string } | null;
  driver_notes?: string;
  rejection_reason?: string;
}

export interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  account_type: 'savings' | 'checking';
  id_number?: string;
  logo_url?: string;
  notes?: string;
  is_active: boolean;
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

export async function getSettlements(cooperative_id?: string, page = 1): Promise<PaginatedResponse<Settlement>> {
  const { data } = await api.get('/accounting/settlements', {
    params: { cooperative_id, limit: 20, page },
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

export async function getRecharges(status?: string, page = 1): Promise<PaginatedResponse<RechargeRow>> {
  const { data } = await api.get('/wallet/recharges', {
    params: { ...(status ? { status } : {}), limit: 20, page },
  });
  return data;
}

export async function getRechargeProofUrl(id: string): Promise<string> {
  const { data } = await api.get(`/wallet/recharges/${id}/proof-url`);
  return data.url as string;
}

export async function confirmRecharge(id: string): Promise<void> {
  await api.patch(`/wallet/recharges/${id}/confirm`);
}

export async function rejectRecharge(id: string, reason: string): Promise<void> {
  await api.patch(`/wallet/recharges/${id}/reject`, { reason });
}

// Bank accounts

export async function getBankAccounts(): Promise<BankAccount[]> {
  const { data } = await api.get('/wallet/bank-accounts/all');
  return data;
}

export async function uploadBankLogo(file: File): Promise<{ logo_url: string; resolved_url: string }> {
  const form = new FormData();
  form.append('logo', file);
  const { data } = await api.post('/wallet/bank-accounts/upload-logo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data as { logo_url: string; resolved_url: string };
}

export async function createBankAccount(dto: {
  bank_name: string;
  account_number: string;
  account_holder: string;
  account_type: 'savings' | 'checking';
  id_number?: string;
  logo_url?: string;
  notes?: string;
}): Promise<BankAccount> {
  const { data } = await api.post('/wallet/bank-accounts', dto);
  return data;
}

export async function updateBankAccount(id: string, dto: Partial<{
  bank_name: string;
  account_number: string;
  account_holder: string;
  account_type: 'savings' | 'checking';
  id_number: string;
  logo_url: string;
  notes: string;
  is_active: boolean;
}>): Promise<BankAccount> {
  const { data } = await api.patch(`/wallet/bank-accounts/${id}`, dto);
  return data;
}
