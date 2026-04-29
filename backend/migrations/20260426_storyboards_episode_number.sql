-- storyboards 增加 episode_number 字段：支持无参考剧本模式下按集数隔离分镜
-- 语义：
--   1) 绑定剧本的分镜（script_id IS NOT NULL）：该字段一般为 NULL，集数由 scripts.episode_number 推导
--   2) 无参考剧本的分镜（script_id IS NULL）：用该字段标记集数，区分"第 N 集"工作台的分镜列表
-- 历史数据：所有已存在的无参考剧本分镜统一回填为第 1 集。

ALTER TABLE storyboards
  ADD COLUMN episode_number INT DEFAULT NULL COMMENT '无参考剧本模式下的集数标签（script_id IS NULL 时生效）' AFTER script_id;

-- 历史数据回填：把已有的自由分镜挂到第 1 集
UPDATE storyboards SET episode_number = 1 WHERE script_id IS NULL AND episode_number IS NULL;

-- 复合索引：加速"某项目 + 某集"的查询
CREATE INDEX idx_project_episode ON storyboards (project_id, episode_number);
