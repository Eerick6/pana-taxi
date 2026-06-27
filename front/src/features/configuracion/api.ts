import api from '@/lib/api';
import type { FareConfig } from '@/types';

export interface SystemConfig {
  platform_commission_pct: number;
  monthly_fee_default: number;
  allow_negotiated_fares: boolean;
  allow_meter_fares: boolean;
}

export async function getFareConfig(): Promise<FareConfig> {
  const { data } = await api.get('/fares/config');
  return data;
}

export async function updateFareConfig(body: Partial<FareConfig>): Promise<FareConfig> {
  const { data } = await api.patch('/fares/config', body);
  return data;
}

export async function getSystemConfig(): Promise<SystemConfig> {
  const { data } = await api.get('/platform/config');
  return data;
}

export async function updateSystemConfig(body: Partial<SystemConfig>): Promise<SystemConfig> {
  const { data } = await api.patch('/platform/config', body);
  return data;
}

export async function getPlatformFeeRate(): Promise<{ commission_pct: number }> {
  const { data } = await api.get('/accounting/platform-fee');
  return data;
}

export async function updatePlatformFeeRate(commission_pct: number): Promise<void> {
  await api.patch('/accounting/platform-fee', { commission_pct });
}
