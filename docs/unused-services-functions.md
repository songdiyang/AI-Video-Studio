# 未使用的 Services 函数清单

> 生成时间：2026-10-15
> 来源：ts-prune 静态分析

## 说明

以下函数在代码中未被任何地方引用（标记为 "used in module" 的除外，表示仅在模块内部使用）。

这些函数大多是后端 API 的封装，虽然当前前端未使用，但可能是：
1. 为未来功能预留的
2. 后端已实现的 API
3. 其他项目/模块可能使用的

**建议**：保留作为 API 文档参考，或确认后端已移除对应接口后再删除。

---

## services/assets.ts（资产管理）

| 函数 | 行号 | 说明 |
|------|------|------|
| `extractPropsFromScript` | 738 | 从剧本提取道具 |
| `generateConceptBreakdown` | 907 | 生成概念分解 |
| `deleteCharacterViewApi` | 930 | 删除角色视图 |
| `getCharacterViewStatus` | 951 | 获取角色视图状态 |
| `downloadCharacterView` | 993 | 下载角色视图 |
| `downloadAllCharacterViews` | 1014 | 下载所有角色视图 |
| `fetchCharacterStatesByCategory` | 1082 | 按分类获取角色状态 |
| `getActiveCharacterState` | 1283 | 获取激活的角色状态 |
| `fetchCharacterStateHistory` | 1303 | 获取角色状态历史 |
| `uploadReferenceImage` | 1377 | 上传参考图 |
| `batchReorderReferenceImages` | 1453 | 批量重排序参考图 |
| `generatePropImage` | 1478 | 生成道具图片 |
| `getPropGenerationStatus` | 1505 | 获取道具生成状态 |
| `fetchPropStates` | 1551 | 获取道具状态 |
| `createPropState` | 1569 | 创建道具状态 |
| `updatePropState` | 1593 | 更新道具状态 |
| `deletePropState` | 1618 | 删除道具状态 |
| `getSceneSketch` | 1692 | 获取场景草图 |
| `checkUploadStatus` | 1840 | 检查上传状态 |
| `fetchCharacterLoadout` | 1890 | 获取角色装备 |
| `updateCharacterLoadout` | 1903 | 更新角色装备 |
| `fetchCharacterComposite` | 1921 | 获取角色合成 |
| `fetchCharacterBindings` | 1955 | 获取角色绑定 |
| `addCharacterBinding` | 1968 | 添加角色绑定 |
| `removeCharacterBinding` | 1983 | 移除角色绑定 |
| `fetchSceneBindings` | 1999 | 获取场景绑定 |
| `addSceneBinding` | 2012 | 添加场景绑定 |
| `removeSceneBinding` | 2027 | 移除场景绑定 |

## services/auth.ts（认证）

| 函数 | 行号 | 说明 |
|------|------|------|
| `isOpsUser` | 183 | 检查是否为运营用户 |
| `getLoginRequirements` | 271 | 获取登录要求 |

## services/billing.ts（计费）

| 函数 | 行号 | 说明 |
|------|------|------|
| `fetchBillingSummary` | 55 | 获取计费摘要 |
| `fetchBillingHistory` | 70 | 获取计费历史 |
| `fetchBalance` | 85 | 获取余额 |
| `fetchResourcePacks` | 100 | 获取资源包 |

## services/collaboration.ts（协作）

| 函数 | 行号 | 说明 |
|------|------|------|
| `revokeInvite` | 328 | 撤销邀请 |
| `canEdit` | 414 | 检查是否可编辑 |

## services/community.ts（社区）

| 函数 | 行号 | 说明 |
|------|------|------|
| `fetchShowcase` | 157 | 获取单个展示 |
| `createShowcase` | 173 | 创建展示 |
| `updateShowcase` | 192 | 更新展示 |
| `deleteShowcase` | 211 | 删除展示 |
| `updateCreatorProfile` | 306 | 更新创作者资料 |

## services/costumes.ts（服装）

| 函数 | 行号 | 说明 |
|------|------|------|
| `createCostume` | 135 | 创建服装 |
| `equipCostume` | 225 | 装备服装 |
| `unequipCostume` | 249 | 卸下服装 |
| `removeCharacterCostume` | 270 | 移除角色服装 |
| `fetchEquippedCostume` | 291 | 获取已装备服装 |

## services/environments.ts（环境）

