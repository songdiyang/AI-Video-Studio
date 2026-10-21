---
name: prompt-map
description: 快速定位 nanostory 项目中所有 AI 提示词（prompt）的存放位置。包括剧本生成、分镜生成、提示词优化、运镜生成、帧生成等模块的提示词文件路径与核心内容映射。当需要查找、修改或审查任何 AI 提示词时使用。
---

# 提示词地图 (Prompt Map)

## 项目路径前缀

所有路径相对于：`backend/src/nosyntask/tasks/`

---

## 一、剧本生成 (Script Generation)

| 文件 | 路径 | 说明 |
|------|------|------|
| scriptGeneration.js | `StoryStudio/scriptGeneration.js` | 一键生成专业剧本的核心提示词 |

**提示词结构：**

```
第 181-213 行: System Prompt（剧本创作助手 + 输出格式规范）
第 153-177 行: User Prompt
  ├── 第 1 集（第 155 行）: 基于标题/故事概述/风格/场景数量要求创作
  └── 续集（第 165 行）: 带前情回顾，延续人物设定和剧情
```

**依赖的外部设置：**
- `getStoryStyle()` → 叙事风格（工程设置页）
- `getNarrativePerspective()` → 拍摄视角
- `storyConstraints` → 创作约束字段
- `getSceneConfig()` → 场景数量配置（短篇/中篇/长篇）

**输出格式要求**（第 187-211 行）：
- 场景标题: `## 场景X：场景名称`
- 场景描述: `*斜体*`
- 角色对白: `**角色名**："对白"`
- 动作指示: `（圆括号）`
- 场景转换: `---`

---

## 二、批量分镜生成 (Batch Storyboard Generation)

| 文件 | 路径 | 说明 |
|------|------|------|
| batchStoryboardGeneration.js | `StoryBoard/batchStoryboardGeneration.js` | 直接生成分镜的核心提示词 |

**核心提示词**（第 214-260 行，`generateSceneStoryboard()` 函数）：

```
你是一个分镜师，将场景内容转化为分镜。

**核心原则：忠实于场景内容**
- 不添加场景中没有的情节、对话或角色
- 描述简洁明了，避免过度艺术加工

输出 JSON 格式，字段包括：
  order, shotType, description, hasAction, startFrame, endFrame,
  endState, dialogue, duration, characters, location, emotion, cameraMovement
```

**关键参数**（第 352-359 行）：
- `scriptId` — 剧本 ID
- `textModel` — 文本模型名称
- `clearExisting` — 是否清理旧分镜
- `think` — 是否启用 thinking 模式

**并发控制**（第 430 行）：默认 3 路并行，每个场景独立调用 AI

---

## 三、分镜描述优化 (Prompt Optimization)

### 3.1 通用优化（兼容模式）

| 文件 | 路径 | 说明 |
|------|------|------|
| singlePromptOptimization.js | `StoryBoard/singlePromptOptimization.js` | 单个分镜描述优化 |
| batchPromptOptimization.js | `StoryBoard/batchPromptOptimization.js` | 批量分镜描述优化 |

### 3.2 图片模型优化

| 文件 | 路径 | 说明 |
|------|------|------|
| singleImagePromptOptimization.js | `StoryBoard/singleImagePromptOptimization.js` | 单个分镜 → 图片生成提示词 |
| batchImagePromptOptimization.js | `StoryBoard/batchImagePromptOptimization.js` | 批量分镜 → 图片生成提示词 |

**System Prompt 示例**（`batchImagePromptOptimization.js` 第 135-160 行）：
```
你是一个专业的分镜描述优化专家，专门为静态图像生成模型优化提示词。

【输出要求 - 正向提示词】
• 重点描述静态视觉元素：构图、光影、色彩、景深、材质质感
• 不要包含运动、时间变化、帧率、运镜相关描述

【输出要求 - 反向提示词（Negative Prompt）】
• 排除低质量、模糊、变形、多余肢体、水印、文字、签名

输出 JSON: {"positive": "...", "negative": "..."}
```

