-- =========================================================
-- 20260502b_add_studio_view_selection.sql
-- 影棚"组装视角选择"字段
-- 用途：影棚作为组装成品，允许用户为每个绑定关系单独选择
--       "采用哪一面图"作为九宫组装图 i2i 融合参考：
--       - 环境 1:1 → 正面（image_url）或背面（image_back_url）
--       - 建筑 1:N → 外景（exterior_image_url）或内景（interior_image_url）
-- =========================================================

ALTER TABLE studios
  ADD COLUMN environment_view ENUM('front','back') DEFAULT 'front'
    COMMENT '影棚采用绑定环境的哪一面图（front=正面图, back=背面图），用于九宫组装图 i2i 参考';

ALTER TABLE studio_building_links
  ADD COLUMN building_view ENUM('exterior','interior') DEFAULT 'exterior'
    COMMENT '影棚采用此建筑的哪种视图（exterior=外景, interior=内景），用于九宫组装图 i2i 参考';
