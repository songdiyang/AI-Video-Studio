/**
 * 小说场景数据管理 Hook
 */

import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '../../../services/auth';

export interface NovelScene {
  id: number;
  project_id: number;
  name: string;
  location?: string;
  space_description?: string;
  close_up_details?: string[];
  history?: string;
  status?: string;
  importance: 'key' | 'normal' | 'minor';
  created_at: string;
  updated_at: string;
}

export function useNovelScenes(projectId: number) {
  const [scenes, setScenes] = useState<NovelScene[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载场景列表
  const loadScenes = useCallback(async () => {
    if (!projectId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/novels/${projectId}/scenes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      
      if (res.ok) {
        const data = await res.json();
        setScenes(data.scenes || []);
      } else {
        throw new Error('加载场景列表失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // 初始加载
  useEffect(() => {
    loadScenes();
  }, [loadScenes]);

  // 创建场景
  const createScene = useCallback(async (sceneData: Partial<NovelScene>) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/novels/${projectId}/scenes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(sceneData),
      });

      if (res.ok) {
        const newScene = await res.json();
        setScenes(prev => [...prev, newScene]);
        return newScene;
      } else {
        throw new Error('创建场景失败');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [projectId]);

  // 更新场景
  const updateScene = useCallback(async (sceneId: number, sceneData: Partial<NovelScene>) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/novels/${projectId}/scenes/${sceneId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(sceneData),
      });

      if (res.ok) {
        const updated = await res.json();
        setScenes(prev => prev.map(s => s.id === sceneId ? updated : s));
        return updated;
      } else {
        throw new Error('更新场景失败');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [projectId]);

  // 删除场景
  const deleteScene = useCallback(async (sceneId: number) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/novels/${projectId}/scenes/${sceneId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        setScenes(prev => prev.filter(s => s.id !== sceneId));
        return true;
      } else {
        throw new Error('删除场景失败');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [projectId]);

  // 按重要程度分组
  const scenesByImportance = {
    key: scenes.filter(s => s.importance === 'key'),
    normal: scenes.filter(s => s.importance === 'normal'),
    minor: scenes.filter(s => s.importance === 'minor'),
  };

  return {
    scenes,
    scenesByImportance,
    loading,
    error,
    loadScenes,
    createScene,
    updateScene,
    deleteScene,
  };
}
