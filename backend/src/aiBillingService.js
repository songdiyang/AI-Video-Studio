const { queryOne, queryAll, execute } = require('./dbHelper');
const { parseJsonField } = require('./utils/parseJsonField');
const { getAIBillingContext } = require('./aiBillingContext');
const { getBillingHandler } = require('./billingHandlers');
const pointsService = require('./pointsService');
const { pushToUser } = require('./websocket');

const TOKEN_METRICS = new Set(['input_tokens', 'output_tokens', 'total_tokens']);
const ALLOWED_COMPONENT_TYPES = new Set([
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'duration_seconds',
  'request_count',
  'item_count'
]);

class ModelBillingConfigError extends Error {
  constructor(message) {
    super(message.startsWith('模型费用配置错误') ? message : `模型费用配置错误：${message}`);
    this.name = 'ModelBillingConfigError';
    this.code = 'MODEL_BILLING_CONFIG_ERROR';
  }
}

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 1e6) / 1e6;
}

function normalizeComponentType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  const aliases = {
    input: 'input_tokens',
    input_token: 'input_tokens',
    input_tokens: 'input_tokens',
    output: 'output_tokens',
    output_token: 'output_tokens',
    output_tokens: 'output_tokens',
    total: 'total_tokens',
    token: 'total_tokens',
    tokens: 'total_tokens',
    total_token: 'total_tokens',
    total_tokens: 'total_tokens',
    second: 'duration_seconds',
    seconds: 'duration_seconds',
    duration: 'duration_seconds',
    duration_seconds: 'duration_seconds',
    request: 'request_count',
    requests: 'request_count',
    request_count: 'request_count',
    image: 'item_count',
    images: 'item_count',
    per_image: 'item_count',
    per_item: 'item_count',
    item: 'item_count',
    items: 'item_count',
    item_count: 'item_count'
  };
  return aliases[normalized] || normalized;
}

function normalizeUnit(componentType, unit) {
  const normalizedUnit = String(unit || '').trim().toLowerCase();

  if (TOKEN_METRICS.has(componentType)) {
    if (!normalizedUnit) return 'per_million_tokens';
    if (['per_million_tokens', 'per_million_token', 'per_mtoken', 'mtoken', 'm_token'].includes(normalizedUnit)) {
      return 'per_million_tokens';
    }
    if (['per_token', 'token', 'tokens'].includes(normalizedUnit)) {
      return 'per_token';
    }
  }

  if (componentType === 'duration_seconds') {
    if (!normalizedUnit || ['per_second', 'second', 'seconds', 'sec'].includes(normalizedUnit)) {
      return 'per_second';
    }
  }

  if (componentType === 'request_count') {
    if (!normalizedUnit || ['per_request', 'request', 'requests'].includes(normalizedUnit)) {
      return 'per_request';
    }
  }

  if (componentType === 'item_count') {
    if (!normalizedUnit || ['per_item', 'item', 'image', 'per_image'].includes(normalizedUnit)) {
      return 'per_item';
    }
  }

  throw new ModelBillingConfigError(`不支持的计费单位: ${unit || '空'}`);
}

function normalizePriceConfig(rawPriceConfig, options = {}) {
  const { modelName = '未知模型' } = options;
  const parsed = parseJsonField(rawPriceConfig, rawPriceConfig);

  if (!parsed) {
    throw new ModelBillingConfigError(`模型 "${modelName}" 的 price_config 为空`);
  }

  let normalized = parsed;
  if (parsed.unit && parsed.price !== undefined && !parsed.components) {
    const legacyType = normalizeComponentType(parsed.unit);
    normalized = {
      currency: 'CNY',
      charge_on_failure: false,
      components: [
        {
          type: legacyType,
          price: parsed.price,
          unit: legacyType === 'total_tokens' ? 'per_token' : undefined
        }
      ]
    };
  }

  if (!Array.isArray(normalized.components) || normalized.components.length === 0) {
    throw new ModelBillingConfigError(`模型 "${modelName}" 的 price_config.components 未配置`);
  }

  const components = normalized.components.map((component, index) => {
    const type = normalizeComponentType(component.type || component.metric || component.key);
    if (!ALLOWED_COMPONENT_TYPES.has(type)) {
      throw new ModelBillingConfigError(`模型 "${modelName}" 的计费项 #${index + 1} 不受支持: ${component.type || component.metric || component.key}`);
    }

    const price = toNumber(
      component.price ?? component.rate ?? component.unit_price ?? component.price_value ?? component.pricePerMillion,
      null
    );
    if (price === null || price < 0) {
      throw new ModelBillingConfigError(`模型 "${modelName}" 的计费项 #${index + 1} 价格非法`);
    }

    return {
      type,
      price,
      unit: normalizeUnit(type, component.unit || component.price_unit || component.billing_unit)
    };
  });

  return {
    currency: String(normalized.currency || 'CNY').toUpperCase(),
    chargeOnFailure: Boolean(normalized.charge_on_failure),
    components
  };
}

