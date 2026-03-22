/**
 * 运行数据库迁移脚本
 * 添加草图版本历史功能（sketch_version字段 + sketch_history表 + 索引）
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    console.log('开始执行草图版本历史迁移...');

    // 1. 添加 storyboards.sketch_version 列
    console.log('1. 添加 storyboards.sketch_version 列...');
    try {
      await connection.execute(`
        ALTER TABLE storyboards 
        ADD COLUMN sketch_version INT DEFAULT 1 COMMENT '草图版本号'
      `);
      console.log('   sketch_version 列添加成功');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('   sketch_version 列已存在，跳过');
      } else {
        throw err;
      }
    }

    // 2. 创建 sketch_history 表
    console.log('2. 创建 sketch_history 表...');
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS sketch_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          storyboard_id INT NOT NULL COMMENT '关联的分镜ID',
          version INT NOT NULL DEFAULT 1 COMMENT '版本号',
          sketch_url TEXT COMMENT '草图文件URL',
          sketch_type VARCHAR(32) COMMENT '草图类型：stick_figure/storyboard_sketch/detailed_lineart',
          sketch_data JSON COMMENT 'Excalidraw矢量数据',
          control_strength DECIMAL(3,2) DEFAULT 0.85 COMMENT 'ControlNet控制强度(0.00-1.00)',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
          
          INDEX idx_sketch_history_storyboard (storyboard_id),
          INDEX idx_sketch_history_version (storyboard_id, version),
          
          FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='草图版本历史记录表'
      `);
      console.log('   sketch_history 表创建成功');
    } catch (err) {
      if (err.code === 'ER_TABLE_EXISTS_ERROR') {
        console.log('   sketch_history 表已存在，跳过');
      } else {
        throw err;
      }
    }

    // 3. 添加 storyboards.sketch_url 索引
    console.log('3. 添加 storyboards.sketch_url 索引...');
    try {
      await connection.execute(`
        CREATE INDEX idx_storyboards_sketch_url ON storyboards(sketch_url(255))
      `);
      console.log('   idx_storyboards_sketch_url 索引创建成功');
    } catch (err) {
      if (err.code === 'ER_DUP_KEYNAME') {
        console.log('   idx_storyboards_sketch_url 索引已存在，跳过');
      } else {
        throw err;
      }
    }

    // 4. 添加 storyboards.sketch_type 索引
    console.log('4. 添加 storyboards.sketch_type 索引...');
    try {
      await connection.execute(`
        CREATE INDEX idx_storyboards_sketch_type ON storyboards(sketch_type)
      `);
      console.log('   idx_storyboards_sketch_type 索引创建成功');
    } catch (err) {
      if (err.code === 'ER_DUP_KEYNAME') {
        console.log('   idx_storyboards_sketch_type 索引已存在，跳过');
      } else {
        throw err;
      }
    }

    console.log('草图版本历史迁移完成!');
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
