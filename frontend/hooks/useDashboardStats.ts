import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '../services/auth';

interface RecentProject {
  id: string;
  name: string;
  updatedAt: string;
}

interface DashboardStats {
  projectCount: number;
  scriptCount: number;
  storyboardCount: number;
  aiCallsCount: number;
  recentProjects: RecentProject[];
}

interface UseDashboardStatsResult {
  stats: DashboardStats;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface CachedData {
  stats: DashboardStats;
  timestamp: number;
}

const CACHE_KEY = 'nanostory-dashboard-stats';
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

const defaultStats: DashboardStats = {
  projectCount: 0,
  scriptCount: 0,
  storyboardCount: 0,
  aiCallsCount: 0,
  recentProjects: [],
};

function getCachedStats(): DashboardStats | null {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data: CachedData = JSON.parse(cached);
    if (Date.now() - data.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    return data.stats;
  } catch {
    return null;
  }
}

function setCachedStats(stats: DashboardStats): void {
  try {
    const data: CachedData = {
      stats,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // 忽略存储错误
  }
}

export function useDashboardStats(): UseDashboardStatsResult {
  const [stats, setStats] = useState<DashboardStats>(() => {
    const cached = getCachedStats();
    return cached || defaultStats;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchStats = useCallback(async (forceRefresh = false) => {
    const token = getAuthToken();
    if (!token) {
      setStats(defaultStats);
      setLoading(false);
      setError(null);
      return;
    }

    // 检查缓存（非强制刷新时）
    if (!forceRefresh) {
      const cached = getCachedStats();
      if (cached) {
        setStats(cached);
        setLoading(false);
        setError(null);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      // 使用专用仪表盘统计端点（/api/stats/dashboard）
      const res = await fetch('/api/stats/dashboard', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error('Failed to fetch dashboard stats');
      }

      const data = await res.json();

      const newStats: DashboardStats = {
        projectCount: data.projectCount || 0,
        scriptCount: data.scriptCount || 0,
        storyboardCount: data.storyboardCount || 0,
        aiCallsCount: data.aiCallsCount || 0,
        recentProjects: (data.recentProjects || []).map((p: { id: string; name: string; updatedAt: string }) => ({
          id: String(p.id),
          name: p.name,
          updatedAt: p.updatedAt || new Date().toISOString(),
        })),
      };

      setStats(newStats);
      setCachedStats(newStats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(refreshKey > 0);
  }, [fetchStats, refreshKey]);

  const refresh = useCallback(() => {
    sessionStorage.removeItem(CACHE_KEY);
    setRefreshKey(k => k + 1);
  }, []);

  return { stats, loading, error, refresh };
}
