-- 将数据库中 Seedream 3.0 t2i 模型升级为 Seedream 4.5（支持文生图+图生图）
-- 模型ID: doubao-seedream-4-5-251128
-- Seedream 4.5 同时支持 text-to-image 和 image-to-image，解决了 3.0 t2i 不支持 image 参数的问题

UPDATE ai_model_configs 
SET 
  name = 'Seedream 4.5 图像生成',
  description = '豆包 Seedream 4.5 图像生成模型，支持文生图和图生图，在主体一致性、指令遵循和美学表现上全面升级。',
  body_template = JSON_SET(
    COALESCE(body_template, '{}'),
    '$.model', 'doubao-seedream-4-5-251128'
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE custom_handler = 'seedream' 
  AND category = 'IMAGE'
  AND is_active = 1;
