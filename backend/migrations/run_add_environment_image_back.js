/**
 * run_add_environment_image_back.js
 * 执行环境背面图字段迁移。
 *
 * 用法：node backend/migrations/run_add_environment_image_back.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function runMigration() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  try {
    console.log('[Migration] 添加 environments.image_back_url 字段...');

    const [cols] = await conn.execute(
      `SHOW COLUMNS FROM environments LIKE 'image_back_url'`
    );
    if (cols.length > 0) {
      console.log('[Migration] image_back_url 字段已存在，跳过');
      return;
    }

    await conn.execute(`
      ALTER TABLE environments
      ADD COLUMN image_back_url VARCHAR(500) DEFAULT NULL
      COMMENT '环境背面图 URL（180° 反向视角），用于维持画风一致性'
    `);

    console.log('[Migration] image_back_url 字段添加成功');
  } catch (err) {
    console.error('[Migration] 添加 image_back_url 字段失败:', err.message);
    throw err;
  } finally {
    await conn.end();
  }
}

module.exports = runMigration;

if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('[Migration] 环境背面图字段迁移完成');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration] 失败:', err);
      process.exit(1);
    });
}
