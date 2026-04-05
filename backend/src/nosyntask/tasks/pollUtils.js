/**
 * 公共异步轮询组件
 * 
 * 统一处理：callAIModel 提交 → 判断同步/异步 → queryAIModel 轮询 → 用数据库配置判断成功/失败 → 返回映射结果
 * 
 * 所有任务（imageGeneration, videoGeneration, frameGeneration, sceneVideoGeneration）
 * 都通过此组件完成异步轮询，不再各自重复实现。
 * 
 * 依赖 ai_model_configs 表中的新字段：
 *   - query_success_condition:  JS 表达式，如 status == "succeed" || status == "completed"
 *   - query_fail_condition:     JS 表达式，如 status == "failed" || status == "error"
 *   - query_success_mapping:    成功时的字段映射，如 {"image_url": "data.task_result.images.0.url"}
 *   - query_fail_mapping:       失败时的字段映射，如 {"error": "data.fail_reason"}
 */

const { callAIModel, queryAIModel } = require('../../aiModelService');
const { queryOne } = require('../../dbHelper');
const { mapResponse } = require('../../utils/templateRenderer');
const { withRateLimit, withSubmitRateLimit, withPollRateLimit } = require('../utils/aiRateLimiter');
const pollManager = require('../utils/PollManager');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function shouldIgnoreUrlPath(path) {
  if (!path) return false;
  return path.includes('.request.') || path.startsWith('request.') || path.includes('.headers.') || path.startsWith('headers.');
}

function collectUrlCandidates(value, path = '', acc = []) {
  if (acc.length >= 12 || value === null || value === undefined) {
    return acc;
  }

  if (isHttpUrl(value)) {
    if (!shouldIgnoreUrlPath(path)) {
      acc.push({
        path: path || '(root)',
        url: value
      });
    }
    return acc;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUrlCandidates(item, path ? `${path}[${index}]` : `[${index}]`, acc));
    return acc;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      collectUrlCandidates(item, nextPath, acc);
    });
  }

  return acc;
}

function getObjectKeys(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
}

function stringifyForLog(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return `[Unserializable: ${error.message}]`;
  }
}


/**
 * 解析 JSON 字段（兼容字符串和对象）
 */
