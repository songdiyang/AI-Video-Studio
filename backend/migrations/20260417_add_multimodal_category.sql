-- 放开 category 限制，改为 VARCHAR 允许任意类型
ALTER TABLE ai_model_configs
MODIFY COLUMN category VARCHAR(50) NOT NULL COMMENT '模型分类';

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
)
ON DUPLICATE KEY UPDATE category = VALUES(category);

-- 插入火山引擎 3D 生成模型配置
INSERT INTO ai_model_configs (
  name, category, provider, description, is_active,
  api_key, request_method, url_template, headers_template, body_template,
  default_params, response_mapping, custom_handler, price_config
) VALUES (
  '火山引擎 3D 生成',
  '3D',
  'volcengine',
  '火山方舟 3D 生成模型，支持根据图片生成高精度 3D 资产，输出多边形面片与 PBR 材质',
  1,
  NULL,
  'POST',
  'https://ark.cn-beijing.volces.com/api/v3/3d/generations',
  '{"Content-Type":"application/json","Authorization":"Bearer apiKey"}',
  '{"model":"modelId","image_url":"{{imageUrl}}"}',
  '{"modelId":"doubao-3d-generation-250424"}',
  '{"taskId":"data.task_id","status":"data.status"}',
  'volcengine_3d',
  '{"currency":"CNY","charge_on_failure":false,"components":[{"type":"request_count","unit":"per_request","price":5}]}'
)
ON DUPLICATE KEY UPDATE category = VALUES(category);
