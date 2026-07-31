import api from '@/lib/api';
import type { AuditLog, PaginatedResponse } from '@/types';

export interface AuditQuery {
  page?: number;
  limit?: number;
  action?: string;
  entity_type?: string;
  actor_id?: string;
  actor_role?: string;
  method?: string;
  status_class?: number;
  from?: string;
  to?: string;
}

export async function getAuditLogs(q: AuditQuery = {}): Promise<PaginatedResponse<AuditLog>> {
  const { data } = await api.get('/audit', { params: { limit: 50, page: 1, ...q } });
  return data;
}
