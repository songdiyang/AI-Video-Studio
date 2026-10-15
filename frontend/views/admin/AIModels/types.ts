export interface PriceComponent {
  type: string;
  unit: string;
  price: number;
}

export interface PriceConfig {
  currency?: string;
  charge_on_failure?: boolean;
  components: PriceComponent[];
}

export interface AIModel {
  id: number;
  name: string;
  category: string;
  provider: string;
  description?: string;
  is_active: number;
  api_key?: string;
  provider_id?: number;
  model_id?: string;
  capabilities?: string[];
  price_config: PriceConfig | string | null;
  priceSummary?: string;
  request_method: string;
  url_template: string;
  headers_template: any;
  body_template?: any;
  default_params?: any;
  response_mapping: any;
  supported_aspect_ratios?: any;
  supported_durations?: any;
  supported_resolutions?: any;
  query_url_template?: string;
  query_method?: string;
  query_headers_template?: any;
  query_body_template?: any;
  query_response_mapping?: any;
  query_success_condition?: string;
  query_fail_condition?: string;
  query_success_mapping?: any;
  query_fail_mapping?: any;
  custom_handler?: string;
  custom_query_handler?: string;
  billing_handler?: string;
  billing_query_handler?: string;
  created_at: string;
  updated_at: string;
}

export interface TextModel {
  id: number;
  name: string;
  provider: string;
  description?: string;
}

export interface ModelFormData {
  name: string;
  category: string;
  provider: string;
  description: string;
  is_active: number;
  api_key: string;
  provider_id: string;
  model_id: string;
  capabilities: string;
  price_config: string;
  request_method: string;
  url_template: string;
  headers_template: string;
  body_template: string;
  default_params: string;
  response_mapping: string;
  supported_aspect_ratios: string;
  supported_durations: string;
  supported_resolutions: string;
  query_url_template: string;
  query_method: string;
  query_headers_template: string;
  query_body_template: string;
  query_response_mapping: string;
  query_success_condition: string;
  query_fail_condition: string;
  query_success_mapping: string;
  query_fail_mapping: string;
  custom_handler: string;
  custom_query_handler: string;
  billing_handler: string;
  billing_query_handler: string;
}

// 视频分辨率预设
export const VIDEO_RESOLUTION_PRESETS = [
  { label: '720P 标清', value: '720p', width: 1280, height: 720 },
  { label: '1080P 高清', value: '1080p', width: 1920, height: 1080 },
  { label: '2K 超清', value: '2k', width: 2560, height: 1440 },
  { label: '4K 超高清', value: '4k', width: 3840, height: 2160 },
];

// 图片清晰度预设
export const IMAGE_RESOLUTION_PRESETS = [
  { label: '1K 标准', value: '1024' },
  { label: '1.5K 高清', value: '1536' },
  { label: '2K 超清', value: '2048' },
];

// 常用长宽比预设
export const ASPECT_RATIO_PRESETS = [
  { label: '横屏 16:9', value: '16:9' },
  { label: '竖屏 9:16', value: '9:16' },
  { label: '正方形 1:1', value: '1:1' },
  { label: '横屏 4:3', value: '4:3' },
  { label: '竖屏 3:4', value: '3:4' },
  { label: '电影 21:9', value: '21:9' },
  { label: '横屏 3:2', value: '3:2' },
  { label: '竖屏 2:3', value: '2:3' },
];

// 常用时长预设
export const DURATION_PRESETS = [
  { label: '5秒', value: 5 },
  { label: '10秒', value: 10 },
  { label: '15秒', value: 15 },
  { label: '30秒', value: 30 },
  { label: '60秒', value: 60 },
];

// OpenAI 兼容模板预设
export interface TemplatePreset {
  name: string;
  description: string;
  category: string;
  config: Partial<ModelFormData>;
}

// OpenAI 适配层预设（推荐）
export interface OpenAIPreset {
  name: string;
  description: string;
  category: string;
  provider_id: number;
  provider_name: string;
  model_id: string;
  capabilities: string[];
  config: Partial<ModelFormData>;
}

