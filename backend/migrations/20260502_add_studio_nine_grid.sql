-- =========================================================
-- 20260502_add_studio_nine_grid.sql
-- 为影棚资产添加"九宫组装图"字段
-- 用途：影棚作为组装成品，基于绑定环境 + 建筑共同生成一张 3x3
--       九机位视角组合图（主视/左视/右视/俯视/仰视/远景/中景/
--       建筑细节/氛围细节），独立于环境全景图，互不影响。
-- =========================================================

ALTER TABLE studios
  ADD COLUMN nine_grid_image_url VARCHAR(1024) DEFAULT NULL
    COMMENT '影棚九宫组装图 URL（3x3 九机位视角合成图）',
  ADD COLUMN nine_grid_generation_status
    ENUM('pending','generating','completed','failed') DEFAULT 'pending'
    COMMENT '九宫组装图生成状态',
  ADD COLUMN nine_grid_generation_prompt TEXT DEFAULT NULL
    COMMENT '九宫组装图最近一次生成所用的提示词（调试/回溯用）';
