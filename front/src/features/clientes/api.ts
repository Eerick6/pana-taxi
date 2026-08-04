import api from '@/lib/api';

export interface ClientUser {
  email: string | null;
  phone: string | null;
  status: 'active' | 'suspended' | 'pending';
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
}

export interface Client {
  id: string;
  full_name: string;
  cedula: string | null;
  profile_photo_url: string | null;
  rating: number;
  total_trips: number;
  created_at: string;
  updated_at: string;
  user: ClientUser | null;
  emergency_contacts?: EmergencyContact[];
}

export interface ClientsPage {
  items: Client[];
  total: number;
  page: number;
  limit: number;
}

export async function getClients(params: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<ClientsPage> {
  const { data } = await api.get('/clients', {
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      ...(params.search ? { search: params.search } : {}),
    },
  });
  return data;
}

export async function getClient(id: string): Promise<Client> {
  const { data } = await api.get(`/clients/${id}`);
  return data;
}

export async function blockClient(id: string): Promise<void> {
  await api.patch(`/clients/${id}/block`);
}

export async function unblockClient(id: string): Promise<void> {
  await api.patch(`/clients/${id}/unblock`);
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