export const OPENAI_PRESETS: OpenAIPreset[] = [
  {
    name: 'DeepSeek Chat',
    description: 'DeepSeek-V3.2 高性价比文本生成，支持128K上下文',
    category: 'TEXT',
    provider_id: 1,
    provider_name: 'deepseek',
    model_id: 'deepseek-chat',
    capabilities: ['llm'],
    config: {
      provider: 'deepseek',
      price_config: JSON.stringify({
        currency: 'CNY',
        charge_on_failure: false,
        components: [
          { type: 'input_tokens', unit: 'per_million_tokens', price: 2 },
          { type: 'output_tokens', unit: 'per_million_tokens', price: 8 }
        ]
      }, null, 2),
    }
  },
  {
    name: 'DeepSeek Reasoner',
    description: 'DeepSeek 深度思考模式，支持推理链输出',
    category: 'TEXT',
    provider_id: 1,
    provider_name: 'deepseek',
    model_id: 'deepseek-reasoner',
    capabilities: ['llm'],
    config: {
      provider: 'deepseek',
      price_config: JSON.stringify({
        currency: 'CNY',
        charge_on_failure: false,
        components: [
          { type: 'input_tokens', unit: 'per_million_tokens', price: 4 },
          { type: 'output_tokens', unit: 'per_million_tokens', price: 16 }
        ]
      }, null, 2),
    }
  },
  {
    name: '通义千问 (Qwen)',
    description: '阿里云百炼 Qwen 系列文本模型',
    category: 'TEXT',
    provider_id: 2,
    provider_name: 'aliyun',
    model_id: 'qwen-plus',
    capabilities: ['llm'],
    config: {
      provider: 'aliyun',
      price_config: JSON.stringify({
        currency: 'CNY',
        charge_on_failure: false,
        components: [
          { type: 'input_tokens', unit: 'per_million_tokens', price: 2 },
          { type: 'output_tokens', unit: 'per_million_tokens', price: 6 }
        ]
      }, null, 2),
    }
  },
  {
    name: '豆包多模态 (Seed)',
    description: '火山引擎豆包多模态理解模型',
    category: 'MULTIMODAL',
    provider_id: 6,
    provider_name: 'volcengine',
    model_id: 'doubao-seed-2-0-pro-260215',
    capabilities: ['mllm', 'vision'],
    config: {
      provider: 'volcengine',
      price_config: JSON.stringify({
        currency: 'CNY',
        charge_on_failure: false,
        components: [
          { type: 'total_tokens', unit: 'per_million_tokens', price: 18 }
        ]
      }, null, 2),
    }
  },
  {
    name: '豆包文生图 (Seedream)',
    description: '火山引擎 Seedream 文生图模型',
    category: 'IMAGE',
    provider_id: 6,
    provider_name: 'volcengine',
    model_id: 'doubao-seedream-3-0-250115',
    capabilities: ['image_gen'],
    config: {
      provider: 'volcengine',
      price_config: JSON.stringify({
        currency: 'CNY',
        charge_on_failure: false,
        components: [{ type: 'item_count', unit: 'per_item', price: 0.02 }]
      }, null, 2),
      supported_aspect_ratios: JSON.stringify(["16:9", "9:16", "1:1", "4:3", "3:4"], null, 2),
    }
  },
  {
    name: '豆包视频 (Seedance)',
    description: '火山引擎 Seedance 视频生成模型',
    category: 'VIDEO',
    provider_id: 6,
    provider_name: 'volcengine',
    model_id: 'doubao-seedance-1-0-250115',
    capabilities: ['video_gen'],
    config: {
      provider: 'volcengine',
      price_config: JSON.stringify({
        currency: 'CNY',
        charge_on_failure: false,
        components: [{ type: 'duration_seconds', unit: 'per_second', price: 0.5 }]
      }, null, 2),
      supported_aspect_ratios: JSON.stringify(["16:9", "9:16", "1:1"], null, 2),
      supported_durations: JSON.stringify([5, 10], null, 2),
    }
  },
];

