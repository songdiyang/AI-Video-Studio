import { getAdminAuthHeaders } from './auth';

export interface AdminLog {
  id: number;
  admin_id: number;
  admin_employee_id: string | null;
  admin_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface AdminLogFilter {
  page?: number;
  limit?: number;
  adminId?: number;
  action?: string;
  targetType?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export async function getAdminLogs(filter: AdminLogFilter = {}) {
  const params = new URLSearchParams();
  if (filter.page) params.set('page', String(filter.page));
  if (filter.limit) params.set('limit', String(filter.limit));
  if (filter.adminId) params.set('adminId', String(filter.adminId));
  if (filter.action) params.set('action', filter.action);
  if (filter.targetType) params.set('targetType', filter.targetType);
  if (filter.startDate) params.set('startDate', filter.startDate);
  if (filter.endDate) params.set('endDate', filter.endDate);
  if (filter.search) params.set('search', filter.search);

  const res = await fetch(`/api/admin/logs?${params.toString()}`, {
    headers: getAdminAuthHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || '获取操作日志失败');
  }

  return res.json() as Promise<{
    logs: AdminLog[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>;
}

export async function getAdminLogActions() {
  const res = await fetch('/api/admin/logs/actions', {
    headers: getAdminAuthHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || '获取操作类型失败');
  }

  const data = await res.json();
  return (data.actions || []) as string[];
}

export async function getAdminLogTargetTypes() {
  const res = await fetch('/api/admin/logs/target-types', {
    headers: getAdminAuthHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || '获取目标类型失败');
  }

  const data = await res.json();
  return (data.targetTypes || []) as string[];
}

export async function getAdminEmployeeId() {
  const res = await fetch('/api/admin/me/employee-id', {
    headers: getAdminAuthHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || '获取工号失败');
  }

  const data = await res.json();
  return data as { employeeId: string; email: string };
}
