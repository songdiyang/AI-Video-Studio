/**
 * 模板渲染工具 - 支持 Mustache 风格的占位符替换
 * 支持嵌套 JSON 结构和路径访问
 */

const { deriveImageParams } = require('./deriveImageParams');
const { deriveTextParams } = require('./deriveTextParams');

/**
 * 渲染模板字符串，替换 {{key}} 占位符
 * 统一处理所有 {{}} 包裹的占位符，不区分是否有引号
 * 
 * 特别处理 URL 参数：如果是 URL 模板，会自动进行 URL 编码
 */
function renderTemplate(template, data) {
  if (!template) return template;
  
  // 判断是否是 URL 模板（包含 http:// 或 https:// 或 ?）
  const isUrl = /^https?:\/\//.test(template) || template.includes('?');
  
  // 统一替换所有 {{key}} 占位符（不管是否有引号）
  return template.replace(/{{(\w+)}}/g, (match, key) => {
    const value = data[key];
    if (value === undefined) return match;
    if (typeof value === 'object') return JSON.stringify(value);
    // URL 参数需要编码
    return isUrl ? encodeURIComponent(String(value)) : String(value);
  });
}

/**
 * 渲染 JSON 对象模板，递归替换所有占位符
 * 遇到 {{key}} 占位符就整体替换：
 * - 如果值为 _REMOVE_ 标识符：标记该字段删除（调用方明确表示不需要该字段）
 * - 如果值存在且不为 _REMOVE_：替换为对应的值（保持类型）
 * - 如果值不存在（undefined）：保留 {{key}} 原样（留给校验层报错）
 */
function renderJsonTemplate(template, data) {
  if (!template) return template;
  
  function processValue(value) {
    if (typeof value === 'string') {
      // 检查是否是纯占位符 "{{key}}"
      const pureMatch = value.match(/^{{(\w+)}}$/);
      if (pureMatch) {
        const key = pureMatch[1];
        const dataValue = data[key];
        // 未传入：保留原样，留给校验层处理
        if (dataValue === undefined) return value;
        // _REMOVE_ 标识符或 null：标记删除
        if (dataValue === null || dataValue === '_REMOVE_') {
          return '__REMOVE_FIELD__';
        }
        return dataValue;
      }
      
      // 字符串内包含占位符（如 "Bearer {{apiKey}}"）
      if (value.includes('{{')) {
        let hasRemove = false;
        const result = value.replace(/{{(\w+)}}/g, (match, key) => {
          const dataValue = data[key];
          if (dataValue === undefined) return match;
          if (dataValue === null || dataValue === '_REMOVE_') {
            hasRemove = true;
            return '__REMOVE_FIELD__';
          }
          return String(dataValue);
        });
        if (hasRemove || result.includes('__REMOVE_FIELD__')) {
          return '__REMOVE_FIELD__';
        }
        return result;
      }
      
      return value;
    } else if (Array.isArray(value)) {
      return value.map(processValue).filter(item => item !== '__REMOVE_FIELD__');
    } else if (value && typeof value === 'object') {
      const result = {};
      for (const [k, v] of Object.entries(value)) {
        const processed = processValue(v);
        if (processed !== '__REMOVE_FIELD__') {
          result[k] = processed;
        }
      }
      // 如果对象为空（所有字段都被移除），则标记整个对象为删除
      if (Object.keys(result).length === 0) {
        return '__REMOVE_FIELD__';
      }
      // 特殊处理：如果对象只剩下 role/type 等元数据字段，但缺少关键数据字段（如 image_url, url, text 等），则标记为删除
      // 这种情况通常发生在可选的 image_url 对象被移除后，外层对象只剩下 role 和 type
      const keys = Object.keys(result);
      const metadataKeys = ['role', 'type', 'name', 'id'];
      const dataKeys = ['image_url', 'url', 'text', 'content', 'value', 'data'];
      const hasOnlyMetadata = keys.length > 0 &&
                              keys.every(k => metadataKeys.includes(k)) &&
                              !keys.some(k => dataKeys.includes(k));
      if (hasOnlyMetadata) {
        return '__REMOVE_FIELD__';
      }
      return result;
    }
    
    return value;
  }
  
  return processValue(template);
}

