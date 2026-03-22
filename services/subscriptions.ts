import { getAuthToken, getAdminAuthHeaders } from './auth';

// 类型定义
export interface SubscriptionPlan {
  id: number;
  name: string;
  display_name: string;
  price_monthly: number;
  price_yearly: number;
  max_projects: number;
  max_api_calls_monthly: number;
  max_team_members: number;
  features_json: string[];
  is_active: boolean;
  sort_order: number;
}

export interface UserSubscription {
  id: number;
  plan_id: number;
  status: 'active' | 'expired' | 'cancelled' | 'trial';
  billing_cycle: 'monthly' | 'yearly';
  current_period_start: string;
  current_period_end: string;
  api_calls_used: number;
  plan: SubscriptionPlan;
}

export interface UsageInfo {
  api_calls_used: number;
  api_calls_limit: number;
  projects_used: number;
  projects_limit: number;
  subscription_status: string;
}

export interface CurrentSubscriptionResponse {
  plan: SubscriptionPlan | null;
  subscription: {
    id: number;
    status: 'active' | 'expired' | 'cancelled' | 'trial';
    billing_cycle: 'monthly' | 'yearly';
    current_period_start: string;
    current_period_end: string;
    subscribed_at: string;
  } | null;
  usage: UsageInfo;
  status: string;
}

export interface AdminSubscription {
  id: number;
  user_id: number;
  user_email: string;
  plan_id: number;
  plan_name: string;
  status: string;
  billing_cycle: string;
  current_period_end: string;
  api_calls_used: number;
  created_at: string;
}

export interface AdminSubscriptionsResponse {
  subscriptions: AdminSubscription[];
  total: number;
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}

// 用户 API

export async function fetchPlans(): Promise<SubscriptionPlan[]> {
  const res = await fetch('/api/subscriptions/plans', {
    headers: authHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to load subscription plans');
  }

  return (await res.json()) as SubscriptionPlan[];
}

export async function fetchCurrentSubscription(): Promise<CurrentSubscriptionResponse | null> {
  const res = await fetch('/api/subscriptions/current', {
    headers: authHeaders(),
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to load current subscription');
  }

  return (await res.json()) as CurrentSubscriptionResponse;
}

export async function subscribe(planId: number, billingCycle: string): Promise<UserSubscription> {
  const res = await fetch('/api/subscriptions/subscribe', {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ planId, billingCycle }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to subscribe');
  }

  return (await res.json()) as UserSubscription;
}

export async function cancelSubscription(): Promise<void> {
  const res = await fetch('/api/subscriptions/cancel', {
    method: 'POST',
    headers: authHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to cancel subscription');
  }
}

export async function fetchUsage(): Promise<UsageInfo> {
  const res = await fetch('/api/subscriptions/usage', {
    headers: authHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to load usage info');
  }

  return (await res.json()) as UsageInfo;
}

// 管理员 API

export async function adminFetchPlans(): Promise<SubscriptionPlan[]> {
  const res = await fetch('/api/admin/subscription-plans', {
    headers: getAdminAuthHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to load subscription plans');
  }

  const data = await res.json();
  return (data.plans || data) as SubscriptionPlan[];
}

export async function adminCreatePlan(data: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
  const { features_json, ...rest } = data as any;
  const payload = { ...rest, features: features_json };
  
  const res = await fetch('/api/admin/subscription-plans', {
    method: 'POST',
    headers: getAdminAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.message || 'Failed to create plan');
  }

  return (await res.json()) as SubscriptionPlan;
}

export async function adminUpdatePlan(id: number, data: Partial<SubscriptionPlan>): Promise<void> {
  const { features_json, ...rest } = data as any;
  const payload = { ...rest, features: features_json };
  
  const res = await fetch(`/api/admin/subscription-plans/${id}`, {
    method: 'PUT',
    headers: getAdminAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.message || 'Failed to update plan');
  }
}

export async function adminDeletePlan(id: number): Promise<void> {
  const res = await fetch(`/api/admin/subscription-plans/${id}`, {
    method: 'DELETE',
    headers: getAdminAuthHeaders(),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.message || 'Failed to delete plan');
  }
}

export async function adminFetchSubscriptions(params: {
  page?: number;
  status?: string;
}): Promise<AdminSubscriptionsResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.status) searchParams.set('status', params.status);

  const res = await fetch(`/api/admin/subscriptions?${searchParams.toString()}`, {
    headers: getAdminAuthHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to load subscriptions');
  }

  const data = await res.json();
  return {
    subscriptions: data.subscriptions || [],
    total: data.pagination?.total ?? 0,
  };
}
