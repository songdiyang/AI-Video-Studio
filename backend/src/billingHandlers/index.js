const path = require('path');
const fs = require('fs');

const handlerCache = {};

/**
 * 厂商 -> 处理器映射表
 * 支持多别名匹配，方便不同写法统一识别
 */
const PROVIDER_HANDLER_MAP = {
  // OpenAI 系
  'openai': 'openai',
  'azure': 'openai',
  'azure_openai': 'openai',
  // DeepSeek
  'deepseek': 'deepseek',
  // 字节/火山/豆包
  'volcengine': 'doubao',
  '火山引擎': 'doubao',
  'doubao': 'doubao',
  '豆包': 'doubao',
  'bytedance': 'doubao',
  // 智谱
  'zhipu': 'zhipu',
  '智谱': 'zhipu',
  'glm': 'zhipu',
  // 阿里/通义
  'aliyun': 'qwen',
  '阿里云': 'qwen',
  'qwen': 'qwen',
  '通义': 'qwen',
  'dashscope': 'qwen',
  // 百度
  'baidu': 'baidu',
  '百度': 'baidu',
  'wenxin': 'baidu',
  '文心': 'baidu',
  'ernie': 'baidu'
};

function getBillingHandler(handlerName) {
  if (!handlerName) return null;

  // 清理 handler 名称（去除前后空格）
  const cleanedName = String(handlerName).trim();
  
  if (!cleanedName) return null;

  if (cleanedName.includes('..') || cleanedName.includes('/') || cleanedName.includes('\\')) {
    console.error(`[BillingHandler] 非法 handler 名称: ${cleanedName}`);
    return null;
  }

  if (handlerCache[cleanedName]) {
    return handlerCache[cleanedName];
  }

  const handlerPath = path.join(__dirname, `${cleanedName}.js`);
  console.log(`[BillingHandler] 尝试加载 handler: "${cleanedName}", 路径: ${handlerPath}`);
  
  if (!fs.existsSync(handlerPath)) {
    console.error(`[BillingHandler] handler 文件不存在: ${handlerPath}`);
    // 列出当前目录下的所有文件帮助调试
    try {
      const files = fs.readdirSync(__dirname);
      console.log(`[BillingHandler] 目录 ${__dirname} 下的文件:`, files);
    } catch (e) {
      console.error(`[BillingHandler] 无法读取目录: ${e.message}`);
    }
    return null;
  }

  try {
    const handler = require(handlerPath);
    handlerCache[cleanedName] = handler;
    console.log(`[BillingHandler] 已加载 handler: ${cleanedName}`);
    return handler;
  } catch (error) {
    console.error(`[BillingHandler] 加载 handler "${cleanedName}" 失败:`, error.message);
    return null;
  }
}

/**
 * 根据厂商名称自动推断计费处理器
 * @param {string} provider - 厂商名称（如 'openai', 'deepseek', '火山引擎'）
 * @returns {string|null} 处理器名称
 */
function inferHandlerFromProvider(provider) {
  if (!provider) return null;
  const normalized = String(provider).toLowerCase().trim();
  return PROVIDER_HANDLER_MAP[normalized] || null;
}

/**
 * 获取厂商计费处理器（优先使用显式配置的 billing_handler，未配置时自动推断）
 * @param {object} modelConfig - 模型配置对象
 * @param {string} modelConfig.billing_handler - 显式配置的处理器名称
 * @param {string} modelConfig.provider - 厂商名称
 * @returns {object|null} 处理器模块
 */
function getProviderHandler(modelConfig) {
  if (!modelConfig) return null;

  // 1. 优先使用显式配置的 billing_handler
  if (modelConfig.billing_handler) {
    const handler = getBillingHandler(modelConfig.billing_handler);
    if (handler) {
      return handler;
    }
    console.warn(`[BillingHandler] 显式配置的 handler "${modelConfig.billing_handler}" 加载失败，尝试自动推断`);
  }

  // 2. 根据 provider 自动推断
  const inferredName = inferHandlerFromProvider(modelConfig.provider);
  if (inferredName) {
    const handler = getBillingHandler(inferredName);
    if (handler) {
      console.log(`[BillingHandler] 根据厂商 "${modelConfig.provider}" 自动匹配处理器: ${inferredName}`);
      return handler;
    }
  }

  // 3. 兜底：返回 null，让默认逻辑处理
  console.log(`[BillingHandler] 无法为厂商 "${modelConfig.provider}" 匹配处理器，使用默认逻辑`);
  return null;
}

// 预加载常用的 billing handlers
function preloadHandlers() {
  const commonHandlers = [
    'volcengine', 'seedance1.5',
    'openai', 'deepseek', 'doubao', 'zhipu', 'qwen', 'baidu'
  ];
  
  for (const name of commonHandlers) {
    const handlerPath = path.join(__dirname, `${name}.js`);
    if (fs.existsSync(handlerPath)) {
      try {
        const handler = require(handlerPath);
        handlerCache[name] = handler;
        console.log(`[BillingHandler] 预加载 handler: ${name}`);
      } catch (error) {
        console.error(`[BillingHandler] 预加载 handler "${name}" 失败:`, error.message);
      }
    }
  }
}

// 服务启动时预加载
preloadHandlers();

module.exports = {
  getBillingHandler,
  getProviderHandler,
  inferHandlerFromProvider,
  PROVIDER_HANDLER_MAP
};
