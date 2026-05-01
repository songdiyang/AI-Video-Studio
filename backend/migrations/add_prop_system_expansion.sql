-- 道具系统全面改造迁移
-- 1. 扩展 props 表：添加道具类型、三视图URL、默认装备字段
-- 2. 新建 character_state_props 关联表：角色状态与道具的叠加关系
-- 3. 扩展 storyboard_props 表：支持分镜中角色持握道具

-- =================== 1. 扩展 props 表 ===================

ALTER TABLE props
  ADD COLUMN prop_type ENUM('permanent', 'interactive') DEFAULT 'interactive'
    COMMENT '道具类型：permanent=永久道具(可叠加到角色状态), interactive=临时交互道具(工作台/分镜中使用)',
  ADD COLUMN front_view_url TEXT
    COMMENT '道具正面视图URL',
  ADD COLUMN side_view_url TEXT
    COMMENT '道具侧面视图URL',
  ADD COLUMN back_view_url TEXT
    COMMENT '道具背面视图URL',
  ADD COLUMN is_equipped BOOLEAN DEFAULT 0
    COMMENT '是否默认装备（仅永久道具有效）';

-- 为已有道具设置默认类型为 interactive（保持向后兼容）
UPDATE props SET prop_type = 'interactive' WHERE prop_type IS NULL;

-- =================== 2. 新建 character_state_props 关联表 ===================

CREATE TABLE IF NOT EXISTS character_state_props (
  id INT AUTO_INCREMENT PRIMARY KEY,
  character_state_id INT NOT NULL COMMENT '角色状态ID',
  prop_id INT NOT NULL COMMENT '道具ID',
  prop_type ENUM('permanent', 'interactive') DEFAULT 'permanent' COMMENT '道具类型',
  is_equipped BOOLEAN DEFAULT 1 COMMENT '当前是否手持',
  hand_position VARCHAR(50) DEFAULT 'right' COMMENT '手持位置: left/right/both/back/waist',
  usage_mode VARCHAR(50) DEFAULT 'hold' COMMENT '持握方式: hold(握持)/wear(佩戴)/carry(背负)/ground(放置)',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (character_state_id) REFERENCES character_states(id) ON DELETE CASCADE,
  FOREIGN KEY (prop_id) REFERENCES props(id) ON DELETE CASCADE,
  UNIQUE KEY uk_state_prop (character_state_id, prop_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色状态-道具关联表';

-- =================== 3. 扩展 storyboard_props 表 ===================

ALTER TABLE storyboard_props
  ADD COLUMN character_id INT NULL COMMENT '关联角色ID',
  ADD COLUMN character_state_id INT NULL COMMENT '角色状态ID',
  ADD COLUMN hand_position VARCHAR(50) DEFAULT 'right' COMMENT '手持位置',
  ADD COLUMN usage_mode VARCHAR(50) DEFAULT 'hold' COMMENT '持握方式';
