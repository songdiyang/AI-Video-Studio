/**
 * 模型适配封装层 (Model Adapter)
 *
 * 在 aiModelService 之上提供统一的模型调用接口，支持：
 * - 从数据库动态加载模型配置（含 OpenAI 适配层平台信息）
 * - 不同模型提供商的 API 调用方式适配
 * - 模型配置的解析、验证和缓存
 * - 统一的 submit + query 接口给上层业务使用
 * - 计费上下文自动包裹、超时控制、标准化错误处理
 */

const {
  callAIModel,
  queryAIModel,
  callAIModelBatch,
  getCachedModelConfig,
  parseJsonField,
  invalidateModelCache
} = require('./aiModelService');
const { withAIBillingContext } = require('./aiBillingContext');
const { queryOne, queryAll } = require('./dbHelper');

// ============ 统一错误类型 ============

class ModelCallError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ModelCallError';
    this.code = code;
    this.details = details;
  }
}

// 错误码定义
const ErrorCodes = {
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  MODEL_DISABLED: 'MODEL_DISABLED',
  CONFIG_INVALID: 'CONFIG_INVALID',
  API_KEY_MISSING: 'API_KEY_MISSING',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  RATE_LIMITED: 'RATE_LIMITED',
  API_ERROR: 'API_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN: 'UNKNOWN'
};

// ============ 模型配置加载与解析 ============

/**
 * 加载并解析完整的模型配置
 * @param {string} modelName - 模型名称
 * @returns {Promise<object>} 解析后的模型配置对象
 * @throws {Error} 模型不存在或未启用
 */
async function loadModelConfig(modelName) {
  if (!modelName) {
    throw new Error('模型名称不能为空');
  }

  const model = await getCachedModelConfig(modelName);

  if (!model) {
    throw new Error(`模型 "${modelName}" 不存在或未启用`);
  }

  // 解析所有 JSON 字段，提供结构化配置
  const config = {
    // 基础信息
    id: model.id,
    name: model.name,
    provider: model.provider,
    category: model.category,
    description: model.description,
    isActive: model.is_active === 1,

    // API 认证
    apiKey: model.api_key || null,

    // 提交请求配置
    submit: {
      urlTemplate: model.url_template,
      method: model.request_method || 'POST',
      headersTemplate: parseJsonField(model.headers_template),
      bodyTemplate: parseJsonField(model.body_template),
      defaultParams: parseJsonField(model.default_params, {}),
    },

    // 查询请求配置（异步任务轮询）
    query: {
      urlTemplate: model.query_url_template || null,
      method: model.query_method || 'GET',
      headersTemplate: parseJsonField(model.query_headers_template),
      bodyTemplate: parseJsonField(model.query_body_template),
    },

    // 响应映射
    responseMapping: parseJsonField(model.response_mapping),
    queryResponseMapping: parseJsonField(model.query_response_mapping),

    // 成功/失败条件
    querySuccessCondition: model.query_success_condition || null,
    queryFailCondition: model.query_fail_condition || null,
    querySuccessMapping: parseJsonField(model.query_success_mapping),
    queryFailMapping: parseJsonField(model.query_fail_mapping),

    // 自定义处理器
    customHandler: model.custom_handler || null,
    customQueryHandler: model.custom_query_handler || null,
    billingHandler: model.billing_handler || null,
    billingQueryHandler: model.billing_query_handler || null,

    // 价格配置
    priceConfig: parseJsonField(model.price_config),

    // 能力标记
    capabilities: {
      toolCalling: model.supports_tool_calling === 1,
      streaming: model.supports_streaming === 1,
      vision: model.supports_vision === 1,
    },

    // 支持的参数
    supportedAspectRatios: parseJsonField(model.supported_aspect_ratios, []),
    supportedDurations: parseJsonField(model.supported_durations, []),
    supportedResolutions: model.supported_resolutions || null,

    // OpenAI 适配层字段
    providerId: model.provider_id || null,
    modelId: model.model_id || null,
    capabilitiesTags: parseJsonField(model.capabilities, []),

    // 保留原始记录供扩展使用
    _raw: model
  };

  return config;
}

/**
 * 获取 API Key（优先级：数据库配置 > 环境变量）
 * @param {object} config - 模型配置对象（loadModelConfig 返回）
 * @returns {string} API Key
 * @throws {Error} API Key 未配置
 */
