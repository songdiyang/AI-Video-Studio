-- 镜头语言参数系统迁移
-- 为 storyboards 表添加镜头语言相关字段

-- 添加草图相关字段（如果不存在）
ALTER TABLE storyboards 
  ADD COLUMN IF NOT EXISTS sketch_url TEXT DEFAULT NULL COMMENT '草图URL',
  ADD COLUMN IF NOT EXISTS sketch_type VARCHAR(32) DEFAULT NULL COMMENT '草图类型：stick_figure=火柴人, storyboard_sketch=分镜草图, detailed_lineart=精细线稿',
  ADD COLUMN IF NOT EXISTS sketch_data JSON DEFAULT NULL COMMENT '草图相关数据（JSON格式）',
  ADD COLUMN IF NOT EXISTS control_strength DECIMAL(3,2) DEFAULT 0.85 COMMENT 'ControlNet 控制强度（0.00-1.00）';

-- 添加锁定相关字段（如果不存在）
ALTER TABLE storyboards 
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE COMMENT '是否锁定：防止误操作修改',
  ADD COLUMN IF NOT EXISTS locked_at DATETIME DEFAULT NULL COMMENT '锁定时间',
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(255) DEFAULT NULL COMMENT '锁定者（用户ID或system）';

-- 添加镜头语言参数字段
ALTER TABLE storyboards 
  ADD COLUMN IF NOT EXISTS shot_size VARCHAR(32) DEFAULT NULL COMMENT '景别：extreme_close_up=大特写, close_up=特写, medium_close_up=中近景, medium_shot=中景, medium_long_shot=中全景, long_shot=全景, extreme_long_shot=大远景',
  ADD COLUMN IF NOT EXISTS camera_height VARCHAR(32) DEFAULT NULL COMMENT '机位高度：eye_level=平视, low_angle=仰拍, high_angle=俯拍, bird_eye=鸟瞰, worm_eye=虫视',
  ADD COLUMN IF NOT EXISTS camera_movement VARCHAR(64) DEFAULT NULL COMMENT '镜头运动：static=固定, push=推, pull=拉, pan=摇, tilt=升降, track=移, dolly=跟, zoom=变焦',
  ADD COLUMN IF NOT EXISTS lens_type VARCHAR(32) DEFAULT NULL COMMENT '镜头类型：wide=广角, standard=标准, telephoto=长焦, macro=微距, fisheye=鱼眼',
  ADD COLUMN IF NOT EXISTS focus_point VARCHAR(255) DEFAULT NULL COMMENT '焦点位置描述',
  ADD COLUMN IF NOT EXISTS depth_of_field VARCHAR(32) DEFAULT NULL COMMENT '景深：shallow=浅景深, deep=深景深, medium=中等',
  ADD COLUMN IF NOT EXISTS lighting_mood VARCHAR(64) DEFAULT NULL COMMENT '光影氛围：high_key=高调, low_key=低调, chiaroscuro=明暗对比, silhouette=剪影, backlit=逆光',
  ADD COLUMN IF NOT EXISTS composition_rule VARCHAR(64) DEFAULT NULL COMMENT '构图法则：rule_of_thirds=三分法, center=中心构图, symmetry=对称, leading_lines=引导线, frame_in_frame=框中框',
  ADD COLUMN IF NOT EXISTS axis_position VARCHAR(32) DEFAULT NULL COMMENT '轴线位置：left=左侧, right=右侧, on_axis=轴线上',
  ADD COLUMN IF NOT EXISTS screen_direction VARCHAR(32) DEFAULT NULL COMMENT '屏幕方向：left_to_right=左向右, right_to_left=右向左, towards_camera=朝向镜头, away_from_camera=远离镜头',
  ADD COLUMN IF NOT EXISTS shot_duration DECIMAL(5,2) DEFAULT NULL COMMENT '镜头时长（秒）',
  ADD COLUMN IF NOT EXISTS transition_type VARCHAR(32) DEFAULT NULL COMMENT '转场类型：cut=硬切, fade=淡入淡出, dissolve=叠化, wipe=划像, match_cut=匹配剪辑';
