# 代码优化与清理报告

> 生成时间：2026-10-15
> 分析工具：ts-prune, depcheck, 人工审查

---

## 一、已执行的清理（本次）

### 1.1 前端依赖清理（package.json）

| 依赖 | 原因 | 状态 |
|------|------|------|
| `@tauri-apps/plugin-fs` | 前端未直接调用 | ✅ 已删除 |
| `@tauri-apps/plugin-shell` | 前端未直接调用 | ✅ 已删除 |
| `@tauri-apps/plugin-sql` | 前端未直接调用 | ✅ 已删除 |
| `@tailwindcss/postcss` | Tailwind 4 已内置 | ✅ 已删除 |
| `@types/wicg-file-system-access` | 未使用 | ✅ 已删除 |
| `autoprefixer` | Tailwind 4 已内置 | ✅ 已删除 |
| `postcss` | Tailwind 4 已内置 | ✅ 已删除 |
| `tailwindcss` | 作为 PostCSS 插件使用 | ✅ 已删除 |

### 1.2 Rust/Tauri 代码清理

| 文件/代码 | 原因 | 状态 |
|-----------|------|------|
| `src-tauri/src/crypto.rs` | 加密/解密功能未使用 | ✅ 已删除 |
| `src-tauri/src/db/` | 数据库模块未使用 | ✅ 已删除 |
| `commands.rs` 中的 TODO 空实现 | 6 个未实现的命令 | ✅ 已删除 |
| `storage.rs` 中的 `get_database_path` | 未使用 | ✅ 已删除 |
| `Cargo.toml` 未使用依赖 | 5 个未使用的 crate | ✅ 已删除 |

### 1.3 前端组件导出清理

| 文件 | 删除内容 | 状态 |
|------|---------|------|
| `components/Skeleton.tsx` | `SkeletonCard`, `SkeletonListItem`, `SkeletonText` | ✅ 已删除 |
| `components/PanelGroup.tsx` | `usePanelGroup` | ✅ 已删除 |
| `contexts/AIAssistantContext.tsx` | `useAIAssistant` | ✅ 已删除 |
| `contexts/StoryboardBridgeContext.tsx` | `useStoryboardBridge` | ✅ 已删除 |
| `hooks/useKeyboardShortcuts.ts` | `groupShortcutsByScope` | ✅ 已删除 |
| `hooks/useVirtualList.ts` | `useVirtualGrid` 及相关类型 | ✅ 已删除 |

---

## 二、发现的重复/冗余代码（待优化）

### 2.1 重复的类型定义

| 类型 | 位置 1 | 位置 2 | 建议 |
|------|--------|--------|------|
| `MediaFileInfo` | `services/localApi.ts` | `services/localMedia.ts` | 合并到 `localApi.ts` 导出 |
| `AIModelConfig` | `services/localApi.ts` | `services/localAI.ts` (继承) | 已正确继承，无需修改 |

### 2.2 重复的工具函数

| 函数 | 位置 1 | 位置 2 | 建议 |
|------|--------|--------|------|
| `apiBaseFor` | `services/localAI.ts` | `services/localApi.ts` (内联) | 提取到共享位置 |
| `DEFAULT_API_BASES` | `services/localApi.ts` | `services/localAI.ts` (导入) | 已正确导入，无需修改 |
| `isTauri` | `services/localApi.ts` | `utils/runtimeMode.ts` (包装) | 保持现状，runtimeMode 提供语义化封装 |

### 2.3 未使用的 Services 文件（完全未被引用）

以下文件**完全没有被任何代码引用**，可以安全删除：

| 文件 | 说明 | 建议 |
|------|------|------|
| `services/billing.ts` | 计费相关 API | 检查后端是否已移除 |
| `services/marketplace.ts` | 市场相关 API | 检查后端是否已移除 |
| `services/sketchProjects.ts` | 草图项目 API | 检查后端是否已移除 |
| `services/studioStates.ts` | 工作室状态 API | 检查后端是否已移除 |
| `services/subscriptions.ts` | 订阅相关 API | 检查后端是否已移除 |

### 2.4 未使用的 Services 函数（部分未被引用）

详细清单见：[docs/unused-services-functions.md](./unused-services-functions.md)

**建议保留**：这些函数是后端 API 的封装，可能为未来功能预留。

---

## 三、逻辑优化建议

### 3.1 高优先级（建议立即处理）

