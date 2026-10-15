/**
 * 资源分类定义与用户/AI 自定义分类
 * ──────────────────────────────────────────────────────────────
 * - 内置资源类型注册表：哪些分类可展示、其显示名与计数方式
 * - 用户自定义分类：localStorage 持久化（键 resource_categories_v1），
 *   默认仅保留「角色 / 影棚 / 道具」三个基本分类，其余内置类型按需手动开启
 * - AI 启发式分类：基于资源名称关键词自动生成自定义分类（classifyResources）
 */
import { useCallback, useEffect, useState } from 'react';
import type { Character, PropItem } from './types';
import type { Scene } from './useSceneData';
import type { Environment } from '../../../services/environments';
import type { Building } from '../../../services/buildings';
import type { Costume } from '../../../services/costumes';

/** 可展示的资源类型（与 ResourcePanel 手风琴内容渲染器 key 一致） */
export type ResourceTypeKey =
  | 'characters' | 'locations' | 'props' | 'environments' | 'buildings' | 'costumes';

/** 手风琴分组 key：内置类型 或 自定义分类（custom:{id}） */
export type ResourceCategoryKey = string;

/** 自定义分类成员引用：`类型:资源ID` */
export type CategoryMemberRef = string;

export interface CustomCategory {
  id: string;
  name: string;
  /** AI 启发式生成的分类带标记，用户手动创建的没有 */
  aiGenerated?: boolean;
  members: CategoryMemberRef[];
}

export interface CategoryConfig {
  /** 当前展示（开启）的内置类型 */
  enabledTypes: ResourceTypeKey[];
  /** 用户 / AI 自定义分类 */
  customCategories: CustomCategory[];
}

/** 默认只保留最基本的三个分类 */
export const DEFAULT_ENABLED_TYPES: ResourceTypeKey[] = ['characters', 'locations', 'props'];

export const CUSTOM_CATEGORY_PREFIX = 'custom:';
export const makeCustomKey = (id: string): ResourceCategoryKey => `${CUSTOM_CATEGORY_PREFIX}${id}`;
export const parseCustomKey = (key: ResourceCategoryKey): string | null =>
  key.startsWith(CUSTOM_CATEGORY_PREFIX) ? key.slice(CUSTOM_CATEGORY_PREFIX.length) : null;

/** 面板已加载的全量资源数据（用于计数 / AI 分类 / 成员选择） */
export interface CategoryResourceData {
  characters: Character[];
  scenes: Scene[];
  props: PropItem[];
  environments: Environment[];
  buildings: Building[];
  costumes: Costume[];
}

interface TypeDef {
  label: string;
  count: (data: CategoryResourceData) => number;
}

/** 内置类型注册表 */
export const RESOURCE_TYPE_REGISTRY: Record<ResourceTypeKey, TypeDef> = {
  characters: { label: '角色', count: d => d.characters.length },
  locations: { label: '影棚', count: d => d.scenes.length },
  props: { label: '道具', count: d => d.props.length },
  environments: { label: '环境', count: d => d.environments.length },
  buildings: { label: '建筑', count: d => d.buildings.length },
  costumes: { label: '服装', count: d => d.costumes.length },
};

export const ALL_RESOURCE_TYPES = Object.keys(RESOURCE_TYPE_REGISTRY) as ResourceTypeKey[];

export interface CategoryResourceEntry {
  type: ResourceTypeKey;
  typeId: number;
  name: string;
}

/** 全量资源扁平列表（供分类管理中按类型挑选成员） */
export function buildAllResourceEntries(data: CategoryResourceData): CategoryResourceEntry[] {
  return [
    ...data.characters.map(c => ({ type: 'characters' as const, typeId: c.id, name: c.name })),
    ...data.scenes.map(s => ({ type: 'locations' as const, typeId: s.id, name: s.name })),
    ...data.props.map(p => ({ type: 'props' as const, typeId: p.id, name: p.name })),
    ...data.environments.map(e => ({ type: 'environments' as const, typeId: e.id, name: e.name })),
    ...data.buildings.map(b => ({ type: 'buildings' as const, typeId: b.id, name: b.name })),
    ...data.costumes.map(c => ({ type: 'costumes' as const, typeId: c.id, name: c.name })),
  ];
}

export const memberRefOf = (e: { type: ResourceTypeKey; typeId: number }): CategoryMemberRef =>
  `${e.type}:${e.typeId}`;

export function findResourceEntry(
  entries: CategoryResourceEntry[], ref: CategoryMemberRef,
): CategoryResourceEntry | undefined {
  const idx = ref.lastIndexOf(':');
  const type = ref.slice(0, idx) as ResourceTypeKey;
  const typeId = Number(ref.slice(idx + 1));
  return entries.find(e => e.type === type && e.typeId === typeId);
}

// ── AI 启发式分类 ──