function getComponentDisplay(component) {
  const priceText = component.unit === 'per_million_tokens'
    ? `¥${component.price}/MToken`
    : component.unit === 'per_token'
      ? `¥${component.price}/Token`
      : component.unit === 'per_second'
        ? `¥${component.price}/秒`
        : component.unit === 'per_request'
          ? `¥${component.price}/次`
          : `¥${component.price}/个`;

  const metricText = {
    input_tokens: '输入',
    output_tokens: '输出',
    total_tokens: '总Token',
    duration_seconds: '时长',
    request_count: '请求',
    item_count: '产物'
  }[component.type] || component.type;

  return `${metricText} ${priceText}`;
}

function getPriceSummary(rawPriceConfig, options = {}) {
  try {
    const normalized = normalizePriceConfig(rawPriceConfig, options);
    return normalized.components.map(getComponentDisplay).join(' + ');
  } catch (error) {
    return '计费配置错误';
  }
}

function collectPromptText(params) {
  const chunks = [];
  for (const key of ['prompt', 'message']) {
    if (params[key]) chunks.push(String(params[key]));
  }

  if (Array.isArray(params.messages)) {
    chunks.push(JSON.stringify(params.messages));
  }

  return chunks.join('\n');
}

function estimateTokensFromText(text) {
  if (!text) return 0;
  const normalizedText = String(text);
  const cjkCount = (normalizedText.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherText = normalizedText.replace(/[\u4e00-\u9fff]/g, '');
  return Math.max(1, cjkCount + Math.ceil(otherText.length / 4));
}

function getOutputTokenUpperLimit(params, defaultParams) {
  const candidates = [
    params.maxTokens,
    params.max_tokens,
    defaultParams?.maxTokens,
    defaultParams?.max_tokens
  ];

  for (const candidate of candidates) {
    const value = toNumber(candidate, null);
    if (value !== null && value > 0) {
      return value;
    }
  }

  return null;
}

function mergeUsage(base, override) {
  return {
    inputTokens: toNumber(override?.inputTokens, toNumber(base?.inputTokens, 0)) || 0,
    outputTokens: toNumber(override?.outputTokens, toNumber(base?.outputTokens, 0)) || 0,
    totalTokens: toNumber(override?.totalTokens, toNumber(base?.totalTokens, 0)) || 0,
    durationSeconds: toNumber(override?.durationSeconds, toNumber(base?.durationSeconds, 0)) || 0,
    requestCount: toNumber(override?.requestCount, toNumber(base?.requestCount, 0)) || 0,
    itemCount: toNumber(override?.itemCount, toNumber(base?.itemCount, 0)) || 0
  };
}

async function estimateUsage(params, model, normalizedPriceConfig) {
  const defaultParams = parseJsonField(model.default_params, {});
  const baseUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    durationSeconds: 0,
    requestCount: normalizedPriceConfig.components.some((item) => item.type === 'request_count') ? 1 : 0,
    itemCount: normalizedPriceConfig.components.some((item) => item.type === 'item_count')
      ? toNumber(params.itemCount ?? params.n ?? params.count, 1) || 1
      : 0
  };

  if (normalizedPriceConfig.components.some((item) => TOKEN_METRICS.has(item.type))) {
    // 只估算输入 tokens，输出 tokens 不设上限，由实际使用量决定
    baseUsage.inputTokens = estimateTokensFromText(collectPromptText(params));
    baseUsage.outputTokens = 0;
    baseUsage.totalTokens = baseUsage.inputTokens;
  }

  if (normalizedPriceConfig.components.some((item) => item.type === 'duration_seconds')) {
    const durationSeconds = toNumber(params.duration ?? params.durationSeconds, null);
    if (durationSeconds === null) {
      throw new ModelBillingConfigError(`模型 "${model.name}" 的 duration_seconds 计费缺少 duration 参数`);
    }
    baseUsage.durationSeconds = durationSeconds;
  }

  const billingHandler = getBillingHandler(model.billing_handler);
  if (billingHandler?.estimate) {
    const overrideUsage = await billingHandler.estimate(params, model, normalizedPriceConfig);
    return mergeUsage(baseUsage, overrideUsage || {});
  }

  return baseUsage;
}

function firstDefined(values, fallback = null) {
  for (const value of values) {
    const parsed = toNumber(value, null);
    if (parsed !== null) {
      return parsed;
    }
  }
  return fallback;
}

