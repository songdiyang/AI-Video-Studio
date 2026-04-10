-- 分镜时长校验配置
INSERT INTO system_configs (config_key, config_name, config_type, config_value, description, is_active)
VALUES 
  ('storyboard_min_duration', '分镜最小总时长(秒)', 'number', '60', '单个剧本生成的分镜总时长最小值，低于此值将触发调整', 1),
  ('storyboard_max_duration', '分镜最大总时长(秒)', 'number', '180', '单个剧本生成的分镜总时长最大值，超过此值将触发调整', 1),
  ('batch_scene_min_duration', '批量场景最小时长(秒)', 'number', '15', '批量模式下每个场景的最小时长', 1),
  ('batch_scene_max_duration', '批量场景最大时长(秒)', 'number', '60', '批量模式下每个场景的最大时长', 1),
  ('duration_tolerance', '时长偏差容忍值(秒)', 'number', '2', '时长超出范围但偏差在此值内时，通过比例缩放调整；超出此值则触发重新生成', 1)
ON DUPLICATE KEY UPDATE config_name = VALUES(config_name);
