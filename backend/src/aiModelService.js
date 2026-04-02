const { queryOne } = require('./dbHelper');
const fetch = require('node-fetch');
const {
  renderTemplate,
  renderJsonTemplate,
  extractValueByPath,
  mapResponse,
  mergeParams,
  renderWithFallback
} = require('./utils/templateRenderer');
const { getHandler } = require('./customHandlers');
const { sanitizeHeaders } = require('./utils/logSanitizer');
const { parseJsonField } = require('./utils/parseJsonField');
const { getAIBillingContext } = require('./aiBillingContext');
const { assertSafeOutboundUrl, safeFetch } = require('./utils/outboundRequestGuard');
const {
  buildModelPricingPayload,
  prepareModelBilling,
  finalizeImmediateBilling,
  createPendingAsyncBilling,
  finalizeAsyncBillingFromQuery
} = require('./aiBillingService');

// ============ 辅助函数 ============
function toNumberSafe(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ============ 模型配置缓存 ============
const MODEL_CACHE_TTL = 300000; // 5分钟缓存（批量生成时减少DB查询）
const modelConfigCache = new Map(); // key: modelName, value: { config, expireAt }

async function getCachedModelConfig(modelName) {
  const cached = modelConfigCache.get(modelName);
  if (cached && Date.now() < cached.expireAt) {
    return cached.config;
  }
  const config = await queryOne(
    'SELECT * FROM ai_model_configs WHERE name = ? AND is_active = 1',
    [modelName]
  );
  if (config) {
    modelConfigCache.set(modelName, { config, expireAt: Date.now() + MODEL_CACHE_TTL });
  }
  return config;
}

function invalidateModelCache(modelName) {
  if (modelName) {
    modelConfigCache.delete(modelName);
  } else {
    modelConfigCache.clear();
  }
}

/**
 * 带单次重试的请求封装
 * 网络错误或 5xx 错误自动重试一次，间隔 2 秒
 */
async function fetchWithRetry(url, options, context = '') {
  try {
    const response = await safeFetch(url, options, context);
    if (response.status >= 500) {
      console.warn(`[AI Model] ${context} 收到 ${response.status}，2秒后重试`);
      await new Promise(r => setTimeout(r, 2000));
      return safeFetch(url, options, context);
    }
    return response;
  } catch (err) {
    if (err.name === 'AbortError') throw err; // 超时不重试
    console.warn(`[AI Model] ${context} 网络错误: ${err.message}，2秒后重试`);
    await new Promise(r => setTimeout(r, 2000));
    return safeFetch(url, options, context);
  }
}

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const isDebug = LOG_LEVEL === 'debug';

function evaluateCondition(mappedResult, conditionExpr) {
  if (!conditionExpr) return false;
  try {
    return !!safeEval(mappedResult, conditionExpr);
  } catch (err) {
    console.warn('[AI Model] 条件表达式执行失败:', conditionExpr, err.message);
    return false;
  }
}

function safeEval(vars, expr) {
  let pos = 0;

  function skipSpaces() {
    while (pos < expr.length && expr[pos] === ' ') pos++;
  }

  function readToken() {
    skipSpaces();
    if (pos >= expr.length) return null;
    const ch = expr[pos];

    if (ch === '"' || ch === "'") {
      const quote = ch;
      pos++;
      let str = '';
      while (pos < expr.length && expr[pos] !== quote) {
        if (expr[pos] === '\\' && pos + 1 < expr.length) {
          pos++;
          str += expr[pos];
        } else {
          str += expr[pos];
        }
        pos++;
      }
      if (pos < expr.length) pos++;
      return { type: 'string', value: str };
    }

    if (ch >= '0' && ch <= '9') {
      let num = '';
      while (pos < expr.length && ((expr[pos] >= '0' && expr[pos] <= '9') || expr[pos] === '.')) {
        num += expr[pos];
        pos++;
      }
      return { type: 'number', value: Number(num) };
    }

    if (ch === '=' && expr[pos + 1] === '=') {
      pos += 2;
      return { type: 'op', value: '==' };
    }
    if (ch === '!' && expr[pos + 1] === '=') {
      pos += 2;
      return { type: 'op', value: '!=' };
    }
    if (ch === '|' && expr[pos + 1] === '|') {
      pos += 2;
      return { type: 'op', value: '||' };
    }
    if (ch === '&' && expr[pos + 1] === '&') {
      pos += 2;
      return { type: 'op', value: '&&' };
    }
    if (ch === '(') {
      pos++;
      return { type: 'paren', value: '(' };
    }
    if (ch === ')') {
      pos++;
      return { type: 'paren', value: ')' };
    }
    if (/[a-zA-Z_$]/.test(ch)) {
      let id = '';
      while (pos < expr.length && /[a-zA-Z0-9_$]/.test(expr[pos])) {
        id += expr[pos];
        pos++;
      }
      return { type: 'ident', value: id };
    }

    throw new Error(`不支持的字符: '${ch}' (位置 ${pos})`);
  }

  const tokenCache = [];
  function nextToken() {
    if (tokenCache.length > 0) return tokenCache.shift();
    return readToken();
  }
  function pushBack(tok) {
    if (tok) tokenCache.unshift(tok);
  }

  function parsePrimary() {
    const tok = nextToken();
    if (!tok) throw new Error('表达式意外结束');
    if (tok.type === 'string' || tok.type === 'number') return tok.value;
    if (tok.type === 'ident') {
      const value = vars[tok.value];
      return value === undefined || value === null ? '' : value;
    }
    if (tok.type === 'paren' && tok.value === '(') {
      const value = parseOr();
      const close = nextToken();
      if (!close || close.value !== ')') throw new Error('缺少闭合括号');
      return value;
    }
    throw new Error(`不支持的 token: ${JSON.stringify(tok)}`);
  }

  function parseComparison() {
    let left = parsePrimary();
    while (true) {
      const tok = nextToken();
      if (!tok || tok.type !== 'op') {
        pushBack(tok);
        return left;
      }
      if (tok.value === '==') {
        left = String(left) === String(parsePrimary());
        continue;
      }
      if (tok.value === '!=') {
        left = String(left) !== String(parsePrimary());
        continue;
      }
      pushBack(tok);
      return left;
    }
  }

  function parseAnd() {
    let left = parseComparison();
    while (true) {
      const tok = nextToken();
      if (tok && tok.type === 'op' && tok.value === '&&') {
        left = parseComparison() && left;
        continue;
      }
      pushBack(tok);
      return left;
    }
  }

  function parseOr() {
    let left = parseAnd();
    while (true) {
      const tok = nextToken();
      if (tok && tok.type === 'op' && tok.value === '||') {
        left = parseAnd() || left;
        continue;
      }
      pushBack(tok);
      return left;
    }
  }

  const result = parseOr();
  const remaining = nextToken();
  if (remaining) {
    throw new Error(`表达式末尾有多余内容: ${JSON.stringify(remaining)}`);
  }
  return result;
}

function attachInternalField(target, key, value) {
  if (!target || typeof target !== 'object') return target;
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    configurable: true,
    writable: true
  });
  return target;
}

