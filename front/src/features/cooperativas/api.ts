import api from '@/lib/api';
import type { Cooperative, FareConfig, PaginatedResponse } from '@/types';

// ── Cooperativas ──────────────────────────────────────────────────────────────

export async function getCooperativas(): Promise<PaginatedResponse<Cooperative>> {
  const { data } = await api.get('/cooperatives', { params: { limit: 200, page: 1 } });
  return data;
}

export async function getCooperativa(id: string): Promise<Cooperative> {
  const { data } = await api.get(`/cooperatives/${id}`);
  return data;
}

export async function createCooperativa(body: {
  name: string; ruc: string; address?: string; phone?: string;
  commission_override?: number; terms_version: string;
}): Promise<Cooperative> {
  const { data } = await api.post('/cooperatives', body);
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

export async function updateCooperativaProfile(id: string, body: { phone?: string; address?: string; latitude?: number; longitude?: number }): Promise<void> {
  await api.patch(`/cooperatives/${id}/profile`, body);
}

export async function setCooperativaFee(id: string, monthly_fee: number): Promise<void> {
  await api.patch(`/cooperatives/${id}/set-fee`, { monthly_fee });
}

export async function deleteCooperativa(id: string): Promise<void> {
  await api.delete(`/cooperatives/${id}`);
}

// ── Miembros (equipo staff) ───────────────────────────────────────────────────

export interface CoopMember {
  id: string;
  full_name: string;
  role: 'admin' | 'operator' | 'supervisor';
  created_at: string;
  user: { id: string; email: string; status: string };
}

export async function getCooperativaMembers(id: string): Promise<CoopMember[]> {
  const { data } = await api.get(`/cooperatives/${id}/members`);
  return data;
}

export async function addCooperativaMember(
  id: string,
  body: { email: string; full_name: string; role: 'admin' | 'operator' | 'supervisor' },
): Promise<CoopMember> {
  const { data } = await api.post(`/cooperatives/${id}/members`, body);
  return data;
}

export async function removeCooperativaMember(memberId: string): Promise<void> {
  await api.delete(`/cooperatives/members/${memberId}`);
}

// ── Paradas ───────────────────────────────────────────────────────────────────

export interface CoopStand {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  capacity: number;
  is_active: boolean;
  active_drivers?: number;
}

export async function getCooperativaStands(coopId: string): Promise<CoopStand[]> {
  const { data } = await api.get('/stands', { params: { cooperative_id: coopId } });
  return data;
}

export async function createCooperativaStand(body: {
  name: string; address?: string; lat: number; lng: number;
  cooperative_id: string; capacity?: number;
}): Promise<CoopStand> {
  const { data } = await api.post('/stands', body);
  return data;
}

export async function deleteCooperativaStand(id: string): Promise<void> {
  await api.delete(`/stands/${id}`);
}

// ── Flota ─────────────────────────────────────────────────────────────────────

export interface FleetDriver {
  driver_id: string;
  driver_name: string;
  online_status: string;
  current_lat?: number | null;
  current_lng?: number | null;
  last_seen_at?: string | null;
  active_trip_id?: string | null;
  vehicle?: { id: string; plate: string; model: string; brand: string; color?: string } | null;
}

export interface FleetResponse {
  cooperative_id: string;
  cooperative_name: string;
  total: number;
  online: number;
  busy: number;
  drivers: FleetDriver[];
}

export async function getCooperativaFleet(id: string): Promise<FleetResponse> {
  const { data } = await api.get(`/cooperatives/${id}/fleet`);
  return data;
}

// ── Vehículos por cooperativa ─────────────────────────────────────────────────

export interface CoopVehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year?: number;
  color?: string;
  approval_status: string;
  status?: string;
  photo_url?: string;
  owner?: { id: string; full_name: string };
  cooperative?: { id: string; name: string };
}

export async function getCooperativaVehiculos(
  coopId: string,
  page = 1,
  limit = 100,
): Promise<{ items: CoopVehicle[]; total: number }> {
  const { data } = await api.get('/vehicles', {
    params: { cooperative_id: coopId, page, limit },
  });
  return data;
}

