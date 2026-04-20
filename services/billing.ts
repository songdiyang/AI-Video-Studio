import { getAuthToken } from './auth';

export interface BillingSummary {
  total_tokens: number;
  total_amount: number;
}

export interface BillingRecord {
  id: number;
  script_id: number | null;
  operation: string;
  model_provider: string | null;
  tokens: number;
  unit_price: number;
  amount: number;
  created_at: string;
}

export interface BalanceInfo {
  balance: number;
  monthlyQuota: number;
  monthlyUsed: number;
  planName: string;
  planDisplayName: string;
  periodEnd: string | null;
}

export interface ResourcePack {
  id: number;
  name: string;
  totalPoints: number;
  remainingPoints: number;
  sourceType: 'purchase' | 'gift' | 'subscription' | 'admin';
  sourceId: number | null;
  isGift: boolean;
  periodStart: string;
  periodEnd: string;
  periodMonth: string;
  status: 'active' | 'expired' | 'used_up';
  isActive: boolean;
  createdAt: string;
}

export interface ResourcePacksResponse {
  packs: ResourcePack[];
  totalBalance: number;
  activeBalance: number;
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchBillingSummary(): Promise<BillingSummary> {
  const res = await fetch('/api/billing/summary', {
    headers: {
      ...authHeaders(),
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to load billing summary');
  }

  return (await res.json()) as BillingSummary;
}

export async function fetchBillingHistory(): Promise<BillingRecord[]> {
  const res = await fetch('/api/billing/history', {
    headers: {
      ...authHeaders(),
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to load billing history');
  }

  return (await res.json()) as BillingRecord[];
}

export async function fetchBalance(): Promise<BalanceInfo> {
  const res = await fetch('/api/users/balance', {
    headers: {
      ...authHeaders(),
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to load balance');
  }

  return (await res.json()) as BalanceInfo;
}

export async function fetchResourcePacks(): Promise<ResourcePacksResponse> {
  const res = await fetch('/api/users/resource-packs', {
    headers: {
      ...authHeaders(),
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to load resource packs');
  }

  return (await res.json()) as ResourcePacksResponse;
}