/**
 * 统一的 AI 模型调用接口
 * @param {string} modelName - 模型名称（如 'DeepSeek Chat'）
 * @param {object} params - 调用参数（会替换模板中的占位符）
 * @param {string} apiKey - API 密钥（可选，默认从环境变量获取）
 * @returns {Promise<object>} - 返回映射后的响应数据
 */
async function callAIModel(modelName, params = {}, apiKey = null) {
  let model = null;
  let billingState = null;
  let requestStarted = false;
  let mergedParams = { ...params };
  try {
    // 从数据库获取模型配置（带缓存）
    model = await getCachedModelConfig(modelName);
    
    if (!model) {
      throw new Error(`模型 "${modelName}" 不存在或未启用`);
    }
    
    // 解析 JSON 字段
    const modelPricing = buildModelPricingPayload(model);
    const headersTemplate = parseJsonField(model.headers_template);
    const bodyTemplate = parseJsonField(model.body_template);
    const defaultParams = parseJsonField(model.default_params, {});
    const responseMapping = parseJsonField(model.response_mapping);
    
    // API Key 优先级：1. 数据库配置 2. 函数参数 3. 环境变量
    if (!apiKey) {
      if (model.api_key) {
        apiKey = model.api_key;
      } else {
        const envKey = `${model.provider.toUpperCase()}_API_KEY`;
        apiKey = process.env[envKey];
        
        if (!apiKey) {
          throw new Error(`API Key 未配置：请在模型配置中设置 API Key 或配置环境变量 ${envKey}`);
        }
      }
    }
    
    // 运行时参数（用户传入 + apiKey，优先级高）
    const runtimeParams = { ...params, apiKey };
    // 兼容旧逻辑：合并参数供 custom_handler 使用
    mergedParams = { ...defaultParams, ...runtimeParams };

    const billingContext = getAIBillingContext();
    console.log('[AI Model] 计费预检字段:', {
      modelName: model.name,
      modelCategory: model.category,
      provider: model.provider,
      userId: billingContext?.userId ?? null,
      projectId: billingContext?.projectId ?? null,
      sourceType: billingContext?.sourceType ?? null,
      operationKey: billingContext?.operationKey ?? null,
      workflowJobId: billingContext?.workflowJobId ?? null,
      generationTaskId: billingContext?.generationTaskId ?? null,
      resourceRefs: billingContext?.resourceRefs || {},
      maxTokens: mergedParams.maxTokens ?? mergedParams.max_tokens ?? null,
      duration: mergedParams.duration ?? mergedParams.durationSeconds ?? null,
      itemCount: mergedParams.itemCount ?? mergedParams.n ?? mergedParams.count ?? null,
      aspectRatio: mergedParams.aspectRatio ?? null
    });

    billingState = await prepareModelBilling(model, mergedParams);
    
    // 两轮渲染 URL（第一轮 runtimeParams，第二轮 defaultParams 兜底）
    const url = renderWithFallback('string', model.url_template, runtimeParams, defaultParams, 'url');
    
    // 两轮渲染 Headers
    const headers = renderWithFallback('json', headersTemplate, runtimeParams, defaultParams, 'headers');
    
    // 构建请求选项
    const requestOptions = {
      method: model.request_method,
      headers
    };
    
    // 两轮渲染 Body
    if (bodyTemplate && (model.request_method === 'POST' || model.request_method === 'PUT')) {
      const renderedBody = renderWithFallback('json', bodyTemplate, runtimeParams, defaultParams, 'body');
      
      // 根据 Content-Type 决定序列化方式
      const contentType = headers['Content-Type'] || headers['content-type'] || '';
      
      if (contentType.includes('application/x-www-form-urlencoded')) {
        // URL 编码格式
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(renderedBody)) {
          params.append(key, String(value));
        }
        requestOptions.body = params.toString();
      } else {
        // 默认使用 JSON 格式
        requestOptions.body = JSON.stringify(renderedBody);
      }
    }
    
    await assertSafeOutboundUrl(url, { context: `AI 模型 ${modelName} 提交请求` });

    // === 自定义 Handler 拦截 ===
    // 模板渲染完成后，如果配置了 custom_handler，则交给 handler 处理请求
    if (model.custom_handler) {
      const handler = getHandler(model.custom_handler);
      if (handler && typeof handler.call === 'function') {
        console.log(`[AI Model] 使用自定义 handler "${model.custom_handler}" 处理提交请求`);
        
        // 解析渲染后的 body 为对象（handler 拿到的是对象，不是字符串）
        let bodyObj = null;
        if (requestOptions.body) {
          try { bodyObj = JSON.parse(requestOptions.body); } catch { bodyObj = requestOptions.body; }
        }
        
        const rendered = {
          url,
          method: requestOptions.method,
          headers: { ...headers },
          body: bodyObj
        };
        
        // handler 返回原始 API 响应 data
        requestStarted = true;
        const data = await handler.call(model, mergedParams, rendered);
        
        // 外层统一做 response_mapping
        const result = mapResponse(data, responseMapping);
        result._raw = data;
        attachInternalField(result, '_submitParams', mergedParams);
        result._model = {
          name: model.name,
          provider: model.provider,
          category: model.category,
          priceConfig: modelPricing.priceConfig,
          priceSummary: modelPricing.priceSummary
        };

        const taskId = result.taskId || result.task_id || result.task_Id;
        if (taskId) {
          result._billing = await createPendingAsyncBilling(model, billingState);
        } else {
          await finalizeImmediateBilling({
            model,
            params: mergedParams,
            billingState,
            submitResult: result,
            requestStatus: 'success'
          });
        }
        return result;
      } else {
        console.warn(`[AI Model] custom_handler "${model.custom_handler}" 未找到或缺少 call 方法，回退到模板流程`);
      }
    }
    
    // === 默认模板 fetch 流程 ===
    // 发送请求
    console.log(`[AI Model] Calling ${modelName}:`, url);
    console.log('[AI Model] Request Method:', requestOptions.method);
    console.log('[AI Model] Request Headers:', JSON.stringify(sanitizeHeaders(requestOptions.headers), null, 2));
    if (isDebug && requestOptions.body) {
      try {
        const bodyObj = JSON.parse(requestOptions.body);
        const fields = Object.keys(bodyObj);
        console.log(`[AI Model] Request Body 字段列表: [${fields.join(', ')}]`);

        // 特别打印content数组的完整内容（用于调试）
        if (bodyObj.content && Array.isArray(bodyObj.content)) {
          console.log('[AI Model] Content数组详情:');
          bodyObj.content.forEach((item, index) => {
            console.log(`[AI Model]   content[${index}]:`, JSON.stringify(item, null, 2));
          });
        }

        for (const key of fields) {
          const val = typeof bodyObj[key] === 'string' ? bodyObj[key] : JSON.stringify(bodyObj[key]);
          console.log(`[AI Model]   ${key}: ${val.substring(0, 200)}${val.length > 200 ? '...' : ''}`);
        }
      } catch (e) {
        // 尝试以 form-urlencoded 解析
        try {
          const formParams = new URLSearchParams(requestOptions.body);
          const fields = [...formParams.keys()];
          console.log(`[AI Model] Request Body (form-urlencoded) 字段列表: [${fields.join(', ')}]`);
          for (const key of fields) {
            const val = formParams.get(key) || '';
            console.log(`[AI Model]   ${key}: ${val.substring(0, 200)}${val.length > 200 ? '...' : ''}`);
          }
        } catch (e2) {
          console.log('[AI Model] Request Body (未知格式):', requestOptions.body.substring(0, 200));
        }
      }
    }
    
    // 添加超时控制（从 default_params.timeout 读取，默认300秒）
    const controller = new AbortController();
    const timeoutMs = toNumberSafe(defaultParams.timeout, 300) * 1000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    let data;
    let response;
    try {
      requestStarted = true;
      response = await fetchWithRetry(url, {
        ...requestOptions,
        signal: controller.signal
      }, `AI 模型 ${modelName} 提交请求`);
      clearTimeout(timeout);
      
      console.log('[AI Model] Response Status:', response.status, response.statusText);
      console.log('[AI Model] Response Headers:', JSON.stringify(sanitizeHeaders(Object.fromEntries(response.headers.entries())), null, 2));
    
      // 获取响应文本
      const responseText = await response.text();
      if (isDebug) {
        console.log('[AI Model] Response Text (first 500 chars):', responseText.substring(0, 500));
      }
    
      // 尝试解析 JSON
      try {
        data = JSON.parse(responseText);
        if (isDebug) {
          const dataStr = JSON.stringify(data, null, 2);
          console.log('[AI Model] Response Data (first 100 chars):', dataStr.substring(0, 100) + (dataStr.length > 100 ? '...' : ''));
        }
      } catch (parseError) {
        console.error('[AI Model] JSON Parse Error:', parseError.message);
        console.error('[AI Model] Raw Response:', responseText);
        throw new Error(`API 返回的不是有效的 JSON 格式。响应内容: ${responseText.substring(0, 200)}...`);
      }
      
      if (!response.ok) {
        throw new Error(data.error?.message || `API 调用失败: ${response.status}`);
      }
    } catch (fetchError) {
      clearTimeout(timeout);
      if (fetchError.name === 'AbortError') {
        console.error(`[AI Model] Request timeout after ${Math.round(timeoutMs / 1000)} seconds`);
        throw new Error(`API 请求超时（${Math.round(timeoutMs / 1000)}秒），请稍后重试`);
      }
      console.error('[AI Model] Network error:', fetchError.message);
      throw new Error(`网络请求失败: ${fetchError.message}。请检查网络连接或稍后重试`);
    }
    
    // 使用 mapResponse 提取字段（更简洁）
    const result = mapResponse(data, responseMapping);
    
    // 添加原始响应和模型信息
    // 根据 Content-Type 决定如何保存请求体
    let requestBody = null;
    if (requestOptions.body) {
      const contentType = requestOptions.headers['Content-Type'] || requestOptions.headers['content-type'] || '';
      if (contentType.includes('application/x-www-form-urlencoded')) {
        // URL 编码格式，保存原始字符串
        requestBody = requestOptions.body;
      } else {
        // JSON 格式，解析为对象
        try {
          requestBody = JSON.parse(requestOptions.body);
        } catch (e) {
          requestBody = requestOptions.body; // 解析失败则保存原始字符串
        }
      }
    }
    
    result._raw = {
      ...data,
      request: {
        url,
        method: requestOptions.method,
        headers: requestOptions.headers,
        body: requestBody
      },
      headers: Object.fromEntries(response.headers.entries())
    };
    attachInternalField(result, '_submitParams', mergedParams);
    result._model = {
      name: model.name,
      provider: model.provider,
      category: model.category,
      priceConfig: modelPricing.priceConfig,
      priceSummary: modelPricing.priceSummary
    };

    const taskId = result.taskId || result.task_id || result.task_Id;
    if (taskId) {
      result._billing = await createPendingAsyncBilling(model, billingState);
    } else {
      await finalizeImmediateBilling({
        model,
        params: mergedParams,
        billingState,
        submitResult: result,
        requestStatus: 'success'
      });
    }
    
    return result;
  } catch (error) {
    if (model && billingState && requestStarted) {
      try {
        await finalizeImmediateBilling({
          model,
          params: mergedParams,
          billingState,
          submitResult: {
            _submitParams: mergedParams
          },
          requestStatus: 'failed',
          errorMessage: error.message
        });
      } catch (billingError) {
        console.error(`[AI Model] 失败计费写入失败 (${modelName}):`, billingError);
      }
    }
    console.error(`[AI Model] Error calling ${modelName}:`, error);
    throw error;
  }
}