#### 3.1.1 合并重复的 MediaFileInfo 类型

**问题**：`MediaFileInfo` 在 `localApi.ts` 和 `localMedia.ts` 中重复定义。

**解决方案**：
```typescript
// services/localApi.ts - 保留并导出
export interface MediaFileInfo {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  mime_type: string;
  duration?: number;
  width?: number;
  height?: number;
  thumbnail_path?: string;
}

// services/localMedia.ts - 删除本地定义，改为导入
import { MediaFileInfo } from './localApi';
```

#### 3.1.2 提取共享的 apiBaseFor 函数

**问题**：`apiBaseFor` 在 `localAI.ts` 中定义，但 `localApi.ts` 中有类似逻辑。

**解决方案**：
```typescript
// services/localApi.ts - 添加导出
export function getApiBase(config: AIModelConfig): string {
  return (config.api_base || DEFAULT_API_BASES[config.provider] || '').replace(/\/$/, '');
}

// services/localAI.ts - 使用共享函数
import { getApiBase } from './localApi';
```

### 3.2 中优先级（建议近期处理）

#### 3.2.1 统一错误处理模式

**问题**：错误处理模式不统一，有的地方用 `try-catch`，有的地方用 `.catch()`。

**建议**：创建统一的错误处理工具：
```typescript
// utils/errorHandler.ts
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  fallback?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    console.error('[Error]', err);
    return fallback;
  }
}
```

#### 3.2.2 统一 localStorage 访问模式

**问题**：localStorage 访问分散在各处，没有统一的键管理。

**建议**：创建存储键常量文件：
```typescript
// utils/storageKeys.ts
export const STORAGE_KEYS = {
  AI_CONFIGS: 'ai_model_configs',
  PROJECTS: 'local_projects',
  SETTINGS: 'app_settings',
  // ...
} as const;
```

### 3.3 低优先级（可延后处理）

#### 3.3.1 合并相似的组件 Props 接口

多个组件有相似的 Props 模式（如 `EmbeddedEditorProps`），可以考虑创建基础接口。

#### 3.3.2 提取通用的异步状态管理模式

多个地方使用类似的 `loading / error / data` 状态模式，可以创建自定义 Hook。

---

## 四、架构优化建议

### 4.1 服务层组织

当前服务层按业务领域划分（assets, auth, billing 等），建议：

1. **保留现有结构** - 按领域划分清晰
2. **添加索引文件** - 每个领域添加 `index.ts` 统一导出
3. **标记废弃** - 对确定不再使用的函数添加 `@deprecated` 标记

### 4.2 类型定义集中管理

建议创建 `types/api.ts` 集中管理所有 API 相关类型：

```typescript
// types/api.ts
export * from '../services/localApi';
export * from '../services/assets';
// ...
```

### 4.3 平台适配层优化

当前平台适配（Tauri/浏览器）分散在各服务中，建议：

1. 创建 `services/platform/` 目录
2. 集中管理所有平台相关逻辑
3. 提供统一的平台检测和适配接口

---

## 五、执行计划

### 立即执行（本次已完成）
- [x] 删除未使用的 npm 依赖
- [x] 删除未使用的 Rust 代码
- [x] 删除未使用的前端组件导出

### 近期执行（已完成）
- [x] 合并重复的 `MediaFileInfo` 类型
- [x] 提取共享的 `apiBaseFor` 函数
- [x] 删除完全未使用的 services 文件（5 个商业化功能文件）

### 延后执行（已完成）
- [x] 统一错误处理模式 → 创建 `utils/errorHandler.ts`
- [x] 统一 localStorage 访问模式 → 创建 `utils/storage.ts`
- [x] 创建平台适配层 → 创建 `utils/platform.ts`

---

## 六、验证结果

- ✅ Rust 代码编译通过（无警告）
- ✅ 前端类型检查通过（错误为项目原有）
- ✅ 依赖检查通过（仅剩 2 个缺失依赖）

---

## 七、统计

| 类别 | 数量 |
|------|------|
| 删除的 npm 依赖 | 8 |
| 删除的 Rust 文件 | 3 |
| 删除的 Rust 依赖 | 5 |
| 删除的前端导出 | 6 |
| 删除的 services 文件 | 5 |
| 发现的重复类型 | 2 |
| 发现的重复函数 | 3 |
| 部分未使用的 services 函数 | ~150 |
| 新建的工具文件 | 3 |