function parseJson(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

/**
 * 用数据库配置的条件表达式判断状态
 * 
 * 条件表达式是简单的 JS 表达式，变量来自 query_response_mapping 的映射结果
 * 例如: status == "succeed" || status == "completed"
 * 
 * @param {object} mappedResult - query_response_mapping 映射出的字段（如 {status: "succeed"}）
 * @param {string} conditionExpr - JS 条件表达式
 * @returns {boolean}
 */
function evaluateCondition(mappedResult, conditionExpr) {
  if (!conditionExpr) return false;
  try {
    return !!_safeEval(mappedResult, conditionExpr);
  } catch (err) {
    console.warn('[PollUtils] 条件表达式执行失败:', conditionExpr, err.message);
    return false;
  }
}

/**
 * 安全条件表达式求值器（递归下降解析器）
 * 
 * 仅支持：== != || && 运算符、字符串/数字字面量、变量标识符、括号分组
 * 不使用 eval / new Function，杜绝代码注入风险
 */
function _safeEval(vars, expr) {
  let pos = 0;

  function peek() { skipSpaces(); return expr[pos]; }
  function skipSpaces() { while (pos < expr.length && expr[pos] === ' ') pos++; }

  // 词法：读取一个 token
  function readToken() {
    skipSpaces();
    if (pos >= expr.length) return null;
    const ch = expr[pos];

    // 字符串字面量
    if (ch === '"' || ch === "'") {
      const quote = ch;
      pos++;
      let str = '';
      while (pos < expr.length && expr[pos] !== quote) {
        if (expr[pos] === '\\' && pos + 1 < expr.length) { pos++; str += expr[pos]; }
        else { str += expr[pos]; }
        pos++;
      }
      if (pos < expr.length) pos++; // 跳过闭合引号
      return { type: 'string', value: str };
    }

    // 数字字面量
    if (ch >= '0' && ch <= '9') {
      let num = '';
      while (pos < expr.length && ((expr[pos] >= '0' && expr[pos] <= '9') || expr[pos] === '.')) {
        num += expr[pos]; pos++;
      }
      return { type: 'number', value: Number(num) };
    }

    // 运算符
    if (ch === '=' && expr[pos + 1] === '=') { pos += 2; return { type: 'op', value: '==' }; }
    if (ch === '!' && expr[pos + 1] === '=') { pos += 2; return { type: 'op', value: '!=' }; }
    if (ch === '|' && expr[pos + 1] === '|') { pos += 2; return { type: 'op', value: '||' }; }
    if (ch === '&' && expr[pos + 1] === '&') { pos += 2; return { type: 'op', value: '&&' }; }

    // 括号
    if (ch === '(') { pos++; return { type: 'paren', value: '(' }; }
    if (ch === ')') { pos++; return { type: 'paren', value: ')' }; }

    // 标识符（变量名）
    if (/[a-zA-Z_$]/.test(ch)) {
      let id = '';
      while (pos < expr.length && /[a-zA-Z0-9_$]/.test(expr[pos])) {
        id += expr[pos]; pos++;
      }
      return { type: 'ident', value: id };
    }

    throw new Error(`不支持的字符: '${ch}' (位置 ${pos})`);
  }

  // 向前看 token（带回退）
  const tokenCache = [];
  function nextToken() {
    if (tokenCache.length > 0) return tokenCache.shift();
    return readToken();
  }
  function pushBack(tok) { if (tok) tokenCache.unshift(tok); }

  // 解析基本值
  function parsePrimary() {
    const tok = nextToken();
    if (!tok) throw new Error('表达式意外结束');
    if (tok.type === 'string') return tok.value;
    if (tok.type === 'number') return tok.value;
    if (tok.type === 'ident') {
      const v = vars[tok.value];
      return (v === undefined || v === null) ? '' : v;
    }
    if (tok.type === 'paren' && tok.value === '(') {
      const val = parseOr();
      const close = nextToken();
      if (!close || close.value !== ')') throw new Error('缺少闭合括号');
      return val;
    }
    throw new Error(`不支持的 token: ${JSON.stringify(tok)}`);
  }

  // 解析比较 == !=
  function parseComparison() {
    let left = parsePrimary();
    while (true) {
      const tok = nextToken();
      if (!tok || tok.type !== 'op') { pushBack(tok); return left; }
      if (tok.value === '==') { left = (String(left) === String(parsePrimary())); continue; }
      if (tok.value === '!=') { left = (String(left) !== String(parsePrimary())); continue; }
      pushBack(tok); return left;
    }
  }

  // 解析 &&
  function parseAnd() {
    let left = parseComparison();
    while (true) {
      const tok = nextToken();
      if (tok && tok.type === 'op' && tok.value === '&&') { left = parseComparison() && left; continue; }
      pushBack(tok); return left;
    }
  }

  // 解析 ||
  function parseOr() {
    let left = parseAnd();
    while (true) {
      const tok = nextToken();
      if (tok && tok.type === 'op' && tok.value === '||') { left = parseAnd() || left; continue; }
      pushBack(tok); return left;
    }
  }

  const result = parseOr();
  // 确保表达式完全消费
  const remaining = nextToken();
  if (remaining) {
    throw new Error(`表达式末尾有多余内容: ${JSON.stringify(remaining)}`);
  }
  return result;
}


/**
 * 提交 AI 模型请求并轮询结果
 * 
 * - 成功：返回 { status: true, ...映射结果, _submitResult }
 * - 失败：直接 throw Error（调用方无需判断 status）
 * - 超时/网络错误：直接 throw Error
 * 
 * @param {string} modelName - 模型名称
 * @param {object} submitParams - 提交给 callAIModel 的参数
 * @param {object} options - 轮询选项
 * @param {number} options.intervalMs - 轮询间隔（默认 3000）
 * @param {number} options.maxDurationMs - 最大等待时间（默认 300000）
 * @param {number} options.maxNetworkErrors - 连续网络错误上限（默认 5）
 * @param {function} options.onProgress - 进度回调 (percent: number) => void
 * @param {number} options.progressStart - 进度起始百分比（默认 30）
 * @param {number} options.progressEnd - 进度结束百分比（默认 90）
 * @param {string} options.logTag - 日志标签（默认 'PollUtils'）
 * @returns {Promise<object>} 成功时返回 { status: true, ...successMapping结果, _submitResult }
 * @throws {Error} 失败/超时/网络错误时抛出异常
 */
async function submitAndPoll(modelName, submitParams, options = {}) {
  const {
    intervalMs = 10000,
    maxDurationMs = 600000,
    maxNetworkErrors = 5,
    onProgress,
    progressStart = 30,
    progressEnd = 90,
    logTag = 'PollUtils',
    adaptiveInterval = true, // 启用自适应轮询间隔
    intervalMultiplier = 1.5, // 每次轮询间隔增长系数
    maxIntervalMs = 30000, // 最大轮询间隔
    enableRateLimit = true // 新增：是否启用全局限流
  } = options;

  // === 1. 提交请求（带全局限流 + 429 重试） ===
  // 优化：使用 withSubmitRateLimit，提交完成后立即释放并发槽
  // 轮询阶段使用独立的 poll 信号量池，不占用模型提交槽位
  const maxRetries = options.maxRetries || 3;
  const retryDelayMs = options.retryDelayMs || 60000; // 默认 60 秒
  
  let submitResult;
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const submitFn = async () => {
        return await callAIModel(modelName, submitParams);
      };
      
      // 提交阶段：获取信号量 → 提交 → 立即释放
      submitResult = enableRateLimit 
        ? await withSubmitRateLimit(modelName, submitFn, { logTag })
        : await submitFn();
      
      break; // 成功则退出重试循环
    } catch (err) {
      lastError = err;
      const isRateLimited = err.message?.includes('429') || 
                           err.message?.includes('rate limit') || 
                           err.message?.includes('too many') ||
                           err.message?.includes('频率限制');
      
      if (isRateLimited && attempt < maxRetries - 1) {
        const delay = retryDelayMs * (attempt + 1); // 递增延迟
        console.warn(`[${logTag}] API 限流 (429)，第 ${attempt + 1} 次重试，等待 ${delay / 1000} 秒...`);
        await sleep(delay);
        continue;
      }
      throw err; // 非限流错误或重试次数耗尽，直接抛出
    }
  }
  
  if (!submitResult) {
    throw lastError || new Error('AI 调用失败');
  }
  
  console.log(`[${logTag}] 提交接口原始响应体:`, stringifyForLog(submitResult?._raw || submitResult));

  // === 2. 加载模型的查询配置 ===
  const modelConfig = await queryOne(
    'SELECT query_success_condition, query_fail_condition, query_success_mapping, query_fail_mapping, query_response_mapping FROM ai_model_configs WHERE name = ? AND is_active = 1',
    [modelName]
  );

  const successCondition = modelConfig?.query_success_condition || null;
  const failCondition = modelConfig?.query_fail_condition || null;
  const successMapping = parseJson(modelConfig?.query_success_mapping);
  const failMapping = parseJson(modelConfig?.query_fail_mapping);

  // === 3. 检查是否同步返回（无 taskId） ===
  const taskId = submitResult.taskId || submitResult.task_id || submitResult.task_Id;
  const hasDirectResult = !taskId;

  if (hasDirectResult) {
    // 同步模型，直接成功
    let mapped = submitResult;
    if (successMapping && submitResult._raw) {
      mapped = mapResponse(submitResult._raw, successMapping);
    }
    const rawForLog = submitResult._raw || submitResult;
    console.log(`[${logTag}] 同步结果字段:`, {
      model: modelName,
      mappedKeys: getObjectKeys(mapped),
      submitKeys: getObjectKeys(submitResult),
      rawKeys: getObjectKeys(rawForLog),
      urlCandidates: collectUrlCandidates(rawForLog)
    });
    return { status: true, ...mapped, _submitResult: submitResult };
  }

  // === 4. 异步模型：使用 PollManager 统一调度轮询 ===
  const { _raw, _model, ...queryFields } = submitResult;

  console.log(`[${logTag}] 异步任务已提交, taskId=${taskId}, 委托给 PollManager 统一调度轮询...`);

  // 通过 PollManager 注册轮询任务
  const pollResult = await pollManager.register({
    modelName,
    queryFields,
    intervalMs: intervalMs,
    maxDurationMs: maxDurationMs,
    maxNetworkErrors,
    adaptiveInterval,
    intervalMultiplier,
    maxIntervalMs,
    logTag,
    onProgress,
    progressStart,
    progressEnd,

    // 每次轮询结果的判断回调
    onPollResult: (queryResult) => {
      const rawData = queryResult._raw || queryResult;
      const mappedBase = { ...queryResult };
      delete mappedBase._raw;

      // 必须配置条件表达式
      if (!successCondition && !failCondition) {
        return {
          status: 'failed',
          error: `模型 "${modelName}" 未配置 query_success_condition / query_fail_condition，无法判断异步任务状态。`
        };
      }

      const isSuccess = evaluateCondition(mappedBase, successCondition);
      const isFail = evaluateCondition(mappedBase, failCondition);

      if (isSuccess) {
        let mapped;
        if (successMapping) {
          mapped = mapResponse(rawData, successMapping);
        } else {
          mapped = mappedBase;
        }
        console.log(`[${logTag}] 成功结果字段:`, {
          model: modelName,
          taskId,
          mappedKeys: getObjectKeys(mapped),
          urlCandidates: collectUrlCandidates(rawData)
        });
        return {
          status: 'success',
          data: {
            status: true,
            ...mapped,
            _submitResult: submitResult,
            _queryResult: queryResult,
            _rawQueryResult: rawData
          }
        };
      }

      if (isFail) {
        let errorInfo;
        if (failMapping) {
          errorInfo = mapResponse(rawData, failMapping);
        } else {
          errorInfo = {
            error: mappedBase.error || mappedBase.message
              || rawData?.message || rawData?.data?.message
              || rawData?.data?.fail_reason
              || '未知错误'
          };
        }
        const errorMsg = errorInfo.error || errorInfo.message || errorInfo.fail_reason || '未知错误';
        return {
          status: 'failed',
          error: `${errorMsg} (taskId: ${taskId})`
        };
      }

      // pending，继续轮询
      return { status: 'pending' };
    }
  });

  return pollResult;
}

module.exports = {
  submitAndPoll,
  sleep,
  evaluateCondition
};
