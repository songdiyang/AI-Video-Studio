/**
 * 扩展中心页面
 * 提供可扩展的功能模块入口，首个扩展为API接口文档
 */

import React, { useState, useMemo } from 'react';
import { FileText, BookOpen, ChevronRight, Search, ExternalLink, Download } from 'lucide-react';

// ============ 扩展项定义 ============

interface ExtensionItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  version: string;
  author: string;
  content: string; // Markdown 内容
}

// ============ 简易 Markdown 渲染器 ============

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const html = useMemo(() => renderMarkdown(content), [content]);
  return (
    <div
      className="markdown-body prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

function renderMarkdown(md: string): string {
  let html = md
    // 代码块
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) =>
      `<pre class="md-code-block"><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`)
    // 行内代码
    .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
    // 标题
    .replace(/^#### (.+)$/gm, '<h4 class="md-h4">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')
    // 粗体/斜体
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 分隔线
    .replace(/^---$/gm, '<hr class="md-hr"/>')
    // 表格
    .replace(/^\|(.+)\|$/gm, (line) => {
      const cells = line.split('|').filter(c => c.trim() !== '');
      if (cells.every(c => /^[\s-:]+$/.test(c))) {
        return '<!--table-sep-->';
      }
      const isHeader = false; // 简化处理
      const cellHtml = cells.map(c => `<td class="md-td">${c.trim()}</td>`).join('');
      return `<tr>${cellHtml}</tr>`;
    })
    // 无序列表
    .replace(/^- (.+)$/gm, '<li class="md-li">$1</li>')
    // 有序列表
    .replace(/^\d+\. (.+)$/gm, '<li class="md-li-ordered">$1</li>');

  // 包裹连续 <tr> 为 <table>
  html = html.replace(/((?:<tr>.*<\/tr>\s*(?:<!--table-sep-->\s*)?)+)/g, (block) => {
    const cleaned = block.replace(/<!--table-sep-->/g, '');
    return `<table class="md-table">${cleaned}</table>`;
  });

  // 包裹连续 <li> 为 <ul>
  html = html.replace(/((?:<li class="md-li">.*<\/li>\s*)+)/g, '<ul class="md-ul">$1</ul>');
  html = html.replace(/((?:<li class="md-li-ordered">.*<\/li>\s*)+)/g, '<ol class="md-ol">$1</ol>');

  // 段落（非标签行）
  html = html.replace(/^(?!<[a-z/!])((?!^\s*$).+)$/gm, '<p class="md-p">$1</p>');

  return html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============ API 文档内容 ============

const API_DOC_CONTENT = `# 饺子动漫 API 接口文档

## 概述

饺子动漫是一个 AI 驱动的动漫/短剧创作平台，提供从剧本生成、分镜制作、角色设计到视频合成的全流程 API。

**Base URL:** \`http://localhost:4001/api\`

**认证方式:** Bearer Token - 在请求头中添加 \`Authorization: Bearer <token>\`

**响应格式:** JSON

---

## 1. 认证接口

### POST /api/auth/register
注册新用户

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱地址 |
| password | string | 是 | 密码（至少6位） |

### POST /api/auth/login
用户登录，返回 JWT Token

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱地址 |
| password | string | 是 | 密码 |

**响应：** \`{ token, user: { id, email, avatar_url } }\`

---

## 2. 项目管理接口

### GET /api/projects
获取当前用户的项目列表

### POST /api/projects
创建新项目

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 项目名称 |
| description | string | 否 | 项目描述 |
| type | string | 否 | 项目类型 |
| team_id | number | 否 | 关联团队ID（团队项目） |

### PUT /api/projects/:id
更新项目信息

### DELETE /api/projects/:id
删除项目

### GET /api/projects/style-presets
获取视觉风格预设列表

### POST /api/projects/suggest-settings
AI 智能推荐项目设置

---

## 3. 剧本管理接口

### POST /api/scripts/create
手动创建剧本

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| projectId | number | 是 | 项目ID |
| title | string | 是 | 剧本标题 |
| content | string | 是 | 剧本内容 |
| episodeNumber | number | 否 | 集数 |

### POST /api/scripts/generate
AI 生成剧本（通过工作流执行）

### GET /api/scripts/project/:projectId
获取项目的所有剧本列表

### GET /api/scripts/project/:projectId/episode/:episodeNumber
获取指定集的剧本

### GET /api/scripts/project/:projectId/recap
获取前情回顾数据

### PUT /api/scripts/:id
更新剧本内容

### DELETE /api/scripts/:id
删除剧本

### DELETE /api/scripts/:id/episode
删除某集（含分镜+剧本+孤立资源清理）

### POST /api/scripts/draft
创建或更新草稿

### PUT /api/scripts/draft/:scriptId
保存草稿内容

### DELETE /api/scripts/draft/:scriptId
删除草稿

### POST /api/scripts/clean-orphans
清理孤立资源（未被引用的角色/场景）

---

## 4. 分镜管理接口

### GET /api/storyboards/:scriptId
获取剧本下所有分镜列表（含关联的角色、场景数据）

### POST /api/storyboards/add
添加新分镜

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| scriptId | number | 是 | 所属剧本ID |
| index | number | 否 | 插入位置 |
| prompt_template | string | 否 | 分镜描述提示词 |

### DELETE /api/storyboards/scene/:storyboardId
删除指定分镜

### PATCH /api/storyboards/reorder
重新排序分镜

**请求体：** \`{ scriptId, storyboardIds: [id1, id2, ...] }\`

### PATCH /api/storyboards/:storyboardId/content
更新分镜内容（提示词、变量等）

**请求体：**
| 字段 | 类型 | 说明 |
|------|------|------|
| prompt_template | string | 分镜描述提示词 |
| variables_json | object | 变量数据（角色、场景、动作等） |

### PATCH /api/storyboards/:storyboardId/media
更新分镜媒体（首帧/尾帧/视频）

### GET /api/storyboards/:storyboardId/validate?type=frame|video
预检分镜资源就绪状态
- \`type=frame\`：检查生成首尾帧的前置条件
- \`type=video\`：检查生成视频的前置条件

### POST /api/storyboards/batch-validate
批量验证多个分镜的就绪状态

### POST /api/storyboards/clean-before-regenerate
重新生成前清理旧数据

### POST /api/storyboards/fix-links
修复分镜与角色/场景的关联关系

### GET /api/storyboards/shot-language-options
获取镜头语言选项（景别、视角、运镜等）

---

## 5. 版本管理接口

### 提示词版本管理

#### GET /api/storyboards/:storyboardId/prompt-history
获取提示词版本历史列表

#### POST /api/storyboards/:storyboardId/prompt-history
手动保存提示词新版本

#### PUT /api/storyboards/:storyboardId/prompt-history/:historyId/restore
恢复到指定提示词版本

### 帧图版本管理

#### GET /api/storyboards/:storyboardId/frame-history
获取帧图版本历史

#### POST /api/storyboards/:storyboardId/frame-history
保存帧图版本

#### PUT /api/storyboards/:storyboardId/frame-history/:historyId/restore
恢复到指定帧图版本

#### DELETE /api/storyboards/:storyboardId/frame-history/:historyId
删除帧图历史记录

### 草图版本管理

#### POST /api/storyboards/:storyboardId/sketch
上传草图

#### DELETE /api/storyboards/:storyboardId/sketch
删除草图

#### PUT /api/storyboards/:storyboardId/sketch-settings
更新草图设置（控制强度等）

#### PUT /api/storyboards/:storyboardId/sketch-data
保存草图矢量数据（Excalidraw）

#### GET /api/storyboards/:storyboardId/sketch/history
获取草图版本历史

#### POST /api/storyboards/:storyboardId/sketch/restore/:version
恢复指定版本草图

---

## 6. 角色管理接口

### GET /api/characters/project/:projectId
获取项目的所有角色

### POST /api/characters
创建角色

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 角色名称 |
| description | string | 否 | 角色描述 |
| appearance | string | 否 | 外貌描述 |
| personality | string | 否 | 性格描述 |
| image_url | string | 否 | 角色图片URL |
| project_id | number | 是 | 所属项目ID |

### PUT /api/characters/:id
更新角色信息

### DELETE /api/characters/:id
删除角色

---

## 7. 场景管理接口

### GET /api/scenes/project/:projectId
获取项目的所有场景（支持可选 \`?scriptId=\` 过滤）

### GET /api/scenes/:id
获取单个场景详情

### POST /api/scenes
创建场景

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 场景名称 |
| description | string | 否 | 场景描述 |
| environment | string | 否 | 环境描述 |
| lighting | string | 否 | 光照描述 |
| mood | string | 否 | 氛围描述 |
| image_url | string | 否 | 场景图片URL（A面） |

### PUT /api/scenes/:id
更新场景

### DELETE /api/scenes/:id
删除场景

### POST /api/scenes/:sceneId/sketch
上传场景草图

### GET /api/scenes/:sceneId/sketch
获取场景草图

---

## 8. 道具管理接口

### GET /api/props/project/:projectId
获取项目的所有道具

### POST /api/props
创建道具

### PUT /api/props/:id
更新道具

### DELETE /api/props/:id
删除道具

---

## 9. 工作流引擎接口

工作流是饺子动漫的核心异步任务引擎，用于处理所有AI生成任务。

### GET /api/workflows/types
获取所有可用的工作流类型

### POST /api/workflows
启动工作流

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workflowType | string | 是 | 工作流类型（见下方列表） |
| projectId | number | 否 | 项目ID |
| params | object | 是 | 工作流参数（因类型而异） |

**响应：** \`{ jobId, tasks, message }\`

### GET /api/workflows
获取用户的工作流列表

**查询参数：**
- \`projectId\` - 按项目过滤
- \`workflowType\` - 按类型过滤
- \`status\` - 按状态过滤
- \`limit\` - 返回数量限制

### GET /api/workflows/:jobId
获取工作流详细状态（含所有子任务），支持 ETag 缓存

### GET /api/workflows/active?projectId=
查询项目的活跃（未消费）工作流

### POST /api/workflows/:jobId/resume
恢复失败的工作流（断点续传）

### POST /api/workflows/:jobId/cancel
取消工作流

### POST /api/workflows/:jobId/consume
标记工作流已消费（前端已读取结果）

---

## 10. 工作流类型详解

### script_only - 剧本生成
**参数：** \`title, description, style, length, textModel, projectId, episodeNumber\`

### storyboard_generation - 智能分镜
自动生成分镜 + 提取角色 + 分析场景状态（4步骤，3次AI调用，支持并行）

**参数：** \`scriptContent, scriptTitle, textModel, scriptId, projectId\`

### batch_storyboard_generation - 批量分镜生成
按场景拆分，每个场景独立并发生成

**参数：** \`scriptId, projectId, textModel, clearExisting\`

### frame_generation - 分镜首尾帧生成
生成有动作分镜的首帧和尾帧

**参数：** \`storyboardId, prompt, imageModel, textModel, aspectRatio\`

### single_frame_generation - 分镜单帧生成
生成无动作分镜的单帧

**参数：** \`storyboardId, description, imageModel, textModel, aspectRatio\`

### batch_frame_generation - 批量帧生成
一键生成一集所有分镜图片（链式传递）

**参数：** \`scriptId, imageModel, textModel, overwriteFrames, aspectRatio, resolution, maxConcurrency\`

### parallel_frame_generation - 并发帧生成
每个分镜独立并发生成（速度更快，连贯性略低）

**参数：** \`scriptId, imageModel, textModel, overwriteFrames, aspectRatio, resolution, maxConcurrency\`

### scene_video - 分镜视频生成
单个分镜的视频生成

**参数：** \`storyboardId, videoModel, textModel, duration, aspectRatio\`

### batch_scene_video_generation - 批量视频生成
一键生成一集所有分镜视频

**参数：** \`scriptId, videoModel, textModel, duration, aspectRatio, resolution, overwriteVideos, maxConcurrency\`

### scene_image_generation - 场景图片生成
生成场景A面和B面图片（2步：风格分析 + 图片生成）

**参数：** \`sceneId, sceneName, description, environment, lighting, mood, style, imageModel, textModel, aspectRatio\`

### character_views_generation - 角色三视图生成
生成角色多视角图片

**参数：** \`characterId, characterName, appearance, personality, description, style, projectId, imageModel, textModel\`

### camera_run_generation - 精细运镜生成
为单个分镜生成精细运镜提示词

**参数：** \`storyboardId, textModel\`

### sketch_frame_generation - 草图帧生成
草图转图片（2步：预处理 + AI生成）

**参数：** \`storyboardId, sketchUrl, sketchType, prompt, imageModel, textModel, aspectRatio, controlStrength\`

### batch_sketch_frame_generation - 批量草图帧生成
一键将一集所有已上传草图的分镜转为图片

**参数：** \`scriptId, imageModel, textModel, aspectRatio, controlStrength, overwriteFrames, maxConcurrency\`

### prop_image_generation - 道具图片生成
AI 生成道具图片（2步：提示词生成 + 图片生成）

**参数：** \`propId, propName, propDescription, propCategory, propStyleConfig, textModel, imageModel, aspectRatio\`

---

## 11. 团队协作接口

### GET /api/teams
获取用户所有团队

### POST /api/teams
创建新团队

**请求体：** \`{ name, description }\`

### GET /api/teams/:teamId
获取团队详情

### PUT /api/teams/:teamId
更新团队信息

### DELETE /api/teams/:teamId
删除团队（仅团队主）

### GET /api/teams/:teamId/members
获取团队成员列表

### POST /api/teams/:teamId/members
邀请成员（发送邮件邀请）

**请求体：** \`{ email, role }\`

### DELETE /api/teams/:teamId/members/:userId
移除团队成员

### POST /api/teams/:teamId/leave
退出团队

### POST /api/teams/join
加入团队（通过邀请码）

### GET /api/teams/:teamId/projects
获取团队项目列表

---

## 12. 分镜关联管理接口

### POST /api/storyboards/link-storyboard/:storyboardId/scenes
关联场景到分镜

### POST /api/storyboards/auto-generate-by-scene/:scriptId
按场景自动生成分镜

### GET /api/storyboards/preview-scenes/:scriptId
预览剧本的场景列表

---

## 13. 其他接口

### 内部邮件系统
- \`GET /api/mail\` - 获取邮件列表
- \`POST /api/mail\` - 发送邮件
- \`PUT /api/mail/:id/read\` - 标记已读

### 用户反馈
- \`POST /api/feedback\` - 提交反馈
- \`GET /api/feedback\` - 获取反馈列表（管理员）

### 模板库
- \`GET /api/templates\` - 获取模板列表
- \`GET /api/templates/:id\` - 获取模板详情
- \`POST /api/templates\` - 创建模板
- \`POST /api/templates/:id/use\` - 使用模板创建项目

### 社区
- \`GET /api/community/works\` - 获取社区作品列表
- \`POST /api/community/works\` - 发布作品到社区
- \`POST /api/community/works/:id/like\` - 点赞
- \`POST /api/community/works/:id/comment\` - 评论

### 订阅管理
- \`GET /api/subscriptions/plans\` - 获取订阅计划
- \`POST /api/subscriptions/subscribe\` - 创建订阅

### 文件代理
- \`GET /api/files/*\` - 代理访问生成的文件资源

### AI 模型配置
- \`GET /api/ai-models\` - 获取可用AI模型列表
- \`GET /api/ai-models/config\` - 获取模型配置

### 系统配置
- \`GET /api/system-configs\` - 获取系统配置
- \`PUT /api/system-configs\` - 更新系统配置（管理员）

### 健康检查
- \`GET /api/health\` - 服务健康状态 -> \`{ status: "ok" }\`

---

## 14. WebSocket 实时通信

**连接地址：** \`ws://localhost:4002\`

用于实时推送工作流任务状态变更。连接后，系统会自动推送当前用户关联的工作流进度更新。

---

## 15. 通用说明

### 认证
除 \`/api/auth/login\`、\`/api/auth/register\`、\`/api/health\` 外，所有接口均需携带 Bearer Token。

### 错误响应格式
\`\`\`json
{
  "message": "错误描述",
  "error": "详细错误信息（部分接口）"
}
\`\`\`

### 状态码
- \`200\` 成功
- \`400\` 参数错误
- \`401\` 未认证
- \`403\` 无权限
- \`404\` 资源不存在
- \`409\` 冲突（如任务已在执行中）
- \`500\` 服务器内部错误
`;

// ============ 扩展列表 ============

const EXTENSIONS: ExtensionItem[] = [
  {
    id: 'api-docs',
    title: '饺子动漫 API 接口文档',
    description: '项目完整API接口、工作流程及功能说明，方便第三方系统调用和集成',
    icon: <FileText className="w-6 h-6 text-blue-500" />,
    category: '开发者工具',
    version: '1.0.0',
    author: '饺子动画团队',
    content: API_DOC_CONTENT,
  },
];

// ============ 主组件 ============

const Extensions: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedExtension = EXTENSIONS.find(e => e.id === selectedId);

  const filteredExtensions = useMemo(() => {
    if (!searchQuery.trim()) return EXTENSIONS;
    const q = searchQuery.toLowerCase();
    return EXTENSIONS.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  return (
    <div className="flex h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-body)' }}>
      {/* 左侧扩展列表 */}
      <div className="w-80 flex-shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
        {/* 头部 */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <BookOpen className="w-5 h-5 text-blue-500" />
            扩展中心
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {EXTENSIONS.length} 个可用扩展
          </p>
          {/* 搜索框 */}
          <div className="mt-3 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="搜索扩展..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none focus:ring-1 focus:ring-blue-500"
              style={{
                backgroundColor: 'var(--bg-input, var(--bg-body))',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* 扩展列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredExtensions.map(ext => (
            <div
              key={ext.id}
              onClick={() => setSelectedId(ext.id)}
              className={`p-3 rounded-xl cursor-pointer transition-all duration-200 border ${
                selectedId === ext.id
                  ? 'border-blue-500/50 shadow-md'
                  : 'border-transparent hover:border-[var(--border-color)]'
              }`}
              style={{
                backgroundColor: selectedId === ext.id ? 'var(--accent-bg, rgba(59,130,246,0.08))' : 'transparent',
              }}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}>
                  {ext.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {ext.title}
                    </h3>
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                    {ext.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: 'rgb(59,130,246)' }}>
                      {ext.category}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      v{ext.version}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {selectedExtension ? (
          <div className="max-w-4xl mx-auto p-6 pb-20">
            {/* 文档头部 */}
            <div className="flex items-center gap-3 mb-6 pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <div className="p-2.5 rounded-xl" style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}>
                {selectedExtension.icon}
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {selectedExtension.title}
                </h1>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {selectedExtension.author} · v{selectedExtension.version}
                </p>
              </div>
              <button
                onClick={() => {
                  const blob = new Blob([selectedExtension.content], { type: 'text/markdown;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${selectedExtension.title}.md`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: 'rgba(59,130,246,0.1)',
                  color: 'rgb(59,130,246)',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.2)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.1)')}
                title="下载为 Markdown 文件"
              >
                <Download className="w-4 h-4" />
                下载文档
              </button>
            </div>
            {/* Markdown 内容 */}
            <MarkdownRenderer content={selectedExtension.content} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
            <ExternalLink className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-sm font-medium">选择左侧扩展查看详情</p>
            <p className="text-xs mt-1">点击扩展卡片即可打开文档</p>
          </div>
        )}
      </div>

      {/* Markdown 样式 */}
      <style>{`
        .md-h1 { font-size: 1.5rem; font-weight: 700; margin: 2rem 0 1rem; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; }
        .md-h2 { font-size: 1.25rem; font-weight: 700; margin: 1.8rem 0 0.8rem; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 0.4rem; }
        .md-h3 { font-size: 1.05rem; font-weight: 600; margin: 1.4rem 0 0.6rem; color: var(--text-primary); }
        .md-h4 { font-size: 0.95rem; font-weight: 600; margin: 1rem 0 0.5rem; color: var(--text-primary); }
        .md-p { font-size: 0.85rem; line-height: 1.7; margin: 0.4rem 0; color: var(--text-secondary, var(--text-primary)); }
        .md-hr { border: none; border-top: 1px solid var(--border-color); margin: 1.5rem 0; }
        .md-ul, .md-ol { padding-left: 1.5rem; margin: 0.5rem 0; }
        .md-li, .md-li-ordered { font-size: 0.85rem; line-height: 1.7; color: var(--text-secondary, var(--text-primary)); margin: 0.15rem 0; }
        .md-li::marker { color: var(--accent, #3b82f6); }
        .md-code-block { background: var(--bg-input, #1e1e2e); border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1rem; overflow-x: auto; margin: 0.8rem 0; }
        .md-code-block code { font-size: 0.8rem; line-height: 1.6; color: var(--text-primary); font-family: 'Fira Code', 'JetBrains Mono', monospace; }
        .md-inline-code { background: rgba(59,130,246,0.1); color: rgb(59,130,246); padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.8rem; font-family: 'Fira Code', monospace; }
        .md-table { width: 100%; border-collapse: collapse; margin: 0.8rem 0; font-size: 0.8rem; }
        .md-td { padding: 0.5rem 0.75rem; border: 1px solid var(--border-color); color: var(--text-secondary, var(--text-primary)); }
        .md-table tr:first-child .md-td { font-weight: 600; background: var(--bg-input, rgba(0,0,0,0.05)); color: var(--text-primary); }
      `}</style>
    </div>
  );
};

export default Extensions;
