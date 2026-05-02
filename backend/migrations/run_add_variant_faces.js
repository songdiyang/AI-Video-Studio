/**
 * 迁移：environment_variants 表添加 faces JSON 列
 * 存储8方位场景图 URL：前/右/后/左/右前/左前/天顶/地面
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function runMigration() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    console.log('[Migration] 开始: 添加 environment_variants.faces 列...');

    await conn.execute(`
      ALTER TABLE environment_variants
      ADD COLUMN faces JSON DEFAULT NULL
      COMMENT '8方位场景图URL：{front,right,back,left,right_front,left_front,top,bottom}'
    `);

    console.log('   ✓ environment_variants.faces 列添加成功');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('   - faces 列已存在，跳过');
    } else {
      throw err;
    }
  } finally {
    await conn.end();
  }
}

module.exports = runMigration;

if (require.main === module) {
  runMigration()
    .then(() => { console.log('[Migration] 完成'); process.exit(0); })
    .catch((err) => { console.error('[Migration] 失败:', err); process.exit(1); });
}