| 函数 | 行号 | 说明 |
|------|------|------|
| `sanitizeEnvironmentDescription` | 156 | 清洗环境描述 |
| `recognizeAllEnvironmentTerrains` | 205 | 识别所有环境地形 |
| `fetchTerrainTypes` | 215 | 获取地形类型 |

## services/environmentVariants.ts（环境变体）

| 函数 | 行号 | 说明 |
|------|------|------|
| `listEnvironmentVariants` | 43 | 列出环境变体 |
| `updateEnvironmentVariant` | 67 | 更新环境变体 |

## services/extensions.ts（扩展）

| 函数 | 行号 | 说明 |
|------|------|------|
| `getExtensionVersions` | 84 | 获取扩展版本 |
| `updateExtensionSettings` | 134 | 更新扩展设置 |
| `publishExtension` | 155 | 发布扩展 |

## services/localApi.ts（本地 API）

| 函数 | 行号 | 说明 |
|------|------|------|
| `getAIModelKey` | 110 | 获取 AI 模型密钥 |
| `getDefaultAIModel` | 156 | 获取默认 AI 模型 |
| `registerProject` | 456 | 注册项目 |
| `selectFile` | 527 | 选择文件 |
| `selectFiles` | 541 | 选择多个文件 |
| `showInExplorer` | 568 | 在资源管理器中显示 |
| `importMediaFile` | 578 | 导入媒体文件 |
| `getAppDataDir` | 588 | 获取应用数据目录 |
| `getProjectDir` | 596 | 获取项目目录 |

## services/localStore.ts（本地存储）

| 函数 | 行号 | 说明 |
|------|------|------|
| `flushDoc` | 116 | 刷新文档 |
| `invalidate` | 127 | 使失效 |
| `clearPathCache` | 164 | 清除路径缓存 |
| `getActiveProjectId` | 189 | 获取活动项目 ID |

## services/marketplace.ts（市场）

| 函数 | 行号 | 说明 |
|------|------|------|
| `fetchMarketplaceTemplates` | 184 | 获取市场模板 |
| `fetchTemplateDetail` | 205 | 获取模板详情 |
| `createMarketplaceTemplate` | 217 | 创建市场模板 |
| `analyzeRecipeText` | 238 | 分析配方文本 |
| `updateMarketplaceTemplate` | 250 | 更新市场模板 |
| `deleteMarketplaceTemplate` | 269 | 删除市场模板 |
| `purchaseTemplate` | 276 | 购买模板 |
| `listTemplate` | 284 | 上架模板 |
| `delistTemplate` | 291 | 下架模板 |
| `toggleTemplateLike` | 302 | 切换模板点赞 |
| `fetchTemplateComments` | 309 | 获取模板评论 |
| `createTemplateComment` | 326 | 创建模板评论 |
| `deleteTemplateComment` | 337 | 删除模板评论 |
| `toggleFollow` | 344 | 切换关注 |
| `fetchFollowers` | 351 | 获取粉丝 |
| `fetchFollowing` | 356 | 获取关注 |
| `fetchMyTemplates` | 365 | 获取我的模板 |
| `fetchMyPurchases` | 383 | 获取我的购买 |
| `fetchEarnings` | 400 | 获取收益 |
| `fetchShop` | 409 | 获取商店 |

## services/mediaCache.ts（媒体缓存）

| 函数 | 行号 | 说明 |
|------|------|------|
| `getCachedUrl` | 79 | 获取缓存 URL |
| `loadWithCache` | 100 | 带缓存加载 |
| `getCacheStats` | 138 | 获取缓存统计 |
| `clearMediaCache` | 165 | 清除媒体缓存 |
| `formatCacheSize` | 183 | 格式化缓存大小 |

## services/modelStats.ts（模型统计）

| 函数 | 行号 | 说明 |
|------|------|------|
| `getModelComparison` | 132 | 获取模型对比 |

## services/sceneElements.ts（场景元素）

| 函数 | 行号 | 说明 |
|------|------|------|
| `getSceneElement` | 86 | 获取场景元素 |
| `createSceneElement` | 94 | 创建场景元素 |
| `updateSceneElement` | 110 | 更新场景元素 |
| `deleteSceneElement` | 130 | 删除场景元素 |
| `addSceneElementLink` | 165 | 添加场景元素链接 |
| `updateSceneElementLink` | 178 | 更新场景元素链接 |

## services/sketchProjects.ts（草图项目）

