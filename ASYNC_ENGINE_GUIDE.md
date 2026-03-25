+# 饺子动漫 异步引擎使用文档

本文档详细说明了饺子动漫项目中异步任务引擎的工作原理、任务定义方式以及前端使用方法。

---

## 目录

1. [异步引擎执行流程](#1-异步引擎执行流程)
2. [异步任务定义](#2-异步任务定义)
3. [前端异步任务使用](#3-前端异步任务使用)
4. [AI 响应字段系统](#4-ai-响应字段系统)
5. [异步轮询系统](#5-异步轮询系统)
6. [前端封装的轮询 Hook](#6-前端封装的轮询-hook)

---

## 1. 异步引擎执行流程

### 1.1 整体架构

```
前端发起请求 → 后端创建工作流 → 执行异步任务 → 轮询状态 → 获取结果
```

### 1.2 详细流程

#### **步骤 1: 前端发起工作流**

```typescript
// 前端调用 startWorkflow
import { startWorkflow } from '@/hooks/useWorkflow';

const { jobId } = await startWorkflow('character_views_generation', projectId, {
  characterId: 123,
  characterName: '张三',
  style: '动漫风格',
  modelName: 'FLUX.1'
});
```

#### **步骤 2: 后端创建工作流任务**

```javascript
// backend/src/nosyntask/engine.js
async startWorkflow(workflowType, userId, projectId, jobParams) {
  // 1. 查找工作流定义
  const definition = this.workflows[workflowType];
  
  // 2. 创建 workflow_jobs 记录
  const jobId = await execute(`
    INSERT INTO workflow_jobs (user_id, project_id, workflow_type, status, input_params)
    VALUES (?, ?, ?, 'pending', ?)
  `, [userId, projectId, workflowType, JSON.stringify(jobParams)]);
  
  // 3. 为每个步骤创建 generation_tasks 记录
  for (const step of definition.steps) {
    await execute(`
      INSERT INTO generation_tasks (job_id, step_index, user_id, project_id, task_type, target_type, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `, [jobId, stepIndex, userId, projectId, step.type, step.targetType]);
  }
  
  // 4. 立即执行第一个步骤
  await this.runNextStep(jobId);
  
  return { jobId, tasks };
}
```

#### **步骤 3: 执行异步任务**

```javascript
// backend/src/nosyntask/engine.js
async _executeTask(task, definition, jobParams) {
  // 1. 构建输入参数
  const input = definition.buildInput({ 
    jobParams, 
    userId: task.user_id, 
    projectId: task.project_id 
  });
  
  // 2. 调用任务处理器
  const result = await definition.handler(input, (progress) => {
    // 更新进度
    execute(`UPDATE generation_tasks SET progress = ? WHERE id = ?`, [progress, task.id]);
  });
  
  // 3. 保存结果
  await execute(`
    UPDATE generation_tasks 
    SET status = 'completed', result_data = ?, progress = 100 
    WHERE id = ?
  `, [JSON.stringify(result), task.id]);
}
```

#### **步骤 4: 前端轮询状态**

```typescript
// 前端使用 useWorkflow Hook 自动轮询
const { job, isRunning, isCompleted, isFailed } = useWorkflow(jobId, {
  onCompleted: (completedJob) => {
    console.log('任务完成:', completedJob);
    // 处理结果
  },
  onFailed: (failedJob) => {
    console.error('任务失败:', failedJob);
  }
});
```

### 1.3 数据库表结构

#### **workflow_jobs 表**
存储工作流任务的总体信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 工作流 ID |
| user_id | INT | 用户 ID |
| project_id | INT | 项目 ID |
| workflow_type | VARCHAR | 工作流类型 |
| status | ENUM | 状态：pending/running/completed/failed |
| input_params | JSON | 输入参数 |
| error_message | TEXT | 错误信息 |
| created_at | TIMESTAMP | 创建时间 |

#### **generation_tasks 表**
存储工作流中每个步骤的详细信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 任务 ID |
| job_id | INT | 所属工作流 ID |
| step_index | INT | 步骤索引 |
| task_type | VARCHAR | 任务类型 |
| target_type | VARCHAR | 目标类型 |
| status | ENUM | 状态：pending/running/completed/failed |
| progress | INT | 进度 0-100 |
| result_data | JSON | 结果数据 |
| error_message | TEXT | 错误信息 |

---

## 2. 异步任务定义

### 2.1 定义位置

所有工作流定义在：
```
backend/src/nosyntask/definitions.js
```

所有任务处理器在：
```
backend/src/nosyntask/tasks/
├── base/                    # 基础任务
│   ├── baseTextModelCall.js    # 统一文本模型调用
│   └── imageGeneration.js      # 图片生成
├── StoryBoard/              # 分镜相关任务
│   ├── storyboardGeneration.js      # 分镜生成
│   ├── characterExtraction.js       # 角色提取
│   ├── sceneExtraction.js           # 场景提取
│   ├── characterViewsGeneration.js  # 角色三视图生成
│   └── sceneImageGeneration.js      # 场景图片生成
├── frameGeneration.js       # 首尾帧生成
├── sceneVideoGeneration.js  # 视频生成
├── promptGenerate.js        # 提示词生成
└── index.js                 # 导出所有处理器
```

### 2.2 工作流定义格式

```javascript
// backend/src/nosyntask/definitions.js
module.exports = {
  workflows: {
    // 工作流名称
    character_views_generation: {
      name: '角色三视图生成',
      steps: [
        {
          type: 'character_views',           // 任务类型
          targetType: 'character',            // 目标类型
          handler: handleCharacterViewsGeneration,  // 处理器函数
          buildInput: (ctx) => ({             // 构建输入参数
            characterId: ctx.jobParams.characterId,
            characterName: ctx.jobParams.characterName,
            appearance: ctx.jobParams.appearance,
            style: ctx.jobParams.style,
            modelName: ctx.jobParams.modelName
          })
        }
      ]
    }
  }
};
```

### 2.3 任务处理器格式

```javascript
// backend/src/nosyntask/tasks/StoryBoard/characterViewsGeneration.js

/**
 * 角色三视图生成任务处理器
 * 
 * @param {Object} inputParams - 输入参数
 * @param {Function} onProgress - 进度回调函数 (0-100)
 * @returns {Object} 结果对象
 */
async function handleCharacterViewsGeneration(inputParams, onProgress) {
  const { characterId, characterName, appearance, style, modelName } = inputParams;
  
  // 报告初始进度
  if (onProgress) onProgress(5);
  
  // 1. 获取可用模型
  const textModels = await getTextModels();
  const imageModels = await getImageModels();
  
  if (onProgress) onProgress(10);
  
  // 2. 生成提示词（使用 AI）
  const promptResult = await handleBaseTextModelCall({
    prompt: `为角色"${characterName}"生成三视图提示词...`,
    modelName: textModel
  }, (p) => onProgress(10 + p * 0.2));
  
  if (onProgress) onProgress(30);
  
  // 3. 生成正面视图
  const frontViewResult = await handleImageGeneration({
    prompt: promptResult.frontPrompt,
    modelName: imageModel,
    width: 1024,
    height: 1024
  }, (p) => onProgress(30 + p * 0.2));
  
  if (onProgress) onProgress(50);
  
  // 4. 生成侧面视图
  const sideViewResult = await handleImageGeneration({
    prompt: promptResult.sidePrompt,
    modelName: imageModel,
    width: 1024,
    height: 1024
  }, (p) => onProgress(50 + p * 0.2));
  
  if (onProgress) onProgress(70);
  
  // 5. 生成背面视图
  const backViewResult = await handleImageGeneration({
    prompt: promptResult.backPrompt,
    modelName: imageModel,
    width: 1024,
    height: 1024
  }, (p) => onProgress(70 + p * 0.3));
  
  if (onProgress) onProgress(100);
  
  // 6. 返回结果
  return {
    frontViewUrl: frontViewResult.imageUrl,
    sideViewUrl: sideViewResult.imageUrl,
    backViewUrl: backViewResult.imageUrl,
    imageUrl: frontViewResult.imageUrl,  // 默认使用正面视图
    modelName: imageModel
  };
}

module.exports = handleCharacterViewsGeneration;
```

### 2.4 注册新任务

#### **步骤 1: 创建任务处理器**

在 `backend/src/nosyntask/tasks/` 下创建新文件。

#### **步骤 2: 导出处理器**

在 `backend/src/nosyntask/tasks/index.js` 中导出：

```javascript
const handleMyNewTask = require('./myNewTask');

module.exports = {
  handleMyNewTask,
  // ... 其他处理器
};
```

#### **步骤 3: 定义工作流**

在 `backend/src/nosyntask/definitions.js` 中添加：

```javascript
const { handleMyNewTask } = require('./tasks');

module.exports = {
  workflows: {
    my_new_workflow: {
      name: '我的新工作流',
      steps: [
        {
          type: 'my_task',
          targetType: 'my_target',
          handler: handleMyNewTask,
          buildInput: (ctx) => ({
            param1: ctx.jobParams.param1,
            param2: ctx.jobParams.param2
          })
        }
      ]
    }
  }
};
```

---

## 3. 前端异步任务使用

### 3.1 使用 startWorkflow 启动任务

```typescript
import { startWorkflow } from '@/hooks/useWorkflow';

// 启动工作流
const handleStartTask = async () => {
  try {
    const { jobId } = await startWorkflow(
      'character_views_generation',  // 工作流类型
      projectId,                      // 项目 ID
      {                               // 任务参数
        characterId: 123,
        characterName: '张三',
        style: '动漫风格',
        modelName: 'FLUX.1'
      }
    );
    
    console.log('任务已启动，jobId:', jobId);
    // 保存 jobId 用于轮询
    setGeneratingJobId(jobId);
  } catch (error) {
    console.error('启动任务失败:', error);
  }
};
```

### 3.2 使用 useWorkflow Hook 轮询状态

```typescript
import { useWorkflow, consumeWorkflow } from '@/hooks/useWorkflow';

const MyComponent = () => {
  const [jobId, setJobId] = useState<number | null>(null);
  
  // 轮询工作流状态
  const { job, isRunning, isCompleted, isFailed } = useWorkflow(jobId, {
    onCompleted: async (completedJob) => {
      console.log('任务完成:', completedJob);
      
      // 获取结果
      const task = completedJob.tasks?.[0];
      const result = task?.result_data;
      
      // 处理结果
      if (result) {
        console.log('生成的图片:', result.frontViewUrl);
      }
      
      // 标记工作流已消费
      await consumeWorkflow(completedJob.id);
      
      // 清空 jobId 停止轮询
      setJobId(null);
    },
    onFailed: async (failedJob) => {
      console.error('任务失败:', failedJob);
      alert('任务失败: ' + failedJob.error_message);
      
      // 标记工作流已消费
      await consumeWorkflow(failedJob.id);
      
      // 清空 jobId 停止轮询
      setJobId(null);
    }
  });
  
  return (
    <div>
      {isRunning && <p>生成中...进度: {job?.tasks?.[0]?.progress || 0}%</p>}
      {isCompleted && <p>生成完成！</p>}
      {isFailed && <p>生成失败！</p>}
    </div>
  );
};
```

### 3.3 使用 useTaskRunner Hook (简化版)

适用于需要同时跟踪多个任务的场景（如首尾帧生成）。

```typescript
import { useTaskRunner } from '@/hooks/useTaskRunner';

const MyComponent = () => {
  const { tasks, runTask, clearTask, isRunning } = useTaskRunner({
    projectId: currentProjectId
  });
  
  // 启动任务
  const handleGenerate = async (sceneId: number, prompt: string) => {
    try {
      await runTask(
        `img_${sceneId}`,        // 任务唯一标识
        'frame_generation',       // 工作流类型
        { prompt, width: 640, height: 360 }  // 参数
      );
    } catch (error) {
      console.error('生成失败:', error);
    }
  };
  
  // 监听任务完成
  useEffect(() => {
    for (const [key, task] of Object.entries(tasks)) {
      if (task.status === 'completed' && task.result) {
        console.log('任务完成:', key, task.result);
        // 处理结果
        clearTask(key);  // 清除任务状态
      }
    }
  }, [tasks]);
  
  return (
    <div>
      {isRunning && <p>有任务正在运行...</p>}
    </div>
  );
};
```

---

## 4. AI 响应字段系统

### 4.1 统一文本模型调用

所有 AI 文本生成统一使用 `baseTextModelCall`：

```javascript
// backend/src/nosyntask/tasks/base/baseTextModelCall.js

const handleBaseTextModelCall = async (inputParams, onProgress) => {
  const { prompt, modelName, temperature, maxTokens } = inputParams;
  
  // 1. 获取可用模型
  const models = await getTextModels();
  const targetModel = modelName || models[0]?.name || 'DeepSeek Chat';
  
  // 2. 调用 AI 模型
  const response = await callAIModel(targetModel, {
    messages: [{ role: 'user', content: prompt }],
    temperature: temperature || 0.7,
    max_tokens: maxTokens || 4000
  });
  
  // 3. 返回响应内容
  return {
    content: response.content,  // AI 返回的文本内容
    modelName: targetModel
  };
};
```

### 4.2 AI 响应字段标准化

#### **文本模型响应格式**

```javascript
// AI 模型返回的标准格式
{
  content: "AI 生成的文本内容",  // 主要内容
  text: "备用文本字段",          // 某些模型使用
  modelName: "DeepSeek Chat",    // 使用的模型名称
  usage: {                        // 使用统计（可选）
    prompt_tokens: 100,
    completion_tokens: 200,
    total_tokens: 300
  }
}
```

#### **图片模型响应格式**

```javascript
// 同步模型响应
{
  image_url: "https://...",      // 图片 URL
  imageUrl: "https://...",       // 备用字段
  url: "https://...",            // 备用字段
  modelName: "FLUX.1"
}

// 异步模型响应（提交阶段）
{
  task_id: "abc123",             // 任务 ID
  status: "pending",             // 任务状态
  modelName: "FLUX.1"
}

// 异步模型响应（查询阶段）
{
  status: "completed",           // completed/failed/processing
  progress: 80,                  // 进度 0-100
  result: {
    image_url: "https://...",
    imageUrl: "https://..."
  },
  error: "错误信息"              // 失败时的错误
}
```

#### **视频模型响应格式**

```javascript
// 同步模型响应
{
  video_url: "https://...",      // 视频 URL
  videoUrl: "https://...",       // 备用字段
  url: "https://...",            // 备用字段
  modelName: "sora2-new"
}

// 异步模型响应（类似图片模型）
{
  task_id: "xyz789",
  status: "pending",
  modelName: "sora2-new"
}
```

### 4.3 JSON 响应修复系统

当 AI 返回的 JSON 格式不完整时，自动调用修复任务：

```javascript
// backend/src/nosyntask/tasks/StoryBoard/storyboardGeneration.js

// 尝试解析 JSON
let parsedData;
try {
  parsedData = JSON.parse(response.content);
} catch (parseError) {
  console.warn('[StoryboardGen] JSON 解析失败，尝试修复...');
  
  // 调用 JSON 修复任务
  const repairResult = await handleRepairJsonResponse({
    brokenJson: response.content,
    modelName: textModel
  });
  
  // 使用修复后的 JSON
  parsedData = repairResult.repairedData;
}
```

### 4.4 响应字段提取工具函数

```javascript
/**
 * 从 AI 响应中提取文本内容
 */
function extractTextContent(response) {
  return response.content || response.text || '';
}

/**
 * 从 AI 响应中提取图片 URL
 */
function extractImageUrl(response) {
  return response.image_url || response.imageUrl || response.url || null;
}

/**
 * 从 AI 响应中提取视频 URL
 */
function extractVideoUrl(response) {
  return response.video_url || response.videoUrl || response.url || null;
}

/**
 * 从 AI 响应中提取 JSON 数据
 */
function extractJsonData(response) {
  const content = extractTextContent(response);
  
  if (typeof content === 'string' && content.trim().startsWith('{')) {
    try {
      return JSON.parse(content);
    } catch (error) {
      console.error('JSON 解析失败:', error);
      return null;
    }
  }
  
  return content;
}
```

---

## 5. 异步轮询系统

### 5.1 后端轮询机制 (submitAndPoll)

用于处理异步 AI 模型（如图片生成、视频生成）：

```javascript
// backend/src/nosyntask/tasks/pollUtils.js

/**
 * 提交任务并轮询结果
 * @param {string} modelName - 模型名称
 * @param {Object} params - 模型参数
 * @param {Object} options - 轮询选项
 * @returns {Object} 最终结果
 */
async function submitAndPoll(modelName, params, options = {}) {
  const {
    intervalMs = 3000,        // 轮询间隔（毫秒）
    maxDurationMs = 300000,   // 最大等待时间（5分钟）
    onProgress,               // 进度回调
    progressStart = 0,        // 进度起始值
    progressEnd = 100,        // 进度结束值
    logTag = 'Poll'           // 日志标签
  } = options;
  
  console.log(`[${logTag}] 提交任务到模型: ${modelName}`);
  
  // 1. 提交任务
  const submitResult = await callAIModel(modelName, params);
  
  // 2. 如果是同步模型，直接返回
  if (submitResult.image_url || submitResult.video_url || submitResult.imageUrl || submitResult.videoUrl) {
    console.log(`[${logTag}] 同步模型，直接返回结果`);
    return submitResult;
  }
  
  // 3. 异步模型，获取任务 ID
  const taskId = submitResult.task_id;
  if (!taskId) {
    throw new Error('未获取到任务 ID');
  }
  
  console.log(`[${logTag}] 异步任务已提交，task_id: ${taskId}`);
  
  // 4. 开始轮询
  const startTime = Date.now();
  let attempts = 0;
  
  while (true) {
    attempts++;
    await sleep(intervalMs);
    
    console.log(`[${logTag}] 轮询第 ${attempts} 次，task_id: ${taskId}`);
    
    // 查询任务状态
    const status = await queryAIModel(taskId);
    
    // 更新进度
    if (onProgress && status.progress !== undefined) {
      const progress = progressStart + (progressEnd - progressStart) * status.progress / 100;
      onProgress(Math.floor(progress));
    }
    
    // 任务完成
    if (status.status === 'completed') {
      console.log(`[${logTag}] ✅ 任务完成`);
      return status.result || status;
    }
    
    // 任务失败
    if (status.status === 'failed') {
      const error = status.error || '任务失败';
      console.error(`[${logTag}] ❌ 任务失败:`, error);
      throw new Error(error);
    }
    
    // 超时检查
    const elapsed = Date.now() - startTime;
    if (elapsed > maxDurationMs) {
      console.error(`[${logTag}] ⏱️ 任务超时 (${elapsed}ms)`);
      throw new Error(`任务超时，已等待 ${Math.floor(elapsed / 1000)} 秒`);
    }
    
    console.log(`[${logTag}] 任务进行中，状态: ${status.status}, 进度: ${status.progress || 0}%`);
  }
}

/**
 * 睡眠函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { submitAndPoll };
```

### 5.2 前端轮询机制 (useWorkflow)

```typescript
// hooks/useWorkflow.ts

export function useWorkflow(
  jobId: number | null,
  callbacks?: {
    onCompleted?: (job: WorkflowJob) => void;
    onFailed?: (job: WorkflowJob) => void;
  }
) {
  const [job, setJob] = useState<WorkflowJob | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  
  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setIsRunning(false);
      setIsCompleted(false);
      setIsFailed(false);
      return;
    }
    
    let timer: NodeJS.Timeout;
    let isMounted = true;
    
    // 轮询函数
    const poll = async () => {
      try {
        const status = await getWorkflowStatus(jobId);
        
        if (!isMounted) return;
        
        setJob(status);
        setIsRunning(status.status === 'running' || status.status === 'pending');
        setIsCompleted(status.status === 'completed');
        setIsFailed(status.status === 'failed');
        
        // 任务完成
        if (status.status === 'completed') {
          console.log('[useWorkflow] 任务完成:', status);
          callbacks?.onCompleted?.(status);
          return true;  // 停止轮询
        }
        
        // 任务失败
        if (status.status === 'failed') {
          console.error('[useWorkflow] 任务失败:', status);
          callbacks?.onFailed?.(status);
          return true;  // 停止轮询
        }
        
        return false;  // 继续轮询
      } catch (error) {
        console.error('[useWorkflow] 轮询失败:', error);
        return false;
      }
    };
    
    // 立即执行一次
    poll().then(shouldStop => {
      if (shouldStop || !isMounted) return;
      
      // 设置定时轮询（每 2 秒）
      timer = setInterval(async () => {
        const shouldStop = await poll();
        if (shouldStop) {
          clearInterval(timer);
        }
      }, 2000);
    });
    
    // 清理函数
    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [jobId]);
  
  return {
    job,
    isRunning,
    isCompleted,
    isFailed
  };
}
```

### 5.3 工作流恢复机制

当用户刷新页面时，自动恢复未完成的工作流：

```typescript
// views/StoryBoard/hooks/useCharacterViewsGeneration.ts

// 检查并恢复活跃工作流
const checkAndResumeNextWorkflow = async () => {
  if (!projectId || !isActive) {
    console.log('[useCharacterViewsGeneration] 页面未激活或无 projectId，跳过检查');
    return;
  }
  
  try {
    console.log('[useCharacterViewsGeneration] 检查项目的三视图生成工作流...');
    const { getActiveWorkflows } = await import('../../../hooks/useWorkflow');
    const { jobs } = await getActiveWorkflows(projectId);
    
    if (jobs && jobs.length > 0) {
      // 只处理角色三视图生成的工作流
      const viewsJob = jobs.find((j: any) => j.workflow_type === 'character_views_generation');
      
      if (viewsJob) {
        console.log('[useCharacterViewsGeneration] 发现三视图生成工作流:', viewsJob);
        setGeneratingJobId(viewsJob.id);
        setIsGenerating(true);
      } else {
        console.log('[useCharacterViewsGeneration] 没有三视图生成工作流');
        setGeneratingJobId(null);
        setIsGenerating(false);
      }
    } else {
      console.log('[useCharacterViewsGeneration] 没有活跃工作流');
      setGeneratingJobId(null);
      setIsGenerating(false);
    }
  } catch (error) {
    console.error('[useCharacterViewsGeneration] 检查活跃工作流失败:', error);
  }
};

// 页面加载时检查是否有未完成的工作流
useEffect(() => {
  if (isActive) {
    checkAndResumeNextWorkflow();
  }
}, [projectId, isActive]);
```

---

## 6. 前端封装的轮询 Hook

### 6.1 useWorkflow

**位置：** `hooks/useWorkflow.ts`

**用途：** 通用工作流轮询 Hook

**API：**

```typescript
function useWorkflow(
  jobId: number | null,
  callbacks?: {
    onCompleted?: (job: WorkflowJob) => void;
    onFailed?: (job: WorkflowJob) => void;
  }
): {
  job: WorkflowJob | null;
  isRunning: boolean;
  isCompleted: boolean;
  isFailed: boolean;
}
```

**使用示例：**

```typescript
import { useWorkflow, consumeWorkflow } from '@/hooks/useWorkflow';

const { job, isRunning, isCompleted, isFailed } = useWorkflow(jobId, {
  onCompleted: async (completedJob) => {
    // 处理完成
    console.log('任务完成:', completedJob);
    await consumeWorkflow(completedJob.id);
  },
  onFailed: async (failedJob) => {
    // 处理失败
    console.error('任务失败:', failedJob);
    await consumeWorkflow(failedJob.id);
  }
});

// 显示进度
const progress = job?.tasks?.[0]?.progress || 0;
```

### 6.2 useTaskRunner

**位置：** `hooks/useTaskRunner.ts`

**用途：** 简化的任务执行和轮询 Hook，支持同时跟踪多个任务

**API：**

```typescript
function useTaskRunner(options?: {
  interval?: number;      // 轮询间隔，默认 2000ms
  projectId?: number;     // 项目 ID，默认 0
}): {
  tasks: Record<string, TaskState>;
  runTask: (key: string, workflowType: string, params: Record<string, any>) => Promise<number>;
  clearTask: (key: string) => void;
  stopPolling: (key: string) => void;
  isRunning: boolean;
}

interface TaskState {
  jobId: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  result: any | null;
  error: string | null;
}
```

**使用示例：**

```typescript
import { useTaskRunner } from '@/hooks/useTaskRunner';

const { tasks, runTask, clearTask, isRunning } = useTaskRunner({
  projectId: currentProjectId
});

// 启动任务
await runTask('scene_123', 'frame_generation', { 
  prompt: '一个美丽的场景',
  width: 640,
  height: 360
});

// 读取任务状态
const task = tasks['scene_123'];
if (task) {
  console.log('状态:', task.status);
  console.log('进度:', task.progress);
  console.log('结果:', task.result);
}

// 监听任务完成
useEffect(() => {
  for (const [key, task] of Object.entries(tasks)) {
    if (task.status === 'completed' && task.result) {
      console.log('任务完成:', key, task.result);
      clearTask(key);
    }
  }
}, [tasks]);
```

### 6.3 useCharacterViewsGeneration

**位置：** `views/StoryBoard/hooks/useCharacterViewsGeneration.ts`

**用途：** 角色三视图生成专用 Hook

**特性：**
- 自动轮询工作流状态
- 页面刷新后自动恢复
- 支持多个角色同时生成
- 自动消费完成的工作流

**API：**

```typescript
function useCharacterViewsGeneration(props: {
  characterId: string | null;
  projectId: number | null;
  isActive: boolean;
  onComplete: () => void;
}): {
  isGenerating: boolean;
  generatingJobId: number | null;
  job: WorkflowJob | null;
  isRunning: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  checkAndResumeNextWorkflow: () => Promise<void>;
}
```

**使用示例：**

```typescript
import { useCharacterViewsGeneration } from './hooks/useCharacterViewsGeneration';

const characterViews = useCharacterViewsGeneration({
  characterId: selectedCharacter?.id?.toString() || null,
  projectId: currentProjectId,
  isActive: isModalOpen,  // 只在模态框打开时轮询
  onComplete: () => {
    // 刷新角色数据
    loadCharacters();
  }
});

// 使用状态
{characterViews.isGenerating && <p>生成中...</p>}
{characterViews.job && <p>进度: {characterViews.job.tasks?.[0]?.progress}%</p>}
```

### 6.4 useSceneImageGeneration

**位置：** `views/StoryBoard/hooks/useSceneImageGeneration.ts`

**用途：** 场景图片生成专用 Hook

**特性：**
- 跟踪正在生成的场景 ID (`generatingSceneId`)
- 自动轮询工作流状态
- 页面刷新后自动恢复
- 支持多个场景同时生成

**API：**

```typescript
function useSceneImageGeneration(props: {
  sceneId: string | null;
  projectId: number | null;
  isActive: boolean;
  onComplete: () => void;
}): {
  isGenerating: boolean;
  generatingJobId: number | null;
  generatingSceneId: string | null;  // 正在生成的场景 ID
  job: WorkflowJob | null;
  isRunning: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  checkAndResumeNextWorkflow: () => Promise<void>;
}
```

**使用示例：**

```typescript
import { useSceneImageGeneration } from './hooks/useSceneImageGeneration';

// 在 StoryBoard 主界面创建 Hook
const sceneImageGen = useSceneImageGeneration({
  sceneId: null,  // 不限定特定场景
  projectId: currentProjectId,
  isActive: true,  // 在 StoryBoard 界面始终轮询
  onComplete: () => {
    loadScenes();
  }
});

// 传递给子组件
<ResourcePanel sceneImageGeneration={sceneImageGen} />

// 在子组件中判断特定场景是否正在生成
const isGenerating = sceneImageGeneration?.generatingSceneId === sceneId.toString();
```

### 6.5 useCharacterExtraction

**位置：** `views/StoryBoard/hooks/useCharacterExtraction.ts`

**用途：** 角色提取专用 Hook

**API：**

```typescript
function useCharacterExtraction(props: {
  projectId: number | null;
  scriptId: number | null;
  scenes: any[];
  isActive: boolean;
  onCompleted: () => void;
}): {
  isExtracting: boolean;
  extractionProgress: number;
  startExtraction: () => Promise<void>;
}
```

**使用示例：**

```typescript
import { useCharacterExtraction } from './hooks/useCharacterExtraction';

const characterExtraction = useCharacterExtraction({
  projectId: currentProjectId,
  scriptId: currentScriptId,
  scenes: scenes,
  isActive: true,
  onCompleted: () => {
    console.log('角色提取完成');
  }
});

// 启动提取
<Button onClick={() => characterExtraction.startExtraction()}>
  提取角色
</Button>

// 显示状态
{characterExtraction.isExtracting && (
  <p>提取中...{characterExtraction.extractionProgress}%</p>
)}
```

### 6.6 useSceneExtraction

**位置：** `views/StoryBoard/hooks/useSceneExtraction.ts`

**用途：** 场景提取专用 Hook

**API：**

```typescript
function useSceneExtraction(props: {
  projectId: number | null;
  scriptId: number | null;
  scenes: any[];
  isActive: boolean;
  onCompleted: () => void;
}): {
  isExtracting: boolean;
  extractionProgress: number;
  startExtraction: () => Promise<void>;
}
```

**使用示例：**

```typescript
import { useSceneExtraction } from './hooks/useSceneExtraction';

const sceneExtraction = useSceneExtraction({
  projectId: currentProjectId,
  scriptId: currentScriptId,
  scenes: scenes,
  isActive: true,
  onCompleted: () => {
    console.log('场景提取完成');
  }
});

// 启动提取
<Button onClick={() => sceneExtraction.startExtraction()}>
  提取场景
</Button>

// 显示状态
{sceneExtraction.isExtracting && (
  <p>提取中...{sceneExtraction.extractionProgress}%</p>
)}
```

---

## 7. 最佳实践

### 7.1 任务设计原则

1. **单一职责**：每个任务处理器只做一件事
2. **进度报告**：及时调用 `onProgress` 更新进度
3. **错误处理**：使用 try-catch 捕获错误并抛出有意义的错误信息
4. **资源清理**：任务完成后清理临时资源
5. **幂等性**：任务应该可以安全地重试

### 7.2 轮询优化

1. **按需轮询**：使用 `isActive` 参数控制轮询时机
2. **及时消费**：任务完成后调用 `consumeWorkflow` 标记已消费
3. **错误恢复**：页面刷新后自动恢复未完成的工作流
4. **避免重复**：同一类型的工作流不要重复创建

### 7.3 前端集成

1. **集中管理**：在父组件创建 Hook，传递给子组件
2. **状态同步**：使用 `onComplete` 回调刷新数据
3. **用户反馈**：显示进度条和状态信息
4. **错误提示**：使用 alert 或 toast 提示错误

---

## 8. 常见问题

### Q1: 如何调试异步任务？

**A:** 查看后端日志，每个任务都有详细的日志输出：

```bash
# 查看工作流引擎日志
[WorkflowEngine] 开始执行工作流...
[TaskHandler] 任务开始执行...
[TaskHandler] 任务完成

# 查看具体任务日志
[FrameGen] 开始生成首帧...
[PromptGenerate] 生成提示词完成
```

### Q2: 任务失败如何重试？

**A:** 重新调用 `startWorkflow` 即可：

```typescript
const handleRetry = async () => {
  await consumeWorkflow(failedJobId);  // 先消费失败的工作流
  const { jobId } = await startWorkflow(workflowType, projectId, params);
  setGeneratingJobId(jobId);
};
```

### Q3: 如何处理长时间运行的任务？

**A:** 使用后端轮询机制 `submitAndPoll`，设置合理的超时时间：

```javascript
const result = await submitAndPoll(modelName, params, {
  intervalMs: 5000,        // 5秒轮询一次
  maxDurationMs: 600000,   // 最多等待10分钟
  onProgress: (p) => console.log('进度:', p)
});
```

### Q4: 如何避免重复创建工作流？

**A:** 在创建前检查是否有活跃的工作流：

```typescript
const handleGenerate = async () => {
  // 检查是否已有活跃工作流
  const { jobs } = await getActiveWorkflows(projectId);
  const existingJob = jobs.find(j => j.workflow_type === 'my_workflow');
  
  if (existingJob) {
    console.log('已有工作流在运行:', existingJob.id);
    setGeneratingJobId(existingJob.id);
    return;
  }
  
  // 创建新工作流
  const { jobId } = await startWorkflow('my_workflow', projectId, params);
  setGeneratingJobId(jobId);
};
```

---

## 9. 附录

### 9.1 完整的工作流类型列表

| 工作流类型 | 说明 | 位置 |
|-----------|------|------|
| `storyboard_generation` | 分镜生成 | `tasks/StoryBoard/storyboardGeneration.js` |
| `character_extraction` | 角色提取 | `tasks/StoryBoard/characterExtraction.js` |
| `scene_extraction` | 场景提取 | `tasks/StoryBoard/sceneExtraction.js` |
| `character_views_generation` | 角色三视图生成 | `tasks/StoryBoard/characterViewsGeneration.js` |
| `scene_image_generation` | 场景图片生成 | `tasks/StoryBoard/sceneImageGeneration.js` |
| `frame_generation` | 首尾帧生成 | `tasks/frameGeneration.js` |
| `scene_video` | 视频生成 | `tasks/sceneVideoGeneration.js` |
| `prompt_generate` | 提示词生成 | `tasks/promptGenerate.js` |

### 9.2 相关文件索引

**后端文件：**
- `backend/src/nosyntask/engine.js` - 工作流引擎
- `backend/src/nosyntask/definitions.js` - 工作流定义
- `backend/src/nosyntask/routes.js` - API 路由
- `backend/src/nosyntask/tasks/` - 任务处理器目录
- `backend/src/nosyntask/tasks/pollUtils.js` - 轮询工具

**前端文件：**
- `hooks/useWorkflow.ts` - 通用工作流 Hook
- `hooks/useTaskRunner.ts` - 任务执行 Hook
- `views/StoryBoard/hooks/` - 分镜相关 Hook 目录

---

**文档版本：** 1.0  
**最后更新：** 2026-02-07  
**维护者：** Jiaozi Anime Team