function extractUsageFromObject(source) {
  if (!source || typeof source !== 'object') return {};

  const usage = source.usage && typeof source.usage === 'object' ? source.usage : null;
  const data = source.data && typeof source.data === 'object' ? source.data : null;

  return {
    inputTokens: firstDefined([
      source.inputTokens,
      source.input_tokens,
      source.promptTokens,
      source.prompt_tokens,
      usage?.input_tokens,
      usage?.prompt_tokens,
      usage?.inputTokens,
      usage?.promptTokens,
      data?.usage?.input_tokens,
      data?.usage?.prompt_tokens
    ], 0),
    outputTokens: firstDefined([
      source.outputTokens,
      source.output_tokens,
      source.completionTokens,
      source.completion_tokens,
      usage?.output_tokens,
      usage?.completion_tokens,
      usage?.outputTokens,
      usage?.completionTokens,
      data?.usage?.output_tokens,
      data?.usage?.completion_tokens
    ], 0),
    totalTokens: firstDefined([
      source.totalTokens,
      source.total_tokens,
      source.tokens,
      usage?.total_tokens,
      usage?.totalTokens,
      data?.usage?.total_tokens
    ], 0),
    durationSeconds: firstDefined([
      source.durationSeconds,
      source.duration_seconds,
      source.duration,
      data?.durationSeconds,
      data?.duration_seconds,
      data?.duration
    ], 0),
    requestCount: firstDefined([
      source.requestCount,
      source.request_count
    ], 0),
    itemCount: firstDefined([
      source.itemCount,
      source.item_count,
      Array.isArray(source.imageUrls) ? source.imageUrls.length : null,
      Array.isArray(data?.images) ? data.images.length : null,
      // 火山引擎 Seedream 格式：data 数组直接包含图片对象
      Array.isArray(source.data) ? source.data.length : null
    ], 0)
  };
}

async function resolveUsage(params) {
  const {
    model,
    normalizedPriceConfig,
    estimatedUsage,
    submitResult,
    finalResult,
    requestStatus,
    useQueryHandler = false
  } = params;

  const handlerName = useQueryHandler ? model.billing_query_handler : model.billing_handler;
  console.log(`[AI Billing] resolveUsage - useQueryHandler: ${useQueryHandler}, handlerName: "${handlerName}"`);
  const billingHandler = getBillingHandler(handlerName);

  if (useQueryHandler && handlerName && !billingHandler) {
    console.error(`[AI Billing] 无法加载 billing_query_handler "${handlerName}" - 模型配置:`, {
      modelName: model.name,
      billing_handler: model.billing_handler,
      billing_query_handler: model.billing_query_handler
    });
    throw new ModelBillingConfigError(`模型 "${model.name}" 的 billing_query_handler "${handlerName}" 未找到`);
  }

  if (!useQueryHandler && handlerName && !billingHandler) {
    throw new ModelBillingConfigError(`模型 "${model.name}" 的 billing_handler "${handlerName}" 未找到`);
  }

  let handlerUsage = null;
  if (useQueryHandler && billingHandler?.resolveUsageFromQuery) {
    handlerUsage = await billingHandler.resolveUsageFromQuery({
      submitResult,
      finalResult,
      params: finalResult?._queryParams || {},
      modelConfig: model,
      requestStatus
    });
  } else if (!useQueryHandler && billingHandler?.resolveUsage) {
    handlerUsage = await billingHandler.resolveUsage({
      submitResult,
      finalResult,
      params: finalResult?._submitParams || {},
      modelConfig: model,
      requestStatus
    });
  }

  const extractedUsage = mergeUsage(
    extractUsageFromObject(submitResult),
    mergeUsage(
      extractUsageFromObject(submitResult?._raw),
      mergeUsage(
        extractUsageFromObject(finalResult),
        extractUsageFromObject(finalResult?._raw)
      )
    )
  );

  let usage = mergeUsage(extractedUsage, handlerUsage || {});

  if (!usage.requestCount && normalizedPriceConfig.components.some((item) => item.type === 'request_count')) {
    usage.requestCount = 1;
  }
  if (!usage.itemCount && normalizedPriceConfig.components.some((item) => item.type === 'item_count')) {
    usage.itemCount = estimatedUsage.itemCount || 1;
  }
  if (!usage.durationSeconds && normalizedPriceConfig.components.some((item) => item.type === 'duration_seconds')) {
    usage.durationSeconds = estimatedUsage.durationSeconds || 0;
  }
  if (!usage.inputTokens && normalizedPriceConfig.components.some((item) => item.type === 'input_tokens')) {
    usage.inputTokens = estimatedUsage.inputTokens || 0;
  }
  if (!usage.outputTokens && normalizedPriceConfig.components.some((item) => item.type === 'output_tokens')) {
    usage.outputTokens = requestStatus === 'failed' ? (estimatedUsage.outputTokens || 0) : 0;
  }
  if (!usage.totalTokens && normalizedPriceConfig.components.some((item) => item.type === 'total_tokens')) {
    usage.totalTokens = requestStatus === 'failed'
      ? (estimatedUsage.totalTokens || 0)
      : (usage.inputTokens + usage.outputTokens);
  }
  if (!usage.totalTokens && (usage.inputTokens || usage.outputTokens)) {
    usage.totalTokens = usage.inputTokens + usage.outputTokens;
  }

  const needsTokenUsage = normalizedPriceConfig.components.some((item) => TOKEN_METRICS.has(item.type));
  if (needsTokenUsage && !handlerUsage && !usage.totalTokens && !(usage.inputTokens || usage.outputTokens)) {
    throw new ModelBillingConfigError(`模型 "${model.name}" 的 token 计费无法解析实际用量，请补充 billing handler 或 usage 字段映射`);
  }

  return usage;
}

