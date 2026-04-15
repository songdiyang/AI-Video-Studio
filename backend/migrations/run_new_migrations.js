/**
 * 统一迁移运行脚本
 * 执行以下迁移:
 * - add_spatial_metadata.sql: 添加场景空间元数据字段
 * - add_tag_groups.sql: 添加角色标签分组系统
 */
const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    console.log('========================================');
    console.log('开始执行数据库迁移...');
    console.log('========================================\n');

    // =============================================
    // 迁移 1: add_spatial_metadata.sql
    // =============================================
    console.log('[迁移 1] add_spatial_metadata.sql - 场景空间元数据增强');
    console.log('-------------------------------------------');

    // 1.1 scenes 表添加 spatial_layout 字段
    console.log('1.1 添加 scenes.spatial_layout 字段...');
    try {
      await connection.execute(`
        ALTER TABLE scenes ADD COLUMN spatial_layout TEXT DEFAULT NULL 
        COMMENT 'JSON: 前景/中景/背景空间布局描述'
      `);
      console.log('    ✓ 成功添加 spatial_layout 字段');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('    - spatial_layout 字段已存在，跳过');
      } else {
        throw err;
      }
    }

    // 1.2 scenes 表添加 camera_defaults 字段
    console.log('1.2 添加 scenes.camera_defaults 字段...');
    try {
      await connection.execute(`
        ALTER TABLE scenes ADD COLUMN camera_defaults TEXT DEFAULT NULL 
        COMMENT 'JSON: 默认摄像机参数(角度/距离/高度)'
      `);
      console.log('    ✓ 成功添加 camera_defaults 字段');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('    - camera_defaults 字段已存在，跳过');
      } else {
        throw err;
      }
    }

    // 1.3 storyboards 表添加 spatial_description 字段
    console.log('1.3 添加 storyboards.spatial_description 字段...');
    try {
      await connection.execute(`
        ALTER TABLE storyboards ADD COLUMN spatial_description TEXT DEFAULT NULL 
        COMMENT 'JSON: 角色位置/深度层/摄像机角度等空间关系'
      `);
      console.log('    ✓ 成功添加 spatial_description 字段');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('    - spatial_description 字段已存在，跳过');
      } else {
        throw err;
      }
    }

    console.log('[迁移 1] 完成 ✓\n');

    // =============================================
    // 迁移 2: add_tag_groups.sql
    // =============================================
    console.log('[迁移 2] add_tag_groups.sql - 角色标签分组系统');
    console.log('-------------------------------------------');

    // 2.1 创建 character_tag_groups 表
    console.log('2.1 创建 character_tag_groups 表...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS character_tag_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL COMMENT '分组名称，如年龄段、风格、种族',
        color VARCHAR(20) DEFAULT '#6366f1' COMMENT '分组颜色标记(hex)',
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_group (user_id, name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('    ✓ character_tag_groups 表已就绪');

    // 2.2 characters 表添加 tag_groups_json 字段
    console.log('2.2 添加 characters.tag_groups_json 字段...');
    try {
      await connection.execute(`
        ALTER TABLE characters ADD COLUMN tag_groups_json TEXT DEFAULT NULL 
        COMMENT 'JSON: 结构化标签分组数据'
      `);
      console.log('    ✓ 成功添加 tag_groups_json 字段');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('    - tag_groups_json 字段已存在，跳过');
      } else {
        throw err;
      }
    }

    console.log('[迁移 2] 完成 ✓\n');

    // =============================================
    // 迁移 3: add_character_states.sql - 角色状态管理与参考图
    // =============================================
    console.log('[迁移 3] add_character_states.sql - 角色状态管理与参考图');
    console.log('-------------------------------------------');

    // 3.1 创建 character_states 表
    console.log('3.1 创建 character_states 表...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS character_states (
        id INT AUTO_INCREMENT PRIMARY KEY,
        character_id INT NOT NULL COMMENT '关联的角色ID',
        name VARCHAR(100) NOT NULL COMMENT '状态名称：如童年、青年、战斗、受伤',
        description TEXT COMMENT '状态描述',
        appearance TEXT COMMENT '该状态下的外貌特征',
        image_url TEXT COMMENT '状态主图URL',
        front_view_url TEXT COMMENT '正面视图URL',
        side_view_url TEXT COMMENT '侧面视图URL',
        back_view_url TEXT COMMENT '背面视图URL',
        sort_order INT DEFAULT 0 COMMENT '排序顺序',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
        INDEX idx_character_id (character_id),
        INDEX idx_sort_order (sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色状态表'
    `);
    console.log('    ✓ character_states 表已就绪');

    // 3.2 创建 asset_reference_images 表
    console.log('3.2 创建 asset_reference_images 表...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS asset_reference_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        asset_type ENUM('character', 'character_state', 'prop') NOT NULL COMMENT '资产类型',
        asset_id INT NOT NULL COMMENT '关联的资产ID',
        image_url TEXT NOT NULL COMMENT '图片URL',
        description VARCHAR(255) DEFAULT NULL COMMENT '图片描述',
        sort_order INT DEFAULT 0 COMMENT '排序顺序',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_asset (asset_type, asset_id),
        INDEX idx_sort_order (sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='资产参考图表'
    `);
    console.log('    ✓ asset_reference_images 表已就绪');

    console.log('[迁移 3] 完成 ✓\n');

    // =============================================
    // 迁移 4: 参考图启用/禁用功能
    // =============================================
    console.log('[迁移 4] 参考图启用/禁用功能');
    console.log('-------------------------------------------');

    // 4.1 为 asset_reference_images 表添加 is_enabled 字段
    console.log('4.1 添加 asset_reference_images.is_enabled 字段...');
    try {
      await connection.execute(`
        ALTER TABLE asset_reference_images 
        ADD COLUMN is_enabled BOOLEAN DEFAULT TRUE COMMENT '是否启用该参考图参与AI生成'
      `);
      console.log('    ✓ 成功添加 is_enabled 字段');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('    - is_enabled 字段已存在，跳过');
      } else {
        throw err;
      }
    }

    // 4.2 为 characters 表添加 use_reference_images 字段
    console.log('4.2 添加 characters.use_reference_images 字段...');
    try {
      await connection.execute(`
        ALTER TABLE characters 
        ADD COLUMN use_reference_images BOOLEAN DEFAULT TRUE COMMENT '是否使用参考图进行三视图生成'
      `);
      console.log('    ✓ 成功添加 use_reference_images 字段');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('    - use_reference_images 字段已存在，跳过');
      } else {
        throw err;
      }
    }

    // 4.3 为 character_states 表添加 use_reference_images 字段
    console.log('4.3 添加 character_states.use_reference_images 字段...');
    try {
      await connection.execute(`
        ALTER TABLE character_states 
        ADD COLUMN use_reference_images BOOLEAN DEFAULT TRUE COMMENT '是否使用参考图进行状态图片生成'
      `);
      console.log('    ✓ 成功添加 use_reference_images 字段');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('    - use_reference_images 字段已存在，跳过');
      } else {
        throw err;
      }
    }

    // 4.4 创建索引优化查询
    console.log('4.4 创建索引 idx_reference_images_enabled...');
    try {
      await connection.execute(`
        CREATE INDEX idx_reference_images_enabled ON asset_reference_images (asset_type, asset_id, is_enabled)
      `);
      console.log('    ✓ 成功创建索引');
    } catch (err) {
      if (err.code === 'ER_DUP_KEYNAME') {
        console.log('    - 索引已存在，跳过');
      } else {
        throw err;
      }
    }

    console.log('[迁移 4] 完成 ✓\n');

    console.log('========================================');
    console.log('所有迁移执行完成!');
    console.log('========================================');
  } catch (err) {
    console.error('\n迁移失败:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
