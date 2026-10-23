/**
 * 资源库统一数据模型
 * ──────────────────────────────────────────────────────────────
 * 分类显示配置与资源清单必须来自同一份工程数据（/api/resource-library）。
 * 这里只放跨层共享的纯类型，避免 ResourcePanel 与 services 互相依赖。
 */

/** 可展示的资源类型（与 ResourcePanel 手风琴内容渲染器 key 一致） */
export type ResourceTypeKey =
  | 'characters' | 'locations' | 'props' | 'environments' | 'buildings' | 'costumes';

/** 自定义分类成员引用：`类型:资源ID` */
export type CategoryMemberRef = string;

export interface CustomCategory {
  id: string;
  name: string;
  /** AI 启发式生成的分类带标记，用户手动创建的没有 */
  aiGenerated?: boolean;
  members: CategoryMemberRef[];
}

export interface ResourceCategoryConfig {
  /** 当前展示（开启）的内置类型 */
  enabledTypes: ResourceTypeKey[];
  /** 用户 / AI 自定义分类 */
  customCategories: CustomCategory[];
}

/** 聚合接口返回的原始资源（由前端统一映射为面板类型） */
export interface ResourceLibraryResponse {
  resources: {
    characters: any[];
    locations: any[];
    props: any[];
    environments: any[];
    buildings: any[];
    costumes: any[];
  };
  categories: ResourceCategoryConfig;
}