function calculatePrice(normalizedPriceConfig, usage) {
  const breakdown = normalizedPriceConfig.components.map((component) => {
    const metricValue = component.type === 'input_tokens'
      ? usage.inputTokens
      : component.type === 'output_tokens'
        ? usage.outputTokens
        : component.type === 'total_tokens'
          ? usage.totalTokens
          : component.type === 'duration_seconds'
            ? usage.durationSeconds
            : component.type === 'request_count'
              ? usage.requestCount
              : usage.itemCount;

    const quantity = toNumber(metricValue, 0) || 0;
    const amount = component.unit === 'per_million_tokens'
      ? (quantity / 1000000) * component.price
      : quantity * component.price;

    return {
      type: component.type,
      quantity,
      unit: component.unit,
      unitPrice: component.price,
      amount: roundMoney(amount),
      label: getComponentDisplay(component)
    };
  });

  return {
    amount: roundMoney(breakdown.reduce((sum, item) => sum + item.amount, 0)),
    breakdown
  };
}

async function ensureBalance(userId, amount, normalizedPriceConfig, usage) {
  // 管理员调试模型时跳过余额检查（sourceType 由 runAsAdminTool 设置）
  const context = getAIBillingContext();
  if (context?.sourceType === 'admin_tool') {
    return { points: 0, isAdmin: true };
  }

  // 计算需要的积分
  const pointsResult = await pointsService.calculatePointsFromCost(amount);
  const requiredPoints = pointsResult.points;

  // 检查积分余额
  const checkResult = await pointsService.checkPointsBalance(userId, requiredPoints);
  
  if (checkResult.isAdmin) {
    return { points: requiredPoints, isAdmin: true };
  }

  if (!checkResult.sufficient) {
    const error = new Error('积分不足');
    error.code = 'INSUFFICIENT_POINTS';
    error.status = 402;
    error.required = requiredPoints;
    error.current = checkResult.balance;
    error.pointsValue = pointsResult.pointsValue;
    throw error;
  }

  return { points: requiredPoints, balance: checkResult.balance };
}

function getPrimaryUnitPrice(breakdown) {
  return roundMoney(breakdown?.[0]?.unitPrice || 0);
}

function getTokensForLegacy(usage) {
  return Math.round(toNumber(usage.totalTokens, 0) || 0);
}

function buildResourceRefs(context) {
  return context?.resourceRefs || {};
}

