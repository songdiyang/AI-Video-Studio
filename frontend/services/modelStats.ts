/**
 * AI模型性能统计服务
 */

import { getAuthToken } from './auth';

function authHeaders() {
  const token = getAuthToken();
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

export interface ModelOverallStats {
  modelName: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  successRate: string;
  avgDurationSeconds: string | null;
  minDuration: number | null;
  maxDuration: number | null;
  avgCost: string;
  totalCost: string;
}

export interface DailyTrend {
  date: string;
  model_name: string;
  calls: number;
  success: number;
  avg_duration: string | null;
}

export interface ErrorDistribution {
  model_name: string;
  error_message: string;
  count: number;
}

export interface TaskTypeDistribution {
  task_type: string;
  model_name: string;
  count: number;
  avg_cost: string;
}

export interface ModelStatsResponse {
  success: boolean;
  period: string;
  overallStats: ModelOverallStats[];
  dailyTrend: DailyTrend[];
  errorDistribution: ErrorDistribution[];
  taskTypeDistribution: TaskTypeDistribution[];
}

export interface ModelComparisonItem {
  modelName: string;
  calls: number;
  success: number;
  successRate: string;
  avgDuration: string | null;
  avgCost: string;
}

export interface ModelComparisonResponse {
  success: boolean;
  period: string;
  comparison: Record<string, ModelComparisonItem[]>;
}

export interface RecentStats {
  modelName: string;
  recentCalls: number;
  recentSuccess: number;
  recentFailed: number;
  activeTasks: number;
  recentSuccessRate: string;
}

export interface ActiveTask {
  id: number;
  model_name: string;
  task_type: string;
  status: string;
  progress: number;
  running_seconds: number;
}

export interface ModelStatusResponse {
  success: boolean;
  recentStats: RecentStats[];
  activeTasks: ActiveTask[];
}

/**
 * 获取模型性能统计
 * @param days 统计天数（默认7天）
 * @param modelName 指定模型名称（可选）
 */
export async function getModelStats(
  days: number = 7,
  modelName?: string
): Promise<ModelStatsResponse> {
  const params = new URLSearchParams();
  params.append('days', String(days));
  if (modelName) {
    params.append('modelName', modelName);
  }

  const res = await fetch(`/api/billing/model-stats?${params.toString()}`, {
    headers: {
      ...authHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || '获取模型统计失败');
  }

  return data as ModelStatsResponse;
}

/**
 * 获取模型对比数据
 * @param days 统计天数（默认7天）
 * @param taskType 指定任务类型（可选）
 */
export async function getModelComparison(
  days: number = 7,
  taskType?: string
): Promise<ModelComparisonResponse> {
  const params = new URLSearchParams();
  params.append('days', String(days));
  if (taskType) {
    params.append('taskType', taskType);
  }

  const res = await fetch(`/api/billing/model-comparison?${params.toString()}`, {
    headers: {
      ...authHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || '获取模型对比失败');
  }

  return data as ModelComparisonResponse;
}

/**
 * 获取实时模型状态
 */
export async function getModelStatus(): Promise<ModelStatusResponse> {
  const res = await fetch('/api/billing/model-status', {
    headers: {
      ...authHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || '获取模型状态失败');
  }

  return data as ModelStatusResponse;
}