/**
 * 从嵌套对象中提取值，支持路径访问如 "data.task_id" 或 "choices.0.message.content"
 */
function extractValueByPath(obj, path) {
  if (!path) return undefined;

  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined) return null;
    
    // 支持数组索引（如 "choices.0" 或 "data[0]"）
    if (key.includes('[') && key.includes(']')) {
      const arrayKey = key.substring(0, key.indexOf('['));
      const index = parseInt(key.substring(key.indexOf('[') + 1, key.indexOf(']')));
      current = current?.[arrayKey]?.[index];
    } else {
      current = current[key];
    }

    if (current === undefined) return undefined;
  }

  return current;
}

/**
 * 根据响应映射提取标准化的响应数据
 */
function mapResponse(rawResponse, mapping) {
  const result = {};

  for (const [standardKey, responsePath] of Object.entries(mapping)) {
    result[standardKey] = extractValueByPath(rawResponse, responsePath);
  }

  return result;
}

/**
 * 合并默认参数和运行时参数（简单两层合并）
 * 
 * 注意：此函数与 nosyntask/utils/aiParamBuilder/parameterMerger.js 中的 mergeParameters 不同：
 * - 本函数：简单两层合并（defaultParams + runtimeParams），用于模板渲染场景
 * - mergeParameters：三层合并（workflowParams > userParams > defaultParams），带重复参数检测和警告，用于 AI 参数构建场景
 * 
 * 两者用途不同，请勿混用。
 */
function mergeParams(defaultParams, runtimeParams) {
  return {
    ...defaultParams,
    ...runtimeParams
  };
}

/**
 * 从渲染结果中查找所有未被替换的 {{key}} 占位符
 * 支持字符串和嵌套对象/数组
 */
function findUnrenderedPlaceholders(value) {
  const placeholders = new Set();
  const pattern = /{{(\w+)}}/g;

  function scan(v) {
    if (typeof v === 'string') {
      let m;
      while ((m = pattern.exec(v)) !== null) {
        placeholders.add(m[1]);
      }
    } else if (Array.isArray(v)) {
      v.forEach(scan);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(scan);
    }
  }

  scan(value);
  return [...placeholders];
}

/**
 * 两轮渲染 + 残留校验（Model Field Guard）
 * 
 * 渲染流程：
 *   1. 合并参数：{ ...fallbackParams, ...runtimeParams }（用户传入优先）
 *   2. 渲染前校验：扫描模板中的 {{key}}，检查合并后的参数是否覆盖了所有占位符
 *   3. 渲染：用合并后的参数渲染模板
 * 
 * 删除字段：调用方传入 { imageUrls: '_REMOVE_' } 表示明确不需要该字段
 * 
 * 注意：校验在渲染前进行（扫描原始模板），而非渲染后扫描结果。
 * 因为用户传入的数据（如 prompt 文本）中可能包含 {{xxx}} 字样，
 * 渲染后扫描会误判为未填充的占位符。
 * 
 * @param {'string'|'json'} type - 渲染类型
 * @param {*} template - 模板
 * @param {object} runtimeParams - 用户传入的运行时参数（优先级高）
 * @param {object} fallbackParams - 后台配置的默认参数（兜底）
 * @param {string} [label] - 用于错误提示的标签
 * @returns {*} 渲染完成的结果
 * @throws {Error} 渲染后仍有未填充的占位符
 */
