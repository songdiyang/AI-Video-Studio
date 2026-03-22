/**
 * 参数合并器
 * 合并工作流参数和用户参数，检测重复并输出警告
 */

/**
 * 合并工作流参数和用户参数（三层合并，带重复检测）
 * 优先级：workflowParams > userParams > defaultParams
 *
 * 注意：此函数与 utils/templateRenderer.js 中的 mergeParams 不同：
 * - 本函数：三层合并，带重复参数检测和警告，用于 AI 参数构建场景
 * - mergeParams：简单两层合并（defaultParams + runtimeParams），用于模板渲染场景
 * 
 * 两者用途不同，请勿混用。
 *
 * @param {object} workflowParams - 工作流传入的参数（优先级最高）
 * @param {object} userParams - 用户传入的参数（优先级中等）
 * @param {object} defaultParams - 模型默认参数（优先级最低）
 * @returns {object} 合并后的参数对象
 */
function mergeParameters(workflowParams = {}, userParams = {}, defaultParams = {}) {
  // 检测重复参数（工作流和用户都传了同一个参数）
  const duplicates = findDuplicateParams(workflowParams, userParams);

  if (duplicates.length > 0) {
    // 输出黄色警告
    console.warn('\x1b[33m%s\x1b[0m',
      `[AI Param Builder] ⚠️  检测到重复参数（工作流和用户都传入了相同参数）：${duplicates.join(', ')}`
    );
    console.warn('\x1b[33m%s\x1b[0m',
      '[AI Param Builder] 优先使用工作流参数，用户参数将被忽略'
    );

    // 输出详细对比
    duplicates.forEach(key => {
      console.warn('\x1b[33m%s\x1b[0m',
        `[AI Param Builder]   - ${key}: 工作流=${JSON.stringify(workflowParams[key])} | 用户=${JSON.stringify(userParams[key])}`
      );
    });
  }

  // 合并参数：workflowParams 覆盖 userParams 覆盖 defaultParams
  const merged = {
    ...defaultParams,
    ...userParams,
    ...workflowParams
  };

  return merged;
}

/**
 * 查找重复参数（同时存在于 workflowParams 和 userParams 中）
 * @param {object} workflowParams - 工作流参数
 * @param {object} userParams - 用户参数
 * @returns {string[]} 重复的参数名列表
 */
function findDuplicateParams(workflowParams, userParams) {
  const workflowKeys = Object.keys(workflowParams || {});
  const userKeys = Object.keys(userParams || {});

  // 找出同时存在于两个对象中的 key
  const duplicates = workflowKeys.filter(key => userKeys.includes(key));

  return duplicates;
}

/**
 * 过滤掉值为 undefined 的参数
 * @param {object} params - 参数对象
 * @returns {object} 过滤后的参数对象
 */
function filterUndefinedParams(params) {
  const filtered = {};

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * 提取模板中需要的参数（扫描 {{key}} 占位符）
 * @param {*} template - 模板（字符串或对象）
 * @returns {string[]} 需要的参数名列表
 */
function extractRequiredParams(template) {
  const params = new Set();
  const pattern = /{{(\w+)}}/g;

  function scan(value) {
    if (typeof value === 'string') {
      let match;
      while ((match = pattern.exec(value)) !== null) {
        params.add(match[1]);
      }
    } else if (Array.isArray(value)) {
      value.forEach(scan);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(scan);
    }
  }

  scan(template);
  return [...params];
}

module.exports = {
  mergeParameters,
  findDuplicateParams,
  filterUndefinedParams,
  extractRequiredParams
};
