-- 扩展 category ENUM 添加 MULTIMODAL 类型
ALTER TABLE ai_model_configs 
MODIFY COLUMN category ENUM('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'MULTIMODAL') NOT NULL COMMENT '模型分类';

-- 插入豆包多模态理解模型配置
INSERT INTO ai_model_configs (
  name, category, provider, description, is_active,
  api_key, request_method, url_template, headers_template, body_template,
  default_params, response_mapping, custom_handler, price_config
) VALUES (
  'Doubao-Seed-2.0-Pro', 
  'MULTIMODAL', 
  'volcengine',
  '豆包多模态理解模型，支持图像理解、视频理解、文档理解，可实时分析多媒体内容并提供操作指导',
  1,
  NULL,
  'POST',
  'https://ark.cn-beijing.volces.com/api/v3/responses',
  '{"Content-Type":"application/json","Authorization":"Bearer apiKey"}',
  '{"model":"modelId","input":"{{input}}"}',
  '{"modelId":"doubao-seed-2-0-pro-260215","temperature":0.7,"max_tokens":4096}',
  '{"content":"output[0].content[0].text","usage":"usage"}',
  'doubao_multimodal',
  '{"currency":"CNY","charge_on_failure":false,"components":[{"type":"total_tokens","unit":"per_million_tokens","price":18}]}'
);
