/**
 * 小说人物数据管理 Hook
 */

import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '../../../services/auth';

export interface NovelCharacter {
  id: number;
  project_id: number;
  name: string;
  gender: 'male' | 'female' | 'other' | 'unknown';
  age?: number;
  personality?: string;
  weight?: number;
  appearance_face?: string;
  height?: number;
  outfit?: {
    head?: string;
    neck?: string;
    upper_body?: string;
    lower_body?: string;
    feet?: string;
  };
  accessories?: {
    head?: string;
    neck?: string;
    upper_body?: string;
    lower_body?: string;
    feet?: string;
  };
  background_story?: string;
  role_type: 'protagonist' | 'supporting' | 'antagonist' | 'minor';
  created_at: string;
  updated_at: string;
}

export function useNovelCharacters(projectId: number) {
  const [characters, setCharacters] = useState<NovelCharacter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载人物列表
  const loadCharacters = useCallback(async () => {
    if (!projectId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/novels/${projectId}/characters`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      
      if (res.ok) {
        const data = await res.json();
        setCharacters(data.characters || []);
      } else {
        throw new Error('加载人物列表失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // 初始加载
  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  // 创建人物
  const createCharacter = useCallback(async (characterData: Partial<NovelCharacter>) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/novels/${projectId}/characters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(characterData),
      });

      if (res.ok) {
        const newCharacter = await res.json();
        setCharacters(prev => [...prev, newCharacter]);
        return newCharacter;
      } else {
        throw new Error('创建人物失败');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [projectId]);

  // 更新人物
  const updateCharacter = useCallback(async (characterId: number, characterData: Partial<NovelCharacter>) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/novels/${projectId}/characters/${characterId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(characterData),
      });

      if (res.ok) {
        const updated = await res.json();
        setCharacters(prev => prev.map(c => c.id === characterId ? updated : c));
        return updated;
      } else {
        throw new Error('更新人物失败');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [projectId]);

  // 删除人物
  const deleteCharacter = useCallback(async (characterId: number) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/novels/${projectId}/characters/${characterId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        setCharacters(prev => prev.filter(c => c.id !== characterId));
        return true;
      } else {
        throw new Error('删除人物失败');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [projectId]);

  // 按角色类型分组
  const charactersByRole = {
    protagonist: characters.filter(c => c.role_type === 'protagonist'),
    supporting: characters.filter(c => c.role_type === 'supporting'),
    antagonist: characters.filter(c => c.role_type === 'antagonist'),
    minor: characters.filter(c => c.role_type === 'minor'),
  };

  return {
    characters,
    charactersByRole,
    loading,
    error,
    loadCharacters,
    createCharacter,
    updateCharacter,
    deleteCharacter,
  };
}