/**
 * 统一的 AI 模型查询接口（用于异步任务轮询）
 * 使用模型配置中的 query_* 字段构建请求
 * @param {string} modelName - 模型名称
 * @param {object} params - 查询参数（提交接口映射结果的字段，会替换查询模板中的占位符）
 * @param {string} apiKey - API 密钥（可选）
 * @returns {Promise<object>} - 返回映射后的查询响应
 */
async function queryAIModel(modelName, params = {}, apiKey = null) {
  try {
    const model = await getCachedModelConfig(modelName);

    if (!model) {
      throw new Error(`模型 "${modelName}" 不存在或未启用`);
    }

    if (!model.query_url_template) {
      throw new Error(`模型 "${modelName}" 未配置查询接口`);
    }

    // API Key
    if (!apiKey) {
      if (model.api_key) {
        apiKey = model.api_key;
      } else {
        const envKey = `${model.provider.toUpperCase()}_API_KEY`;
        apiKey = process.env[envKey];
      }
    }

    // 运行时参数（查询映射字段 + apiKey）
    const runtimeParams = { ...params, apiKey };
    // 兼容旧逻辑
    const mergedParams = { ...runtimeParams };

    // 解析 default_params 作为兜底
    const defaultParams = parseJsonField(model.default_params, {});

    // 两轮渲染查询 URL
    const url = renderWithFallback('string', model.query_url_template, runtimeParams, defaultParams, 'query_url');

    // 两轮渲染查询 Headers
    const queryHeadersTemplate = parseJsonField(model.query_headers_template, {});
    const headers = renderWithFallback('json', queryHeadersTemplate, runtimeParams, defaultParams, 'query_headers');

    // 构建请求
    const queryMethod = model.query_method || 'GET';
    const requestOptions = { method: queryMethod, headers };

    // 两轮渲染查询 Body
    const queryBodyTemplate = parseJsonField(model.query_body_template);

    if (queryBodyTemplate && queryMethod !== 'GET') {
      const renderedBody = renderWithFallback('json', queryBodyTemplate, runtimeParams, defaultParams, 'query_body');
      const contentType = headers['Content-Type'] || headers['content-type'] || '';

      if (contentType.includes('application/x-www-form-urlencoded')) {
        const urlParams = new URLSearchParams();
        for (const [key, value] of Object.entries(renderedBody)) {
          urlParams.append(key, String(value));
        }
        requestOptions.body = urlParams.toString();
      } else {
        requestOptions.body = JSON.stringify(renderedBody);
      }
    }

    await assertSafeOutboundUrl(url, { context: `AI 模型 ${modelName} 查询请求` });

    // === 自定义 Query Handler 拦截 ===
    if (model.custom_query_handler) {
      const handler = getHandler(model.custom_query_handler);
      if (handler && typeof handler.query === 'function') {
        console.log(`[AI Model Query] 使用自定义 handler "${model.custom_query_handler}" 处理查询请求`);
        
        let bodyObj = null;
        if (requestOptions.body) {
          try { bodyObj = JSON.parse(requestOptions.body); } catch { bodyObj = requestOptions.body; }
        }
        
        const rendered = {
          url,
          method: queryMethod,
          headers: { ...headers },
          body: bodyObj
        };
        
        // handler 返回原始 API 响应 data
        const data = await handler.query(model, mergedParams, rendered);
        if (isDebug) {
          console.log('[AI Model Query] Response:', JSON.stringify(data, null, 2));
        }
        
        // 外层统一做 query_response_mapping
        const queryResponseMapping = parseJsonField(model.query_response_mapping);
        
        let result = data;
        if (queryResponseMapping) {
          result = mapResponse(data, queryResponseMapping);
          result._raw = data;
        }

        const mappedBase = { ...result };
        attachInternalField(result, '_queryParams', mergedParams);
        delete mappedBase._raw;

        const isSuccess = evaluateCondition(mappedBase, model.query_success_condition || null);
        const isFail = evaluateCondition(mappedBase, model.query_fail_condition || null);

        if (params?._billing?.recordId && (isSuccess || isFail)) {
          const finalResult = {
            ...result,
            _raw: data
          };
          attachInternalField(finalResult, '_queryParams', mergedParams);
          await finalizeAsyncBillingFromQuery(
            model,
            params,
            finalResult,
            isSuccess ? 'success' : 'failed'
          );
        }

        return result;
      } else {
        console.warn(`[AI Model Query] custom_query_handler "${model.custom_query_handler}" 未找到或缺少 query 方法，回退到模板流程`);
      }
    }
    
    // === 默认模板 fetch 流程 ===
    console.log(`[AI Model Query] Querying ${modelName}:`, url);

    // 添加超时控制（从 default_params.queryTimeout 读取，默认60秒）
    const controller = new AbortController();
    const queryTimeoutMs = toNumberSafe(defaultParams.queryTimeout, 60) * 1000;
    const timeout = setTimeout(() => controller.abort(), queryTimeoutMs);

    let data;
    try {
      const response = await fetchWithRetry(url, { ...requestOptions, signal: controller.signal }, `AI 模型 ${modelName} 查询请求`);
      clearTimeout(timeout);
      data = await response.json();
    } catch (fetchError) {
      clearTimeout(timeout);
      if (fetchError.name === 'AbortError') {
        throw new Error(`查询请求超时（${Math.round(queryTimeoutMs / 1000)}秒），请稍后重试`);
      }
      throw fetchError;
    }

    if (isDebug) {
      console.log('[AI Model Query] Response:', JSON.stringify(data, null, 2));
    }

    // 使用查询响应映射
    const queryResponseMapping = parseJsonField(model.query_response_mapping);

    let result = data;
    if (queryResponseMapping) {
      result = mapResponse(data, queryResponseMapping);
      result._raw = data;
    }

    const mappedBase = { ...result };
    attachInternalField(result, '_queryParams', mergedParams);
    delete mappedBase._raw;

    const isSuccess = evaluateCondition(mappedBase, model.query_success_condition || null);
    const isFail = evaluateCondition(mappedBase, model.query_fail_condition || null);

    if (params?._billing?.recordId && (isSuccess || isFail)) {
      const finalResult = {
        ...result,
        _raw: data
      };
      attachInternalField(finalResult, '_queryParams', mergedParams);
      await finalizeAsyncBillingFromQuery(
        model,
        params,
        finalResult,
        isSuccess ? 'success' : 'failed'
      );
    }

    return result;
  } catch (error) {
    console.error(`[AI Model Query] Error querying ${modelName}:`, error);
    throw error;
  }
}

