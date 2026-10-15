import { useState, useEffect } from 'react';
import { getAuthToken } from '../../../services/auth';
import { Character } from './types';

export const useCharacterData = (projectId?: number | null, scriptId?: number | null) => {
  const [dbCharacters, setDbCharacters] = useState<Character[]>([]);
  const [isLoadingCharacters, setIsLoadingCharacters] = useState(false);

  useEffect(() => {
    if (projectId) {
      loadCharacters();
    } else {
      setDbCharacters([]);
    }
  }, [projectId]);

  const loadCharacters = async () => {
    if (!projectId) {
      console.log('[ResourcePanel] 缺少 projectId，跳过加载角色');
      return;
    }
    
    setIsLoadingCharacters(true);
    try {
      const token = getAuthToken();
      // 获取项目所有角色（不按集数过滤，因为同一角色可能出现在多集）
      const res = await fetch(`/api/characters/project/${projectId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        const data = await res.json();
        // 将后端 snake_case 字段映射为前端 camelCase
        const mapped: Character[] = (data.characters || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          appearance: c.appearance,
          base_appearance: c.base_appearance,
          outfit_appearance: c.outfit_appearance,
          personality: c.personality,
          description: c.description,
          source: c.source,
          imageUrl: c.image_url || c.imageUrl,
          frontViewUrl: c.front_view_url || c.frontViewUrl,
          sideViewUrl: c.side_view_url || c.sideViewUrl,
          backViewUrl: c.back_view_url || c.backViewUrl,
          characterSheetUrl: c.character_sheet_url || c.characterSheetUrl,
          generationPrompt: c.generation_prompt || c.generationPrompt,
          generationStatus: c.generation_status || c.generationStatus,
          gender: c.gender,
          statesCount: c.states_count ?? 0,
          base_model_image_url: c.base_model_image_url,
          has_base_model_views: c.has_base_model_views,
          active_state_name: c.active_state_name,
          active_state_outfit: c.active_state_outfit,
          active_state_image_url: c.active_state_image_url,
        }));
        setDbCharacters(mapped);
        console.log('[ResourcePanel] 加载了', mapped.length, '个角色');
      }
    } catch (error) {
      console.error('[ResourcePanel] 加载角色失败:', error);
    } finally {
      setIsLoadingCharacters(false);
    }
  };

  return { dbCharacters, isLoadingCharacters, loadCharacters };
};
