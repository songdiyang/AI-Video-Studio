<div align="center">

# Animated Memory / 动漫记忆 🎬

[English](#english) | [中文](#中文)

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)

</div>

---

# English

### AI-Powered Video Creation Platform

*Transform your creative ideas into stunning video content with AI*

[Features](#features) · [Quick Start](#quick-start) · [Documentation](#documentation) · [Contributing](#contributing)

## Overview

**Animated Memory** (纳米故事) is an open-source AI video creation platform that integrates multiple cutting-edge AI models (DeepSeek, Vidu, Kling, Seedance, Seedream, Doubao, Qwen, etc.) to provide a complete workflow from script generation, storyboard design, to video composition and export.

The project adopts a front-end and back-end separation architecture with a microservices-ready design. The backend is based on Node.js + Express + MySQL, managed by PM2, with dedicated notification and core services running in Docker. It supports multi-user collaboration, team management, billing & subscription system, extension plugins, RAG knowledge base, and a comprehensive admin dashboard.

## Features

<table>
<tr>
<td width="50%">

### Script Studio
- AI-powered script generation (DeepSeek / Qwen / Doubao / Zhipu)
- Multi-episode management with auto-numbering
- Script outline panel with dual-mode design
- Manual script editing & AI assistant

### Storyboard System
- Visual storyboard design interface
- First/last frame image generation
- AI video clip generation (Kling / Seedance / Vidu)
- One-click auto storyboard extraction
- Simplified storyboard mode
- Director Space with AI generation menus

### Multiple Workbench Modes
- Comic Drama Workbench (短剧工作台)
- Manga Workbench (漫画工作台)
- Novel Workbench (小说工作台)
- Short Video Workbench (短视频工作台)
- Node Mode for visual workflow editing

</td>
<td width="50%">

### Asset Management
- Character, scene, prop, and costume organization
- Character state sheets & three-view references
- Visual gallery with quick preview
- AI-powered prop image generation
- Building & environment variant assets

### Video Composition
- Multi-track timeline editor
- Subtitle system with styling
- BGM audio track support
- FFmpeg-based video export

### Admin Dashboard
- System monitoring & analytics dashboard
- AI model & provider configuration
- User, subscription & billing management
- Announcement & feedback management
- Error monitoring & rate limit management
- RAG knowledge base status
- Service dashboard & admin audit logs
- Site settings & frontend configuration

</td>
</tr>
</table>

### User System

Complete user management and billing system:

- **User Authentication** — JWT-based authentication with bcrypt encryption
- **User Center** — Profile, balance, consumption statistics, billing history
- **Points & Subscription** — Points recharge, subscription tiers, billing configuration
- **Team Collaboration** — Project collaborators, team members, task assignment
- **Internal Mailbox** — In-app messaging system

### Async Task Engine

Built-in asynchronous task engine for handling time-consuming AI generation tasks:

- **Queue Management** — Background processing for image/video generation
- **Real-time Tracking** — WebSocket-based live task progress monitoring
- **Auto Cleanup** — Intelligent task state management with automatic expiration

### Platform Features

- **Community & Marketplace** — Template sharing, community projects
- **Extension System** — Plugin architecture (e.g. Japanese Language Pack)
- **i18n** — Full Chinese (zh-CN) and English (en-US) localization
- **AI Assistant** — Context-aware AI assistant panel
- **Hot Update** — Runtime hot update deployment without downtime
- **RAG Knowledge Base** — VikingDB / Volcengine RAG integration for context retrieval
- **Command Palette** — Keyboard-driven command interface
- **Onboarding Wizard** — Quick start guide for new users

## Tech Stack

### Frontend

| Technology | Version | Description |
|:-----------|:-------:|:------------|
| [React](https://react.dev/) | 19 | UI Framework |
| [Vite](https://vitejs.dev/) | 6 | Build Tool |
| [TypeScript](https://www.typescriptlang.org/) | 5.8 | Type Safety |
| [TailwindCSS](https://tailwindcss.com/) | 4 | Styling |
| [HeroUI](https://www.heroui.com/) | 2.8 | Component Library |
| [Framer Motion](https://www.framer.com/motion/) | 12 | Animations |
| [React Router](https://reactrouter.com/) | 7 | Routing |
| [FFmpeg.wasm](https://ffmpegwasm.netlify.app/) | 0.12 | Video Processing |
| [Three.js](https://threejs.org/) | 0.184 | 3D Rendering |
| [Excalidraw](https://excalidraw.com/) | 0.18 | Whiteboard / Sketching |
| [Socket.IO Client](https://socket.io/) | 4 | Real-time Communication |

### Backend

| Technology | Description |
|:-----------|:------------|
| [Node.js](https://nodejs.org/) | Runtime Environment (v20+) |
| [Express](https://expressjs.com/) | Web Framework |
| [MySQL](https://www.mysql.com/) | Database |
| [JWT](https://jwt.io/) | Authentication |
| [bcryptjs](https://github.com/dcodeIO/bcrypt.js) | Password Encryption |
| [Socket.IO](https://socket.io/) | WebSocket Server |
| [PM2](https://pm2.keymetrics.io/) | Process Manager |
| [MinIO](https://min.io/) | Object Storage |

### Microservices

| Service | Description |
|:--------|:------------|
| **Notification Service** | In-app notification dispatch & management |
| **Core Service (Control Plane)** | Central orchestration & panel management |
| **Core Service (Agent)** | Docker node agent for runtime operations |
| **Hot Update Service** | Runtime bundle deployment & backend restart |

### Supported AI Models

| Model | Capability |
|:------|:-----------|
| **DeepSeek** | Script & Text Generation |
| **Qwen (通义千问)** | Script & Text Generation |
| **Doubao (豆包)** | Text Generation & Multimodal Analysis |
| **Zhipu (智谱)** | Script & Text Generation |
| **Vidu** | Image-to-Video, Text-to-Video |
| **Kling (可灵)** | Image / Video Generation (Custom Handler) |
| **Seedance** | Video Generation |
| **Seedream** | Image Generation |
| **Gemini** | Text Processing |
| *OpenAI Compatible* | Any OpenAI-compatible provider |
| *Extensible* | More models via adapter pattern |

### Infrastructure

| Technology | Description |
|:-----------|:------------|
| [Docker Compose](https://docs.docker.com/compose/) | Container Orchestration |
| [Nginx](https://nginx.org/) | Reverse Proxy & Static Serving |
| [PM2](https://pm2.keymetrics.io/) | Backend Process Management |
| [VikingDB](https://www.volcengine.com/product/vikingdb) | RAG Knowledge Base (Volcengine) |

## Quick Start

### Prerequisites

| Requirement | Version |
|:------------|:--------|
| Docker Engine | 24+ |
| Docker Compose | v2 |
| Node.js | 20+ |
| MySQL | 8.0+ |
| Browser | Chrome / Edge (recommended) |

### Installation

```bash
git clone https://github.com/Dirinkbottle/nanostory.git
cd nanostory

# Prepare Docker env
cp docker-compose.env.example docker-compose.env

# Prepare backend env
cp backend/.env.example backend/.env
# Edit backend/.env with your database credentials

# Initialize database
mysql -u root -p nanostory < backend/initial_database.sql

# Install dependencies
npm install

# Build release bundle
npm run build:release

# Bootstrap runtime/current
npm run release:bootstrap

# Start the Docker stack
npm run docker:up
```

### Common Commands

```bash
# Start the standard stack (nginx + services)
npm run docker:up

# Start the dev profile (nginx -> Vite dev server)
npm run docker:dev

# Tail compose logs
npm run docker:logs

# Stop the stack
npm run docker:down

# Upload the latest bundle through hot_update
npm run release:upload

# Start backend in development mode (PM2)
pm2 start ecosystem.config.cjs
```

### Environment Configuration

Create `backend/.env` with the following variables:

```env
# Database
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=nanostory
MYSQL_USER=root
MYSQL_PASSWORD=your_password

# Security
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# Server
PORT=4000
ALLOWED_ORIGINS=http://localhost
NODE_ENV=development

# Microservices
CORE_SERVICE_URL=http://localhost:4102
NOTIFICATION_SERVICE_URL=http://localhost:4101
SERVICE_SHARED_SECRET=change-this-shared-secret

# Object Storage (MinIO)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=change-this-minio-password
```

## Project Structure

```
nanostory/
├── App.tsx                    # Application entry
├── components/                # Shared components
│   ├── Layout.tsx             # Main layout
│   ├── DirectorSpace/         # Director Space AI generation
│   ├── DynamicWorkbench/      # Multi-mode workbench switcher
│   ├── NodeCanvas/            # Node-based visual editor
│   ├── PanelGroup.tsx         # Resizable panel system
│   ├── TaskQueueBubble/       # Task queue UI
│   ├── AIAssistantPanel/      # AI assistant panel
│   ├── CommandPalette/        # Command palette
│   ├── WorkflowDashboard/     # Workflow dashboard
│   └── ui/                    # UI theme components
├── views/                     # Page views
│   ├── ScriptStudio/          # Script editor module
│   ├── StoryBoard/            # Storyboard module
│   ├── SimpleStoryBoard/      # Simplified storyboard
│   ├── AssetsManager/         # Asset management
│   ├── VideoComposition/      # Video composition & export
│   ├── ComicDramaWorkbench/   # Comic drama workbench
│   ├── MangaWorkbench/        # Manga workbench
│   ├── NovelWorkbench/        # Novel workbench
│   ├── ShortVideoWorkbench/   # Short video workbench
│   ├── Community/             # Community features
│   ├── Marketplace/           # Template marketplace
│   ├── TemplateGallery/       # Template gallery
│   ├── Landing/               # Landing page
│   ├── Pricing/               # Pricing & subscription
│   ├── Projects.tsx           # Project management
│   ├── UserCenter.tsx         # User profile & billing
│   ├── Auth.tsx               # Authentication
│   ├── Settings/              # User settings
│   └── admin/                 # Admin dashboard
│       ├── Dashboard.tsx      # System analytics
│       ├── AIModels/          # AI model config
│       ├── ModelProviders.tsx # Model provider management
│       ├── ModelStatsDashboard.tsx # Model usage stats
│       ├── UserManagement.tsx # User management
│       ├── SubscriptionManagement.tsx # Subscription plans
│       ├── BillingConfig.tsx  # Billing configuration
│       ├── RateLimitManagement.tsx # Rate limiting
│       ├── AnnouncementManagement.tsx # Announcements
│       ├── FeedbackManagement.tsx # User feedback
│       ├── ErrorMonitor.tsx   # Error monitoring
│       ├── ServiceDashboard.tsx # Service health
│       ├── RAGStatus.tsx      # RAG knowledge base
│       ├── AdminLog.tsx       # Admin audit logs
│       ├── SiteSettings.tsx   # Site settings
│       └── UserSettingsManagement.tsx # Frontend settings
├── features/
│   └── NodeMode/              # Visual node editing feature
├── hooks/                     # Custom React hooks
├── services/                  # API service layer
├── contexts/                  # React contexts (theme, i18n, points, etc.)
├── extensions/                # Extension plugins
│   └── japanese-language-pack/
├── locales/                   # i18n translations (zh-CN, en-US)
├── notifications/             # Notification UI layer
├── types/                     # TypeScript type definitions
├── utils/                     # Utility functions
├── microservices/             # Microservice packages
│   ├── core-service/          # Core orchestration service
│   └── notification-service/  # Notification dispatch service
├── docker/                    # Docker configurations
│   ├── nginx/                 # Nginx reverse proxy
│   ├── backend/               # Backend container
│   ├── core-service/          # Core service container
│   ├── notification-service/  # Notification container
│   └── hot-update/            # Hot update container
├── runtime/                   # Runtime data (frontend bundles, backend data)
└── backend/                   # Backend service
    ├── src/
    │   ├── index.js           # Server entry
    │   ├── auth.js            # Authentication
    │   ├── billing.js         # Billing service
    │   ├── users.js           # User management
    │   ├── projects.js        # Project management
    │   ├── collaboration.js   # Team collaboration
    │   ├── marketplace.js     # Marketplace service
    │   ├── websocket.js       # WebSocket handler
    │   ├── aiAssistantRoutes.js # AI assistant routes
    │   ├── aiModelService.js  # AI model service
    │   ├── modelAdapter.js    # Model adapter (OpenAI compatible)
    │   ├── openaiAdapter.js   # OpenAI-compatible adapter
    │   ├── ragRoutes.js       # RAG knowledge base routes
    │   ├── novelRoutes.js     # Novel workbench routes
    │   ├── nosyntask/         # Async task engine
    │   ├── adapters/          # Model adapter framework
    │   ├── billingHandlers/   # Multi-provider billing handlers
    │   ├── customHandlers/    # Custom AI model handlers
    │   │   ├── deepseek.js
    │   │   ├── doubao_multimodal.js
    │   │   ├── kling_video.js
    │   │   ├── seedance1.5.js
    │   │   ├── seedream.js
    │   │   └── ...
    │   ├── modules/           # Feature modules
    │   │   ├── ai-assistant/
    │   │   ├── ai-runtime/
    │   │   ├── generation/
    │   │   ├── identity-billing/
    │   │   ├── media/
    │   │   ├── project-script/
    │   │   ├── resource/
    │   │   ├── storyboard/
    │   │   └── workflow/
    │   ├── middleware/        # Express middleware
    │   ├── storage/           # Storage abstraction layer
    │   └── utils/             # Backend utilities
    └── initial_database.sql   # Database schema
```

## Documentation

- [Async Engine Guide](ASYNC_ENGINE_GUIDE.md) — Task engine architecture and usage
- [Docker Deployment](docs/docker-deployment.md) — Docker Compose, runtime bootstrap, and hot update workflow
- [WebSocket Usage](WEBSOCKET_USAGE.md) — WebSocket real-time communication guide
- [Security Policy](SECURITY.md) — Security guidelines and reporting

## Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'feat: add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Submit** a Pull Request

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

# 中文

### AI 驱动的视频创作平台

*用 AI 将你的创意转化为精彩的视频内容*

[功能特性](#功能特性) · [快速开始](#快速开始-1) · [项目文档](#项目文档) · [参与贡献](#参与贡献)

## 项目概述

**动漫记忆**（纳米故事）是一款开源的 AI 视频创作平台，集成多种前沿 AI 大模型（DeepSeek、通义千问、豆包、智谱、Vidu、可灵 Kling、Seedance、Seedream 等），提供从剧本生成、分镜设计、视频合成到导出的完整工作流。

项目采用前后端分离架构，具备微服务设计能力。后端基于 Node.js + Express + MySQL，由 PM2 管理进程，配合独立的通知服务和核心服务运行在 Docker 中。支持多用户协作、团队管理、计费与订阅系统、扩展插件、RAG 知识库以及完善的管理后台。

## 功能特性

<table>
<tr>
<td width="50%">

### 剧本工作室
- AI 剧本生成（DeepSeek / 通义千问 / 豆包 / 智谱）
- 多集剧本管理与自动编号
- 剧本大纲面板双模式设计
- 手动剧本编辑与 AI 助手

### 分镜系统
- 可视化分镜设计界面
- 首帧/尾帧图片生成
- AI 视频片段生成（可灵 / Seedance / Vidu）
- 一键自动提取分镜
- 简化分镜模式
- 导演空间 AI 生成菜单

### 多工作台模式
- 短剧工作台 (Comic Drama)
- 漫画工作台 (Manga)
- 小说工作台 (Novel)
- 短视频工作台 (Short Video)
- 节点模式可视化工作流编辑

</td>
<td width="50%">

### 资产管理
- 角色、场景、道具、服装分类管理
- 角色状态图与三视图参考
- 可视化画廊与快速预览
- AI 道具图片生成
- 建筑与环境变体资产

### 视频合成
- 多轨道时间轴编辑器
- 字幕系统与样式设置
- BGM 背景音乐轨道
- 基于 FFmpeg 的视频导出

### 管理后台
- 系统监控与数据分析看板
- AI 模型与提供商配置管理
- 用户、订阅与计费管理
- 公告与反馈管理
- 错误监控与速率限制管理
- RAG 知识库状态监控
- 服务健康看板与管理员审计日志
- 站点设置与前端配置

</td>
</tr>
</table>

### 用户系统

完整的用户管理与计费系统：

- **用户认证** — 基于 JWT 的身份认证，bcrypt 密码加密
- **用户中心** — 个人资料、余额、消费统计、账单记录
- **积分与订阅** — 积分充值、订阅层级、计费配置
- **团队协作** — 项目协作者、团队成员、任务分配
- **站内信** — 应用内消息系统

### 异步任务引擎

内置异步任务引擎，高效处理耗时的 AI 生成任务：

- **队列管理** — 后台异步处理图片/视频生成
- **实时追踪** — 基于 WebSocket 的任务进度实时监控
- **自动清理** — 智能任务状态管理，自动过期清理

### 平台特性

- **社区与市场** — 模板共享、社区项目
- **扩展系统** — 插件架构（如日语语言包）
- **国际化** — 完整中文 (zh-CN) 和英文 (en-US) 支持
- **AI 助手** — 上下文感知 AI 助手面板
- **热更新** — 运行时热更新部署，无需停机
- **RAG 知识库** — VikingDB / 火山引擎 RAG 集成，上下文检索
- **命令面板** — 键盘驱动的命令界面
- **新手引导** — 新用户快速上手向导

## 技术栈

### 前端

| 技术 | 版本 | 说明 |
|:-----|:----:|:-----|
| [React](https://react.dev/) | 19 | UI 框架 |
| [Vite](https://vitejs.dev/) | 6 | 构建工具 |
| [TypeScript](https://www.typescriptlang.org/) | 5.8 | 类型安全 |
| [TailwindCSS](https://tailwindcss.com/) | 4 | 样式方案 |
| [HeroUI](https://www.heroui.com/) | 2.8 | 组件库 |
| [Framer Motion](https://www.framer.com/motion/) | 12 | 动画库 |
| [React Router](https://reactrouter.com/) | 7 | 路由管理 |
| [FFmpeg.wasm](https://ffmpegwasm.netlify.app/) | 0.12 | 视频处理 |
| [Three.js](https://threejs.org/) | 0.184 | 3D 渲染 |
| [Excalidraw](https://excalidraw.com/) | 0.18 | 白板 / 草图绘制 |
| [Socket.IO Client](https://socket.io/) | 4 | 实时通信 |

### 后端

| 技术 | 说明 |
|:-----|:-----|
| [Node.js](https://nodejs.org/) | 运行环境 (v20+) |
| [Express](https://expressjs.com/) | Web 框架 |
| [MySQL](https://www.mysql.com/) | 数据库 |
| [JWT](https://jwt.io/) | 身份认证 |
| [bcryptjs](https://github.com/dcodeIO/bcrypt.js) | 密码加密 |
| [Socket.IO](https://socket.io/) | WebSocket 服务 |
| [PM2](https://pm2.keymetrics.io/) | 进程管理 |
| [MinIO](https://min.io/) | 对象存储 |

### 微服务

| 服务 | 说明 |
|:-----|:-----|
| **通知服务** | 站内通知分发与管理 |
| **核心服务（控制面）** | 中心编排与面板管理 |
| **核心服务（代理）** | Docker 节点代理，运行时操作 |
| **热更新服务** | 运行时 bundle 部署与后端重启 |

### 支持的 AI 模型

| 模型 | 能力 |
|:-----|:-----|
| **DeepSeek** | 剧本与文本生成 |
| **通义千问 Qwen** | 剧本与文本生成 |
| **豆包 Doubao** | 文本生成与多模态分析 |
| **智谱 Zhipu** | 剧本与文本生成 |
| **Vidu** | 图生视频、文生视频 |
| **可灵 Kling** | 图片/视频生成（自定义处理器） |
| **Seedance** | 视频生成 |
| **Seedream** | 图片生成 |
| **Gemini** | 文本处理 |
| *OpenAI 兼容* | 任意 OpenAI 兼容提供商 |
| *可扩展* | 通过适配器模式接入更多模型 |

### 基础设施

| 技术 | 说明 |
|:-----|:-----|
| [Docker Compose](https://docs.docker.com/compose/) | 容器编排 |
| [Nginx](https://nginx.org/) | 反向代理与静态资源服务 |
| [PM2](https://pm2.keymetrics.io/) | 后端进程管理 |
| [VikingDB](https://www.volcengine.com/product/vikingdb) | RAG 知识库（火山引擎） |

## 快速开始

### 环境要求

| 依赖 | 版本 |
|:-----|:-----|
| Docker Engine | 24+ |
| Docker Compose | v2 |
| Node.js | 20+ |
| MySQL | 8.0+ |
| 浏览器 | Chrome / Edge（推荐） |

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/Dirinkbottle/nanostory.git
cd nanostory

# 准备 Compose 环境变量
cp docker-compose.env.example docker-compose.env

# 准备后端环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env 填入数据库配置

# 初始化数据库
mysql -u root -p nanostory < backend/initial_database.sql

# 安装依赖
npm install

# 构建 release bundle
npm run build:release

# 写入 runtime/current
npm run release:bootstrap

# 启动 Docker 栈
npm run docker:up
```

### 常用命令

```bash
# 启动标准栈（nginx + 微服务）
npm run docker:up

# 启动开发模式（nginx -> Vite dev server）
npm run docker:dev

# 查看日志
npm run docker:logs

# 停止服务
npm run docker:down

# 通过 hot_update 上传最新 bundle
npm run release:upload

# 开发模式启动后端（PM2）
pm2 start ecosystem.config.cjs
```

### 环境变量配置

创建 `backend/.env` 文件：

```env
# 数据库配置
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=nanostory
MYSQL_USER=root
MYSQL_PASSWORD=your_password

# 安全配置
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# 服务配置
PORT=4000
ALLOWED_ORIGINS=http://localhost
NODE_ENV=development

# 微服务配置
CORE_SERVICE_URL=http://localhost:4102
NOTIFICATION_SERVICE_URL=http://localhost:4101
SERVICE_SHARED_SECRET=change-this-shared-secret

# 对象存储 (MinIO)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=change-this-minio-password
```

## 项目结构

```
nanostory/
├── App.tsx                    # 应用入口
├── components/                # 公共组件
│   ├── Layout.tsx             # 主布局
│   ├── DirectorSpace/         # 导演空间 AI 生成
│   ├── DynamicWorkbench/      # 多模式工作台切换
│   ├── NodeCanvas/            # 节点可视化编辑器
│   ├── PanelGroup.tsx         # 可调整面板系统
│   ├── TaskQueueBubble/       # 任务队列组件
│   ├── AIAssistantPanel/      # AI 助手面板
│   ├── CommandPalette/        # 命令面板
│   ├── WorkflowDashboard/     # 工作流看板
│   └── ui/                    # UI 主题组件
├── views/                     # 页面视图
│   ├── ScriptStudio/          # 剧本工作室
│   ├── StoryBoard/            # 分镜系统
│   ├── SimpleStoryBoard/      # 简化分镜
│   ├── AssetsManager/         # 资产管理
│   ├── VideoComposition/      # 视频合成与导出
│   ├── ComicDramaWorkbench/   # 短剧工作台
│   ├── MangaWorkbench/        # 漫画工作台
│   ├── NovelWorkbench/        # 小说工作台
│   ├── ShortVideoWorkbench/   # 短视频工作台
│   ├── Community/             # 社区功能
│   ├── Marketplace/           # 模板市场
│   ├── TemplateGallery/       # 模板画廊
│   ├── Landing/               # 落地页
│   ├── Pricing/               # 定价与订阅
│   ├── Projects.tsx           # 项目管理
│   ├── UserCenter.tsx         # 用户中心与计费
│   ├── Auth.tsx               # 认证页面
│   ├── Settings/              # 用户设置
│   └── admin/                 # 管理后台
│       ├── Dashboard.tsx      # 系统数据分析
│       ├── AIModels/          # AI 模型配置
│       ├── ModelProviders.tsx # 模型提供商管理
│       ├── ModelStatsDashboard.tsx # 模型用量统计
│       ├── UserManagement.tsx # 用户管理
│       ├── SubscriptionManagement.tsx # 订阅计划
│       ├── BillingConfig.tsx  # 计费配置
│       ├── RateLimitManagement.tsx # 速率限制
│       ├── AnnouncementManagement.tsx # 公告管理
│       ├── FeedbackManagement.tsx # 用户反馈
│       ├── ErrorMonitor.tsx   # 错误监控
│       ├── ServiceDashboard.tsx # 服务健康
│       ├── RAGStatus.tsx      # RAG 知识库
│       ├── AdminLog.tsx       # 管理员审计日志
│       ├── SiteSettings.tsx   # 站点设置
│       └── UserSettingsManagement.tsx # 前端设置
├── features/
│   └── NodeMode/              # 节点编辑功能模块
├── hooks/                     # 自定义 Hooks
├── services/                  # API 服务层
├── contexts/                  # React Context（主题、国际化、积分等）
├── extensions/                # 扩展插件
│   └── japanese-language-pack/
├── locales/                   # 国际化翻译文件 (zh-CN, en-US)
├── notifications/             # 通知 UI 层
├── types/                     # TypeScript 类型定义
├── utils/                     # 工具函数
├── microservices/             # 微服务包
│   ├── core-service/          # 核心编排服务
│   └── notification-service/  # 通知分发服务
├── docker/                    # Docker 配置
│   ├── nginx/                 # Nginx 反向代理
│   ├── backend/               # 后端容器
│   ├── core-service/          # 核心服务容器
│   ├── notification-service/  # 通知服务容器
│   └── hot-update/            # 热更新容器
├── runtime/                   # 运行时数据（前端 bundle、后端数据）
└── backend/                   # 后端服务
    ├── src/
    │   ├── index.js           # 服务入口
    │   ├── auth.js            # 身份认证
    │   ├── billing.js         # 计费服务
    │   ├── users.js           # 用户管理
    │   ├── projects.js        # 项目管理
    │   ├── collaboration.js   # 团队协作
    │   ├── marketplace.js     # 市场服务
    │   ├── websocket.js       # WebSocket 处理
    │   ├── aiAssistantRoutes.js # AI 助手路由
    │   ├── aiModelService.js  # AI 模型服务
    │   ├── modelAdapter.js    # 模型适配器（OpenAI 兼容）
    │   ├── openaiAdapter.js   # OpenAI 兼容适配器
    │   ├── ragRoutes.js       # RAG 知识库路由
    │   ├── novelRoutes.js     # 小说工作台路由
    │   ├── nosyntask/         # 异步任务引擎
    │   ├── adapters/          # 模型适配器框架
    │   ├── billingHandlers/   # 多提供商计费处理
    │   ├── customHandlers/    # 自定义 AI 模型处理器
    │   │   ├── deepseek.js
    │   │   ├── doubao_multimodal.js
    │   │   ├── kling_video.js
    │   │   ├── seedance1.5.js
    │   │   ├── seedream.js
    │   │   └── ...
    │   ├── modules/           # 功能模块
    │   │   ├── ai-assistant/
    │   │   ├── ai-runtime/
    │   │   ├── generation/
    │   │   ├── identity-billing/
    │   │   ├── media/
    │   │   ├── project-script/
    │   │   ├── resource/
    │   │   ├── storyboard/
    │   │   └── workflow/
    │   ├── middleware/        # Express 中间件
    │   ├── storage/           # 存储抽象层
    │   └── utils/             # 后端工具函数
    └── initial_database.sql   # 数据库结构
```

## 项目文档

- [异步引擎使用指南](ASYNC_ENGINE_GUIDE.md) — 任务引擎架构与使用方法
- [Docker 部署](docs/docker-deployment.md) — Docker Compose、运行时 bootstrap 与 hot update 工作流
- [WebSocket 使用指南](WEBSOCKET_USAGE.md) — WebSocket 实时通信指南
- [安全策略](SECURITY.md) — 安全指南与漏洞报告

## 参与贡献

欢迎贡献代码！请按以下步骤操作：

1. **Fork** 本仓库
2. **创建** 特性分支：`git checkout -b feature/amazing-feature`
3. **提交** 更改：`git commit -m 'feat: add amazing feature'`
4. **推送** 到分支：`git push origin feature/amazing-feature`
5. **提交** Pull Request

## 开源协议

本项目基于 **MIT 协议** 开源 - 详见 [LICENSE](LICENSE) 文件。

---

<div align="center">

**[Back to Top / 返回顶部](#animated-memory--动漫记忆-)**

Made with love by Animated Memory Team

</div>
