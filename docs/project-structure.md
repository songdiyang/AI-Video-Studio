# AI-Video-Studio 项目结构

> 更新时间：2026-10-15
> 版本：0.5.1
> 架构：前后端分离（frontend/ + backend/）

---

## 根目录

```
AI-Video-Studio/
├── 📁 .github/              # GitHub Actions 工作流
├── 📁 .qoder/               # Qoder IDE 配置
├── 📁 backend/              # 后端服务 (Node.js + Express)
├── 📁 docker/               # Docker 配置
├── 📁 docs/                 # 文档
├── 📁 extensions/           # 扩展插件
├── 📁 frontend/             # 前端 + 桌面端（React + Tauri）
├── 📁 microservices/        # 微服务
├── 📁 scripts/              # 构建脚本
│
├── 📄 docker-compose.yml    # Docker Compose
├── 📄 docker-compose.env.example
├── 📄 ecosystem.config.cjs  # PM2 配置
└── 📄 README.md             # 项目说明
```

---

## frontend/ - 前端 + 桌面端

```
frontend/
├── 📁 components/           # 共享 UI 组件
│   ├── 📁 ActivityBar/      # VSCode 式活动栏/侧栏/底部面板/应用菜单
│   ├── 📁 AIAssistantPanel/ # AI 助手面板
│   ├── 📁 SidePanels/       # 侧边面板（工程/团队/工作台）
│   ├── 📁 TaskQueueBubble/  # 任务队列
│   ├── 📄 Layout.tsx        # 主布局（VSCode 五区骨架）
│   ├── 📄 TitleBar.tsx      # 自定义窗口标题栏
│   └── ...
├── 📁 contexts/             # React Context
│   ├── 📄 WorkbenchContext.tsx        # 工作台 + 布局面板状态
│   ├── 📄 StoryboardBridgeContext.tsx # 分镜面板 Portal 桥接
│   ├── 📄 AIAssistantContext.tsx      # AI 助手
│   └── ...
├── 📁 features/             # 功能模块（NodeMode）
├── 📁 hooks/                # 自定义 Hooks
├── 📁 locales/              # 国际化（zh-CN / en-US）
├── 📁 notifications/        # 通知系统
├── 📁 public/               # 静态资源
├── 📁 services/             # API 服务层
│   ├── 📄 localApi.ts       # 本地 API（桌面/浏览器分流）
│   ├── 📄 localApiRouter.ts # 本地 API 路由
│   ├── 📄 localStore.ts     # 本地存储
│   └── ...
├── 📁 src-tauri/            # Tauri 桌面端 (Rust)
│   ├── 📁 capabilities/     # 权限配置
│   ├── 📁 src/              # Rust 源码（commands/lib/main/storage）
│   ├── 📄 Cargo.toml
│   └── 📄 tauri.conf.json
├── 📁 types/                # TypeScript 类型
├── 📁 utils/                # 工具函数
├── 📁 views/                # 页面视图
│   ├── 📁 StoryBoard/       # 分镜板（核心）
│   ├── 📁 ScriptStudio/     # 剧本工作室
│   ├── 📁 Settings/         # 设置
│   ├── 📁 Teams/            # 团队
│   └── ...
│
├── 📄 App.tsx               # 应用入口
├── 📄 index.tsx             # React 渲染入口
├── 📄 package.json          # 前端依赖
├── 📄 vite.config.ts        # Vite 配置
└── 📄 tsconfig.json         # TypeScript 配置
```

---

## backend/ - 后端服务

```
backend/
├── 📁 migrations/           # 数据库迁移
├── 📁 scripts/              # 脚本
├── 📁 src/                  # 源码
│   ├── 📁 adapters/         # 模型适配器
│   ├── 📁 middleware/       # Express 中间件
│   ├── 📁 modules/          # 功能模块
│   ├── 📁 services/         # 服务
│   ├── 📁 storage/          # 存储抽象层
│   ├── 📄 index.js          # 服务器入口
│   └── ...
├── 📁 uploads/              # 上传文件
├── 📄 .env.example          # 环境变量示例
├── 📄 initial_database.sql  # 数据库初始化
└── 📄 package.json          # 后端依赖
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
│              共享 React 代码（frontend/）                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  components/  views/  contexts/  hooks/  services/  │   │
│  │  VSCode 式布局：活动栏 + 侧栏 + 编辑区 + 底部面板      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      服务层（frontend/services/）            │
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
│ │(backend/)│     │  (SQLite)   │               │(localStorage)│
│ └─────────┘      └─────────────┘               └─────────┘│
└───────────────────────────────────────────────────────────┘
```

---

## 布局说明（VSCode 式工作台）

```
┌──────────────────────────────────────────────────────────┐
│ 顶部菜单栏（文件/编辑/查看/转到/帮助 + 面板切换/用户/窗口）│
├────┬─────────┬────────────────────────────┬─────────────┤
│ 活 │  左侧栏  │                            │  AI 助手     │
│ 动 │ (工程/团 │        编辑区(主内容)        │  面板       │
│ 栏 │ 队/扩展/ │                            │ (可拖宽)    │
│    │ 工作台)  │                            │             │
│    ├─────────┴────────────────────────────┤             │
│    │  底部任务面板（可折叠/可拖高）          │             │
├────┴──────────────────────────────────────┴─────────────┤
│ 状态栏（连接状态 / 快捷键 / 任务 / 版本）                  │
└──────────────────────────────────────────────────────────┘
```

- **活动栏**：图标导航，右键可选择性显示/隐藏按钮
- **左侧栏**：工程/团队/扩展/工作台面板，可拖宽、可折叠；分镜/资源/大纲通过 Portal 桥接自 StoryBoard
- **编辑区**：主内容（工作台/分镜/设置等路由页面）
- **右侧 AI 面板**：AI 助手，可拖宽、可折叠
- **底部面板**：任务队列，可拖高、可折叠
- **状态栏**：连接状态、快捷键入口、任务面板开关、版本号