/**
 * 获取所有启用的文本模型列表
 */
async function getTextModels() {
  const { queryAll } = require('./dbHelper');
  const models = await queryAll(
    "SELECT id, name, provider, category, description FROM ai_model_configs WHERE category = 'TEXT' AND is_active = 1 ORDER BY id ASC"
  );
  return models;
}

/**
 * 获取所有启用的图片模型列表
 */
async function getImageModels() {
  const { queryAll } = require('./dbHelper');
  const models = await queryAll(
    "SELECT id, name, provider, category, description FROM ai_model_configs WHERE category = 'IMAGE' AND is_active = 1 ORDER BY id ASC"
  );
  return models;
}

/**
 * 批量调用 AI 模型（并发控制）
 * @param {Array<{modelName: string, params: object, apiKey?: string}>} calls - 调用列表
 * @param {object} options - 选项
 * @param {number} options.concurrency - 最大并发数，默认 3
 * @returns {Promise<{results: Array, errors: Array}>}
 */
async function callAIModelBatch(calls, { concurrency = 3 } = {}) {
  const results = new Array(calls.length).fill(null);
  const errors = new Array(calls.length).fill(null);
  
  // 手写并发控制（不引入外部依赖）
  let index = 0;
  const execute = async () => {
    while (index < calls.length) {
      const currentIndex = index++;
      const { modelName, params, apiKey } = calls[currentIndex];
      try {
        results[currentIndex] = await callAIModel(modelName, params, apiKey);
      } catch (err) {
        errors[currentIndex] = { index: currentIndex, modelName, error: err.message };
      }
    }
  };
  
  // 启动 concurrency 个并发 worker
  const workers = Array.from({ length: Math.min(concurrency, calls.length) }, () => execute());
  await Promise.all(workers);
  
  return { results, errors: errors.filter(Boolean) };
}

module.exports = {
  callAIModel,
  queryAIModel,
  callAIModelBatch,
  getTextModels,
  getImageModels,
  invalidateModelCache
};
