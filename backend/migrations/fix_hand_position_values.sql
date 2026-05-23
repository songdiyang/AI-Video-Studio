-- 修复 character_state_props 中由 held_props 自动同步产生的脏数据
-- 将无效的 hand_position='right_hand' 修正为标准值 'right'
-- 将无效的 usage_mode='held' 修正为标准值 'hold'

UPDATE character_state_props
SET hand_position = 'right'
WHERE hand_position = 'right_hand';

UPDATE character_state_props
SET usage_mode = 'hold'
WHERE usage_mode = 'held';
