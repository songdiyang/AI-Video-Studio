<div align="center">

# Jiaozi Anime / 饺子动漫 🥟

[English](#english) | [中文](#中文)

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)

</div>

---

# English

### AI-Powered Video Creation Platform

*Transform your creative ideas into stunning video content with AI*

[Features](#features) · [Quick Start](#quick-start) · [Documentation](#documentation) · [Contributing](#contributing)

## Overview

**Jiaozi Anime** is an open-source AI video creation platform that integrates multiple cutting-edge AI models (DeepSeek, Vidu, Kling, Seedance, etc.) to provide a complete workflow from script generation, storyboard design, to video composition and export.

The project adopts a front-end and back-end separation architecture, with the back-end based on Node.js + MySQL providing stable API services and an asynchronous task engine, supporting multi-user collaboration, billing system, and admin dashboard.

## Features

<table>
<tr>
<td width="50%">

### Script Studio
- AI-powered script generation with DeepSeek
- Multi-episode management
- Customizable video model selection
- Manual script editing support

### Storyboard System
- Visual storyboard design interface
- First/last frame image generation
- AI video clip generation
- One-click auto storyboard extraction
- Simplified storyboard mode

</td>
<td width="50%">

### Asset Management
- Character, scene, and prop organization
- Visual gallery with quick preview
- Consistent art style maintenance

### Video Composition
- Multi-track timeline editor
- Subtitle system with styling
- BGM audio track support
- FFmpeg-based video export

### Admin Dashboard
- System monitoring & analytics
- AI model configuration
- User & billing management
- System & frontend settings

</td>
</tr>
</table>

### User System

Complete user management and billing system:

- **User Authentication** — JWT-based authentication with bcrypt encryption
- **User Center** — Profile, balance, consumption statistics, billing history
- **Billing System** — Pay-per-use model with detailed cost tracking
- **Admin Panel** — User management, system configuration, frontend settings

### Async Task Engine

Built-in asynchronous task engine for handling time-consuming AI generation tasks:

- **Queue Management** — Background processing for image/video generation
- **Real-time Tracking** — Live task progress monitoring
- **Auto Cleanup** — Intelligent task state management with automatic expiration

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

### Backend

| Technology | Description |
|:-----------|:------------|
| [Node.js](https://nodejs.org/) | Runtime Environment (v18+) |
| [Express](https://expressjs.com/) | Web Framework |
| [MySQL](https://www.mysql.com/) | Database |
| [JWT](https://jwt.io/) | Authentication |
| [bcryptjs](https://github.com/dcodeIO/bcrypt.js) | Password Encryption |
| [MinIO](https://min.io/) | Object Storage (Optional) |

### Supported AI Models

| Model | Capability |
|:------|:-----------|
| **DeepSeek** | Script Generation |
| **Vidu** | Image-to-Video, Text-to-Video |
| **Kling** | Image/Video Generation (Custom Handler) |
| **Seedance** | Video Generation |
| **Gemini** | Text Processing |
| *Extensible* | More models coming... |

## Quick Start

### Prerequisites

| Requirement | Version |
|:------------|:--------|
| Node.js | 18+ |
| MySQL | 8.0+ |
| Browser | Chrome / Edge (recommended) |

### Installation

```bash
# Clone the repository
git clone https://github.com/Dirinkbottle/nanostory.git
cd nanostory

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend && npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your database credentials

# Initialize database
mysql -u root -p nanostory < initial_database.sql

# Start backend server (Port 4000)
npm run dev

# In a new terminal, start frontend (Port 3000)
cd .. && npm run dev
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
ALLOWED_ORIGINS=http://localhost:3000
NODE_ENV=development
```

## Project Structure

```
nanostory/
├── App.tsx                    # Application entry
├── components/                # Shared components
│   ├── Layout.tsx
│   ├── TaskQueueBubble/       # Task queue UI
│   └── ui/GenshinUI/          # UI theme components
├── views/                     # Page views
│   ├── ScriptStudio/          # Script editor module
│   ├── StoryBoard/            # Storyboard module
│   ├── SimpleStoryBoard/      # Simplified storyboard
│   ├── AssetsManager/         # Asset management
│   ├── VideoComposition/      # Video composition & export
│   ├── Projects.tsx           # Project management
│   ├── UserCenter.tsx         # User profile & billing
│   ├── Settings/              # User settings
│   └── admin/                 # Admin dashboard
│       ├── AIModels/          # AI model config
│       ├── UserManagement.tsx
│       ├── SystemConfigManagement.tsx
│       ├── UserSettingsManagement.tsx
│       └── FrontendSettingsManagement.tsx
├── hooks/                     # Custom React hooks
├── services/                  # API services
├── contexts/                  # React contexts
└── backend/                   # Backend service
    ├── src/
    │   ├── index.js           # Server entry
    │   ├── auth.js            # Authentication
    │   ├── billing.js         # Billing service
    │   ├── users.js           # User management
    │   ├── nosyntask/         # Async task engine
    │   └── customHandlers/    # Custom AI handlers
    │       ├── deepseek.js
    │       ├── kling_video.js
    │       ├── seedance1.5.js
    │       └── ...
    └── initial_database.sql   # Database schema
```

## Documentation

- [Async Engine Guide](ASYNC_ENGINE_GUIDE.md) — Task engine architecture and usage
- [Docker Deployment](docs/docker-deployment.md) — Nginx + Backend + MinIO deployment
- [Hot Update](docs/hot-update.md) — CI release bundle validation and runtime rollout
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

**饺子动漫** 是一款开源的 AI 视频创作平台，集成多种前沿 AI 大模型（DeepSeek、Vidu、可灵 Kling、Seedance 等），提供从剧本生成、分镜设计、视频合成到导出的完整工作流。

项目采用前后端分离架构，后端基于 Node.js + MySQL 提供稳定的 API 服务和异步任务引擎，支持多用户协作、计费系统与管理后台。

## 功能特性

<table>
<tr>
<td width="50%">

### 剧本工作室
- 基于 DeepSeek 的 AI 剧本生成
- 多集剧本管理
- 自定义视频模型选择
- 手动剧本编辑支持

### 分镜系统
- 可视化分镜设计界面
- 首帧/尾帧图片生成
- AI 视频片段生成
- 一键自动提取分镜
- 简化分镜模式

</td>
<td width="50%">

### 资产管理
- 角色、场景、道具分类管理
- 可视化画廊与快速预览
- 统一美术风格维护

### 视频合成
- 多轨道时间轴编辑器
- 字幕系统与样式设置
- BGM 背景音乐轨道
- 基于 FFmpeg 的视频导出

### 管理后台
- 系统监控与数据分析
- AI 模型配置管理
- 用户与计费管理
- 系统与前端设置

</td>
</tr>
</table>

### 用户系统

完整的用户管理与计费系统：

- **用户认证** — 基于 JWT 的身份认证，bcrypt 密码加密
- **用户中心** — 个人资料、余额、消费统计、账单记录
- **计费系统** — 按量计费模式，详细成本追踪
- **管理后台** — 用户管理、系统配置、前端设置

### 异步任务引擎

内置异步任务引擎，高效处理耗时的 AI 生成任务：

- **队列管理** — 后台异步处理图片/视频生成
- **实时追踪** — 任务进度实时监控
- **自动清理** — 智能任务状态管理，自动过期清理

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

### 后端

| 技术 | 说明 |
|:-----|:-----|
| [Node.js](https://nodejs.org/) | 运行环境 (v18+) |
| [Express](https://expressjs.com/) | Web 框架 |
| [MySQL](https://www.mysql.com/) | 数据库 |
| [JWT](https://jwt.io/) | 身份认证 |
| [bcryptjs](https://github.com/dcodeIO/bcrypt.js) | 密码加密 |
| [MinIO](https://min.io/) | 对象存储（可选） |

### 支持的 AI 模型

| 模型 | 能力 |
|:-----|:-----|
| **DeepSeek** | 剧本生成 |
| **Vidu** | 图生视频、文生视频 |
| **可灵 Kling** | 图片/视频生成（自定义处理器） |
| **Seedance** | 视频生成 |
| **Gemini** | 文本处理 |
| *可扩展* | 更多模型持续接入中... |

## 快速开始

### 环境要求

| 依赖 | 版本 |
|:-----|:-----|
| Node.js | 18+ |
| MySQL | 8.0+ |
| 浏览器 | Chrome / Edge（推荐） |

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/Dirinkbottle/nanostory.git
cd nanostory

# 安装前端依赖
npm install

# 安装后端依赖
cd backend && npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入数据库配置

# 初始化数据库
mysql -u root -p nanostory < initial_database.sql

# 启动后端服务（端口 4000）
npm run dev

# 新开终端，启动前端（端口 3000）
cd .. && npm run dev
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
ALLOWED_ORIGINS=http://localhost:3000
NODE_ENV=development
```

## 项目结构

```
nanostory/
├── App.tsx                    # 应用入口
├── components/                # 公共组件
│   ├── Layout.tsx
│   ├── TaskQueueBubble/       # 任务队列组件
│   └── ui/GenshinUI/          # UI 主题组件
├── views/                     # 页面视图
│   ├── ScriptStudio/          # 剧本工作室
│   ├── StoryBoard/            # 分镜系统
│   ├── SimpleStoryBoard/      # 简化分镜
│   ├── AssetsManager/         # 资产管理
│   ├── VideoComposition/      # 视频合成与导出
│   ├── Projects.tsx           # 项目管理
│   ├── UserCenter.tsx         # 用户中心与计费
│   ├── Settings/              # 用户设置
│   └── admin/                 # 管理后台
│       ├── AIModels/          # AI 模型配置
│       ├── UserManagement.tsx
│       ├── SystemConfigManagement.tsx
│       ├── UserSettingsManagement.tsx
│       └── FrontendSettingsManagement.tsx
├── hooks/                     # 自定义 Hooks
├── services/                  # API 服务
├── contexts/                  # React Context
└── backend/                   # 后端服务
    ├── src/
    │   ├── index.js           # 服务入口
    │   ├── auth.js            # 身份认证
    │   ├── billing.js         # 计费服务
    │   ├── users.js           # 用户管理
    │   ├── nosyntask/         # 异步任务引擎
    │   └── customHandlers/    # 自定义 AI 处理器
    │       ├── deepseek.js
    │       ├── kling_video.js
    │       ├── seedance1.5.js
    │       └── ...
    └── initial_database.sql   # 数据库结构
```

## 项目文档

- [异步引擎使用指南](ASYNC_ENGINE_GUIDE.md) — 任务引擎架构与使用方法
- [Docker 部署](docs/docker-deployment.md) — Nginx + Backend + MinIO 部署方案
- [热更新](docs/hot-update.md) — CI 产物打包、验签与运行时切换
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

**[Back to Top / 返回顶部](#jiaozi-anime--饺子动漫-)**

Made with love by Jiaozi Anime Team

</div>
