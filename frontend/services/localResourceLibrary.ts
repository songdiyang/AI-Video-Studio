/**
 * 资源库聚合路由（/api/resource-library）
 * ──────────────────────────────────────────────────────────────
 * 分类显示配置与角色/影棚/道具/环境/建筑/服装清单来自同一份工程数据：
 *   - GET  /api/resource-library?projectId=... 一次返回 resources + categories
 *   - PUT  /api/resource-library/categories     保存分类配置到工程文档
 *
 * 分类配置不再使用 localStorage，避免「资源已存在但分类被全局配置隐藏」的脱节。
 */
import { readDoc, writeDoc } from './localStore';
import { loadRestDoc, resolvePath, jsonResponse } from './localAssetShared';
import { migrateScenesToStudios } from './localStudios';
import type { ResourceCategoryConfig, ResourceTypeKey } from '../types/resourceLibrary';

const RESOURCE_TYPES: ResourceTypeKey[] = [
  'characters', 'locations', 'props', 'environments', 'buildings', 'costumes',
];

const DEFAULT_CATEGORIES: ResourceCategoryConfig = {
  // 环境/建筑是影棚的组成素材，默认展示在影棚分组之下，便于直接维护绑定来源
  enabledTypes: ['characters', 'locations', 'environments', 'buildings', 'props'],
  customCategories: [],
};

/** 旧版默认三分类（升级识别用） */
const LEGACY_DEFAULT_TYPES = ['characters', 'locations', 'props'];

function normalizeCategories(raw: any): ResourceCategoryConfig {
  const enabledTypes = Array.isArray(raw?.enabledTypes)
    ? raw.enabledTypes.filter((t: any): t is ResourceTypeKey => RESOURCE_TYPES.includes(t))
    : [...DEFAULT_CATEGORIES.enabledTypes];
  const customCategories = Array.isArray(raw?.customCategories)
    ? raw.customCategories
      .filter((c: any) => c && typeof c.id === 'string' && typeof c.name === 'string')
      .map((c: any) => ({
        ...c,
        members: Array.isArray(c.members)
          ? c.members.filter((m: any): m is string => typeof m === 'string')
          : [],
      }))
    : [];

  // 完全空配置回退默认分类，保证资源库不会出现「有资源但零分类」的死状态。
  if (enabledTypes.length === 0 && customCategories.length === 0) {
    return { ...DEFAULT_CATEGORIES, enabledTypes: [...DEFAULT_CATEGORIES.enabledTypes] };
  }
  // 存量工程一次性升级：落盘的还是旧版默认三分类时，换为含环境/建筑的新默认；
  // 用户自定义过分类（内容或顺序不同、有自定义分组）则保持原样。
  if (customCategories.length === 0 && enabledTypes.length === LEGACY_DEFAULT_TYPES.length
    && enabledTypes.every((t, i) => t === LEGACY_DEFAULT_TYPES[i])) {
    return { ...DEFAULT_CATEGORIES, enabledTypes: [...DEFAULT_CATEGORIES.enabledTypes] };
  }
  return { enabledTypes, customCategories };
}

function propItems(doc: any): any[] {
  if (Array.isArray(doc?.props)) return doc.props;
  if (Array.isArray(doc?.items)) return doc.items;
  return [];
}

/**
 * 读取工程级分类配置；兼容一次性迁移旧的全局 localStorage 配置。
 * 迁移完成后删除旧键，分类配置从此只存在于工程文档。
 */
async function loadCategories(path: string): Promise<ResourceCategoryConfig> {
  const stored = await readDoc<any>(path, 'resourceCategories', null);
  if (stored && (Array.isArray(stored.enabledTypes) || Array.isArray(stored.customCategories))) {
    return normalizeCategories(stored);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const legacy = localStorage.getItem('resource_categories_v1');
      if (legacy) {
        const migrated = normalizeCategories(JSON.parse(legacy));
        writeDoc(path, 'resourceCategories', migrated);
        localStorage.removeItem('resource_categories_v1');
        return migrated;
      }
    }
  } catch {
    /* 旧配置损坏时直接使用默认分类 */
  }

  return normalizeCategories(null);
}

export async function routeResourceLibrary(
  url: URL,
  method: string,
  body: any,
): Promise<Response | null> {
  const pathname = url.pathname;
  if (pathname !== '/api/resource-library' && pathname !== '/api/resource-library/categories') {
    return null;
  }

  const m = method.toUpperCase();
  const projectIdRaw = url.searchParams.get('projectId') ?? body?.projectId ?? null;
  const path = await resolvePath(projectIdRaw);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);

  if (pathname === '/api/resource-library' && m === 'GET') {
    // 影棚自愈迁移：读取前把历史 scenes 影棚并入 studios，保证资源面板与分镜看到同一份影棚
    await migrateScenesToStudios(path);
    const [characters, studios, propsDoc, environments, buildings, costumes, categories] = await Promise.all([
      loadRestDoc(path, 'characters'),
      loadRestDoc(path, 'studios'),
      readDoc<any>(path, 'props', {}),
      loadRestDoc(path, 'environments'),
      loadRestDoc(path, 'buildings'),
      loadRestDoc(path, 'costumes'),
      loadCategories(path),
    ]);

    return jsonResponse({
      success: true,
      resources: {
        characters: characters.items,
        locations: studios.items,
        props: propItems(propsDoc),
        environments: environments.items,
        buildings: buildings.items,
        costumes: costumes.items,
      },
      categories: normalizeCategories(categories),
    });
  }

  if (pathname === '/api/resource-library/categories' && (m === 'PUT' || m === 'PATCH')) {
    const categories = normalizeCategories(body?.categories ?? body);
    writeDoc(path, 'resourceCategories', categories);
    return jsonResponse({ success: true, categories });
  }

  return null;
}
