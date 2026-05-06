-- =============================================
-- 版本控制与团队协作功能扩展表
-- =============================================

-- 版本历史表（支持分镜、场景、帧的版本管理）
CREATE TABLE IF NOT EXISTS version_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '所属项目 ID',
  resource_type ENUM('storyboard', 'scene', 'character', 'frame_sequence') NOT NULL COMMENT '资源类型',
  resource_id INT NOT NULL COMMENT '资源 ID（分镜 ID/场景 ID/角色 ID 等）',
  version_number INT NOT NULL COMMENT '版本号（从 1 开始递增）',
  parent_version_id INT DEFAULT NULL COMMENT '父版本 ID（支持分支）',
  branch_name VARCHAR(100) DEFAULT 'main' COMMENT '分支名称',
  version_label VARCHAR(255) COMMENT '版本标签（如：初稿、修改版、终稿）',
  change_summary TEXT COMMENT '变更摘要',
  change_details JSON COMMENT '变更详情（记录具体字段变化）',
  snapshot_data JSON COMMENT '快照数据（完整资源数据备份）',
  created_by INT NOT NULL COMMENT '创建者用户 ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_current TINYINT(1) DEFAULT 1 COMMENT '是否为当前版本',
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_version_id) REFERENCES version_history(id) ON DELETE SET NULL,
  INDEX idx_resource (resource_type, resource_id),
  INDEX idx_project (project_id),
  INDEX idx_version (resource_type, resource_id, version_number),
  INDEX idx_branch (resource_type, resource_id, branch_name),
  INDEX idx_current (resource_type, resource_id, is_current)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='版本历史表';

