import api from '@/lib/api';
import type { AuditLog, PaginatedResponse } from '@/types';

export interface AuditQuery {
  page?: number;
  limit?: number;
  action?: string;
  entity_type?: string;
  user_id?: string;
  from_date?: string;
  to_date?: string;
}

export async function getAuditLogs(q: AuditQuery = {}): Promise<PaginatedResponse<AuditLog>> {
  const { data } = await api.get('/audit', { params: { limit: 30, page: 1, ...q } });
  return data;
}
