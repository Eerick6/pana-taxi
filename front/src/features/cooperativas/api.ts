import api from '@/lib/api';
import type { Cooperative, PaginatedResponse } from '@/types';

// GET /cooperatives only accepts page and limit — filtering must be done client-side
export async function getCooperativas(): Promise<PaginatedResponse<Cooperative>> {
  const { data } = await api.get('/cooperatives', { params: { limit: 200, page: 1 } });
  return data;
}

export async function getCooperativa(id: string): Promise<Cooperative> {
  const { data } = await api.get(`/cooperatives/${id}`);
  return data;
}

export async function approveCooperativa(id: string): Promise<void> {
  await api.patch(`/cooperatives/${id}/approve`);
}

export async function rejectCooperativa(id: string, reason: string): Promise<void> {
  await api.patch(`/cooperatives/${id}/reject`, { reason });
}

export async function suspendCooperativa(id: string): Promise<void> {
  await api.patch(`/cooperatives/${id}/suspend`);
}

export async function activateCooperativa(id: string): Promise<void> {
  await api.patch(`/cooperatives/${id}/activate`);
}

export async function updateCooperativa(id: string, body: Partial<Cooperative>): Promise<Cooperative> {
  const { data } = await api.patch(`/cooperatives/${id}`, body);
  return data;
}
