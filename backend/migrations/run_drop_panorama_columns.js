/**
 * 迁移：移除全景图字段（环境全景 + 场景全景系统整体下线）
 * 影响表：
 *   - environments.panorama_image_url
 *   - environment_variants.panorama_image_url
 *   - scenes.panorama_image_url
 * 幂等：列不存在时跳过
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const TARGETS = [
  { table: 'environments', column: 'panorama_image_url' },
  { table: 'environment_variants', column: 'panorama_image_url' },
  { table: 'scenes', column: 'panorama_image_url' },
];

async function runMigration() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  try {
    console.log('[Migration] 开始: 移除 panorama_image_url 字段...');

    for (const { table, column } of TARGETS) {
      const [rows] = await conn.execute(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [process.env.MYSQL_DATABASE, table, column]
      );

      if (rows.length === 0) {
        console.log(`   - ${table}.${column} 不存在，跳过`);
        continue;
      }

      await conn.execute(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
      console.log(`   ✓ ${table}.${column} 已删除`);
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
