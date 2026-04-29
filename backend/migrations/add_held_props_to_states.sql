-- 角色状态表增加"手持道具"字段
-- 将角色当前状态下手持/携带的道具（如剑、书本、胡萝卜等）从自由外貌描述中独立出来，
-- 与 outfit(服装) / hairstyle(发型) / accessories(配饰) 对齐，作为可变状态属性。
ALTER TABLE character_states ADD COLUMN held_props VARCHAR(500) DEFAULT NULL
  COMMENT '手持道具描述（当前状态下角色持有/携带的道具，如剑、书本、胡萝卜等）' AFTER body_elements;
