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

export async function getCoopMembers(q: DriversQuery = {}): Promise<PaginatedResponse<Driver>> {
  const { data } = await api.get('/drivers/cooperative/members', { params: { limit: 20, page: 1, ...q } });
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

export async function deleteDriver(id: string): Promise<void> {
  await api.delete(`/drivers/${id}`);
}

export async function getDriver(id: string): Promise<Driver & { documents?: DriverDocument[] }> {
  const { data } = await api.get(`/drivers/${id}`);
  return data;
}

export interface DriverDocument {
  id: string;
  type: string;
  file_url: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  expires_at: string | null;
  created_at: string;
}

export async function getDocumentUrl(driverId: string, documentId: string): Promise<string> {
  const { data } = await api.get(`/drivers/${driverId}/documents/${documentId}/url`);
  return data.url as string;
}

export async function approveDocument(driverId: string, documentId: string): Promise<void> {
  await api.patch(`/drivers/${driverId}/documents/${documentId}/approve`);
}

export async function rejectDocument(driverId: string, documentId: string, reason: string): Promise<void> {
  await api.patch(`/drivers/${driverId}/documents/${documentId}/reject`, { reason });
}

export interface OtpLookupResult {
  found: boolean;
  phone?: string;
  otp_code?: string;
  expires_at?: string;
  expired?: boolean;
}

export async function adminOtpLookup(phone: string): Promise<OtpLookupResult> {
  const { data } = await api.get('/auth/admin/otp-lookup', { params: { phone } });
  return data;
}
