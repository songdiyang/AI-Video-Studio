# AI-Video-Studio 项目结构

> 更新时间：2026-10-15
> 版本：0.5.1

---

## 根目录

```
AI-Video-Studio/
├── 📁 .github/              # GitHub Actions 工作流
├── 📁 .qoder/               # Qoder IDE 配置
├── 📁 backend/              # 后端服务 (Node.js + Express)
├── 📁 components/           # 共享 UI 组件
├── 📁 contexts/             # React Context
├── 📁 dist/                 # 构建输出
├── 📁 docker/               # Docker 配置
├── 📁 docs/                 # 文档
├── 📁 extensions/           # 扩展插件
├── 📁 features/             # 功能模块
├── 📁 hooks/                # 自定义 Hooks
├── 📁 hot_update/           # 热更新服务
├── 📁 locales/              # 国际化
├── 📁 microservices/        # 微服务
├── 📁 node_modules/         # 依赖
├── 📁 notifications/        # 通知系统
├── 📁 public/               # 静态资源
├── 📁 runtime/              # 运行时数据
├── 📁 scripts/              # 构建脚本
├── 📁 services/             # API 服务层
├── 📁 src-tauri/            # Tauri 桌面端 (Rust)
├── 📁 types/                # TypeScript 类型
├── 📁 utils/                # 工具函数
├── 📁 views/                # 页面视图
│
├── 📄 App.tsx               # 应用入口
├── 📄 index.tsx             # React 渲染入口
├── 📄 index.html            # HTML 模板
├── 📄 index.css             # 全局样式
├── 📄 package.json          # 前端依赖
├── 📄 vite.config.ts        # Vite 配置
├── 📄 tsconfig.json         # TypeScript 配置
├── 📄 tailwind.config.js    # Tailwind 配置
├── 📄 postcss.config.js     # PostCSS 配置
├── 📄 docker-compose.yml    # Docker Compose
├── 📄 ecosystem.config.cjs  # PM2 配置
└── 📄 README.md             # 项目说明
```

---

## 前端核心目录

### components/ - 共享 UI 组件

```
components/
├── 📁 ActivityBar/          # 左侧活动栏
├── 📁 AIAssistantPanel/     # AI 助手面板
├── 📁 AssetEditor/          # 资产编辑器
├── 📁 AssetSceneRelations/  # 资产场景关系
├── 📁 BottomPanel/          # 底部面板
├── 📁 CommandPalette/       # 命令面板
├── 📁 ContentEditorPanel/   # 内容编辑面板
├── 📁 DirectorSpace/        # 导演空间
├── 📁 DynamicWorkbench/     # 动态工作台
├── 📁 NodeCanvas/           # 节点画布
├── 📁 Onboarding/           # 新手引导
├── 📁 PreviewEditor/        # 预览编辑器
├── 📁 QuickStartWizard/     # 快速启动向导
├── 📁 ScriptGenerateTab/    # 剧本生成标签
├── 📁 ScriptWorkshop/       # 剧本工坊
├── 📁 SidePanels/           # 侧边面板
├── 📁 TabBar/               # 标签栏
├── 📁 TabContent/           # 标签内容
├── 📁 TaskQueueBubble/      # 任务队列气泡
├── 📁 ui/                   # UI 主题组件
│   └── 📁 GenshinUI/        # 原神风格 UI
├── 📁 ViewTabBar/           # 视图标签栏
├── 📁 WorkflowDashboard/    # 工作流仪表盘
│
├── 📄 AIAssistantDrawer.tsx # AI 助手抽屉
├── 📄 AIModelConfigModal.tsx
├── 📄 AIModelSelector.tsx
├── 📄 AdminRoute.tsx
├── 📄 AuthModal.tsx
├── 📄 ErrorBoundary.tsx
├── 📄 FaceSphereViewer.tsx
├── 📄 ImageCropperModal.tsx
├── 📄 InternalMailbox.tsx
├── 📄 KeyboardShortcutsHelp.tsx
├── 📄 Layout.tsx            # 主布局
├── 📄 LazyImage.tsx
├── 📄 MarkdownRenderer.tsx
├── 📄 NetworkStatusBar.tsx
├── 📄 PanelGroup.tsx        # 可调整面板组
├── 📄 PreviewProvider.tsx
├── 📄 ProjectCollaborators.tsx
├── 📄 ProjectSelector.tsx
├── 📄 ProtectedRoute.tsx
├── 📄 ResizablePanel.tsx    # 可调整面板
├── 📄 ScriptPreviewRenderer.tsx
├── 📄 Skeleton.tsx          # 骨架屏
├── 📄 TaskAssignmentModal.tsx
├── 📄 TeamMembersPanel.tsx
├── 📄 TitleBar.tsx          # 自定义标题栏
└── 📄 UpgradePrompt.tsx
```

### views/ - 页面视图