function getApiKey(config) {
  if (config.apiKey) {
    return config.apiKey;
  }

  const envKey = `${config.provider.toUpperCase()}_API_KEY`;
  const apiKey = process.env[envKey];

  if (!apiKey) {
    throw new Error(
      `API Key 未配置：请在模型配置中设置 API Key 或配置环境变量 ${envKey}`
    );
  }

  return apiKey;
}

/**
 * 验证模型配置完整性
 * @param {object} config - 模型配置对象
 * @returns {object} { valid: boolean, errors: string[] }
 */
function validateModelConfig(config) {
  const errors = [];

  if (!config.name) errors.push('模型名称不能为空');
  if (!config.provider) errors.push('模型提供商不能为空');
  if (!config.category) errors.push('模型类别不能为空');

  // OpenAI 适配层模式：配置了 provider_id + model_id 时，跳过传统模板校验
  const isOpenAIAdapter = config.providerId && config.modelId;

  if (!isOpenAIAdapter) {
    // 传统模板模式校验
    if (!config.submit?.urlTemplate) {
      errors.push('缺少提交请求 URL 模板');
    }
    if (!config.submit?.method) {
      errors.push('缺少提交请求方法');
    }

    // 异步模型需要查询配置
    if (config.category === 'VIDEO') {
      if (!config.query?.urlTemplate) {
        errors.push('视频模型需要配置查询 URL 模板');
      }
    }

    // 响应映射校验
    if (!config.responseMapping || Object.keys(config.responseMapping).length === 0) {
      errors.push('缺少响应映射配置');
    }
  } else {
    // OpenAI 适配层模式：只需要校验 provider_id 和 model_id
    if (!config.providerId) {
      errors.push('OpenAI 适配层模式缺少 provider_id');
    }
    if (!config.modelId) {
      errors.push('OpenAI 适配层模式缺少 model_id');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============ 统一模型调用接口 ============

/**
 * 统一的模型调用接口（同步/异步兼容）
 *
 * @param {string} modelName - 模型名称
 * @param {object} params - 调用参数
 * @param {object} options - 选项
 * @param {string} options.apiKey - 显式指定 API Key
 * @param {boolean} options.skipValidation - 跳过配置校验
 * @returns {Promise<object>} 调用结果
 *
 * 返回结构：
 * {
 *   content: string,        // 文本内容（TEXT/MULTIMODAL）
 *   imageUrl: string,       // 图片 URL（IMAGE）
 *   taskId: string,         // 异步任务 ID（VIDEO/IMAGE 异步）
 *   tokens: number,         // Token 消耗
 *   inputTokens: number,
 *   outputTokens: number,
 *   _raw: object,           // 原始响应
 *   _model: object          // 模型信息
 * }
 */
async function invokeModel(modelName, params = {}, options = {}) {
  const config = await loadModelConfig(modelName);

  // 配置校验
  if (!options.skipValidation) {
    const validation = validateModelConfig(config);
    if (!validation.valid) {
      throw new ModelCallError(
        `模型配置校验失败: ${validation.errors.join(', ')}`,
        ErrorCodes.CONFIG_INVALID,
        { modelName, errors: validation.errors }
      );
    }
  }

  // 获取 API Key
  const apiKey = options.apiKey || getApiKey(config);

  // 超时控制（默认 300 秒）
  const timeoutMs = (options.timeout || 300) * 1000;

  try {
    // 调用底层服务
    const result = await Promise.race([
      callAIModel(modelName, params, apiKey),
      new Promise((_, reject) =>
        setTimeout(() => reject(new ModelCallError(
          `模型调用超时（${timeoutMs / 1000}秒）`,
          ErrorCodes.REQUEST_TIMEOUT,
          { modelName }
        )), timeoutMs)
      )
    ]);

    return result;
  } catch (error) {
    if (error instanceof ModelCallError) throw error;

    // 标准化错误
    const message = error.message || '未知错误';
    let code = ErrorCodes.UNKNOWN;

    if (message.includes('API Key 未配置')) {
      code = ErrorCodes.API_KEY_MISSING;
    } else if (message.includes('429') || message.includes('rate limit') || message.includes('频率限制')) {
      code = ErrorCodes.RATE_LIMITED;
    } else if (message.includes('timeout') || message.includes('超时')) {
      code = ErrorCodes.REQUEST_TIMEOUT;
    } else if (message.includes('网络') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      code = ErrorCodes.NETWORK_ERROR;
    } else if (message.includes('不存在') || message.includes('未启用')) {
      code = ErrorCodes.MODEL_NOT_FOUND;
    } else if (message.includes('API 调用失败') || message.includes('JSON 格式')) {
      code = ErrorCodes.API_ERROR;
    }

    throw new ModelCallError(message, code, { modelName, originalError: error.message });
  }
}

// ============ 分类封装接口 ============

/**
 * 调用文本模型（TEXT / MULTIMODAL）
 * @param {string} modelName - 模型名称
 * @param {object} params - { prompt, messages, maxTokens, temperature, think }
 * @param {object} options - 选项
 */
async function invokeTextModel(modelName, params = {}, options = {}) {
  const result = await invokeModel(modelName, params, options);
  return result;
}

/**
 * 调用图片生成模型（IMAGE）
 * @param {string} modelName - 模型名称
 * @param {object} params - { prompt, size, width, height, aspectRatio, imageUrl, imageUrls }
 * @param {object} options - 选项
 */
async function invokeImageModel(modelName, params = {}, options = {}) {
  const result = await invokeModel(modelName, params, options);
  return result;
}

/**
 * 调用视频生成模型（VIDEO）
 * @param {string} modelName - 模型名称
 * @param {object} params - { prompt, duration, aspectRatio, resolution, imageUrl, imageUrls }
 * @param {object} options - 选项
 */
async function invokeVideoModel(modelName, params = {}, options = {}) {
  const result = await invokeModel(modelName, params, options);
  return result;
}

/**
 * 带计费上下文的模型调用
 * 自动包裹 withAIBillingContext，用于路由/工作流等场景
 *
 * @param {string} modelName - 模型名称
 * @param {object} params - 调用参数
 * @param {object} billingContext - 计费上下文 { userId, projectId, sourceType, operationKey, resourceRefs }
 * @param {object} options - 选项
 */
async function invokeModelWithBilling(modelName, params = {}, billingContext = {}, options = {}) {
  const { userId, projectId, sourceType, operationKey, resourceRefs } = billingContext;

  return withAIBillingContext(
    {
      userId,
      projectId: projectId || null,
      sourceType: sourceType || 'api',
      operationKey: operationKey || 'model_call',
      resourceRefs: resourceRefs || {}
    },
    () => invokeModel(modelName, params, options)
  );
}

/**
 * 查询异步任务状态
 *
 * @param {string} modelName - 模型名称
 * @param {object} params - 查询参数（需包含 taskId 等映射字段）
 * @param {object} options - 选项
 * @param {string} options.apiKey - 显式指定 API Key
 * @returns {Promise<object>} 查询结果
 */
async function queryModelTask(modelName, params = {}, options = {}) {
  const config = await loadModelConfig(modelName);

  if (!config.query?.urlTemplate) {
    throw new Error(`模型 "${modelName}" 未配置查询接口，不支持异步任务查询`);
  }

  const apiKey = options.apiKey || getApiKey(config);

  return queryAIModel(modelName, params, apiKey);
}

/**
 * 完整的异步任务调用（提交 + 轮询直到完成）
 *
 * @param {string} modelName - 模型名称
 * @param {object} submitParams - 提交参数
 * @param {object} options - 选项
 * @param {string} options.apiKey - API Key
 * @param {number} options.maxPolls - 最大轮询次数，默认 60
 * @param {number} options.pollInterval - 轮询间隔（秒），默认 5
 * @returns {Promise<object>} 最终结果
 */
async function invokeAsyncModel(modelName, submitParams = {}, options = {}) {
  const {
    apiKey: explicitKey,
    maxPolls = 60,
    pollInterval = 5
  } = options;

  const config = await loadModelConfig(modelName);
  const apiKey = explicitKey || getApiKey(config);

  // 1. 提交任务
  const submitResult = await callAIModel(modelName, submitParams, apiKey);

  const taskId = submitResult.taskId || submitResult.task_id || submitResult.task_Id;
  if (!taskId) {
    // 同步完成，直接返回
    return {
      ...submitResult,
      _phase: 'sync'
    };
  }

  // 2. 轮询查询
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, pollInterval * 1000));

    const queryResult = await queryAIModel(modelName, { taskId, ...submitResult }, apiKey);

    // 判断完成状态
    const isSuccess = evaluateCondition(queryResult, config.querySuccessCondition);
    const isFail = evaluateCondition(queryResult, config.queryFailCondition);

    if (isSuccess) {
      return {
        ...queryResult,
        _taskId: taskId,
        _phase: 'completed',
        _pollCount: i + 1
      };
    }

    if (isFail) {
      throw new Error(
        `异步任务执行失败: ${queryResult.error || queryResult.message || '未知错误'}`
      );
    }
  }

  throw new Error(`异步任务轮询超时（${maxPolls * pollInterval}秒），任务ID: ${taskId}`);
}