### 3.3 视频模型优化

| 文件 | 路径 | 说明 |
|------|------|------|
| singleVideoPromptOptimization.js | `StoryBoard/singleVideoPromptOptimization.js` | 单个分镜 → 视频生成提示词 |
| batchVideoPromptOptimization.js | `StoryBoard/batchVideoPromptOptimization.js` | 批量分镜 → 视频生成提示词 |

**优化原则**（`singleVideoPromptOptimization.js` 第 208-223 行）：
- 真人实拍视频优化原则（4 条）
- 基础画面要素：构图、透视、景别、焦点、镜头、快门角度、色彩
- 动态要素：运动、运镜、时间、帧率说明

---

## 四、运镜生成 (Camera Movement Generation)

| 文件 | 路径 | 说明 |
|------|------|------|
| cameraRunGeneration.js | `StoryBoard/cameraRunGeneration.js` | 精细运镜提示词生成 |

**关键输入变量**（第 126-144 行）：
- `description` → 分镜 `prompt_template`
- `hasAction`, `shotType`, `emotion`, `cameraMovement`
- `startFrame`, `endFrame`, `dialogues`, `duration`
- `firstFrameUrl`, `lastFrameUrl` → 首尾帧参考图

---

## 五、帧生成 (Frame Generation)

| 文件 | 路径 | 说明 |
|------|------|------|
| frameGeneration.js | `StoryBoard/frameGeneration.js` | 首尾帧提示词生成 |
| batchFrameGeneration.js | `StoryBoard/batchFrameGeneration.js` | 批量帧生成调度 |
| independentFrameGeneration.js | `StoryBoard/independentFrameGeneration.js` | 独立帧生成 |

**`frameGeneration.js` 关键参数**（第 458-459 行）：
- `storyboardId`, `prompt`, `imageModel`, `textModel`
- `aspectRatio`, `resolution`, `visualStyle`

---

## 六、完整文件目录树

```
backend/src/nosyntask/tasks/
├── StoryStudio/
│   └── scriptGeneration.js           ← 一键生成剧本
└── StoryBoard/
    ├── batchStoryboardGeneration.js  ← 批量生成分镜
    ├── singlePromptOptimization.js   ← 单分镜优化（通用）
    ├── batchPromptOptimization.js    ← 批量分镜优化（通用）
    ├── singleImagePromptOptimization.js  ← 单分镜图片优化
    ├── batchImagePromptOptimization.js   ← 批量分镜图片优化
    ├── singleVideoPromptOptimization.js  ← 单分镜视频优化
    ├── batchVideoPromptOptimization.js   ← 批量分镜视频优化
    ├── cameraRunGeneration.js        ← 运镜生成
    ├── frameGeneration.js            ← 帧生成
    ├── batchFrameGeneration.js       ← 批量帧生成
    ├── independentFrameGeneration.js ← 独立帧生成
    ├── hdRepairGeneration.js         ← 高清修复
    └── analyzeActionType.js          ← 动作类型智能分析
```

---

## 七、快速查找指南

| 你要找什么 | 去哪个文件 |
|-----------|-----------|
| 剧本生成 System/User Prompt | `StoryStudio/scriptGeneration.js` L181-213 / L153-177 |
| 分镜生成 Prompt | `StoryBoard/batchStoryboardGeneration.js` L214-260 |
| 分镜描述优化（通用） | `StoryBoard/singlePromptOptimization.js` |
| 图片模型 Prompt 优化 | `StoryBoard/batchImagePromptOptimization.js` |
| 视频模型 Prompt 优化 | `StoryBoard/singleVideoPromptOptimization.js` / `batchVideoPromptOptimization.js` |
| 运镜 Prompt | `StoryBoard/cameraRunGeneration.js` |
| 首尾帧 Prompt | `StoryBoard/frameGeneration.js` |
| 场景数量配置规则 | `StoryStudio/scriptGeneration.js` L17-24 |
| 动作类型分析 | `StoryBoard/analyzeActionType.js` |