| 函数 | 行号 | 说明 |
|------|------|------|
| `getSketchProjects` | 36 | 获取草图项目列表 |
| `getSketchProject` | 68 | 获取草图项目 |
| `createSketchProject` | 86 | 创建草图项目 |
| `updateSketchProject` | 111 | 更新草图项目 |
| `deleteSketchProject` | 138 | 删除草图项目 |
| `uploadSketchThumbnail` | 155 | 上传草图缩略图 |
| `exportSketchImage` | 181 | 导出草图图片 |

## services/storyboards.ts（分镜）

| 函数 | 行号 | 说明 |
|------|------|------|
| `fetchStoryboardTemplates` | 55 | 获取分镜模板 |
| `fetchStoryboards` | 70 | 获取分镜 |
| `fetchStandaloneStoryboards` | 89 | 获取独立分镜 |
| `saveStoryboards` | 104 | 保存分镜 |
| `uploadSketch` | 183 | 上传草图 |
| `deleteSketch` | 212 | 删除草图 |
| `updateSketchSettings` | 231 | 更新草图设置 |
| `saveSketchData` | 255 | 保存草图数据 |
| `exportSketchToImage` | 374 | 导出草图为图片 |
| `generateFromSketch` | 406 | 从草图生成 |
| `batchLockStoryboards` | 496 | 批量锁定分镜 |
| `batchUnlockStoryboards` | 518 | 批量解锁分镜 |
| `getSketchHistory` | 545 | 获取草图历史 |
| `getSketchHistoryVersion` | 575 | 获取草图历史版本 |
| `restoreSketchVersion` | 598 | 恢复草图版本 |

## services/studioStates.ts（工作室状态）

| 函数 | 行号 | 说明 |
|------|------|------|
| `listStudioStates` | 40 | 列出工作室状态 |
| `getStudioState` | 49 | 获取工作室状态 |
| `createStudioState` | 55 | 创建工作室状态 |
| `updateStudioState` | 75 | 更新工作室状态 |
| `deleteStudioState` | 94 | 删除工作室状态 |

## services/subscriptions.ts（订阅）

| 函数 | 行号 | 说明 |
|------|------|------|
| `fetchPlans` | 80 | 获取计划 |
| `fetchCurrentSubscription` | 93 | 获取当前订阅 |
| `subscribe` | 110 | 订阅 |
| `cancelSubscription` | 128 | 取消订阅 |
| `fetchUsage` | 140 | 获取使用量 |
| `adminFetchPlans` | 155 | 管理员获取计划 |
| `adminCreatePlan` | 169 | 管理员创建计划 |
| `adminUpdatePlan` | 193 | 管理员更新计划 |
| `adminDeletePlan` | 211 | 管理员删除计划 |
| `adminGetPlanLockStatus` | 228 | 管理员获取计划锁定状态 |
| `adminUnlockPlans` | 242 | 管理员解锁计划 |
| `adminLockPlans` | 265 | 管理员锁定计划 |
| `adminFetchSubscriptions` | 279 | 管理员获取订阅 |
| `adminUpdateSubscription` | 303 | 管理员更新订阅 |
| `adminCreateSubscription` | 328 | 管理员创建订阅 |

## services/templates.ts（模板）

| 函数 | 行号 | 说明 |
|------|------|------|
| `fetchTemplate` | 108 | 获取模板 |
| `createTemplate` | 136 | 创建模板 |
| `updateTemplate` | 172 | 更新模板 |
| `deleteTemplate` | 191 | 删除模板 |

---

## 统计

| 模块 | 未使用函数数 |
|------|-------------|
| assets | 28 |
| marketplace | 20 |
| subscriptions | 15 |
| storyboards | 15 |
| sketchProjects | 7 |
| studioStates | 5 |
| templates | 4 |
| billing | 4 |
| community | 5 |
| costumes | 5 |
| sceneElements | 6 |
| localApi | 9 |
| localStore | 4 |
| mediaCache | 5 |
| environments | 3 |
| environmentVariants | 2 |
| extensions | 3 |
| auth | 2 |
| collaboration | 2 |
| modelStats | 1 |
| **总计** | **~150** |

---

## 建议

1. **保留**：如果后端 API 仍存在，建议保留这些函数作为客户端 SDK
2. **删除**：如果确认后端已移除对应接口，可以安全删除
3. **文档**：可以将这些函数作为 API 文档参考
