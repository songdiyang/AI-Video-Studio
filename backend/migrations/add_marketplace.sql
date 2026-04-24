-- 模板市场功能数据库迁移
-- 将现有创作者社区改造为模板市场，支持提示词配方交易、社交互动
-- 执行日期：2026-04-24
-- 幂等设计：使用 IF NOT EXISTS / 忽略已存在列

-- =============================================
-- 1. templates 表扩展字段
-- =============================================

-- 使用存储过程安全添加列（列已存在则跳过）
DROP PROCEDURE IF EXISTS add_column_if_not_exists;
DELIMITER $$
CREATE PROCEDURE add_column_if_not_exists(
  IN p_table VARCHAR(100),
  IN p_column VARCHAR(100),
  IN p_definition TEXT
)
BEGIN
  DECLARE col_exists INT DEFAULT 0;
  SELECT COUNT(*) INTO col_exists
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column;
  
  IF col_exists = 0 THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_column_if_not_exists('templates', 'price', 'INT DEFAULT 0 COMMENT "售价（积分），0=免费"');
CALL add_column_if_not_exists('templates', 'is_free', 'TINYINT(1) DEFAULT 0 COMMENT "是否免费模板"');
CALL add_column_if_not_exists('templates', 'listing_status', "ENUM('draft','listed','delisted') DEFAULT 'draft' COMMENT '上架状态'");
CALL add_column_if_not_exists('templates', 'recipe_type', "ENUM('character','scene','script') DEFAULT 'character' COMMENT '配方类型'");
CALL add_column_if_not_exists('templates', 'preview_urls', 'JSON COMMENT "预览图URL列表"');
CALL add_column_if_not_exists('templates', 'recipe_data', 'JSON COMMENT "配方数据（提示词+参数）"');
CALL add_column_if_not_exists('templates', 'like_count', 'INT DEFAULT 0 COMMENT "点赞数"');
CALL add_column_if_not_exists('templates', 'comment_count', 'INT DEFAULT 0 COMMENT "评论数"');
CALL add_column_if_not_exists('templates', 'purchase_count', 'INT DEFAULT 0 COMMENT "购买数"');
CALL add_column_if_not_exists('templates', 'total_revenue', 'INT DEFAULT 0 COMMENT "累计收入（积分）"');
CALL add_column_if_not_exists('templates', 'listed_at', 'DATETIME COMMENT "上架时间"');
CALL add_column_if_not_exists('templates', 'sort_score', 'FLOAT DEFAULT 0 COMMENT "排序权重分"');
CALL add_column_if_not_exists('templates', 'review_status', "ENUM('pending','approved','rejected') DEFAULT 'pending' COMMENT '审核状态'");
CALL add_column_if_not_exists('templates', 'review_note', 'TEXT COMMENT "审核备注"');
CALL add_column_if_not_exists('templates', 'seller_id', 'INT COMMENT "卖家用户ID"');

-- 添加索引
ALTER TABLE templates ADD INDEX IF NOT EXISTS idx_listing_status (listing_status);
ALTER TABLE templates ADD INDEX IF NOT EXISTS idx_recipe_type (recipe_type);
ALTER TABLE templates ADD INDEX IF NOT EXISTS idx_seller_id (seller_id);
ALTER TABLE templates ADD INDEX IF NOT EXISTS idx_sort_score (sort_score);
ALTER TABLE templates ADD INDEX IF NOT EXISTS idx_price (price);

DROP PROCEDURE IF EXISTS add_column_if_not_exists;

-- =============================================
-- 2. template_purchases - 购买记录表
-- =============================================
CREATE TABLE IF NOT EXISTS template_purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  buyer_id INT NOT NULL,
  template_id INT NOT NULL,
  seller_id INT NOT NULL,
  price INT NOT NULL COMMENT '成交价格（积分）',
  platform_fee INT NOT NULL COMMENT '平台手续费（积分）',
  seller_revenue INT NOT NULL COMMENT '卖家收入（积分）',
  status ENUM('completed','refunded') DEFAULT 'completed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (buyer_id) REFERENCES users(id),
  FOREIGN KEY (template_id) REFERENCES templates(id),
  FOREIGN KEY (seller_id) REFERENCES users(id),
  UNIQUE KEY uk_buyer_template (buyer_id, template_id),
  INDEX idx_buyer_id (buyer_id),
  INDEX idx_seller_id (seller_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 3. template_comments - 评论表
-- =============================================
CREATE TABLE IF NOT EXISTS template_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  parent_id INT DEFAULT NULL COMMENT '回复评论ID',
  like_count INT DEFAULT 0,
  status ENUM('visible','hidden') DEFAULT 'visible',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (parent_id) REFERENCES template_comments(id) ON DELETE SET NULL,
  INDEX idx_template_id (template_id),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 4. template_likes - 点赞去重表
-- =============================================
CREATE TABLE IF NOT EXISTS template_likes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_template_user (template_id, user_id),
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 5. user_follows - 关注/粉丝表
-- =============================================
CREATE TABLE IF NOT EXISTS user_follows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  follower_id INT NOT NULL COMMENT '关注者',
  following_id INT NOT NULL COMMENT '被关注者',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_follow (follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id),
  FOREIGN KEY (following_id) REFERENCES users(id),
  INDEX idx_follower (follower_id),
  INDEX idx_following (following_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 6. creator_profiles 表扩展字段
-- =============================================
DROP PROCEDURE IF EXISTS add_column_if_not_exists;
DELIMITER $$
CREATE PROCEDURE add_column_if_not_exists(
  IN p_table VARCHAR(100),
  IN p_column VARCHAR(100),
  IN p_definition TEXT
)
BEGIN
  DECLARE col_exists INT DEFAULT 0;
  SELECT COUNT(*) INTO col_exists
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column;
  
  IF col_exists = 0 THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_column_if_not_exists('creator_profiles', 'follower_count', 'INT DEFAULT 0 COMMENT "粉丝数"');
CALL add_column_if_not_exists('creator_profiles', 'following_count', 'INT DEFAULT 0 COMMENT "关注数"');
CALL add_column_if_not_exists('creator_profiles', 'total_sales', 'INT DEFAULT 0 COMMENT "累计销量"');
CALL add_column_if_not_exists('creator_profiles', 'total_earnings', 'INT DEFAULT 0 COMMENT "累计收入（积分）"');
CALL add_column_if_not_exists('creator_profiles', 'shop_description', 'TEXT COMMENT "小店简介"');

DROP PROCEDURE IF EXISTS add_column_if_not_exists;
