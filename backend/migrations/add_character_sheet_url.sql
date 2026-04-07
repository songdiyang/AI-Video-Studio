-- 添加角色设定图合成URL字段
ALTER TABLE characters ADD COLUMN character_sheet_url TEXT COMMENT '角色设定图合成URL（三视图+描述信息）' AFTER back_view_url;
