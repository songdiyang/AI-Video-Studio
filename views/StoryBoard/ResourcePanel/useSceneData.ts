import { useState, useEffect } from 'react';
import { getAuthToken } from '../../../services/auth';

export interface Scene {
  id: number;
  name: string;
  description?: string;
  environment?: string;
  lighting?: string;
  mood?: string;
  image_url?: string;
  reverse_image_url?: string; // B 面图 URL
  generation_prompt?: string; // A 面生成提示词
  reverse_generation_prompt?: string; // B 面生成提示词
  generation_status?: string;
  tags?: string;
}

export const useSceneData = (projectId?: number | null, scriptId?: number | null) => {
  const [dbScenes, setDbScenes] = useState<Scene[]>([]);
  const [isLoadingScenes, setIsLoadingScenes] = useState(false);

  useEffect(() => {
    if (projectId && scriptId) {
      loadScenes();
    }
  }, [projectId, scriptId]);

  const loadScenes = async () => {
    if (!projectId || !scriptId) {
      console.log('[ResourcePanel] 缺少 projectId 或 scriptId，跳过加载场景');
      return;
    }
    
    setIsLoadingScenes(true);
    try {
      const token = getAuthToken();
      // 强制传递 scriptId 给后端
      const res = await fetch(`/api/scenes/project/${projectId}?scriptId=${scriptId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        const data = await res.json();
        setDbScenes(data.scenes || []);
        console.log('[ResourcePanel] 加载了', data.scenes?.length || 0, '个场景');
      }
    } catch (error) {
      console.error('[ResourcePanel] 加载场景失败:', error);
    } finally {
      setIsLoadingScenes(false);
    }
  };

  return { dbScenes, isLoadingScenes, loadScenes };
};
