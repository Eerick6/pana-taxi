import api from '@/lib/api';
import type { Stand, PaginatedResponse } from '@/types';

export interface StandsQuery {
  page?: number;
  limit?: number;
  cooperative_id?: string;
}

export async function getStands(q: StandsQuery = {}): Promise<PaginatedResponse<Stand>> {
  const { data } = await api.get('/stands', { params: { limit: 30, page: 1, ...q } });
  return data;
}

export async function getStandQueue(id: string): Promise<{ driver_id: string; full_name: string; position: number }[]> {
  const { data } = await api.get(`/stands/${id}/queue`);
  return data;
}

export async function createStand(body: { name: string; address?: string; lat: number; lng: number; capacity?: number; cooperative_id?: string }): Promise<Stand> {
  const { data } = await api.post('/stands', body);
  return data;
}

export async function updateStand(id: string, body: Partial<Stand>): Promise<Stand> {
  const { data } = await api.patch(`/stands/${id}`, body);
  return data;
}

export async function deleteStand(id: string): Promise<void> {
  await api.delete(`/stands/${id}`);
}
