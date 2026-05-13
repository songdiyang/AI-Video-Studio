import { useState, useEffect } from 'react';
import { getAuthToken } from '../../../services/auth';
import type { Environment } from '../../../services/environments';
import type { Building } from '../../../services/buildings';

export interface Scene {
  id: number;
  name: string;
  description?: string;
  environment?: string;
  lighting?: string;
  mood?: string;
  image_url?: string;
  reverse_image_url?: string;
  generation_prompt?: string;
  reverse_generation_prompt?: string;
  generation_status?: string;
  tags?: string;
  studio_id?: number | null;
  studio_name?: string | null;
  nine_grid_image_url?: string | null;
  nine_grid_generation_status?: string | null;
  // 新场景概念：environment + buildings 聚合
  _environment?: Environment | null;
  _buildings?: Building[];
  /** 影棚采用环境的哪一面（front/back） */
  environment_view?: 'front' | 'back';
  /** 项目ID（用于加载组装候选池） */
  project_id?: number;
}

export const useSceneData = (projectId?: number | null, scriptId?: number | null) => {
  const [dbScenes, setDbScenes] = useState<Scene[]>([]);
  const [isLoadingScenes, setIsLoadingScenes] = useState(false);

  useEffect(() => {
    if (projectId) {
      loadStudios();
    }
  }, [projectId, scriptId]);

  const loadStudios = async () => {
    if (!projectId) return;
    
    setIsLoadingScenes(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/studios?projectId=${projectId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        const data = await res.json();
        const studios = (data.studios || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description || '',
          image_url: s.cover_image_url || null,
          nine_grid_image_url: s.nine_grid_image_url || null,
          nine_grid_generation_status: s.nine_grid_generation_status || null,
          studio_id: s.id,
          studio_name: s.name,
          generation_status: 'pending',
          _environment: s.environment || null,
          _buildings: Array.isArray(s.buildings) ? s.buildings : [],
          environment_view: s.environment_view || 'front',
          project_id: s.project_id,
        }));
        setDbScenes(studios);
        console.log('[ResourcePanel] 加载了', studios.length, '个场景（Studios）');
      }
    } catch (error) {
      console.error('[ResourcePanel] 加载场景失败:', error);
    } finally {
      setIsLoadingScenes(false);
    }
  };

  return { dbScenes, isLoadingScenes, loadScenes: loadStudios };
};
