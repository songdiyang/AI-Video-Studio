/**
 * 迁移脚本：添加新用户首次订阅优惠价格字段
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nanostory',
    charset: 'utf8mb4'
  });

  console.log('[Migration] 连接数据库成功');

  try {
    // 检查并添加 first_month_price 字段
    const [monthCols] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'subscription_plans' AND COLUMN_NAME = 'first_month_price'
    `, [process.env.DB_NAME || 'nanostory']);

    if (monthCols.length === 0) {
      await connection.query(`
        ALTER TABLE subscription_plans
        ADD COLUMN first_month_price DECIMAL(10,2) DEFAULT NULL
        COMMENT '新用户首月优惠价格（月付），NULL 表示无优惠'
      `);
      console.log('[Migration] 已添加 first_month_price 字段');
    } else {
      console.log('[Migration] first_month_price 字段已存在，跳过');
    }

    // 检查并添加 first_year_price 字段
    const [yearCols] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'subscription_plans' AND COLUMN_NAME = 'first_year_price'
    `, [process.env.DB_NAME || 'nanostory']);

    if (yearCols.length === 0) {
      await connection.query(`
        ALTER TABLE subscription_plans
        ADD COLUMN first_year_price DECIMAL(10,2) DEFAULT NULL
        COMMENT '新用户首年优惠价格（年付），NULL 表示无优惠'
      `);
      console.log('[Migration] 已添加 first_year_price 字段');
    } else {
      console.log('[Migration] first_year_price 字段已存在，跳过');
    }

    console.log('[Migration] 迁移完成!');
  } catch (error) {
    console.error('[Migration] 执行失败:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

runMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
