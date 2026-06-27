import api from '@/lib/api';
import type { Driver, PaginatedResponse } from '@/types';

export interface DriversQuery {
  page?: number;
  limit?: number;
  approval_status?: string;
  search?: string;
  cooperative_id?: string;
}

export async function getDrivers(q: DriversQuery = {}): Promise<PaginatedResponse<Driver>> {
  const { data } = await api.get('/drivers', { params: { limit: 20, page: 1, ...q } });
  return data;
}

export async function getPendingPlatformDrivers(q: DriversQuery = {}): Promise<PaginatedResponse<Driver>> {
  const { data } = await api.get('/drivers/platform/pending', { params: { limit: 20, page: 1, ...q } });
  return data;
}

export async function getPendingCoopDrivers(q: DriversQuery = {}): Promise<PaginatedResponse<Driver>> {
  const { data } = await api.get('/drivers/cooperative/pending', { params: { limit: 20, page: 1, ...q } });
  return data;
}

export async function approveDriverPlatform(id: string): Promise<void> {
  await api.patch(`/drivers/${id}/platform-approve`);
}

export async function rejectDriverPlatform(id: string, reason: string): Promise<void> {
  await api.patch(`/drivers/${id}/platform-reject`, { reason });
}

export async function approveDriverCoop(id: string): Promise<void> {
  await api.patch(`/drivers/${id}/cooperative-approve`);
}

export async function rejectDriverCoop(id: string, reason: string): Promise<void> {
  await api.patch(`/drivers/${id}/cooperative-reject`, { reason });
}

export async function blockDriver(id: string): Promise<void> {
  await api.patch(`/drivers/${id}/block`);
}

export async function unblockDriver(id: string): Promise<void> {
  await api.patch(`/drivers/${id}/unblock`);
}

export async function getDriver(id: string): Promise<Driver> {
  const { data } = await api.get(`/drivers/${id}`);
  return data;
}