function renderWithFallback(type, template, runtimeParams, fallbackParams, label = 'template') {
  if (!template) return template;

  // 合并参数：runtimeParams 覆盖 fallbackParams（包括 _REMOVE_ 标识符）
  const mergedData = { ...(fallbackParams || {}), ...(runtimeParams || {}) };

  // 自动派生缺失字段（多传不会报错，模板只用它引用的占位符）
  // 图片/视频参数派生：imageUrl ↔ imageUrls ↔ startFrame ↔ endFrame
  // 派生前过滤 _REMOVE_ 标识符，避免把它当成有效值传入派生函数
  const _r = v => v === '_REMOVE_' ? undefined : v;
  const imgDerived = deriveImageParams({
    imageUrl: _r(mergedData.imageUrl),
    imageUrls: mergedData.imageUrls,
    startFrame: _r(mergedData.startFrame),
    endFrame: _r(mergedData.endFrame)
  });
  if (imgDerived.imageUrl && !mergedData.imageUrl)     mergedData.imageUrl = imgDerived.imageUrl;
  if (imgDerived.imageUrls && !mergedData.imageUrls)   mergedData.imageUrls = imgDerived.imageUrls;
  if (imgDerived.startFrame && !mergedData.startFrame) mergedData.startFrame = imgDerived.startFrame;
  if (imgDerived.endFrame && !mergedData.endFrame)     mergedData.endFrame = imgDerived.endFrame;

  // 文本参数派生：prompt ↔ message ↔ messages
  const txtDerived = deriveTextParams({
    prompt: _r(mergedData.prompt),
    message: _r(mergedData.message),
    messages: mergedData.messages
  });
  if (txtDerived.prompt && !mergedData.prompt)     mergedData.prompt = txtDerived.prompt;
  if (txtDerived.message && !mergedData.message)   mergedData.message = txtDerived.message;
  if (txtDerived.messages && !mergedData.messages) mergedData.messages = txtDerived.messages;

  // 尺寸参数派生：size ↔ resolution（双向兼容）
  // Seedream 5.0 等模型使用 size（如 '2k', '3k'），其他模型可能使用 resolution
  if (!mergedData.size && mergedData.resolution && mergedData.resolution !== '_REMOVE_') {
    mergedData.size = mergedData.resolution;
  }
  if (!mergedData.resolution && mergedData.size && mergedData.size !== '_REMOVE_') {
    mergedData.resolution = mergedData.size;
  }
  // 如果 size 和 resolution 都没有，但模板需要 size，提供默认值 '2k'（Seedream 5.0 系列默认）
  // 这在模板校验阶段会检测到需要 size，此时提供兜底值
  if (!mergedData.size || mergedData.size === '_REMOVE_') {
    mergedData.size = '2k';
  }

  // 渲染前校验：扫描原始模板中的 {{key}}，检查 mergedData 是否全部覆盖
  const required = findUnrenderedPlaceholders(template);
  const missing = required.filter(key => mergedData[key] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `模板渲染不完整 [${label}]：以下占位符未被填充: ${missing.map(k => '{{' + k + '}}').join(', ')}。` +
      `请检查调用参数或模型的 default_params 配置。如果某字段确实不需要，请传入 '_REMOVE_' 标识符。`
    );
  }

  const renderFn = type === 'json' ? renderJsonTemplate : renderTemplate;
  return renderFn(template, mergedData);
}

/**
 * 构建完整的 HTTP 请求对象
 */
function buildRequest(config, runtimeParams) {
  const params = mergeParams(config.defaultParams, runtimeParams);

  const url = renderTemplate(config.urlTemplate, params);
  const headers = renderJsonTemplate(config.headersTemplate, params);
  const body = config.bodyTemplate
    ? renderJsonTemplate(config.bodyTemplate, params)
    : undefined;

  return {
    method: config.requestMethod,
    url,
    headers,
    body
  };
}

/**
 * 构建查询请求对象（用于轮询任务状态）
 */
function buildQueryRequest(config, runtimeParams) {
  if (!config.queryUrlTemplate) return null;

  const params = mergeParams(config.defaultParams, runtimeParams);

  const url = renderTemplate(config.queryUrlTemplate, params);
  const headers = config.queryHeadersTemplate
    ? renderJsonTemplate(config.queryHeadersTemplate, params)
    : {};
  const body = config.queryBodyTemplate
    ? renderJsonTemplate(config.queryBodyTemplate, params)
    : undefined;

  return {
    method: config.queryMethod || 'GET',
    url,
    headers,
    body
  };
}

module.exports = {
  renderTemplate,
  renderJsonTemplate,
  extractValueByPath,
  mapResponse,
  mergeParams,
  buildRequest,
  buildQueryRequest,
  findUnrenderedPlaceholders,
  renderWithFallback
};
