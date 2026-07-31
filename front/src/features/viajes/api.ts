import api from '@/lib/api';
import type { Trip, PaginatedResponse } from '@/types';

export interface TripsQuery {
  page?: number;
  limit?: number;
  status?: string;
  from_date?: string;
  to_date?: string;
  cooperative_id?: string;
  driver_id?: string;
}

export async function getTrips(q: TripsQuery = {}): Promise<PaginatedResponse<Trip>> {
  const { data } = await api.get('/trips', { params: { limit: 20, page: 1, ...q } });
  return data;
}

export async function getTrip(id: string): Promise<Trip> {
  const { data } = await api.get(`/trips/${id}`);
  return data;
}

export async function cancelTrip(id: string, reason: string): Promise<void> {
  await api.patch(`/trips/${id}/cancel`, { reason });
}

export interface CreateTripPayload {
  origin_address?: string;
  origin_lat?: number;
  origin_lng?: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  fare_mode?: 'meter' | 'negotiated';
  client_offer?: number;
  walk_in_client_name?: string;
  cooperative_id?: string;
  stand_id?: string;
}

export async function createTrip(body: CreateTripPayload): Promise<Trip> {
  const { data } = await api.post('/trips', body);
  return data;
}