-- 团队协作成员表
CREATE TABLE IF NOT EXISTS team_collaborators (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '所属项目 ID',
  user_id INT NOT NULL COMMENT '用户 ID',
  role ENUM('owner', 'admin', 'editor', 'viewer', 'reviewer') NOT NULL DEFAULT 'viewer' COMMENT '角色权限',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  invited_by INT NOT NULL COMMENT '邀请者用户 ID',
  status ENUM('pending', 'active', 'removed') DEFAULT 'active' COMMENT '成员状态',
  last_active_at DATETIME DEFAULT NULL COMMENT '最后活跃时间',
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_project_user (project_id, user_id),
  INDEX idx_project (project_id),
  INDEX idx_user (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='团队协作成员表';

-- 帧批注与评论表
CREATE TABLE IF NOT EXISTS frame_annotations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '所属项目 ID',
  storyboard_id INT NOT NULL COMMENT '分镜 ID',
  frame_type ENUM('first', 'last', 'video_frame') NOT NULL DEFAULT 'first' COMMENT '帧类型',
  frame_timestamp DECIMAL(10,3) DEFAULT NULL COMMENT '视频时间戳（秒）',
  annotation_type ENUM('comment', 'suggestion', 'issue', 'approval') NOT NULL DEFAULT 'comment' COMMENT '批注类型',
  position_x DECIMAL(5,2) DEFAULT NULL COMMENT '标注位置 X 坐标（百分比 0-100）',
  position_y DECIMAL(5,2) DEFAULT NULL COMMENT '标注位置 Y 坐标（百分比 0-100）',
  content TEXT NOT NULL COMMENT '批注内容',
  reply_to INT DEFAULT NULL COMMENT '回复的批注 ID',
  status ENUM('open', 'resolved', 'rejected', 'archived') DEFAULT 'open' COMMENT '批注状态',
  priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium' COMMENT '优先级',
  tags TEXT COMMENT '标签（逗号分隔）',
  attachments JSON COMMENT '附件（图片、文件等）',
  created_by INT NOT NULL COMMENT '创建者用户 ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at DATETIME DEFAULT NULL COMMENT '解决时间',
  resolved_by INT DEFAULT NULL COMMENT '解决者用户 ID',
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reply_to) REFERENCES frame_annotations(id) ON DELETE SET NULL,
  INDEX idx_storyboard (storyboard_id),
  INDEX idx_project (project_id),
  INDEX idx_status (status),
  INDEX idx_type (annotation_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='帧批注与评论表';

-- 操作日志表（广电级合规溯源）
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id INT DEFAULT NULL COMMENT '所属项目 ID',
  user_id INT NOT NULL COMMENT '操作用户 ID',
  action_type VARCHAR(100) NOT NULL COMMENT '操作类型（如：storyboard.create, scene.update, frame.delete）',
  resource_type VARCHAR(50) DEFAULT NULL COMMENT '资源类型',
  resource_id INT DEFAULT NULL COMMENT '资源 ID',
  action_description TEXT COMMENT '操作描述',
  request_data JSON COMMENT '请求数据',
  response_data JSON COMMENT '响应数据',
  ip_address VARCHAR(45) COMMENT 'IP 地址',
  user_agent TEXT COMMENT '用户代理',
  session_id VARCHAR(128) COMMENT '会话 ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_project (project_id),
  INDEX idx_user (user_id),
  INDEX idx_action_type (action_type),
  INDEX idx_created_at (created_at),
  INDEX idx_resource (resource_type, resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志表';

-- 实时协作状态表（WebSocket 会话追踪）
CREATE TABLE IF NOT EXISTS collaboration_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '项目 ID',
  user_id INT NOT NULL COMMENT '用户 ID',
  session_id VARCHAR(128) NOT NULL COMMENT 'WebSocket 会话 ID',
  resource_type VARCHAR(50) DEFAULT NULL COMMENT '正在编辑的资源类型',
  resource_id INT DEFAULT NULL COMMENT '正在编辑的资源 ID',
  cursor_position JSON COMMENT '光标位置/选中区域',
  last_heartbeat_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '最后心跳时间',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_session (session_id),
  INDEX idx_project (project_id),
  INDEX idx_user (user_id),
  INDEX idx_heartbeat (last_heartbeat_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实时协作会话表';

-- 冲突解决记录表
CREATE TABLE IF NOT EXISTS conflict_resolutions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '项目 ID',
  resource_type VARCHAR(50) NOT NULL COMMENT '资源类型',
  resource_id INT NOT NULL COMMENT '资源 ID',
  conflict_type ENUM('concurrent_edit', 'version_conflict', 'data_conflict') NOT NULL COMMENT '冲突类型',
  conflicting_users JSON COMMENT '冲突用户列表',
  resolution_strategy ENUM('last_write_wins', 'manual_merge', 'version_branch', 'accept_both') NOT NULL COMMENT '解决策略',
  resolution_data JSON COMMENT '解决后的数据',
  resolved_by INT NOT NULL COMMENT '解决者用户 ID',
  resolved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_project (project_id),
  INDEX idx_resource (resource_type, resource_id),
  INDEX idx_resolved_at (resolved_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='冲突解决记录表';

-- 通知订阅表（协作通知）
CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '用户 ID',
  project_id INT DEFAULT NULL COMMENT '项目 ID（NULL 表示全局）',
  notification_type ENUM('comment', 'mention', 'version_change', 'invite', 'conflict') NOT NULL COMMENT '通知类型',
  resource_type VARCHAR(50) DEFAULT NULL COMMENT '资源类型',
  resource_id INT DEFAULT NULL COMMENT '资源 ID',
  is_email TINYINT(1) DEFAULT 1 COMMENT '是否邮件通知',
  is_push TINYINT(1) DEFAULT 1 COMMENT '是否推送通知',
  is_in_app TINYINT(1) DEFAULT 1 COMMENT '是否应用内通知',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE KEY uk_user_type_resource (user_id, notification_type, resource_type, resource_id),
  INDEX idx_user (user_id),
  INDEX idx_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知订阅表';

-- 工作流审批表（广电级审核流程）
CREATE TABLE IF NOT EXISTS workflow_approvals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '项目 ID',
  storyboard_id INT DEFAULT NULL COMMENT '分镜 ID',
  approval_stage ENUM('draft', 'review', 'approved', 'rejected') NOT NULL DEFAULT 'draft' COMMENT '审批阶段',
  current_reviewer_id INT DEFAULT NULL COMMENT '当前审核人 ID',
  approval_flow JSON COMMENT '审批流程配置',
  approval_comments JSON COMMENT '审批意见',
  final_approved_by INT DEFAULT NULL COMMENT '最终批准人 ID',
  final_approved_at DATETIME DEFAULT NULL COMMENT '最终批准时间',
  created_by INT NOT NULL COMMENT '创建者用户 ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (current_reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (final_approved_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_project (project_id),
  INDEX idx_storyboard (storyboard_id),
  INDEX idx_stage (approval_stage),
  INDEX idx_reviewer (current_reviewer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作流审批表';

-- 素材库版本表
CREATE TABLE IF NOT EXISTS asset_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  asset_type ENUM('character', 'scene', 'prop', 'reference') NOT NULL COMMENT '素材类型',
  asset_id INT NOT NULL COMMENT '素材 ID',
  version_number INT NOT NULL COMMENT '版本号',
  file_url TEXT NOT NULL COMMENT '文件 URL',
  file_size BIGINT DEFAULT NULL COMMENT '文件大小（字节）',
  file_hash VARCHAR(64) DEFAULT NULL COMMENT '文件哈希（用于去重和校验）',
  metadata JSON COMMENT '元数据',
  uploaded_by INT NOT NULL COMMENT '上传者用户 ID',
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_current TINYINT(1) DEFAULT 1 COMMENT '是否为当前版本',
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_asset (asset_type, asset_id),
  INDEX idx_version (asset_type, asset_id, version_number),
  INDEX idx_current (asset_type, asset_id, is_current)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='素材库版本表';

-- 数据同步日志表（云端同步追踪）
CREATE TABLE IF NOT EXISTS sync_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '项目 ID',
  user_id INT NOT NULL COMMENT '用户 ID',
  sync_type ENUM('upload', 'download', 'conflict_resolve', 'merge') NOT NULL COMMENT '同步类型',
  resource_type VARCHAR(50) NOT NULL COMMENT '资源类型',
  resource_id INT NOT NULL COMMENT '资源 ID',
  sync_status ENUM('pending', 'success', 'failed', 'conflict') NOT NULL COMMENT '同步状态',
  local_version INT DEFAULT NULL COMMENT '本地版本号',
  remote_version INT DEFAULT NULL COMMENT '远程版本号',
  sync_data JSON COMMENT '同步数据',
  error_message TEXT COMMENT '错误信息',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_project (project_id),
  INDEX idx_user (user_id),
  INDEX idx_status (sync_status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据同步日志表';

-- 插入示例数据：默认协作权限模板
INSERT INTO team_collaborators (project_id, user_id, role, invited_by)
SELECT p.id, p.user_id, 'owner', p.user_id
FROM projects p
ON DUPLICATE KEY UPDATE role=VALUES(role);
