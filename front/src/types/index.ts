// ── Auth & User ────────────────────────────────────────────────────────────
export type UserRole =
  | 'OWNER'
  | 'PLATFORM_ADMIN'
  | 'FINANCE'
  | 'MONITORING'
  | 'SUPPORT'
  | 'COOPERATIVE_ADMIN'
  | 'COOPERATIVE_OPERATOR'
  | 'COOPERATIVE_SUPERVISOR'
  | 'DRIVER'
  | 'OWNER_DRIVER'
  | 'CLIENT';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING';

// ── Cooperative ────────────────────────────────────────────────────────────
export type CooperativeStatus = 'active' | 'inactive' | 'suspended';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Cooperative {
  id: string;
  name: string;
  ruc: string;
  address: string | null;
  phone: string | null;
  email?: string | null;
  logo_url: string | null;
  status: CooperativeStatus;
  approval_status: ApprovalStatus;
  rejection_reason: string | null;
  commission_override: number | null;
  monthly_fee_override: number | null;
  created_at: string;
  updated_at: string;
}

// ── Driver ─────────────────────────────────────────────────────────────────
export type DriverOnlineStatus = 'offline' | 'online' | 'busy' | 'looking_for_work';
export type DriverType = 'driver' | 'owner_driver';

export interface Driver {
  id: string;
  user?: { id?: string; email?: string; phone?: string };
  full_name: string;
  license_number: string | null;
  license_expiry: string | null;
  profile_photo_url: string | null;
  driver_type: DriverType;
  approval_status: ApprovalStatus;
  rejection_reason: string | null;
  online_status: DriverOnlineStatus;
  current_lat: number | null;
  current_lng: number | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at?: string;
}

// ── Vehicle ────────────────────────────────────────────────────────────────
export interface Vehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  photo_url: string | null;
  status: ApprovalStatus;
  rejection_reason: string | null;
  cooperative?: { id: string; name: string } | null;
  owner?: { id: string; full_name: string } | null;
  assigned_driver?: { id: string; full_name: string } | null;
  created_at: string;
}

// ── Trip ───────────────────────────────────────────────────────────────────
export type TripStatus =
  | 'requested'
  | 'negotiating'
  | 'accepted'
  | 'driver_arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type FareMode = 'meter' | 'negotiated';
export type TripSource = 'client' | 'cooperative';
export type PaymentStatus = 'pending' | 'completed' | 'failed';
export type CancelledBy = 'client' | 'driver' | 'cooperative' | 'platform';

export interface Trip {
  id: string;
  source: TripSource;
  status: TripStatus;
  fare_mode: FareMode;
  client?: { id: string; email?: string } | null;
  driver?: { id: string; full_name: string } | null;
  vehicle?: { id: string; plate: string } | null;
  cooperative?: { id: string; name: string } | null;
  stand?: { id: string; name: string } | null;
  walk_in_client_name?: string | null;
  origin_address: string | null;
  destination_address: string | null;
  estimated_distance_km?: number | null;
  estimated_duration_min?: number | null;
  fare_amount?: number | null;
  commission_amount?: number | null;
  commission_rate?: number | null;
  payment_status?: PaymentStatus | null;
  cancelled_by?: CancelledBy | null;
  cancellation_reason?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
}

// ── SOS ────────────────────────────────────────────────────────────────────
export type SosStatus = 'open' | 'resolved';

export interface SosAlert {
  id: string;
  trip?: { id: string } | null;
  triggered_by?: { id: string; role?: string } | null;
  lat: number | null;
  lng: number | null;
  message: string | null;
  status: SosStatus;
  resolved_at: string | null;
  created_at: string;
}

// ── Stand ──────────────────────────────────────────────────────────────────
export interface Stand {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  capacity: number;
  is_active: boolean;
  cooperative?: { id: string; name: string } | null;
  cooperative_id: string;
  created_at: string;
  updated_at?: string;
}

// ── Wallet ─────────────────────────────────────────────────────────────────
export interface WalletRecharge {
  id: string;
  driver?: { id: string; full_name: string } | null;
  amount: number;
  status: 'pending' | 'confirmed' | 'rejected';
  receipt_url: string | null;
  created_at: string;
}

// ── Settlement ─────────────────────────────────────────────────────────────
export type SettlementStatus = 'pending' | 'confirmed' | 'cancelled';

export interface Settlement {
  id: string;
  cooperative?: { id: string; name: string } | null;
  cooperative_id: string;
  amount: number;
  period_from: string;
  period_to: string;
  status: SettlementStatus;
  confirmed_at: string | null;
  created_at: string;
}

// ── Platform Staff ─────────────────────────────────────────────────────────
export interface PlatformMember {
  id: string;
  user?: { id: string; email: string; status: UserStatus };
  full_name: string;
  role: UserRole;
  created_at: string;
}

// ── Cooperative Member ─────────────────────────────────────────────────────
export interface CooperativeMember {
  id: string;
  user_id: string;
  cooperative_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
}

// ── Audit ──────────────────────────────────────────────────────────────────
export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  status_code: number;
  created_at: string;
}

// ── Fare Config ────────────────────────────────────────────────────────────
export interface FareConfig {
  base_fare: number;
  per_km_rate: number;
  per_min_rate: number;
  minimum_fare: number;
  platform_commission_pct: number;
}

// ── Auth ───────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  cooperative_id: string | null;
}

export interface AuthTokens {
  access_token: string;
  role: UserRole;
}

// ── Pagination ─────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages?: number;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  data?: Record<string, string> | null;
  read_at: string | null;
  created_at: string;
}

export interface ApiError {
  message: string;
  statusCode: number;
}
