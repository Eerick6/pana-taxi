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
