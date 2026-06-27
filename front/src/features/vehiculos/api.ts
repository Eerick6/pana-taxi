import api from '@/lib/api';
import type { Vehicle, PaginatedResponse } from '@/types';

export interface VehiclesQuery {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  cooperative_id?: string;
}

export async function getVehicles(q: VehiclesQuery = {}): Promise<PaginatedResponse<Vehicle>> {
  const { data } = await api.get('/vehicles', { params: { limit: 20, page: 1, ...q } });
  return data;
}

export async function getPendingVehicles(q: VehiclesQuery = {}): Promise<PaginatedResponse<Vehicle>> {
  const { data } = await api.get('/vehicles/pending', { params: { limit: 20, page: 1, ...q } });
  return data;
}

export async function approveVehicle(id: string): Promise<void> {
  await api.patch(`/vehicles/${id}/approve`);
}

export async function rejectVehicle(id: string, reason: string): Promise<void> {
  await api.patch(`/vehicles/${id}/reject`, { reason });
}

export async function getVehicle(id: string): Promise<Vehicle> {
  const { data } = await api.get(`/vehicles/${id}`);
  return data;
}
