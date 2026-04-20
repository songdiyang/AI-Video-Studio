-- 角色状态表增加身体元素字段
-- 用于白膜生成时注入身体标记（纹身、疤痕、胎记等永久性身体标记）
ALTER TABLE character_states ADD COLUMN body_elements TEXT DEFAULT NULL 
  COMMENT '身体元素描述（纹身、疤痕、胎记等永久性身体标记）' AFTER accessories;
