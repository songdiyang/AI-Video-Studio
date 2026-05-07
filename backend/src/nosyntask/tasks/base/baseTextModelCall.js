/**
 * 基础文本模型调用任务
 * 统一处理不同文本模型的参数格式差异
 *
 * 智能路由支持：
 *   - 传入具体模型名称（如 'DeepSeek Chat'）→ 直接调用
 *   - 传入 '@auto' 或 '@router' → 由 ModelRouter 根据任务类型自动选择
 *
 * 输入参数:
 * @param {string} params.prompt - 统一的提示词字段
 * @param {string} params.textModel - 文本模型名称（统一字段名，支持 @auto/@router）
 * @param {number} params.maxTokens - 最大 token 数（可选，默认 500）
 * @param {number} params.temperature - 温度参数（可选，默认 0.7）
 *
 * 输出:
 * @returns {Object} AI 模型的原始响应结果
 */

const { callAIModel } = require('../../../aiModelService');
const { washForText } = require('../../../utils/washBody');

// 懒加载 ModelRouter（避免循环依赖）
let modelRouter = null;
function getModelRouter() {
  if (!modelRouter) {
    const { modelRouter: router } = require('../../../services/ModelRouter');
    modelRouter = router;
  }
  return modelRouter;
}

/**
 * 解析模型名称，支持智能路由
 * @param {string} modelName - 原始模型名称
 * @param {string} stepType - 工作流步骤类型（用于路由）
 * @param {object} projectConfig - 项目配置
 * @returns {Promise<string>} 解析后的模型名称
 */
async function resolveModelName(modelName, stepType, projectConfig = {}) {
  if (!modelName || modelName === '@auto' || modelName === '@router') {
    if (!stepType) {
      throw new Error('使用 @auto/@router 时必须提供 stepType');
    }
    const router = getModelRouter();
    const selected = await router.selectModelForWorkflowStep(stepType, projectConfig);
    if (!selected) {
      throw new Error(`ModelRouter 未找到适合步骤 "${stepType}" 的模型`);
    }
    console.log(`[BaseTextModelCall] 智能路由选择: ${selected.name} (步骤: ${stepType})`);
    return selected.name;
  }
  return modelName;
}

async function handleBaseTextModelCall(params, onProgress) {
  const {
    prompt,
    message,
    messages,
    textModel: rawModelName,
    maxTokens = 8192,
    temperature = 0.7,
    think,
    // 智能路由相关参数
    stepType,
    projectConfig
  } = params;

  if (!prompt && !message && !(messages && messages.length > 0)) {
    throw new Error('prompt 参数是必需的');
  }

  if (!rawModelName) {
    throw new Error('textModel 参数是必需的');
  }

  // 解析模型名称（支持 @auto/@router）
  const modelName = await resolveModelName(rawModelName, stepType, projectConfig);

  console.log('[BaseTextModelCall] 开始调用文本模型:', {
    originalName: rawModelName,
    resolvedName: modelName,
    promptLength: (prompt || message || '').length,
    maxTokens,
    temperature
  });

  if (onProgress) onProgress(10);

  if (onProgress) onProgress(20);

  try {
    // 构建请求参数（文本参数派生由 templateRenderer.renderWithFallback 统一处理）
    const requestParams = {
      prompt,
      message,
      messages,
      maxTokens,
      temperature,
      think
    };

    console.log('[BaseTextModelCall] 调用 AI 模型...');
    console.log('[BaseTextModelCall] 提示词预览:', (prompt || message || '').substring(0, 200) + '...');

    if (onProgress) onProgress(40);

    // 调用 AI 模型服务
    const response = await callAIModel(modelName, requestParams);

    if (onProgress) onProgress(90);

    console.log('[BaseTextModelCall] ✅ 模型调用成功');
    console.log('[BaseTextModelCall] 响应类型:', typeof response);
    console.log('[BaseTextModelCall] 响应预览:', JSON.stringify(response).substring(0, 300));

    if (onProgress) onProgress(100);

    // 清洗响应内容（去除 think 标签、代码块标记等）
    if (response && typeof response.content === 'string') {
      response.content = washForText(response.content);
    }

    // 附加路由信息（方便上游追踪）
    response._routing = {
      originalModel: rawModelName,
      resolvedModel: modelName,
      stepType: stepType || null
    };

    return response;

  } catch (error) {
    console.error('[BaseTextModelCall] 模型调用失败:', error);
    throw new Error(`文本模型调用失败: ${error.message}`);
  }
}

module.exports = handleBaseTextModelCall;
