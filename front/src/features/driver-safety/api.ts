import api from '@/lib/api';
import type { DeviationAlert, DeviationAlertStatus, PaginatedResponse } from '@/types';

export interface DeviationAlertsQuery {
  page?: number;
  limit?: number;
  status?: DeviationAlertStatus | '';
}

export async function getDeviationAlerts(q: DeviationAlertsQuery = {}): Promise<PaginatedResponse<DeviationAlert>> {
  const { data } = await api.get('/driver-safety/deviation-alerts', {
    params: { limit: 20, page: 1, ...q, status: q.status || undefined },
  });
  return data;
}

export async function resolveDeviationAlert(id: string, resolution_notes?: string): Promise<void> {
  await api.patch(`/driver-safety/deviation-alerts/${id}/resolve`, { resolution_notes });
}

export interface SafetyCheckPhoto {
  id: string;
  captured_at: string;
  photo_url: string;
}

export async function getTripSafetyChecks(tripId: string): Promise<{ items: SafetyCheckPhoto[] }> {
  const { data } = await api.get(`/driver-safety/trips/${tripId}/selfies`);
  return data;
}