```
views/
├── 📁 admin/                # 管理后台
│   ├── 📁 AIModels/         # AI 模型配置
│   ├── 📄 AdminLayout.tsx
│   ├── 📄 AdminLog.tsx
│   ├── 📄 Dashboard.tsx
│   ├── 📄 ErrorMonitor.tsx
│   ├── 📄 ModelStatsDashboard.tsx
│   └── ...
├── 📁 AssetsManager/        # 资产管理器
│   ├── 📁 AssetModel/       # 资产模型
│   ├── 📄 index.tsx
│   └── ...
├── 📁 ComicDramaWorkbench/  # 短剧工作台
├── 📁 Community/            # 社区
├── 📁 Extensions/           # 扩展
├── 📁 Landing/              # 落地页
├── 📁 MangaWorkbench/       # 漫画工作台
├── 📁 NovelWorkbench/       # 小说工作台
├── 📁 ScriptStudio/         # 剧本工作室
├── 📁 Settings/             # 设置
├── 📁 ShortVideoWorkbench/  # 短视频工作台
├── 📁 SimpleStoryBoard/     # 简化分镜板
├── 📁 StoryBoard/           # 分镜板（完整版）
│   ├── 📁 AnimaticPreview/
│   ├── 📁 BlockEditor/
│   ├── 📁 CameraControl/
│   ├── 📁 components/
│   ├── 📁 core/
│   ├── 📁 hooks/
│   ├── 📁 MagicSpace/
│   ├── 📁 plugins/
│   ├── 📁 ResourcePanel/
│   └── 📄 index.tsx
├── 📁 StoryBoardPage/       # 分镜页面
├── 📁 Teams/                # 团队
├── 📁 TemplateGallery/      # 模板库
├── 📁 VideoComposition/     # 视频合成
│
├── 📄 AcceptInvite.tsx
├── 📄 Auth.tsx
├── 📄 Projects.tsx
└── 📄 UserCenter.tsx
```

### services/ - API 服务层

```
services/
├── 📄 admin.ts              # 管理后台
├── 📄 aiAssistant.ts        # AI 助手
├── 📄 assets.ts             # 资产管理
├── 📄 auth.ts               # 认证
├── 📄 buildings.ts          # 建筑
├── 📄 collaboration.ts      # 协作
├── 📄 community.ts          # 社区
├── 📄 costumes.ts           # 服装
├── 📄 environments.ts       # 环境
├── 📄 environmentVariants.ts # 环境变体
├── 📄 extensions.ts         # 扩展
├── 📄 localAI.ts            # 本地 AI
├── 📄 localAiAssistant.ts   # 本地 AI 助手
├── 📄 localAiAssistantChat.ts
├── 📄 localAiChatPayload.ts
├── 📄 localApi.ts           # 本地 API（核心）
├── 📄 localApiRouter.ts     # 本地 API 路由
├── 📄 localCloudFallback.ts
├── 📄 localMedia.ts         # 本地媒体
├── 📄 localStore.ts         # 本地存储
├── 📄 localWorkflow.ts      # 本地工作流
├── 📄 localWorkflowRouter.ts
├── 📄 mediaCache.ts         # 媒体缓存
├── 📄 modelStats.ts         # 模型统计
├── 📄 projects.ts           # 项目
├── 📄 sceneElements.ts      # 场景元素
├── 📄 scripts.ts            # 剧本
├── 📄 storyboards.ts        # 分镜
├── 📄 studios.ts            # 工作室
└── 📄 templates.ts          # 模板
```

### contexts/ - React Context

```
contexts/
├── 📄 AIAssistantContext.tsx    # AI 助手上下文
├── 📄 ConfirmContext.tsx        # 确认对话框
├── 📄 ExtensionContext.tsx      # 扩展上下文
├── 📄 LanguageContext.tsx       # 语言上下文
├── 📄 StoryboardBridgeContext.tsx # 分镜桥接
├── 📄 ThemeContext.tsx          # 主题上下文
├── 📄 ToastContext.tsx          # 通知上下文
└── 📄 WorkbenchContext.tsx      # 工作台上下文
```

### hooks/ - 自定义 Hooks

```
hooks/
├── 📄 useAIAssistantSessions.ts
├── 📄 useAIModels.ts
├── 📄 useCommandPalette.ts
├── 📄 useDashboardStats.ts
├── 📄 useKeyboardShortcuts.ts
├── 📄 useNetworkStatus.ts
├── 📄 useOnboarding.ts
├── 📄 useResizableSidebar.ts
├── 📄 useRoutePreload.ts
├── 📄 useTaskRunner.ts
├── 📄 useVirtualList.ts
├── 📄 useWebSocket.ts
└── 📄 useWorkflow.ts
```

### utils/ - 工具函数

```
utils/
├── 📄 aomFormat.ts          # AOM 格式
├── 📄 errorHandler.ts       # 错误处理（新增）
├── 📄 extensionInstaller.ts # 扩展安装
├── 📄 extensionStorage.ts   # 扩展存储
├── 📄 modelCapabilities.ts  # 模型能力
├── 📄 platform.ts           # 平台适配（新增）
├── 📄 runtimeMode.ts        # 运行时模式
└── 📄 storage.ts            # 存储工具（新增）
```

---

## 桌面端目录

### src-tauri/ - Tauri 桌面应用

