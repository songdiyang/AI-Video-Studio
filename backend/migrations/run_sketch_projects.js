/**
 * 运行数据库迁移脚本
 * 创建独立草图项目表（sketch_projects）
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
    console.log('开始执行独立草图项目表迁移...');

    // 创建 sketch_projects 表
    console.log('1. 创建 sketch_projects 表...');
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS sketch_projects (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL COMMENT '用户ID',
          project_id INT NOT NULL COMMENT '所属项目ID',
          title VARCHAR(255) NOT NULL DEFAULT '未命名草图' COMMENT '草图标题',
          description TEXT COMMENT '草图描述',
          thumbnail_url VARCHAR(512) COMMENT '缩略图URL',
          sketch_url VARCHAR(512) COMMENT '导出图片URL',
          excalidraw_data LONGTEXT COMMENT 'Excalidraw矢量数据JSON',
          tags JSON COMMENT '标签列表',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
          
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          
          INDEX idx_sketch_projects_user_project (user_id, project_id),
          INDEX idx_sketch_projects_updated (updated_at DESC)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='独立草图项目表'
      `);
      console.log('   sketch_projects 表创建成功');
    } catch (err) {
      if (err.code === 'ER_TABLE_EXISTS_ERROR') {
        console.log('   sketch_projects 表已存在，跳过');
      } else {
        throw err;
      }
    }

    // 添加 title 索引（用于搜索）
    console.log('2. 添加 title 索引...');
    try {
      await connection.execute(`
        CREATE INDEX idx_sketch_projects_title ON sketch_projects(title)
      `);
      console.log('   idx_sketch_projects_title 索引创建成功');
    } catch (err) {
      if (err.code === 'ER_DUP_KEYNAME') {
        console.log('   idx_sketch_projects_title 索引已存在，跳过');
      } else {
        throw err;
      }
    }

    console.log('独立草图项目表迁移完成!');
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
