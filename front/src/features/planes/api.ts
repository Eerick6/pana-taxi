import api from '@/lib/api';
import type { Plan } from '@/types';

export async function getPlanes(): Promise<Plan[]> {
  const { data } = await api.get('/plans');
  return data?.items ?? data ?? [];
}

export async function getPlan(id: string): Promise<Plan> {
  const { data } = await api.get(`/plans/${id}`);
  return data;
}

export async function createPlan(body: Partial<Plan>): Promise<Plan> {
  const { data } = await api.post('/plans', body);
  return data;
}

export async function updatePlan(id: string, body: Partial<Plan>): Promise<Plan> {
  const { data } = await api.patch(`/plans/${id}`, body);
  return data;
}

export async function deletePlan(id: string): Promise<void> {
  await api.delete(`/plans/${id}`);
}

export async function togglePlanStatus(id: string, is_active: boolean): Promise<Plan> {
  const { data } = await api.patch(`/plans/${id}`, { is_active });
  return data;
}