// ============ 批量调用 ============

/**
 * 批量调用模型（并发控制）
 * @param {Array<{modelName: string, params: object}>} tasks - 任务列表
 * @param {object} options - 选项
 * @param {number} options.concurrency - 并发数
 * @param {string} options.apiKey - 统一 API Key
 * @returns {Promise<{results: Array, errors: Array}>}
 */
async function invokeModelBatch(tasks, options = {}) {
  const { concurrency = 3, apiKey } = options;

  const calls = tasks.map(t => ({
    modelName: t.modelName,
    params: t.params,
    apiKey: t.apiKey || apiKey
  }));

  return callAIModelBatch(calls, { concurrency });
}

// ============ 模型列表查询 ============

/**
 * 获取所有启用的模型列表（带完整配置）
 * @param {object} filters - 筛选条件
 * @param {string} filters.category - 类别筛选
 * @param {string} filters.provider - 提供商筛选
 * @returns {Promise<object[]>}
 */
async function listModels(filters = {}) {
  let sql = 'SELECT * FROM ai_model_configs WHERE is_active = 1';
  const params = [];

  if (filters.category) {
    sql += ' AND category = ?';
    params.push(filters.category);
  }
  if (filters.provider) {
    sql += ' AND provider = ?';
    params.push(filters.provider);
  }

  sql += ' ORDER BY category, id ASC';

  const models = await queryAll(sql, params);

  return models.map(model => ({
    id: model.id,
    name: model.name,
    provider: model.provider,
    category: model.category,
    description: model.description,
    isActive: model.is_active === 1,
    capabilities: {
      toolCalling: model.supports_tool_calling === 1,
      streaming: model.supports_streaming === 1,
      vision: model.supports_vision === 1
    },
    priceConfig: parseJsonField(model.price_config),
    customHandler: model.custom_handler,
    _raw: model
  }));
}

