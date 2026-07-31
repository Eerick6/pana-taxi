import api from '@/lib/api';
import type { Vehicle, VehicleDocument, PaginatedResponse } from '@/types';

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

export async function getVehicle(id: string): Promise<Vehicle & { documents?: VehicleDocument[] }> {
  const { data } = await api.get(`/vehicles/${id}`);
  return data;
}

export async function approveVehicle(id: string): Promise<void> {
  await api.patch(`/vehicles/${id}/approve`);
}

export async function rejectVehicle(id: string, reason: string): Promise<void> {
  await api.patch(`/vehicles/${id}/reject`, { reason });
}

export async function suspendVehicle(id: string): Promise<void> {
  await api.patch(`/vehicles/${id}/suspend`);
}

export async function activateVehicle(id: string): Promise<void> {
  await api.patch(`/vehicles/${id}/activate`);
}

export async function deleteVehicle(id: string): Promise<void> {
  await api.delete(`/vehicles/${id}`);
}

export async function getVehicleDocumentUrl(vehicleId: string, documentId: string): Promise<string> {
  const { data } = await api.get(`/vehicles/${vehicleId}/admin-documents/${documentId}/url`);
  return data.url as string;
}

export async function approveVehicleDocument(vehicleId: string, documentId: string): Promise<void> {
  await api.patch(`/vehicles/${vehicleId}/documents/${documentId}/approve`);
}

export async function rejectVehicleDocument(vehicleId: string, documentId: string, reason: string): Promise<void> {
  await api.patch(`/vehicles/${vehicleId}/documents/${documentId}/reject`, { reason });
}