async function insertBillingRecord(payload) {
  const result = await execute(
    `INSERT INTO billing_records (
      user_id, script_id, operation, model_provider, model_tier, tokens, unit_price, amount, points_cost,
      model_name, model_category, source_type, operation_key, workflow_job_id, generation_task_id,
      request_status, charge_status, currency, input_tokens, output_tokens, duration_seconds,
      item_count, price_breakdown_json, usage_snapshot, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.userId,
      payload.scriptId || null,
      payload.operation || null,
      payload.modelProvider || null,
      payload.modelTier || 'standard',
      payload.tokens || 0,
      payload.unitPrice || 0,
      payload.amount || 0,
      payload.pointsCost || 0,
      payload.modelName || null,
      payload.modelCategory || null,
      payload.sourceType || null,
      payload.operationKey || null,
      payload.workflowJobId || null,
      payload.generationTaskId || null,
      payload.requestStatus || null,
      payload.chargeStatus || null,
      payload.currency || 'CNY',
      payload.inputTokens || 0,
      payload.outputTokens || 0,
      payload.durationSeconds || 0,
      payload.itemCount || 0,
      payload.priceBreakdownJson || null,
      payload.usageSnapshot || null,
      payload.errorMessage || null
    ]
  );

  return result.insertId;
}

async function createPendingBillingRecord(context, model, normalizedPriceConfig, estimatedUsage, estimatedAmount) {
  const resourceRefs = buildResourceRefs(context);
  return insertBillingRecord({
    userId: context.userId,
    scriptId: resourceRefs.scriptId || null,
    operation: context.operationKey,
    modelProvider: model.provider,
    tokens: getTokensForLegacy(estimatedUsage),
    unitPrice: 0,
    amount: 0,
    modelName: model.name,
    modelCategory: model.category,
    sourceType: context.sourceType,
    operationKey: context.operationKey,
    workflowJobId: context.workflowJobId,
    generationTaskId: context.generationTaskId,
    requestStatus: 'submitted',
    chargeStatus: 'pending',
    currency: normalizedPriceConfig.currency,
    inputTokens: estimatedUsage.inputTokens,
    outputTokens: estimatedUsage.outputTokens,
    durationSeconds: estimatedUsage.durationSeconds,
    itemCount: estimatedUsage.itemCount,
    priceBreakdownJson: JSON.stringify([]),
    usageSnapshot: JSON.stringify({
      estimatedUsage,
      estimatedAmount,
      resourceRefs
    }),
    errorMessage: null
  });
}

function buildBillingMetadata({ recordId, estimatedUsage, estimatedAmount }) {
  return {
    recordId,
    estimatedUsage,
    estimatedAmount
  };
}

async function applyBalanceCharge(userId, amount) {
  const rounded = roundMoney(amount);
  if (!rounded || rounded <= 0) {
    return { points: 0, deducted: 0 };
  }

  // 计算实际消耗的积分
  const pointsResult = await pointsService.calculatePointsFromCost(rounded);
  
  // 扣除积分
  const deductResult = await pointsService.deductPoints(userId, pointsResult.points);
  
  // 通过 WebSocket 推送余额更新
  if (deductResult.deducted > 0) {
    try {
      pushToUser(userId, {
        type: 'balance_update',
        balance: deductResult.balanceAfter,
        deducted: deductResult.deducted
      });
    } catch (e) {
      // 推送失败不影响主流程
      console.warn('[Billing] WebSocket 余额推送失败:', e.message);
    }
  }
  
  return {
    points: pointsResult.points,
    rawCost: pointsResult.rawCost,
    serviceFee: pointsResult.serviceFee,
    totalPrice: pointsResult.totalPrice,
    deducted: deductResult.deducted,
    balanceAfter: deductResult.balanceAfter,
    isAdmin: deductResult.isAdmin
  };
}

async function finalizePendingBillingRecord(recordId, payload) {
  const existing = await queryOne(
    'SELECT id, charge_status FROM billing_records WHERE id = ?',
    [recordId]
  );

  if (!existing) {
    throw new Error(`待结算账单不存在: ${recordId}`);
  }

  if (existing.charge_status !== 'pending') {
    return existing;
  }

  await execute(
    `UPDATE billing_records SET
      operation = ?, model_provider = ?, model_tier = ?, tokens = ?, unit_price = ?, amount = ?, points_cost = ?,
      model_name = ?, model_category = ?, source_type = ?, operation_key = ?, workflow_job_id = ?,
      generation_task_id = ?, request_status = ?, charge_status = ?, currency = ?, input_tokens = ?,
      output_tokens = ?, duration_seconds = ?, item_count = ?, price_breakdown_json = ?,
      usage_snapshot = ?, error_message = ?
     WHERE id = ?`,
    [
      payload.operation || null,
      payload.modelProvider || null,
      payload.modelTier || 'standard',
      payload.tokens || 0,
      payload.unitPrice || 0,
      payload.amount || 0,
      payload.pointsCost || 0,
      payload.modelName || null,
      payload.modelCategory || null,
      payload.sourceType || null,
      payload.operationKey || null,
      payload.workflowJobId || null,
      payload.generationTaskId || null,
      payload.requestStatus || null,
      payload.chargeStatus || null,
      payload.currency || 'CNY',
      payload.inputTokens || 0,
      payload.outputTokens || 0,
      payload.durationSeconds || 0,
      payload.itemCount || 0,
      payload.priceBreakdownJson || null,
      payload.usageSnapshot || null,
      payload.errorMessage || null,
      recordId
    ]
  );

  return { id: recordId, charge_status: payload.chargeStatus };
}

async function prepareModelBilling(model, params) {
  const context = getAIBillingContext();
  if (!context?.userId) {
    throw new Error(`AI 计费上下文缺失，无法执行模型调用: ${model.name}`);
  }

  const normalizedPriceConfig = normalizePriceConfig(model.price_config, { modelName: model.name });
  const estimatedUsage = await estimateUsage(params, model, normalizedPriceConfig);
  const { amount: estimatedAmount } = calculatePrice(normalizedPriceConfig, estimatedUsage);

  await ensureBalance(context.userId, estimatedAmount);

  return {
    context,
    normalizedPriceConfig,
    estimatedUsage,
    estimatedAmount
  };
}

async function finalizeImmediateBilling({
  model,
  params,
  billingState,
  submitResult,
  requestStatus,
  errorMessage
}) {
  const usage = await resolveUsage({
    model,
    normalizedPriceConfig: billingState.normalizedPriceConfig,
    estimatedUsage: billingState.estimatedUsage,
    submitResult,
    finalResult: submitResult,
    requestStatus,
    useQueryHandler: false
  });

  const shouldCharge = requestStatus === 'success' || billingState.normalizedPriceConfig.chargeOnFailure;
  const price = shouldCharge
    ? calculatePrice(billingState.normalizedPriceConfig, usage)
    : { amount: 0, breakdown: [] };

  let chargeResult = { points: 0, deducted: 0 };
  if (shouldCharge) {
    chargeResult = await applyBalanceCharge(billingState.context.userId, price.amount);
  }

  const resourceRefs = buildResourceRefs(billingState.context);
  await insertBillingRecord({
    userId: billingState.context.userId,
    scriptId: resourceRefs.scriptId || null,
    operation: billingState.context.operationKey,
    modelProvider: model.provider,
    tokens: getTokensForLegacy(usage),
    unitPrice: getPrimaryUnitPrice(price.breakdown),
    amount: price.amount,
    pointsCost: chargeResult.points,
    modelName: model.name,
    modelCategory: model.category,
    sourceType: billingState.context.sourceType,
    operationKey: billingState.context.operationKey,
    workflowJobId: billingState.context.workflowJobId,
    generationTaskId: billingState.context.generationTaskId,
    requestStatus,
    chargeStatus: shouldCharge ? 'charged' : 'skipped',
    currency: billingState.normalizedPriceConfig.currency,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    durationSeconds: usage.durationSeconds,
    itemCount: usage.itemCount,
    priceBreakdownJson: JSON.stringify(price.breakdown),
    usageSnapshot: JSON.stringify({
      estimatedUsage: billingState.estimatedUsage,
      actualUsage: usage,
      pointsCharge: chargeResult
    }),
    errorMessage: errorMessage || null
  });
}

async function createPendingAsyncBilling(model, billingState) {
  const recordId = await createPendingBillingRecord(
    billingState.context,
    model,
    billingState.normalizedPriceConfig,
    billingState.estimatedUsage,
    billingState.estimatedAmount
  );

  return buildBillingMetadata({
    recordId,
    estimatedUsage: billingState.estimatedUsage,
    estimatedAmount: billingState.estimatedAmount
  });
}

async function finalizeAsyncBillingFromQuery(model, queryParams, finalResult, requestStatus) {
  const billingMeta = queryParams?._billing;
  if (!billingMeta?.recordId) {
    return null;
  }

  const context = getAIBillingContext();
  if (!context?.userId) {
    throw new Error(`AI 计费上下文缺失，无法完成异步结算: ${model.name}`);
  }

  const normalizedPriceConfig = normalizePriceConfig(model.price_config, { modelName: model.name });
  const estimatedUsage = mergeUsage({}, billingMeta.estimatedUsage || {});
  const usage = await resolveUsage({
    model,
    normalizedPriceConfig,
    estimatedUsage,
    submitResult: queryParams,
    finalResult,
    requestStatus,
    useQueryHandler: true
  });

  const shouldCharge = requestStatus === 'success' || normalizedPriceConfig.chargeOnFailure;
  const price = shouldCharge
    ? calculatePrice(normalizedPriceConfig, usage)
    : { amount: 0, breakdown: [] };

  let chargeResult = { points: 0, deducted: 0 };
  if (shouldCharge) {
    chargeResult = await applyBalanceCharge(context.userId, price.amount);
  }

  const resourceRefs = buildResourceRefs(context);
  await finalizePendingBillingRecord(billingMeta.recordId, {
    operation: context.operationKey,
    modelProvider: model.provider,
    tokens: getTokensForLegacy(usage),
    unitPrice: getPrimaryUnitPrice(price.breakdown),
    amount: price.amount,
    pointsCost: chargeResult.points,
    modelName: model.name,
    modelCategory: model.category,
    sourceType: context.sourceType,
    operationKey: context.operationKey,
    workflowJobId: context.workflowJobId,
    generationTaskId: context.generationTaskId,
    requestStatus,
    chargeStatus: shouldCharge ? 'charged' : 'skipped',
    currency: normalizedPriceConfig.currency,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    durationSeconds: usage.durationSeconds,
    itemCount: usage.itemCount,
    priceBreakdownJson: JSON.stringify(price.breakdown),
    usageSnapshot: JSON.stringify({
      estimatedUsage,
      actualUsage: usage,
      pointsCharge: chargeResult
    }),
    errorMessage: requestStatus === 'failed'
      ? (finalResult?.error || finalResult?.message || finalResult?._raw?.message || null)
      : null,
    scriptId: resourceRefs.scriptId || null
  });

  return {
    amount: price.amount,
    points: chargeResult.points,
    chargeStatus: shouldCharge ? 'charged' : 'skipped'
  };
}

function buildModelPricingPayload(model) {
  return {
    priceConfig: normalizePriceConfig(model.price_config, { modelName: model.name }),
    priceSummary: getPriceSummary(model.price_config, { modelName: model.name })
  };
}

async function listBillingRecords(userId, options = {}) {
  const {
    limit = 20,
    offset = 0,
    chargeStatus,
    modelCategory,
    sourceType
  } = options;

  const filters = ['b.user_id = ?'];
  const params = [userId];

  if (chargeStatus) {
    filters.push('b.charge_status = ?');
    params.push(chargeStatus);
  }
  if (modelCategory) {
    filters.push('b.model_category = ?');
    params.push(modelCategory);
  }
  if (sourceType) {
    filters.push('b.source_type = ?');
    params.push(sourceType);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const records = await queryAll(
    `SELECT
      b.id, b.script_id, b.operation, b.model_provider, b.model_tier, b.tokens, b.unit_price, b.amount, b.points_cost, b.created_at,
      b.model_name, b.model_category, b.source_type, b.operation_key, b.workflow_job_id, b.generation_task_id,
      b.request_status, b.charge_status, b.currency, b.input_tokens, b.output_tokens, b.duration_seconds,
      b.item_count, b.price_breakdown_json, b.usage_snapshot, b.error_message,
      p.name AS project_name
     FROM billing_records b
     LEFT JOIN workflow_jobs wj ON b.workflow_job_id = wj.id
     LEFT JOIN projects p ON wj.project_id = p.id
     ${whereClause}
     ORDER BY b.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );

  const totalRow = await queryOne(
    `SELECT COUNT(*) AS count FROM billing_records b ${whereClause}`,
    params
  );

  return {
    records: records.map((record) => ({
      ...record,
      price_breakdown_json: parseJsonField(record.price_breakdown_json, []),
      usage_snapshot: parseJsonField(record.usage_snapshot, {}),
      project_name: record.project_name || null,
      // 前端展示用：积分对应的内部成本金额
      points_value: (record.points_cost || 0) * pointsService.POINT_VALUE_CNY,
      // 前端展示用：积分对应的用户充值售价金额
      points_purchase_value: (record.points_cost || 0) * pointsService.POINT_PURCHASE_PRICE
    })),
    total: Number(totalRow?.count || 0),
    limit: Number(limit),
    offset: Number(offset)
  };
}