/** 关键词 → 分类名 的启发式规则表（命中第一个即归类） */
export const AI_CATEGORY_RULES: { keywords: string[]; category: string }[] = [
  { keywords: ['主角', '主人公', '男一', '女一', 'hero', 'protagonist'], category: '主角团' },
  { keywords: ['反派', '敌人', 'boss', 'villain', '魔', '妖'], category: '反派势力' },
  { keywords: ['路人', '配角', '群众', '士兵', '村民', 'mob', 'extra'], category: '配角群演' },
  { keywords: ['日', '晴', '晨', '黄昏', 'day', 'sunny', 'street', '街', '校园', '教室'], category: '日常场景' },
  { keywords: ['夜', '月', 'dark', 'night', '月光', '星空', '雨'], category: '夜景氛围' },
  { keywords: ['宫', '殿', '楼', '塔', '城堡', 'castle', 'palace', '建筑', '大厅'], category: '室内外建筑' },
  { keywords: ['武器', '剑', '刀', '枪', '道具', 'prop', 'sword', '法宝', '手机'], category: '关键道具' },
  { keywords: ['服', '装', '衣', '裙', 'armor', 'costume', '制服', '铠甲'], category: '服饰造型' },
];

/**
 * 对全量资源做关键词启发式归类。
 * 仅返回命中 ≥2 个资源的分类，避免产生大量单资源噪音分组。
 */
export function classifyResources(entries: CategoryResourceEntry[]): Omit<CustomCategory, 'id'>[] {
  const buckets = new Map<string, CategoryMemberRef[]>();
  for (const rule of AI_CATEGORY_RULES) buckets.set(rule.category, []);
  for (const entry of entries) {
    const lowerName = (entry.name || '').toLowerCase();
    const hit = AI_CATEGORY_RULES.find(r => r.keywords.some(k => lowerName.includes(k.toLowerCase())));
    if (hit) buckets.get(hit.category)!.push(memberRefOf(entry));
  }
  return [...buckets.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([name, members]) => ({ name, aiGenerated: true, members }));
}

// ── 持久化 ──

const STORAGE_KEY = 'resource_categories_v1';

export function loadCategoryConfig(): CategoryConfig {
  const fallback: CategoryConfig = { enabledTypes: [...DEFAULT_ENABLED_TYPES], customCategories: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<CategoryConfig>;
    const enabledTypes = Array.isArray(parsed.enabledTypes)
      ? parsed.enabledTypes.filter((t): t is ResourceTypeKey => ALL_RESOURCE_TYPES.includes(t))
      : fallback.enabledTypes;
    const customCategories = Array.isArray(parsed.customCategories)
      ? parsed.customCategories.filter(c => c && typeof c.id === 'string' && typeof c.name === 'string')
        .map(c => ({ ...c, members: Array.isArray(c.members) ? c.members : [] }))
      : [];
    return { enabledTypes, customCategories };
  } catch {
    return fallback;
  }
}

export function saveCategoryConfig(config: CategoryConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

// ── 状态管理 Hook ──

/** 资源分类配置：展示哪些内置类型 + 自定义分类增删改，自动持久化 */
export function useResourceCategories() {
  const [config, setConfig] = useState<CategoryConfig>(loadCategoryConfig);

  useEffect(() => {
    saveCategoryConfig(config);
  }, [config]);

  /** 开启/关闭某个内置类型的展示 */
  const toggleType = useCallback((type: ResourceTypeKey) => {
    setConfig(prev => ({
      ...prev,
      enabledTypes: prev.enabledTypes.includes(type)
        ? prev.enabledTypes.filter(t => t !== type)
        : [...prev.enabledTypes, type],
    }));
  }, []);

  /** 新建自定义分类（同名则复用现有分类改名语义，直接拒绝） */
  const addCustomCategory = useCallback((name: string, members: CategoryMemberRef[] = []): boolean => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    let added = false;
    setConfig(prev => {
      if (prev.customCategories.some(c => c.name === trimmed)) return prev;
      added = true;
      return {
        ...prev,
        customCategories: [...prev.customCategories, { id: `c${Date.now()}`, name: trimmed, members }],
      };
    });
    return added;
  }, []);

  const renameCustomCategory = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setConfig(prev => ({
      ...prev,
      customCategories: prev.customCategories.map(c => (c.id === id ? { ...c, name: trimmed, aiGenerated: undefined } : c)),
    }));
  }, []);

  const removeCustomCategory = useCallback((id: string) => {
    setConfig(prev => ({
      ...prev,
      customCategories: prev.customCategories.filter(c => c.id !== id),
    }));
  }, []);

  /** 向自定义分类添加成员（去重） */
  const addMember = useCallback((id: string, ref: CategoryMemberRef) => {
    setConfig(prev => ({
      ...prev,
      customCategories: prev.customCategories.map(c =>
        c.id === id && !c.members.includes(ref) ? { ...c, members: [...c.members, ref] } : c,
      ),
    }));
  }, []);

  const removeMember = useCallback((id: string, ref: CategoryMemberRef) => {
    setConfig(prev => ({
      ...prev,
      customCategories: prev.customCategories.map(c =>
        c.id === id ? { ...c, members: c.members.filter(m => m !== ref) } : c,
      ),
    }));
  }, []);

  /** 批量应用 AI 分类结果（同名分类覆盖成员，其余追加） */
  const applyAiCategories = useCallback((suggestions: Omit<CustomCategory, 'id'>[]) => {
    setConfig(prev => {
      const next = [...prev.customCategories];
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

  /** 移除所有 AI 生成的分类（保留用户手动创建的） */
  const clearAiCategories = useCallback(() => {
    setConfig(prev => ({
      ...prev,
      customCategories: prev.customCategories.filter(c => !c.aiGenerated),
    }));
  }, []);

  return {
    config,
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
