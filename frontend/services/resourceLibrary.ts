/**
 * 资源库统一数据服务
 * ──────────────────────────────────────────────────────────────
 * 分类显示配置与资源清单由同一个工程接口返回，避免两者分开存储后脱节。
 * 本地模式下 /api/resource-library 由 localResourceLibrary 接管。
 */
import type { ResourceCategoryConfig, ResourceLibraryResponse } from '../types/resourceLibrary';

const EMPTY_RESOURCES: ResourceLibraryResponse['resources'] = {
  characters: [],
  locations: [],
  props: [],
  environments: [],
  buildings: [],
  costumes: [],
};

const DEFAULT_CATEGORIES: ResourceCategoryConfig = {
  // 与 localResourceLibrary 的默认保持一致：环境/建筑展示在影棚之下
  enabledTypes: ['characters', 'locations', 'environments', 'buildings', 'props'],
  customCategories: [],
};

export async function fetchResourceLibrary(projectId: number): Promise<ResourceLibraryResponse> {
  const res = await fetch(`/api/resource-library?projectId=${projectId}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || '加载资源库失败');
  }
  const data = await res.json();
  const resources = data?.resources || {};
  return {
    resources: {
      characters: Array.isArray(resources.characters) ? resources.characters : EMPTY_RESOURCES.characters,
      locations: Array.isArray(resources.locations) ? resources.locations : EMPTY_RESOURCES.locations,
      props: Array.isArray(resources.props) ? resources.props : EMPTY_RESOURCES.props,
      environments: Array.isArray(resources.environments) ? resources.environments : EMPTY_RESOURCES.environments,
      buildings: Array.isArray(resources.buildings) ? resources.buildings : EMPTY_RESOURCES.buildings,
      costumes: Array.isArray(resources.costumes) ? resources.costumes : EMPTY_RESOURCES.costumes,
    },
    categories: data?.categories || DEFAULT_CATEGORIES,
  };
}

export async function saveResourceLibraryCategories(
  projectId: number,
  categories: ResourceCategoryConfig,
): Promise<void> {
  const res = await fetch(`/api/resource-library/categories?projectId=${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, categories }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || '保存分类配置失败');
  }
}