```
src-tauri/
├── 📁 capabilities/         # 权限配置
├── 📁 gen/                  # 生成的代码
├── 📁 icons/                # 应用图标
├── 📁 src/                  # Rust 源码
│   ├── 📄 commands.rs       # Tauri 命令
│   ├── 📄 lib.rs            # 库入口
│   ├── 📄 main.rs           # 主入口
│   └── 📄 storage.rs        # 存储管理
├── 📁 target/               # 构建输出
├── 📄 Cargo.toml            # Rust 依赖
└── 📄 tauri.conf.json       # Tauri 配置
```

---

## 后端目录

### backend/ - Node.js 后端

```
backend/
├── 📁 migrations/           # 数据库迁移
├── 📁 node_modules/         # 依赖
├── 📁 scripts/              # 脚本
├── 📁 src/                  # 源码
│   ├── 📁 adapters/         # 模型适配器
│   ├── 📁 billingHandlers/  # 计费处理器
│   ├── 📁 customHandlers/   # 自定义 AI 处理器
│   ├── 📁 middleware/       # Express 中间件
│   ├── 📁 modules/          # 功能模块
│   ├── 📁 nosyntask/        # 异步任务引擎
│   ├── 📁 resourceLinks/    # 资源链接
│   ├── 📁 scripts/          # 脚本
│   ├── 📁 services/         # 服务
│   ├── 📁 storage/          # 存储抽象层
│   ├── 📁 types/            # 类型
│   ├── 📁 utils/            # 工具
│   │
│   ├── 📄 index.js          # 服务器入口
│   ├── 📄 auth.js           # 认证
│   ├── 📄 billing.js        # 计费
│   ├── 📄 users.js          # 用户
│   ├── 📄 projects.js       # 项目
│   ├── 📄 collaboration.js  # 协作
│   ├── 📄 marketplace.js    # 市场
│   ├── 📄 websocket.js      # WebSocket
│   └── ...
├── 📁 uploads/              # 上传文件
├── 📄 .env                  # 环境变量
├── 📄 .env.example          # 环境变量示例
├── 📄 initial_database.sql  # 数据库初始化
└── 📄 package.json          # 后端依赖
```

---

## 其他目录

### docs/ - 文档

```
docs/
├── 📄 code-optimization-report.md      # 代码优化报告
├── 📄 unused-services-functions.md     # 未使用函数清单
├── 📄 docker-deployment.md             # Docker 部署
├── 📄 pipeline-flowchart.md            # 流程图
├── 📄 会员积分策略方案.md
├── 📄 运营成本指导.md
└── ...
```

### public/ - 静态资源

```
public/
├── 📁 extensions/           # 扩展资源
├── 📁 models/               # 3D 模型
├── 📁 providers/            # 提供商图标
├── 📁 styles/               # 公共样式
├── 📄 favicon.ico
└── 📄 icon.png
```

### locales/ - 国际化

```
locales/
├── 📄 en-US.ts              # 英文
└── 📄 zh-CN.ts              # 中文
```

### features/ - 功能模块

```
features/
└── 📁 NodeMode/             # 节点模式
    ├── 📁 components/
    ├── 📁 hooks/
    ├── 📁 types/
    └── 📁 utils/
```

### extensions/ - 扩展插件

```
extensions/
└── 📁 japanese-language-pack/  # 日语语言包
```

---

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      用户界面层                              │
│  ┌─────────────┐  ┌─────────────┐                          │
│  │   浏览器     │  │  桌面应用    │                          │
│  │  (Vite Dev) │  │  (Tauri)    │                          │
│  └──────┬──────┘  └──────┬──────┘                          │
│         │                │                                  │
│         └────────────────┘                                  │
│              共享 React 代码                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  components/  views/  contexts/  hooks/  services/  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      服务层                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              services/localApi.ts                    │   │
│  │  ┌─────────────┐          ┌─────────────────────┐   │   │
│  │  │  浏览器模式  │          │     桌面模式         │   │   │
│  │  │ localStorage│          │  Tauri Rust 命令     │   │   │
│  │  └─────────────┘          └─────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│  ┌───────────────────────┼───────────────────────────────┐ │
│  │                       │                               │ │
│  ▼                       ▼                               ▼ │
│ ┌─────────┐      ┌─────────────┐               ┌─────────┐│
│ │ 后端API │      │ Tauri Rust  │               │ 本地存储 ││
│ │(Node.js)│      │  (SQLite)   │               │(localStorage)│
│ └─────────┘      └─────────────┘               └─────────┘│
└───────────────────────────────────────────────────────────┘
```

---

## 统计

| 类别 | 数量 |
|------|------|
| 根目录文件 | 21 |
| 根目录文件夹 | 24 |
| components/ | 22 个子目录 + 25 个文件 |
| views/ | 17 个子目录 + 4 个文件 |
| services/ | 30 个文件 |
| contexts/ | 8 个文件 |
| hooks/ | 13 个文件 |
| utils/ | 8 个文件 |
| src-tauri/src/ | 4 个文件 |
| backend/src/ | 44 个文件 |
