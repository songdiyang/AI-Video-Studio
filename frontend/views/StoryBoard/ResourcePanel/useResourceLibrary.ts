/**
 * 资源库统一 Hook
 * ──────────────────────────────────────────────────────────────
 * 一次 /api/resource-library 调用同时拿到资源清单与分类显示配置，
 * 分类修改也写回同一份工程文档，避免 localStorage 配置与资源数据脱节。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Character, PropItem } from './types';
import type { Environment } from '../../../services/environments';
import type { Building } from '../../../services/buildings';
import type { Costume } from '../../../services/costumes';
import { mapCharacterItems } from './useCharacterData';
import { mapStudioItems, type Scene } from './useSceneData';
import { ALL_RESOURCE_TYPES, DEFAULT_ENABLED_TYPES, type CategoryConfig, type CategoryMemberRef, type CustomCategory } from './resourceCategories';
import { fetchResourceLibrary, saveResourceLibraryCategories } from '../../../services/resourceLibrary';
import type { ResourceLibraryResponse } from '../../../types/resourceLibrary';

export interface ResourceLibraryData {
  characters: Character[];
  locations: Scene[];
  props: PropItem[];
  environments: Environment[];
  buildings: Building[];
  costumes: Costume[];
}

const emptyData = (): ResourceLibraryData => ({
  characters: [],
  locations: [],
  props: [],
  environments: [],
  buildings: [],
  costumes: [],
});

const defaultCategories = (): CategoryConfig => ({
  enabledTypes: [...DEFAULT_ENABLED_TYPES],
  customCategories: [],
});

function normalizeCategories(raw: any): CategoryConfig {
  const enabledTypes = Array.isArray(raw?.enabledTypes)
    ? raw.enabledTypes.filter((t: any) => ALL_RESOURCE_TYPES.includes(t))
    : [...DEFAULT_ENABLED_TYPES];
  const customCategories = Array.isArray(raw?.customCategories) ? raw.customCategories : [];
  if (enabledTypes.length === 0 && customCategories.length === 0) return defaultCategories();
  return { enabledTypes, customCategories };
}

function mapPayload(payload: ResourceLibraryResponse): ResourceLibraryData {
  return {
    characters: mapCharacterItems(payload.resources.characters || []),
    locations: mapStudioItems(payload.resources.locations || []),
    props: (payload.resources.props || []) as PropItem[],
    environments: (payload.resources.environments || []) as Environment[],
    buildings: (payload.resources.buildings || []) as Building[],
    costumes: (payload.resources.costumes || []) as Costume[],
  };
}

export function useResourceLibrary(projectId?: number | null, scriptId?: number | null) {
  const [data, setData] = useState<ResourceLibraryData>(emptyData);
  const [categories, setCategories] = useState<CategoryConfig>(defaultCategories);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const hydratedRef = useRef(false);
  const loadedProjectRef = useRef<number | null>(null);
  const lastSavedRef = useRef('');
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  const refresh = useCallback(async () => {
    if (!projectId) {
      requestIdRef.current++;
      hydratedRef.current = false;
      loadedProjectRef.current = null;
      lastSavedRef.current = '';
      setData(emptyData());
      setCategories(defaultCategories());
      setIsLoading(false);
      setError(null);
      return;
    }

    const reqId = ++requestIdRef.current;
    setIsLoading(true);
    try {
      const payload = await fetchResourceLibrary(projectId);
      if (reqId !== requestIdRef.current) return;
      const nextCategories = normalizeCategories(payload.categories);
      setData(mapPayload(payload));
      setCategories(nextCategories);
      hydratedRef.current = true;
      loadedProjectRef.current = projectId;
      lastSavedRef.current = JSON.stringify(nextCategories);
      setError(null);
    } catch (e: any) {
      if (reqId !== requestIdRef.current) return;
      setError(e?.message || '加载资源库失败');
    } finally {
      if (reqId === requestIdRef.current) setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh, scriptId]);

  // 卸载时让在途请求失效，避免写回已卸载组件
  useEffect(() => () => { requestIdRef.current++; }, []);

  // AI 助手等外部入口修改角色/场景后广播刷新，保持与统一数据源一致
  useEffect(() => {
    const onLibraryChanged = (event: Event) => {
      const type = (event as CustomEvent)?.detail?.type;
      if (!type || type === 'characters' || type === 'studios') void refresh();
    };
    window.addEventListener('resource-library-changed', onLibraryChanged);
    return () => window.removeEventListener('resource-library-changed', onLibraryChanged);
  }, [refresh]);

  // 分类配置变化后写回工程文档（与资源数据同源）
  useEffect(() => {
    if (!projectId || !hydratedRef.current || loadedProjectRef.current !== projectId) return;
    const serialized = JSON.stringify(categories);
    if (serialized === lastSavedRef.current) return;
    lastSavedRef.current = serialized;
    void saveResourceLibraryCategories(projectId, categories).catch((e) => {
      console.warn('[ResourceLibrary] 保存分类配置失败:', e);
    });
  }, [categories, projectId]);

  const toggleType = useCallback((type: CategoryConfig['enabledTypes'][number]) => {
    setCategories(prev => ({
      ...prev,
      enabledTypes: prev.enabledTypes.includes(type)
        ? prev.enabledTypes.filter(t => t !== type)
        : [...prev.enabledTypes, type],
    }));
  }, []);

  const addCustomCategory = useCallback((name: string, members: CategoryMemberRef[] = []): boolean => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (categoriesRef.current.customCategories.some(c => c.name === trimmed)) return false;
    setCategories(prev => {
      if (prev.customCategories.some(c => c.name === trimmed)) return prev;
      return {
        ...prev,
        customCategories: [...prev.customCategories, { id: `c${Date.now()}`, name: trimmed, members }],
      };
    });
    return true;
  }, []);

  const renameCustomCategory = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategories(prev => ({
      ...prev,
      customCategories: prev.customCategories.map(c => (
        c.id === id ? { ...c, name: trimmed, aiGenerated: undefined } : c
      )),
    }));
  }, []);

  const removeCustomCategory = useCallback((id: string) => {
    setCategories(prev => ({
      ...prev,
      customCategories: prev.customCategories.filter(c => c.id !== id),
    }));
  }, []);

  const addMember = useCallback((id: string, ref: CategoryMemberRef) => {
    setCategories(prev => ({
      ...prev,
      customCategories: prev.customCategories.map(c => (
        c.id === id && !c.members.includes(ref) ? { ...c, members: [...c.members, ref] } : c
      )),
    }));
  }, []);

  const removeMember = useCallback((id: string, ref: CategoryMemberRef) => {
    setCategories(prev => ({
      ...prev,
      customCategories: prev.customCategories.map(c => (
        c.id === id ? { ...c, members: c.members.filter(m => m !== ref) } : c
      )),
    }));
  }, []);

  const applyAiCategories = useCallback((suggestions: Omit<CustomCategory, 'id'>[]) => {
    setCategories(prev => {
      const next = prev.customCategories.map(c => ({ ...c, members: [...c.members] }));
      for (const s of suggestions) {
        const existing = next.find(c => c.name === s.name);
        if (existing) {
          existing.members = [...new Set([...existing.members, ...s.members])];
          existing.aiGenerated = true;
        } else {
          next.push({ id: `ai${Date.now()}${Math.random().toString(36).slice(2, 6)}`, ...s });
        }
      }
      return { ...prev, customCategories: next };
    });
  }, []);

  const clearAiCategories = useCallback(() => {
    setCategories(prev => ({
      ...prev,
      customCategories: prev.customCategories.filter(c => !c.aiGenerated),
    }));
  }, []);

  return {
    data,
    categories,
    isLoading,
    error,
    refresh,
    toggleType,
    addCustomCategory,
    renameCustomCategory,
    removeCustomCategory,
    addMember,
    removeMember,
    applyAiCategories,
    clearAiCategories,
  };
}
