-- ============================================================
-- 角色白膜/服装分层架构改造
-- 在 characters 表增加 base_appearance 和 outfit_appearance 字段
-- ============================================================

-- 白膜体貌描述（不含服装的身体特征：年龄、性别、体型、肤色、发型发色、瞳色、五官、永久身体标记）
ALTER TABLE characters ADD COLUMN base_appearance TEXT DEFAULT NULL COMMENT '白膜体貌描述（不含服装的身体特征）';

-- 服装外貌描述（服装款式/颜色/材质、配饰、鞋子等可更换装饰）
ALTER TABLE characters ADD COLUMN outfit_appearance TEXT DEFAULT NULL COMMENT '服装外貌描述（服装、配饰等可更换装饰）';

-- 索引：加速按白膜状态查询
-- (is_base_model 索引已存在于 add_costumes.sql)
