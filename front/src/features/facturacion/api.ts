import api from '@/lib/api';
import type { Invoice, BillingPayment, Renewal, PaginatedResponse } from '@/types';

export async function getInvoices(params?: { status?: string; cooperative_id?: string; page?: number; limit?: number }): Promise<PaginatedResponse<Invoice>> {
  const { data } = await api.get('/billing/invoices', { params: { limit: 50, page: 1, ...params } });
  return data;
}

export async function getPayments(params?: { status?: string; page?: number; limit?: number }): Promise<PaginatedResponse<BillingPayment>> {
  const { data } = await api.get('/billing/payments', { params: { limit: 50, page: 1, ...params } });
  return data;
}

export async function getRenewals(): Promise<Renewal[]> {
  const { data } = await api.get('/billing/renewals');
  return data?.items ?? data ?? [];
}

export async function confirmPayment(id: string): Promise<void> {
  await api.patch(`/billing/payments/${id}/confirm`);
}

export async function rejectPayment(id: string): Promise<void> {
  await api.patch(`/billing/payments/${id}/reject`);
}

export async function markInvoicePaid(id: string): Promise<void> {
  await api.patch(`/billing/invoices/${id}/mark-paid`);
}

export async function getBillingStats(): Promise<{
  total_billed: number;
  total_paid: number;
  total_pending: number;
  total_overdue: number;
  active_subscriptions: number;
}> {
  const { data } = await api.get('/billing/stats');
  return data;
}
