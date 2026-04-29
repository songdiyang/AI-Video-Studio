/**
 * AI 助手工具注册表
 *
 * 将 nosyntask 的 workflow 定义包装成 AI 可调用的工具(function calling)。
 *
 * 职责：
 * - 向 LLM 暴露工具 schema（JSON Schema for function calling）
 * - 接收 LLM 返回的 tool_call（name + args），启动对应子 workflow
 * - 子 workflow 通过 parent_job_id 关联到 AI 助手主 workflow
 * - 统一入口做参数校验，未知工具/非法参数直接拒绝
 */

const workflowEngine = require('../../nosyntask/engine');

/**
 * 工具定义数组
 * 每个工具：
 *   - name:         LLM 使用的名字
 *   - description:  给 LLM 的说明
 *   - parameters:   JSON Schema，用于 function calling
 *   - workflowType: 对应 nosyntask 工作流
 *   - buildJobParams(args, ctx): 将 LLM 参数映射为 workflow jobParams
 *   - buildProjectId(args, ctx): 取 projectId（默认 ctx.projectId）
 */
const TOOLS = [
  {
    name: 'generate_character_views',
    description: '为指定角色生成白膜三视图（正面/侧面/背面）。适用于项目已有角色，需要生成或重新生成外观视图的场景。',
    parameters: {
      type: 'object',
      properties: {
        characterId: { type: 'number', description: '角色 ID（必填）' },
        imageModel: { type: 'string', description: '图片生成模型名称，若未指定使用项目默认' }
      },
      required: ['characterId']
    },
    workflowType: 'character_views_generation',
    buildJobParams: (args, ctx) => ({
      characterId: args.characterId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },

  {
    name: 'generate_scene_image',
    description: '为指定场景生成场景图片。适用于需要为已有场景生成视觉表现的场景。',
    parameters: {
      type: 'object',
      properties: {
        sceneId: { type: 'number', description: '场景 ID（必填）' },
        imageModel: { type: 'string', description: '图片生成模型名称' }
      },
      required: ['sceneId']
    },
    workflowType: 'scene_image_generation',
    buildJobParams: (args, ctx) => ({
      sceneId: args.sceneId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },

  {
    name: 'generate_storyboards_batch',
    description: '为指定剧本批量生成分镜。输入剧本 ID，系统会把剧本按场景拆分并为每个场景生成分镜。',
    parameters: {
      type: 'object',
      properties: {
        scriptId: { type: 'number', description: '剧本 ID（必填）' },
        textModel: { type: 'string', description: '文本模型名称' }
      },
      required: ['scriptId']
    },
    workflowType: 'batch_storyboard_generation',
    buildJobParams: (args, ctx) => ({
      scriptId: args.scriptId,
      textModel: args.textModel || ctx.defaultTextModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },

  {
    name: 'generate_frames_batch',
    description: '为指定剧本的所有分镜批量生成首尾帧图片。前置：已完成分镜生成。',
    parameters: {
      type: 'object',
      properties: {
        scriptId: { type: 'number', description: '剧本 ID（必填）' },
        imageModel: { type: 'string', description: '图片模型名称' }
      },
      required: ['scriptId']
    },
    workflowType: 'batch_frame_generation',
    buildJobParams: (args, ctx) => ({
      scriptId: args.scriptId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },

  {
    name: 'optimize_storyboard_prompts',
    description: '批量优化指定剧本下所有分镜的提示词（图片或视频类型）。',
    parameters: {
      type: 'object',
      properties: {
        scriptId: { type: 'number', description: '剧本 ID（必填）' },
        targetType: {
          type: 'string',
          enum: ['image', 'video'],
          description: '优化目标：image=图片提示词，video=视频提示词'
        },
        textModel: { type: 'string', description: '文本模型' }
      },
      required: ['scriptId', 'targetType']
    },
    workflowType: 'batch_prompt_optimization',
    buildJobParams: (args, ctx) => ({
      scriptId: args.scriptId,
      targetType: args.targetType,
      textModel: args.textModel || ctx.defaultTextModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  }
];

const TOOL_MAP = new Map(TOOLS.map(t => [t.name, t]));

/**
 * 生成 OpenAI/DeepSeek function calling 兼容的 tools schema
 * @param {object} scope - 作用域过滤（预留）
 */
function getToolsSchema(scope = {}) {
  return TOOLS.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

/**
 * 列出所有工具的元数据（供前端展示）
 */
function listTools() {
  return TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    workflowType: tool.workflowType
  }));
}

/**
 * 校验 LLM 返回的工具调用参数
 * @returns { valid: boolean, tool, args, error }
 */
function validateToolCall(toolName, rawArgs) {
  const tool = TOOL_MAP.get(toolName);
  if (!tool) {
    return { valid: false, error: `未知工具: ${toolName}` };
  }

  let args;
  if (typeof rawArgs === 'string') {
    try { args = JSON.parse(rawArgs); } catch (e) {
      return { valid: false, tool, error: `参数不是合法 JSON: ${e.message}` };
    }
  } else if (typeof rawArgs === 'object' && rawArgs !== null) {
    args = rawArgs;
  } else {
    return { valid: false, tool, error: '参数必须是对象或 JSON 字符串' };
  }

  // 简单必填校验（不做完整 JSON Schema 校验，留给子 workflow 的 contract 做）
  const required = tool.parameters.required || [];
  for (const field of required) {
    if (args[field] === undefined || args[field] === null) {
      return { valid: false, tool, args, error: `缺少必填字段: ${field}` };
    }
  }

  return { valid: true, tool, args };
}

/**
 * 启动子 workflow
 *
 * @param {object} params
 * @param {string} params.toolName
 * @param {object} params.args - 已通过 validateToolCall 校验的参数
 * @param {object} params.actor - { userId, projectId }
 * @param {object} params.defaults - { defaultTextModel, defaultImageModel } 供 buildJobParams 使用
 * @param {number} params.parentJobId - 父 workflow id
 * @returns {Promise<{ jobId, workflowType, toolName }>}
 */
async function invokeTool({ toolName, args, actor, defaults = {}, parentJobId }) {
  const tool = TOOL_MAP.get(toolName);
  if (!tool) throw new Error(`未知工具: ${toolName}`);

  const ctx = {
    userId: actor.userId,
    projectId: actor.projectId,
    ...defaults
  };

  const jobParams = tool.buildJobParams(args, ctx);
  const projectId = jobParams.projectId ?? actor.projectId ?? null;

  const result = await workflowEngine.startWorkflow(tool.workflowType, {
    userId: actor.userId,
    projectId,
    jobParams,
    parentJobId,
    metadata: {
      source: 'ai_assistant',
      toolName,
      toolArgs: args
    }
  });

  return {
    jobId: result.jobId,
    workflowType: tool.workflowType,
    toolName,
    tasks: result.tasks
  };
}

module.exports = {
  getToolsSchema,
  listTools,
  validateToolCall,
  invokeTool
};
