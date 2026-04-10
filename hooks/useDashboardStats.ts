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
      // 获取项目列表
      const res = await fetch('/api/projects', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error('Failed to fetch projects');
      }

      const data = await res.json();
      const projects = data.projects || [];

      // 计算统计数据
      const projectCount = projects.length;
      
      // 统计剧本和分镜数量（基于项目类型）
      let scriptCount = 0;
      let storyboardCount = 0;
      
      projects.forEach((project: { type?: string; settings_json?: string }) => {
        if (project.type === 'script') {
          scriptCount++;
        }
        // 尝试从 settings_json 获取更多信息
        try {
          const settings = project.settings_json ? JSON.parse(project.settings_json) : {};
          if (settings.storyboardCount) {
            storyboardCount += settings.storyboardCount;
          }
        } catch {
          // 忽略解析错误
        }
      });

      // 获取最近5个项目
      const sortedProjects = [...projects]
        .sort((a: { updated_at?: string }, b: { updated_at?: string }) => {
          const dateA = new Date(a.updated_at || 0).getTime();
          const dateB = new Date(b.updated_at || 0).getTime();
          return dateB - dateA;
        })
        .slice(0, 5);

      const recentProjects: RecentProject[] = sortedProjects.map((p: { id: number; name: string; updated_at?: string }) => ({
        id: String(p.id),
        name: p.name,
        updatedAt: p.updated_at || new Date().toISOString(),
      }));

      const newStats: DashboardStats = {
        projectCount,
        scriptCount,
        storyboardCount,
        recentProjects,
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