/**
 * 按类别获取模型列表
 * @returns {Promise<object>}
 */
async function listModelsByCategory() {
  const models = await listModels();
  const grouped = {};

  for (const model of models) {
    if (!grouped[model.category]) {
      grouped[model.category] = [];
    }
    grouped[model.category].push(model);
  }

  return grouped;
}

// ============ 缓存管理 ============

/**
 * 刷新指定模型的缓存
 * @param {string} modelName - 模型名称
 */
function refreshModelCache(modelName) {
  invalidateModelCache(modelName);
}

/**
 * 刷新所有模型缓存
 */
function refreshAllModelCache() {
  invalidateModelCache();
}

// ============ 辅助函数 ============

/**
 * 评估条件表达式（从 aiModelService 复制，避免循环依赖）
 */
function evaluateCondition(mappedResult, conditionExpr) {
  if (!conditionExpr) return false;
  try {
    return !!safeEval(mappedResult, conditionExpr);
  } catch (err) {
    return false;
  }
}

/**
 * 简化的 safeEval（支持基本比较和路径访问）
 */
function safeEval(vars, expr) {
  // 替换变量引用为实际值
  let code = expr;

  // 处理 {{var}} 或 ${var} 格式的占位符
  code = code.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = vars[key];
    return typeof val === 'string' ? `"${val}"` : String(val);
  });

  // 处理简单路径访问如 status == 'success'
  try {
    // 构建一个安全的执行环境
    const fn = new Function('vars', `with(vars) { return ${code}; }`);
    return fn(vars);
  } catch {
    return false;
  }
}

// ============ 模块导出 ============

module.exports = {
  // 错误类型
  ModelCallError,
  ErrorCodes,

  // 配置加载与解析
  loadModelConfig,
  getApiKey,
  validateModelConfig,

  // 统一调用接口
  invokeModel,
  invokeTextModel,
  invokeImageModel,
  invokeVideoModel,
  invokeModelWithBilling,
  queryModelTask,
  invokeAsyncModel,
  invokeModelBatch,

  // 模型列表
  listModels,
  listModelsByCategory,

  // 缓存管理
  refreshModelCache,
  refreshAllModelCache,

  // 底层透传（供高级使用）
  callAIModel,
  queryAIModel,
  callAIModelBatch
};