async function getBillingSummary(userId) {
  const row = await queryOne(
    `SELECT
      COALESCE(SUM(CASE WHEN charge_status = 'charged' THEN amount ELSE 0 END), 0) AS total_amount,
      COALESCE(SUM(CASE WHEN charge_status = 'charged' THEN tokens ELSE 0 END), 0) AS total_tokens,
      COALESCE(SUM(CASE WHEN charge_status = 'charged' THEN points_cost ELSE 0 END), 0) AS total_points,
      COUNT(*) AS total_records,
      COALESCE(SUM(CASE WHEN request_status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_records
     FROM billing_records
     WHERE user_id = ?`,
    [userId]
  );

  return {
    total_amount: Number(row?.total_amount || 0),
    total_tokens: Number(row?.total_tokens || 0),
    total_points: Number(row?.total_points || 0),
    total_points_value: Number(row?.total_points || 0) * pointsService.POINT_VALUE_CNY,
    total_points_purchase_value: Number(row?.total_points || 0) * pointsService.POINT_PURCHASE_PRICE,
    total_records: Number(row?.total_records || 0),
    failed_records: Number(row?.failed_records || 0)
  };
}

async function getBillingStats(userId) {
  const [summary, videoCount, imageCount, projectCount, scriptCount, characterCount, monthlyPoints] = await Promise.all([
    getBillingSummary(userId),
    queryOne(
      `SELECT COUNT(*) AS count
       FROM billing_records
       WHERE user_id = ? AND model_category = 'VIDEO' AND charge_status = 'charged'`,
      [userId]
    ),
    queryOne(
      `SELECT COUNT(*) AS count
       FROM billing_records
       WHERE user_id = ? AND model_category = 'IMAGE' AND charge_status = 'charged'`,
      [userId]
    ),
    queryOne('SELECT COUNT(*) AS count FROM projects WHERE user_id = ?', [userId]),
    queryOne('SELECT COUNT(*) AS count FROM scripts WHERE user_id = ?', [userId]),
    queryOne('SELECT COUNT(*) AS count FROM characters WHERE project_id IN (SELECT id FROM projects WHERE user_id = ?)', [userId]),
    queryOne(
      `SELECT COALESCE(SUM(points_cost), 0) AS total
       FROM billing_records
       WHERE user_id = ? AND charge_status = 'charged'
         AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
      [userId]
    )
  ]);

  return {
    totalSpent: summary.total_amount,
    totalTokens: summary.total_tokens,
    totalRecords: summary.total_records,
    failedRecords: summary.failed_records,
    scriptCount: Number(scriptCount?.count || 0),
    videoCount: Number(videoCount?.count || 0),
    imageCount: Number(imageCount?.count || 0),
    projectCount: Number(projectCount?.count || 0),
    characterCount: Number(characterCount?.count || 0),
    monthlyPointsUsed: Number(monthlyPoints?.total || 0)
  };
}

/**
 * 按时间段统计费用
 * @param {number} userId
 * @param {object} options
 * @param {'day'|'week'|'month'} options.period - 统计粒度
 * @param {number} options.limit - 返回记录数，默认30
 * @returns {Promise<Array>}
 */
async function getBillingStatsByPeriod(userId, { period = 'day', limit = 30 } = {}) {
  let dateFormat;
  switch (period) {
    case 'week':
      dateFormat = '%x-W%v'; // ISO year-week
      break;
    case 'month':
      dateFormat = '%Y-%m';
      break;
    case 'day':
    default:
      dateFormat = '%Y-%m-%d';
      break;
  }

  const rows = await queryAll(
    `SELECT
      DATE_FORMAT(created_at, ?) AS period_key,
      COALESCE(SUM(CASE WHEN charge_status = 'charged' THEN amount ELSE 0 END), 0) AS total_amount,
      COUNT(*) AS total_records,
      COALESCE(SUM(CASE WHEN charge_status = 'charged' THEN input_tokens + output_tokens ELSE 0 END), 0) AS total_tokens,
      COALESCE(SUM(CASE WHEN request_status = 'success' THEN 1 ELSE 0 END), 0) AS success_count,
      COALESCE(SUM(CASE WHEN request_status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count
     FROM billing_records
     WHERE user_id = ?
     GROUP BY period_key
     ORDER BY period_key DESC
     LIMIT ?`,
    [dateFormat, userId, Number(limit)]
  );

  return rows.map(row => ({
    period: row.period_key,
    amount: Number(row.total_amount || 0),
    records: Number(row.total_records || 0),
    tokenUsage: Number(row.total_tokens || 0),
    successCount: Number(row.success_count || 0),
    failedCount: Number(row.failed_count || 0)
  }));
}

/**
 * 按模型维度统计费用
 * @param {number} userId
 * @returns {Promise<Array>}
 */
async function getBillingStatsByModel(userId) {
  const rows = await queryAll(
    `SELECT
      model_name,
      model_category,
      model_provider,
      COUNT(*) AS call_count,
      COALESCE(SUM(CASE WHEN charge_status = 'charged' THEN amount ELSE 0 END), 0) AS total_amount,
      COALESCE(SUM(CASE WHEN request_status = 'success' THEN 1 ELSE 0 END), 0) AS success_count,
      COALESCE(SUM(CASE WHEN request_status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count,
      COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens,
      COALESCE(SUM(duration_seconds), 0) AS total_duration,
      COALESCE(SUM(item_count), 0) AS total_items
     FROM billing_records
     WHERE user_id = ? AND model_name IS NOT NULL
     GROUP BY model_name, model_category, model_provider
     ORDER BY total_amount DESC`,
    [userId]
  );

  return rows.map(row => ({
    modelName: row.model_name,
    modelCategory: row.model_category,
    provider: row.model_provider,
    callCount: Number(row.call_count || 0),
    totalAmount: Number(row.total_amount || 0),
    successRate: row.call_count > 0
      ? Math.round((Number(row.success_count || 0) / Number(row.call_count)) * 10000) / 100
      : 0,
    failedCount: Number(row.failed_count || 0),
    totalTokens: Number(row.total_tokens || 0),
    totalDuration: Number(row.total_duration || 0),
    totalItems: Number(row.total_items || 0)
  }));
}

module.exports = {
  ModelBillingConfigError,
  normalizePriceConfig,
  getPriceSummary,
  buildModelPricingPayload,
  prepareModelBilling,
  finalizeImmediateBilling,
  createPendingAsyncBilling,
  finalizeAsyncBillingFromQuery,
  listBillingRecords,
  getBillingSummary,
  getBillingStats,
  getBillingStatsByPeriod,
  getBillingStatsByModel,
  // 积分服务
  pointsService
};
