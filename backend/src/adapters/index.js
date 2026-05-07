/**
 * Adapter 注册中心
 *
 * 统一管理所有 Platform Adapter 的注册和实例化。
 * 新增平台时，只需在此注册对应的 Adapter 类。
 */

const BaseAdapter = require('./BaseAdapter');
const OpenAICompatibleAdapter = require('./OpenAICompatibleAdapter');

// ============================================================
// Adapter 注册表
// ============================================================

const ADAPTER_REGISTRY = {
  // OpenAI 兼容平台（默认）
  'openai_compatible': OpenAICompatibleAdapter,

  // 火山引擎系列（OpenAI 兼容，但部分模型有特殊参数）
  'volcengine': OpenAICompatibleAdapter,
  '火山引擎': OpenAICompatibleAdapter,

  // DeepSeek
  'deepseek': OpenAICompatibleAdapter,

  // 智谱 AI
  'zhipu': OpenAICompatibleAdapter,
  '智谱': OpenAICompatibleAdapter,
  'glm': OpenAICompatibleAdapter,

  // 百度千帆
  'baidu': OpenAICompatibleAdapter,
  '百度': OpenAICompatibleAdapter,
  'qianfan': OpenAICompatibleAdapter,

  // 阿里云
  'aliyun': OpenAICompatibleAdapter,
  '阿里云': OpenAICompatibleAdapter,
  'dashscope': OpenAICompatibleAdapter,

  // 硅基流动
  'siliconflow': OpenAICompatibleAdapter,
  '硅基流动': OpenAICompatibleAdapter,

  // OpenAI / Azure
  'openai': OpenAICompatibleAdapter,
  'azure': OpenAICompatibleAdapter,
  'azure_openai': OpenAICompatibleAdapter,

  // 非标准平台（需要独立 Adapter）
  // 'kling': KlingAdapter,
  // '可灵': KlingAdapter,
  // 'minimax': MiniMaxAdapter,
};

// ============================================================
// 工厂函数
// ============================================================

/**
 * 根据适配器名称获取 Adapter 类
 * @param {string} adapterName - 适配器名称
 * @returns {typeof BaseAdapter}
 */
function getAdapterClass(adapterName) {
  if (!adapterName) {
    return OpenAICompatibleAdapter;
  }

  const normalizedName = adapterName.toLowerCase().trim();
  const AdapterClass = ADAPTER_REGISTRY[normalizedName];

  if (!AdapterClass) {
    console.warn(`[AdapterRegistry] 未找到适配器 "${adapterName}"，回退到 OpenAICompatibleAdapter`);
    return OpenAICompatibleAdapter;
  }

  return AdapterClass;
}

/**
 * 创建 Adapter 实例
 * @param {string} adapterName - 适配器名称
 * @param {object} providerConfig - 平台配置
 * @param {object} modelConfig - 模型配置
 * @returns {BaseAdapter}
 */
function createAdapter(adapterName, providerConfig, modelConfig) {
  const AdapterClass = getAdapterClass(adapterName);
  return new AdapterClass(providerConfig, modelConfig);
}

/**
 * 注册新的 Adapter
 * @param {string} name - 适配器名称
 * @param {typeof BaseAdapter} AdapterClass - Adapter 类
 */
function registerAdapter(name, AdapterClass) {
  if (!(AdapterClass.prototype instanceof BaseAdapter)) {
    throw new Error(`Adapter "${name}" 必须继承 BaseAdapter`);
  }
  ADAPTER_REGISTRY[name.toLowerCase()] = AdapterClass;
}

/**
 * 获取所有已注册的 Adapter 名称
 * @returns {string[]}
 */
function getRegisteredAdapters() {
  return Object.keys(ADAPTER_REGISTRY);
}

/**
 * 根据平台名称自动推断 Adapter
 * @param {string} providerName - 平台名称
 * @returns {typeof BaseAdapter}
 */
function inferAdapterForProvider(providerName) {
  if (!providerName) return OpenAICompatibleAdapter;

  const normalized = providerName.toLowerCase().trim();

  // 直接匹配
  if (ADAPTER_REGISTRY[normalized]) {
    return ADAPTER_REGISTRY[normalized];
  }

  // 关键字匹配
  const keywords = {
    'volcengine': ['volcengine', '火山', '方舟'],
    'deepseek': ['deepseek'],
    'zhipu': ['zhipu', '智谱', 'glm'],
    'baidu': ['baidu', '百度', 'qianfan', '千帆'],
    'aliyun': ['aliyun', '阿里', 'dashscope', '百炼'],
    'openai': ['openai', 'azure'],
    'siliconflow': ['siliconflow', '硅基'],
  };

  for (const [adapter, words] of Object.entries(keywords)) {
    if (words.some(w => normalized.includes(w))) {
      return ADAPTER_REGISTRY[adapter];
    }
  }

  // 默认回退
  return OpenAICompatibleAdapter;
}

module.exports = {
  BaseAdapter,
  OpenAICompatibleAdapter,
  getAdapterClass,
  createAdapter,
  registerAdapter,
  getRegisteredAdapters,
  inferAdapterForProvider,
  ADAPTER_REGISTRY
};
