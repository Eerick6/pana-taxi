import api from '@/lib/api';
import type { SosAlert, PaginatedResponse } from '@/types';

export interface SosQuery {
  page?: number;
  limit?: number;
  status?: string;
}

export async function getSosAlerts(q: SosQuery = {}): Promise<PaginatedResponse<SosAlert>> {
  const { data } = await api.get('/sos', { params: { limit: 20, page: 1, ...q } });
  return data;
}

export async function resolveSos(id: string): Promise<void> {
  await api.patch(`/sos/${id}/resolve`);
}

export async function getSosAlert(id: string): Promise<SosAlert> {
  const { data } = await api.get(`/sos/${id}`);
  return data;
}