// 传统模板预设（保留用于非 OpenAI 兼容接口）
export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    name: '异步视频生成 (通用)',
    description: '通用异步视频生成模板，支持任务提交和轮询查询',
    category: 'VIDEO',
    config: {
      request_method: 'POST',
      headers_template: JSON.stringify({
        "Content-Type": "application/json",
        "Authorization": "Bearer {{apiKey}}"
      }, null, 2),
      body_template: JSON.stringify({
        "model": "{{model}}",
        "prompt": "{{prompt}}",
        "duration": "{{duration}}",
        "aspect_ratio": "{{aspectRatio}}"
      }, null, 2),
      default_params: JSON.stringify({ duration: 5, aspectRatio: '16:9' }, null, 2),
      response_mapping: JSON.stringify({ "taskId": "data.task_id" }, null, 2),
      query_method: 'GET',
      query_response_mapping: JSON.stringify({ "status": "data.status" }, null, 2),
      query_success_condition: 'status == "completed" || status == "succeed"',
      query_fail_condition: 'status == "failed" || status == "error"',
      query_success_mapping: JSON.stringify({ "video_url": "data.video_url" }, null, 2),
      query_fail_mapping: JSON.stringify({ "error": "data.error_message" }, null, 2),
      price_config: JSON.stringify({
        currency: 'CNY',
        charge_on_failure: false,
        components: [{ type: 'duration_seconds', unit: 'per_second', price: 0.1 }]
      }, null, 2),
      supported_aspect_ratios: JSON.stringify(["16:9", "9:16", "1:1"], null, 2),
      supported_durations: JSON.stringify([5, 10], null, 2),
      supported_resolutions: JSON.stringify(["720p", "1080p"], null, 2),
    }
  },
  {
    name: '2K 高质量视频生成',
    description: '支持 2K 超清分辨率的高质量视频生成模板',
    category: 'VIDEO',
    config: {
      request_method: 'POST',
      headers_template: JSON.stringify({
        "Content-Type": "application/json",
        "Authorization": "Bearer {{apiKey}}"
      }, null, 2),
      body_template: JSON.stringify({
        "model": "{{model}}",
        "prompt": "{{prompt}}",
        "duration": "{{duration}}",
        "aspect_ratio": "{{aspectRatio}}",
        "resolution": "{{resolution}}",
        "quality": "high"
      }, null, 2),
      default_params: JSON.stringify({ duration: 5, aspectRatio: '16:9', resolution: '2k', quality: 'high' }, null, 2),
      response_mapping: JSON.stringify({ "taskId": "data.task_id" }, null, 2),
      query_method: 'GET',
      query_response_mapping: JSON.stringify({ "status": "data.status" }, null, 2),
      query_success_condition: 'status == "completed" || status == "succeed"',
      query_fail_condition: 'status == "failed" || status == "error"',
      query_success_mapping: JSON.stringify({ "video_url": "data.video_url" }, null, 2),
      query_fail_mapping: JSON.stringify({ "error": "data.error_message" }, null, 2),
      price_config: JSON.stringify({
        currency: 'CNY',
        charge_on_failure: false,
        components: [{ type: 'duration_seconds', unit: 'per_second', price: 0.5 }]
      }, null, 2),
      supported_aspect_ratios: JSON.stringify(["16:9", "9:16", "1:1", "21:9"], null, 2),
      supported_durations: JSON.stringify([5, 10, 15, 30], null, 2),
      supported_resolutions: JSON.stringify(["1080p", "2k", "4k"], null, 2),
    }
  },
];

export const DEFAULT_FORM_DATA: ModelFormData = {
  name: '',
  category: 'TEXT',
  provider: '',
  description: '',
  is_active: 1,
  api_key: '',
  provider_id: '',
  model_id: '',
  capabilities: '[]',
  price_config: JSON.stringify({
    currency: 'CNY',
    charge_on_failure: false,
    components: [
      {
        type: 'total_tokens',
        unit: 'per_million_tokens',
        price: 2
      }
    ]
  }, null, 2),
  request_method: 'POST',
  url_template: '',
  headers_template: '{}',
  body_template: '{}',
  default_params: '{}',
  response_mapping: '{}',
  supported_aspect_ratios: '[]',
  supported_durations: '[]',
  supported_resolutions: '[]',
  query_url_template: '',
  query_method: 'GET',
  query_headers_template: '{}',
  query_body_template: '{}',
  query_response_mapping: '{}',
  query_success_condition: '',
  query_fail_condition: '',
  query_success_mapping: '{}',
  query_fail_mapping: '{}',
  custom_handler: '',
  custom_query_handler: '',
  billing_handler: '',
  billing_query_handler: ''
};
