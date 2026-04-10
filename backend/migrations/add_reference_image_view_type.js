/**
 * 数据库迁移：为参考图添加视角类型支持
 * 
 * 功能：
 * 1. 为 asset_reference_images 表添加 view_type 字段
 *    - 支持分类：front (正面)、side (侧面)、back (背面)、other (其他)
 * 2. 添加索引以优化按视角查询
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
    console.log('执行迁移: 添加参考图视角类型支持');
    console.log('========================================\n');

    // 1. 检查 view_type 列是否已存在
    console.log('1. 检查 view_type 列...');
    const [columns] = await connection.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'asset_reference_images' 
       AND COLUMN_NAME = 'view_type'`
    );

    if (columns.length === 0) {
      // 添加 view_type 列
      console.log('2. 添加 view_type 列...');
      await connection.execute(`
        ALTER TABLE asset_reference_images 
        ADD COLUMN view_type ENUM('front', 'side', 'back', 'other') DEFAULT 'other' 
        COMMENT '视角类型：front=正面、side=侧面、back=背面、other=其他参考' 
        AFTER description
      `);
      console.log('    ✓ 添加 view_type 列成功');

      // 添加索引
      console.log('3. 添加 view_type 索引...');
      try {
        await connection.execute(`
          CREATE INDEX idx_view_type ON asset_reference_images (view_type)
        `);
        console.log('    ✓ 添加 view_type 索引成功');
      } catch (err) {
        if (err.code === 'ER_DUP_KEYNAME') {
          console.log('    - view_type 索引已存在，跳过');
        } else {
          throw err;
        }
      }
    } else {
      console.log('    - view_type 列已存在，跳过');
    }

    console.log('\n========================================');
    console.log('迁移完成!');
    console.log('========================================');
    console.log('\nasset_reference_images 表新增字段:');
    console.log('  - view_type: 视角类型 (front/side/back/other)');

  } catch (err) {
    console.error('\n迁移失败:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
