/**
 * 迁移脚本: 添加道具生成支持
 * 
 * 1. 创建 prop_states 表（道具状态管理）
 * 2. 创建 storyboard_props 关联表（分镜-道具关联）
 * 3. 为 props 表添加生成相关字段
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
    console.log('执行迁移: 添加道具生成支持');
    console.log('========================================\n');

    // 1. 创建道具状态表
    console.log('1. 创建 prop_states 表...');
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS prop_states (
          id INT AUTO_INCREMENT PRIMARY KEY,
          prop_id INT NOT NULL,
          name VARCHAR(100) NOT NULL COMMENT '状态名称（如：打开、关闭、损坏）',
          description TEXT COMMENT '状态描述',
          image_url VARCHAR(500) COMMENT '该状态的图片',
          sort_order INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_prop_id (prop_id),
          FOREIGN KEY (prop_id) REFERENCES props(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='道具状态表 - 支持道具在不同场景中的变化'
      `);
      console.log('    ✓ prop_states 表创建成功');
    } catch (err) {
      if (err.code === 'ER_TABLE_EXISTS_ERROR') {
        console.log('    - prop_states 表已存在，跳过');
      } else {
        throw err;
      }
    }

    // 2. 创建分镜-道具关联表
    console.log('\n2. 创建 storyboard_props 关联表...');
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS storyboard_props (
          id INT AUTO_INCREMENT PRIMARY KEY,
          storyboard_id INT NOT NULL,
          prop_id INT NOT NULL,
          prop_state_id INT DEFAULT NULL COMMENT '使用的道具状态',
          position_hint VARCHAR(100) COMMENT '位置提示（如：桌上、手中）',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_storyboard_prop (storyboard_id, prop_id),
          INDEX idx_storyboard_id (storyboard_id),
          INDEX idx_prop_id (prop_id),
          FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
          FOREIGN KEY (prop_id) REFERENCES props(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='分镜-道具关联表'
      `);
      console.log('    ✓ storyboard_props 表创建成功');
    } catch (err) {
      if (err.code === 'ER_TABLE_EXISTS_ERROR') {
        console.log('    - storyboard_props 表已存在，跳过');
      } else {
        throw err;
      }
    }

    // 3. 为 props 表添加生成相关字段
    console.log('\n3. 为 props 表添加生成相关字段...');
    
    // 3.1 添加 generation_status 字段
    try {
      await connection.execute(`
        ALTER TABLE props 
        ADD COLUMN generation_status ENUM('idle','generating','completed','failed') DEFAULT 'idle'
        COMMENT '生成状态'
      `);
      console.log('    ✓ 成功添加 generation_status 字段');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('    - generation_status 字段已存在，跳过');
      } else {
        throw err;
      }
    }

    // 3.2 添加 generation_prompt 字段
    try {
      await connection.execute(`
        ALTER TABLE props 
        ADD COLUMN generation_prompt TEXT
        COMMENT '生成时使用的提示词'
      `);
      console.log('    ✓ 成功添加 generation_prompt 字段');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('    - generation_prompt 字段已存在，跳过');
      } else {
        throw err;
      }
    }

    // 3.3 添加 style_config 字段
    try {
      await connection.execute(`
        ALTER TABLE props 
        ADD COLUMN style_config JSON
        COMMENT '样式配置（材质、颜色、尺寸等）'
      `);
      console.log('    ✓ 成功添加 style_config 字段');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('    - style_config 字段已存在，跳过');
      } else {
        throw err;
      }
    }

    console.log('\n========================================');
    console.log('迁移完成!');
    console.log('========================================');
    console.log('\n新增表:');
    console.log('  - prop_states: 道具状态管理');
    console.log('  - storyboard_props: 分镜-道具关联');
    console.log('\nprops 表新增字段:');
    console.log('  - generation_status: 生成状态');
    console.log('  - generation_prompt: 生成提示词');
    console.log('  - style_config: 样式配置 JSON');

  } catch (err) {
    console.error('\n迁移失败:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
