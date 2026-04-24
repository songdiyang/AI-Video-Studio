-- nanostory 项目 MySQL 初始化脚本
-- 幂等设计：使用 CREATE DATABASE IF NOT EXISTS + CREATE TABLE IF NOT EXISTS
-- 可重复执行，不会破坏已有数据

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS nanostory 
  DEFAULT CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

-- 使用数据库
USE nanostory;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') DEFAULT 'user' COMMENT '用户角色：user=普通用户, admin=管理员',
  balance DECIMAL(18,6) DEFAULT 100.000000,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 通知表（notification-service 持久化队列）
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  scope_type ENUM('user', 'session', 'broadcast') NOT NULL,
  target_user_id INT DEFAULT NULL,
  target_session_id VARCHAR(128) DEFAULT NULL,
  message_type ENUM('info', 'debug', 'success', 'warn', 'error') NOT NULL,
  title VARCHAR(255) DEFAULT NULL,
  message TEXT NOT NULL,
  payload_json JSON DEFAULT NULL,
  source_service VARCHAR(100) NOT NULL,
  source_event VARCHAR(255) DEFAULT NULL,
  status ENUM('pending', 'delivering', 'acked', 'dead') NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 6,
  lease_until DATETIME DEFAULT NULL,
  available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acked_at DATETIME DEFAULT NULL,
  dedupe_key VARCHAR(255) DEFAULT NULL,
  broadcast_batch_id VARCHAR(128) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notifications_status_available (status, available_at),
  INDEX idx_notifications_user_status (target_user_id, status, available_at),
  INDEX idx_notifications_session_status (target_session_id, status, available_at),
  INDEX idx_notifications_lease_until (lease_until),
  INDEX idx_notifications_broadcast_batch (broadcast_batch_id),
  INDEX idx_notifications_dedupe (dedupe_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 项目表（提前创建，因为其他表需要引用）
CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  cover_url TEXT,
  type VARCHAR(50) DEFAULT 'video' COMMENT '项目类型：video=视频, comic=漫画',
  status VARCHAR(50) DEFAULT 'draft' COMMENT '状态：draft=草稿, in_progress=进行中, completed=已完成',
  settings_json TEXT COMMENT '项目配置（JSON格式）',
  use_models JSON DEFAULT NULL COMMENT 'AI模型选择配置（按category分类，如 {"TEXT":"模型名","IMAGE":"模型名","VIDEO":"模型名"}）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_type (type),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 剧本表
CREATE TABLE IF NOT EXISTS scripts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  project_id INT NOT NULL COMMENT '所属项目ID',
  episode_number INT NOT NULL DEFAULT 1 COMMENT '集数编号，从1开始',
  title VARCHAR(255),
  content TEXT NOT NULL,
  model_provider VARCHAR(100),
  token_used INT DEFAULT 0,
  status ENUM('generating', 'completed', 'failed') DEFAULT 'completed' COMMENT '生成状态',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE KEY uk_project_episode (project_id, episode_number) COMMENT '每个项目的每集只能有一个剧本',
  INDEX idx_user_id (user_id),
  INDEX idx_project_id (project_id),
  INDEX idx_episode_number (episode_number),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 分镜表
CREATE TABLE IF NOT EXISTS storyboards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '所属项目ID',
  script_id INT NOT NULL,
  idx INT NOT NULL COMMENT '分镜序号',
  prompt_template TEXT COMMENT '提示词模板',
  variables_json TEXT COMMENT '变量（JSON格式）',
  first_frame_url TEXT COMMENT '首帧图片URL',
  last_frame_url TEXT COMMENT '尾帧图片URL',
  video_url TEXT COMMENT '生成的视频URL',
  updated_scene_url TEXT DEFAULT NULL COMMENT '更新版空镜场景图URL（modified镜头生成，供后续 inherit 镜头作为场景参考）',
  sketch_url TEXT DEFAULT NULL COMMENT '草图URL',
  sketch_type VARCHAR(32) DEFAULT NULL COMMENT '草图类型：stick_figure=火柴人, storyboard_sketch=分镜草图, detailed_lineart=精细线稿',
  sketch_data JSON DEFAULT NULL COMMENT '草图相关数据（JSON格式）',
  control_strength DECIMAL(3,2) DEFAULT 0.85 COMMENT 'ControlNet 控制强度（0.00-1.00）',
  is_locked BOOLEAN DEFAULT FALSE COMMENT '是否锁定：防止误操作修改',
  locked_at DATETIME DEFAULT NULL COMMENT '锁定时间',
  locked_by VARCHAR(255) DEFAULT NULL COMMENT '锁定者（用户ID或system）',
  -- 镜头语言参数
  shot_size VARCHAR(32) DEFAULT NULL COMMENT '景别：extreme_close_up=大特写, close_up=特写, medium_close_up=中近景, medium_shot=中景, medium_long_shot=中全景, long_shot=全景, extreme_long_shot=大远景',
  camera_height VARCHAR(32) DEFAULT NULL COMMENT '机位高度：eye_level=平视, low_angle=仰拍, high_angle=俯拍, bird_eye=鸟瞰, worm_eye=虫视',
  camera_movement VARCHAR(64) DEFAULT NULL COMMENT '镜头运动：static=固定, push=推, pull=拉, pan=摇, tilt=升降, track=移, dolly=跟, zoom=变焦',
  lens_type VARCHAR(32) DEFAULT NULL COMMENT '镜头类型：wide=广角, standard=标准, telephoto=长焦, macro=微距, fisheye=鱼眼',
  focus_point VARCHAR(255) DEFAULT NULL COMMENT '焦点位置描述',
  depth_of_field VARCHAR(32) DEFAULT NULL COMMENT '景深：shallow=浅景深, deep=深景深, medium=中等',
  lighting_mood VARCHAR(64) DEFAULT NULL COMMENT '光影氛围：high_key=高调, low_key=低调, chiaroscuro=明暗对比, silhouette=剪影, backlit=逆光',
  composition_rule VARCHAR(64) DEFAULT NULL COMMENT '构图法则：rule_of_thirds=三分法, center=中心构图, symmetry=对称, leading_lines=引导线, frame_in_frame=框中框',
  axis_position VARCHAR(32) DEFAULT NULL COMMENT '轴线位置：left=左侧, right=右侧, on_axis=轴线上',
  screen_direction VARCHAR(32) DEFAULT NULL COMMENT '屏幕方向：left_to_right=左向右, right_to_left=右向左, towards_camera=朝向镜头, away_from_camera=远离镜头',
  shot_duration DECIMAL(5,2) DEFAULT NULL COMMENT '镜头时长（秒）',
  transition_type VARCHAR(32) DEFAULT NULL COMMENT '转场类型：cut=硬切, fade=淡入淡出, dissolve=叠化, wipe=划像, match_cut=匹配剪辑',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
  INDEX idx_project_id (project_id),
  INDEX idx_script_id (script_id),
  INDEX idx_idx (idx)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 角色表
CREATE TABLE IF NOT EXISTS characters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  project_id INT NOT NULL COMMENT '所属项目ID',
  script_id INT DEFAULT NULL COMMENT '来源剧本ID（如果是从剧本提取）',
  name VARCHAR(255) NOT NULL,
  description TEXT COMMENT '角色描述',
  appearance TEXT COMMENT '外貌特征',
  personality TEXT COMMENT '性格特点',
  image_url TEXT COMMENT '角色图片URL',
  front_view_url TEXT COMMENT '正面视图URL',
  side_view_url TEXT COMMENT '侧面视图URL',
  back_view_url TEXT COMMENT '背面视图URL',
  tags TEXT COMMENT '标签（逗号分隔）',
  source VARCHAR(50) DEFAULT 'manual' COMMENT '来源：manual=手动创建, ai_extracted=AI从剧本提取, ai_generated=AI生成',
  generation_prompt TEXT COMMENT '图片生成提示词',
  generation_params JSON COMMENT '图片生成参数（模型、尺寸、风格等）',
  generation_status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT NULL COMMENT '图片生成状态',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_project_id (project_id),
  INDEX idx_script_id (script_id),
  INDEX idx_name (name),
  INDEX idx_source (source),
  INDEX idx_generation_status (generation_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 场景表
CREATE TABLE IF NOT EXISTS scenes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  project_id INT NOT NULL COMMENT '所属项目ID',
  script_id INT DEFAULT NULL COMMENT '来源剧本ID（如果是从剧本提取）',
  name VARCHAR(255) NOT NULL,
  description TEXT COMMENT '场景描述',
  environment TEXT COMMENT '环境描述',
  lighting TEXT COMMENT '光照描述',
  mood TEXT COMMENT '氛围描述',
  image_url TEXT COMMENT '场景图片URL（A面/正打：主视角空镜）',
  reverse_image_url TEXT COMMENT '场景图片URL（B面/反打：180°反向视角空镜）',
  tags TEXT COMMENT '标签（逗号分隔）',
  source VARCHAR(50) DEFAULT 'manual' COMMENT '来源：manual=手动创建, ai_extracted=AI从剧本提取, ai_generated=AI生成',
  generation_prompt TEXT COMMENT '图片生成提示词（A面）',
  reverse_generation_prompt TEXT COMMENT '图片生成提示词（B面）',
  generation_params JSON COMMENT '图片生成参数',
  generation_status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT NULL COMMENT '图片生成状态',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_project_id (project_id),
  INDEX idx_script_id (script_id),
  INDEX idx_name (name),
  INDEX idx_source (source),
  INDEX idx_generation_status (generation_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 道具表
CREATE TABLE IF NOT EXISTS props (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  project_id INT NOT NULL COMMENT '所属项目ID',
  name VARCHAR(255) NOT NULL COMMENT '道具名称',
  description TEXT COMMENT '道具描述',
  category VARCHAR(100) COMMENT '道具分类，如：武器、工具、装饰品等',
  image_url TEXT COMMENT '道具图片URL',
  tags TEXT COMMENT '标签，逗号分隔',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_project_id (project_id),
  INDEX idx_name (name),
  INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 分镜-角色 关联表（强ID关联，替代 variables_json 中的名字字符串）
CREATE TABLE IF NOT EXISTS storyboard_characters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  storyboard_id INT NOT NULL COMMENT '分镜ID',
  character_id INT NOT NULL COMMENT '角色ID',
  role_type VARCHAR(50) DEFAULT 'appear' COMMENT '角色在该镜头中的作用：appear=出现, speak=说话, action=动作',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  UNIQUE KEY uk_storyboard_character (storyboard_id, character_id),
  INDEX idx_storyboard_id (storyboard_id),
  INDEX idx_character_id (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='分镜-角色关联表';

-- 分镜-场景 关联表
CREATE TABLE IF NOT EXISTS storyboard_scenes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  storyboard_id INT NOT NULL COMMENT '分镜ID',
  scene_id INT NOT NULL COMMENT '场景ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
  UNIQUE KEY uk_storyboard_scene (storyboard_id, scene_id),
  INDEX idx_storyboard_id (storyboard_id),
  INDEX idx_scene_id (scene_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='分镜-场景关联表';

-- 计费记录表
CREATE TABLE IF NOT EXISTS billing_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  script_id INT,
  operation VARCHAR(50) NOT NULL,
  model_provider VARCHAR(100),
  model_tier VARCHAR(50),
  tokens INT NOT NULL DEFAULT 0,
  unit_price DECIMAL(18,6) NOT NULL DEFAULT 0.000000,
  amount DECIMAL(18,6) NOT NULL DEFAULT 0.000000,
  model_name VARCHAR(255) DEFAULT NULL,
  model_category VARCHAR(20) DEFAULT NULL,
  source_type VARCHAR(50) DEFAULT NULL,
  operation_key VARCHAR(100) DEFAULT NULL,
  workflow_job_id INT DEFAULT NULL,
  generation_task_id INT DEFAULT NULL,
  request_status VARCHAR(50) DEFAULT NULL,
  charge_status VARCHAR(50) DEFAULT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  duration_seconds DECIMAL(18,6) NOT NULL DEFAULT 0.000000,
  item_count INT NOT NULL DEFAULT 0,
  price_breakdown_json JSON DEFAULT NULL,
  usage_snapshot JSON DEFAULT NULL,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at),
  INDEX idx_operation (operation),
  INDEX idx_charge_status (charge_status),
  INDEX idx_source_type (source_type),
  INDEX idx_model_category (model_category),
  INDEX idx_workflow_job_id (workflow_job_id),
  INDEX idx_generation_task_id (generation_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI 模型配置表 (统一管理所有第三方 AI 接口)
CREATE TABLE IF NOT EXISTS ai_model_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- 基础信息
  name VARCHAR(255) NOT NULL COMMENT '模型显示名称，如 "Sora 2.0 Turbo"',
  category ENUM('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'MULTIMODAL') NOT NULL COMMENT '模型分类',
  provider VARCHAR(100) NOT NULL COMMENT '厂商标识，如 openai, google, kling, minimax',
  description TEXT COMMENT '模型描述',
  is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用，0=禁用 1=启用',
  api_key VARCHAR(500) COMMENT 'API 密钥，优先使用此字段，为空则从环境变量获取',
  
  -- 价格配置 (JSON 格式)
  -- 示例: {"currency":"CNY","charge_on_failure":false,"components":[{"type":"input_tokens","unit":"per_million_tokens","price":2},{"type":"output_tokens","unit":"per_million_tokens","price":8}]}
  price_config JSON NOT NULL COMMENT '统一计费配置，支持 token/秒/次/个 等组合计费',
  
  -- 请求配置
  request_method ENUM('GET', 'POST', 'PUT', 'DELETE') DEFAULT 'POST' COMMENT 'HTTP 请求方法',
  url_template VARCHAR(500) NOT NULL COMMENT 'API 地址模板，支持占位符如 https://api.kling.com/v1/{{action}}',
  
  -- Headers 模板 (JSON 格式)
  -- 示例: {"Authorization": "Bearer {{apiKey}}", "Content-Type": "application/json"}
  headers_template JSON NOT NULL COMMENT 'HTTP Headers 模板，支持 {{apiKey}} 等占位符',
  
  -- Body 模板 (JSON 格式)
  -- 示例: {"model": "kling-v1", "prompt": "{{prompt}}", "image_url": "{{imageUrl}}"}
  body_template JSON COMMENT 'HTTP Body 模板，支持 {{prompt}}, {{width}} 等占位符',
  
  -- 默认参数 (JSON 格式)
  -- 示例: {"aspect_ratio": "16:9", "duration": 5}
  default_params JSON COMMENT '默认参数，前端未传时使用',

  -- 模型能力配置 (JSON 格式)
  -- 示例: ["16:9", "9:16"] 或 [{"label":"横屏 16:9","value":"16:9"}]
  supported_aspect_ratios JSON COMMENT '模型支持的输出比例列表（图片/视频模型使用）',
  supported_durations JSON COMMENT '模型支持的视频时长列表（仅视频模型使用）',
  
  -- 响应映射 (JSON 格式)
  -- 示例: {"taskId": "data.id", "status": "data.status", "videoUrl": "data.result.video_url"}
  response_mapping JSON NOT NULL COMMENT '响应字段映射，用于统一不同厂商的返回格式',
  
  -- 查询配置 (用于轮询任务状态)
  query_url_template VARCHAR(500) COMMENT '查询任务状态的 URL 模板',
  query_method ENUM('GET', 'POST') DEFAULT 'GET' COMMENT '查询请求方法',
  query_headers_template JSON COMMENT '查询请求的 Headers 模板',
  query_body_template JSON COMMENT '查询请求的 Body 模板',
  query_response_mapping JSON COMMENT '查询响应的基础字段映射，提取 status 等原始值。示例: {"status": "data.task_status"}',
  query_success_condition VARCHAR(500) COMMENT '成功判断表达式(JS)。示例: status == "succeed" || status == "completed"',
  query_fail_condition VARCHAR(500) COMMENT '失败判断表达式(JS)。示例: status == "failed" || status == "error"',
  query_success_mapping JSON COMMENT '成功时的结果字段映射。示例: {"image_url": "data.task_result.images.0.url", "video_url": "data.remote_url"}',
  query_fail_mapping JSON COMMENT '失败时的错误字段映射。示例: {"error": "data.fail_reason", "message": "data.error.message"}',
  
  -- 自定义 Handler（用于无法通过模板配置覆盖的特殊 API，如特殊认证、特殊参数格式等）
  -- handler 名称对应 backend/src/customHandlers/ 目录下的文件名（不含 .js）
  custom_handler VARCHAR(100) DEFAULT NULL COMMENT '自定义提交 handler 名称，为空则走模板流程。示例: "kling_video"',
  custom_query_handler VARCHAR(100) DEFAULT NULL COMMENT '自定义查询 handler 名称，为空则走模板流程。示例: "kling_video"',
  billing_handler VARCHAR(100) DEFAULT NULL COMMENT '复杂计费解析 handler 名称，为空则按标准 usage 字段解析',
  billing_query_handler VARCHAR(100) DEFAULT NULL COMMENT '异步模型最终结算时使用的计费查询 handler 名称',
  
  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- 索引
  INDEX idx_category (category),
  INDEX idx_provider (provider),
  INDEX idx_is_active (is_active),
  INDEX idx_category_active (category, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 模型配置表';


-- 工作流任务表（管理多步骤异步工作流）
CREATE TABLE IF NOT EXISTS workflow_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  project_id INT DEFAULT NULL COMMENT '所属项目ID（管理后台任务可为NULL）',
  workflow_type VARCHAR(50) NOT NULL COMMENT '工作流类型，如 script_only, comic_generation, smart_parse',
  status ENUM('pending', 'running', 'completed', 'failed', 'cancelled') DEFAULT 'pending' COMMENT '工作流状态',
  current_step_index INT DEFAULT 0 COMMENT '当前执行到的步骤索引',
  total_steps INT NOT NULL COMMENT '总步骤数',
  input_params JSON COMMENT '工作流输入参数',
  error_message TEXT COMMENT '错误信息',
  execution_snapshot JSON DEFAULT NULL COMMENT '执行快照：持久化 stepCounters、runningTasks 等内存状态，用于断点恢复',
  admin_resolved TINYINT(1) DEFAULT 0 COMMENT '管理员是否已处理（用于错误监控面板）',
  is_consumed TINYINT(1) DEFAULT 0 COMMENT '前端是否已消费结果（防止重复处理）',
  started_at DATETIME DEFAULT NULL COMMENT '开始执行时间',
  completed_at DATETIME DEFAULT NULL COMMENT '完成时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_project_id (project_id),
  INDEX idx_workflow_type (workflow_type),
  INDEX idx_status (status),
  INDEX idx_is_consumed (is_consumed),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作流任务表';

-- 生成任务表（工作流中的单个步骤，用于追踪异步AI生成任务）
CREATE TABLE IF NOT EXISTS generation_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT DEFAULT NULL COMMENT '所属工作流ID（独立任务可为NULL）',
  step_index INT DEFAULT 0 COMMENT '在工作流中的步骤索引',
  user_id INT NOT NULL,
  project_id INT DEFAULT NULL COMMENT '所属项目ID（管理后台任务可为NULL）',
  task_type VARCHAR(50) NOT NULL COMMENT '任务类型：script, character_extract, character_image, scene_image, storyboard, video, frame_image, scene_video, smart_parse 等',
  target_type VARCHAR(50) NOT NULL COMMENT '目标资源类型：script, character, scene, storyboard, ai_model_config',
  target_id INT DEFAULT NULL COMMENT '目标资源ID',
  model_name VARCHAR(255) COMMENT 'AI模型名称',
  input_params JSON COMMENT '输入参数',
  status ENUM('pending', 'processing', 'completed', 'failed', 'retrying') DEFAULT 'pending' COMMENT '任务状态',
  progress INT DEFAULT 0 COMMENT '进度百分比（0-100）',
  result_data JSON COMMENT '结果数据',
  work_result JSON DEFAULT NULL COMMENT '任务执行追踪日志（引擎自动记录：步骤、耗时、参考图选择等）',
  error_message TEXT COMMENT '错误信息',
  retry_count INT DEFAULT 0 COMMENT '已重试次数',
  max_retries INT DEFAULT 3 COMMENT '最大重试次数',
  retry_reason TEXT COMMENT '重试原因/错误详情（JSON格式，含 errorType、stack、timestamp 等）',
  external_task_id VARCHAR(255) COMMENT '外部任务ID（如API返回的task_id）',
  started_at DATETIME DEFAULT NULL COMMENT '开始时间',
  completed_at DATETIME DEFAULT NULL COMMENT '完成时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES workflow_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  INDEX idx_job_id (job_id),
  INDEX idx_step_index (step_index),
  INDEX idx_user_id (user_id),
  INDEX idx_project_id (project_id),
  INDEX idx_task_type (task_type),
  INDEX idx_status (status),
  INDEX idx_external_task_id (external_task_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI生成任务追踪表';

-- 工作流结构化日志表
CREATE TABLE IF NOT EXISTS workflow_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id INT DEFAULT NULL COMMENT '关联的工作流ID',
  task_id INT DEFAULT NULL COMMENT '关联的任务ID',
  user_id INT DEFAULT NULL COMMENT '关联的用户ID',
  workflow_type VARCHAR(50) DEFAULT NULL COMMENT '工作流类型',
  log_level ENUM('debug', 'info', 'warn', 'error') DEFAULT 'info' COMMENT '日志级别',
  log_source VARCHAR(100) DEFAULT NULL COMMENT '日志来源模块（Engine/Executor/Scheduler/Handler 等）',
  log_event VARCHAR(100) DEFAULT NULL COMMENT '事件类型（task_started, task_completed, task_failed, task_retrying, job_started, job_completed, job_failed, step_scheduled, memory_high, backpressure_activated 等）',
  log_message TEXT COMMENT '日志消息',
  log_context JSON DEFAULT NULL COMMENT '结构化上下文（duration_ms, step_index, model_name, error_type 等）',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) COMMENT '日志生成时间（毫秒精度）',
  INDEX idx_job_id (job_id),
  INDEX idx_task_id (task_id),
  INDEX idx_user_id (user_id),
  INDEX idx_log_level (log_level),
  INDEX idx_log_event (log_event),
  INDEX idx_workflow_type (workflow_type),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (job_id) REFERENCES workflow_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES generation_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作流结构化日志表';

-- 初始化默认管理员账户（已移除硬编码凭证，请手动创建）
-- NOTE: Default admin removed for security. Create admin via:
--   INSERT INTO users (email, password_hash, role, balance)
--   VALUES ('admin', '<bcrypt_hash>', 'admin', 0.000000);
-- Generate hash: node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"

-- 初始化 DeepSeek 模型配置（DeepSeek-V3.2）
-- deepseek-chat: 非思考模式，上下文128K，输出默认4K/最大8K
-- deepseek-reasoner: 思考模式，上下文128K，输出默认32K/最大64K（由 custom_handler 自动切换）
-- 注意：api_key 字段需要手动在数据库中更新，或通过管理后台配置
INSERT INTO ai_model_configs (
  name, category, provider, description, is_active, api_key,
  price_config, request_method, url_template, headers_template,
  body_template, default_params, response_mapping, custom_handler
) VALUES (
  'DeepSeek Chat',
  'TEXT',
  'deepseek',
  'DeepSeek-V3.2 高性价比AI文本生成，支持128K上下文，适合剧本创作和智能对话。支持思考模式与工具调用。',
  1,
  NULL,  -- API Key 留空，首次使用时需在管理后台配置
  '{"currency":"CNY","charge_on_failure":false,"components":[{"type":"input_tokens","unit":"per_million_tokens","price":2},{"type":"output_tokens","unit":"per_million_tokens","price":3}]}',
  'POST',
  'https://api.deepseek.com/v1/chat/completions',
  '{"Content-Type": "application/json", "Authorization": "Bearer {{apiKey}}"}',
  '{"model": "deepseek-chat", "messages": "{{messages}}", "max_tokens": "{{maxTokens}}", "temperature": "{{temperature}}"}',
  '{"maxTokens": 8000, "temperature": 0.7}',
  '{"content": "choices.0.message.content", "reasoningContent": "choices.0.message.reasoning_content", "tokens": "usage.total_tokens", "inputTokens": "usage.prompt_tokens", "outputTokens": "usage.completion_tokens", "finishReason": "choices.0.finish_reason"}',
  'deepseek'
)
ON DUPLICATE KEY UPDATE 
  category=VALUES(category),
  provider=VALUES(provider),
  description=VALUES(description),
  api_key=VALUES(api_key);

-- =============================================
-- 订阅计费、创作者社区和模板库功能表
-- =============================================

-- 订阅计划表
CREATE TABLE IF NOT EXISTS subscription_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  price_monthly DECIMAL(10,2) NOT NULL,
  price_yearly DECIMAL(10,2),
  max_projects INT DEFAULT -1,
  max_api_calls_monthly INT DEFAULT 0,
  max_team_members INT DEFAULT 1,
  features_json JSON,
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户订阅表
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  plan_id INT NOT NULL,
  status ENUM('active','expired','cancelled','trial') DEFAULT 'trial',
  billing_cycle ENUM('monthly','yearly') DEFAULT 'monthly',
  current_period_start DATETIME,
  current_period_end DATETIME,
  api_calls_used INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
  INDEX idx_user_id (user_id),
  INDEX idx_plan_id (plan_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创作模板表
CREATE TABLE IF NOT EXISTS templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  creator_id INT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  thumbnail_url TEXT,
  template_data JSON NOT NULL,
  tags TEXT,
  use_count INT DEFAULT 0,
  is_official TINYINT(1) DEFAULT 0,
  is_public TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_creator_id (creator_id),
  INDEX idx_category (category),
  INDEX idx_is_official (is_official),
  INDEX idx_is_public (is_public)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创作者档案表
CREATE TABLE IF NOT EXISTS creator_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  display_name VARCHAR(255),
  avatar_url TEXT,
  bio TEXT,
  social_links JSON,
  total_works INT DEFAULT 0,
  total_views INT DEFAULT 0,
  total_likes INT DEFAULT 0,
  badge VARCHAR(50) DEFAULT 'newcomer',
  is_public TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_badge (badge)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 作品展示表
CREATE TABLE IF NOT EXISTS showcases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  project_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  cover_url TEXT,
  preview_url TEXT,
  tags TEXT,
  view_count INT DEFAULT 0,
  like_count INT DEFAULT 0,
  is_featured TINYINT(1) DEFAULT 0,
  status ENUM('draft','published','hidden') DEFAULT 'draft',
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_project_id (project_id),
  INDEX idx_status (status),
  INDEX idx_is_featured (is_featured)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 初始化默认订阅套餐
INSERT INTO subscription_plans (name, display_name, price_monthly, price_yearly, max_projects, max_api_calls_monthly, max_team_members, features_json, sort_order) VALUES
('starter', 'Starter', 99.00, 999.00, 1, 10, 1, '["基础工具全开放","单部作品管理","10次/月 API调用","社区浏览"]', 1),
('creator', 'Creator', 499.00, 4999.00, 5, 500, 3, '["完整工作流","5个项目","500次/月 API调用","社区排行榜","模板库访问"]', 2),
('studio', 'Studio', 1999.00, 19999.00, -1, 5000, 10, '["无限项目","5000次/月 API调用","团队协作","版本控制","优先支持"]', 3),
('enterprise', 'Enterprise', 0.00, 0.00, -1, -1, -1, '["定制化接入","私有部署选项","优先技术支持","行业数据反馈","专属客户经理"]', 4)
ON DUPLICATE KEY UPDATE display_name=VALUES(display_name);

SET FOREIGN_KEY_CHECKS = 1;
