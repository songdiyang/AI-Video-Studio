-- =========================================================
-- add_costume_generation_status.sql
-- 服装三视图生成 - 补 generation_status / generation_prompt
-- =========================================================

ALTER TABLE costumes
  ADD COLUMN generation_status ENUM('pending','generating','completed','failed') NOT NULL DEFAULT 'pending' COMMENT '三视图生成状态' AFTER tags,
  ADD COLUMN generation_prompt TEXT DEFAULT NULL COMMENT '三视图生成提示词快照' AFTER generation_status;

CREATE INDEX idx_costume_gen_status ON costumes(generation_status);
