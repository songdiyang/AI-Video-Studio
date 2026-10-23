import { useState, useEffect } from 'react';
import { Character } from './types';

/** 把 /api/characters/project/:id 的 snake_case 角色映射为面板 camelCase 形状 */
export function mapCharacterItems(items: any[]): Character[] {
  return (items || []).map((c: any) => ({
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
}

export const useCharacterData = (projectId?: number | null, scriptId?: number | null) => {
  const [dbCharacters, setDbCharacters] = useState<Character[]>([]);
  const [isLoadingCharacters, setIsLoadingCharacters] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (projectId) {
      loadCharacters();
    } else {
      setDbCharacters([]);
    }
  }, [projectId, reloadToken]);

  // AI 助手等外部入口修改角色库后广播刷新，保证资源面板与智能体看到同一份数据
  useEffect(() => {
    const onLibraryChanged = (event: Event) => {
      const type = (event as CustomEvent)?.detail?.type;
      if (!type || type === 'characters') setReloadToken((v) => v + 1);
    };
    window.addEventListener('resource-library-changed', onLibraryChanged);
    return () => window.removeEventListener('resource-library-changed', onLibraryChanged);
  }, []);

  const loadCharacters = async () => {
    if (!projectId) {
      console.log('[ResourcePanel] 缺少 projectId，跳过加载角色');
      return;
    }
    
    setIsLoadingCharacters(true);
    try {
      // 获取项目所有角色（不按集数过滤，因为同一角色可能出现在多集）
      const res = await fetch(`/api/characters/project/${projectId}`);

      if (res.ok) {
        const data = await res.json();
        setDbCharacters(mapCharacterItems(data.characters || []));
        console.log('[ResourcePanel] 加载了', (data.characters || []).length, '个角色');
      }
    } catch (error) {
      console.error('[ResourcePanel] 加载角色失败:', error);
    } finally {
      setIsLoadingCharacters(false);
    }
  };

  return { dbCharacters, isLoadingCharacters, loadCharacters };
};
