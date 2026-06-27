import api from '@/lib/api';
import type { PlatformMember, PaginatedResponse, UserRole } from '@/types';

export async function getStaff(page = 1, limit = 20): Promise<PaginatedResponse<PlatformMember>> {
  const { data } = await api.get('/platform/staff', { params: { page, limit } });
  return data;
}

export async function inviteStaff(body: { email: string; full_name: string; role: UserRole }): Promise<PlatformMember> {
  const { data } = await api.post('/platform/staff', body);
  return data;
}

export async function updateStaff(id: string, body: { role?: UserRole }): Promise<PlatformMember> {
  const { data } = await api.patch(`/platform/staff/${id}`, body);
  return data;
}

export async function deleteStaff(id: string): Promise<void> {
  await api.delete(`/platform/staff/${id}`);
}