export async function approveVehiculo(id: string): Promise<void> {
  await api.patch(`/vehicles/${id}/approve`);
}

export async function rejectVehiculo(id: string, reason: string): Promise<void> {
  await api.patch(`/vehicles/${id}/reject`, { reason });
}

export async function suspendVehiculo(id: string): Promise<void> {
  await api.patch(`/vehicles/${id}/suspend`);
}

export async function activateVehiculo(id: string): Promise<void> {
  await api.patch(`/vehicles/${id}/activate`);
}

export async function deleteVehiculo(id: string): Promise<void> {
  await api.delete(`/vehicles/${id}`);
}

export async function toggleStandActivo(id: string, is_active: boolean): Promise<void> {
  await api.patch(`/stands/${id}`, { is_active });
}

// ── Socios (owner-drivers vinculados) ─────────────────────────────────────────

export interface CoopSocio {
  id: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  created_at: string;
  owner: {
    id: string;
    full_name: string;
    driver_type: string;
    approval_status: string;
    license_number?: string;
    user: { id: string; email: string };
  };
}

export async function getCooperativaSocios(
  coopId: string,
  status?: string,
): Promise<{ items: CoopSocio[]; total: number }> {
  const { data } = await api.get(`/cooperatives/${coopId}/owners`, {
    params: { limit: 100, page: 1, ...(status ? { status } : {}) },
  });
  return data;
}

export async function aprobarSocio(driverId: string, coopId: string): Promise<void> {
  await api.patch(`/drivers/${driverId}/cooperative-approve`, null, {
    params: { cooperative_id: coopId },
  });
}

export async function rechazarSocio(driverId: string, coopId: string, reason: string): Promise<void> {
  await api.patch(`/drivers/${driverId}/cooperative-reject`, { reason }, {
    params: { cooperative_id: coopId },
  });
}

// ── Documentos de cooperativa ─────────────────────────────────────────────────

export interface CoopDocument {
  id: string;
  type: string;
  file_url: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  expires_at: string | null;
  created_at: string;
}

export async function getCoopDocuments(coopId: string): Promise<CoopDocument[]> {
  const { data } = await api.get(`/cooperatives/${coopId}/documents`);
  return data;
}

export async function getCoopDocumentUrl(coopId: string, docId: string): Promise<string> {
  const { data } = await api.get(`/cooperatives/${coopId}/documents/${docId}/url`);
  return data.url ?? data;
}

export async function approveCoopDocument(coopId: string, docId: string): Promise<void> {
  await api.patch(`/cooperatives/${coopId}/documents/${docId}/approve`);
}

export async function rejectCoopDocument(coopId: string, docId: string, reason: string): Promise<void> {
  await api.patch(`/cooperatives/${coopId}/documents/${docId}/reject`, { reason });
}

// ── Tarifas por cooperativa ───────────────────────────────────────────────────

export async function getCoopFareConfig(coopId: string): Promise<FareConfig> {
  const { data } = await api.get(`/fares/config/${coopId}`);
  return data;
}

export async function setCoopFareConfig(coopId: string, body: Partial<FareConfig>): Promise<FareConfig> {
  const { data } = await api.patch(`/fares/config/${coopId}`, body);
  return data;
}

// ── Pendientes (para notificación en panel) ───────────────────────────────────

export async function getPendingCooperativas(): Promise<{ total: number }> {
  const { data } = await api.get('/cooperatives/pending', { params: { page: 1, limit: 1 } });
  return { total: data.total ?? 0 };
}

// ── Resumen paradas (dashboard) ───────────────────────────────────────────────

export async function getStandsSummary(): Promise<Array<{
  coop_id: string; coop_name: string; stands: number; drivers_at_stands: number;
}>> {
  const { data } = await api.get('/stands/summary');
  return data;
}

// ── Terms ─────────────────────────────────────────────────────────────────────

export async function getCooperativaTermsVersion(): Promise<string> {
  const { data } = await api.get('/terms/cooperative');
  return data.version ?? '1.0';
}
