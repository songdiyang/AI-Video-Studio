/**
 * 运行扩展市场表迁移
 * 执行 20260507_extension_tables.sql 和 20260507_seed_japanese_extension.sql
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'nanostory',
    multipleStatements: true
  });

  try {
    console.log('========================================');
    console.log('扩展市场表迁移');
    console.log('========================================\n');

    // 1. 执行扩展表结构迁移
    console.log('1. 执行扩展表结构迁移...');
    const tablesSqlPath = path.join(__dirname, '20260507_extension_tables.sql');
    const tablesSql = fs.readFileSync(tablesSqlPath, 'utf8');
    
    // 分割 SQL 语句（按分号分割）
    const tableStatements = tablesSql
      .split(/;[\r\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    console.log(`   找到 ${tableStatements.length} 条表结构 SQL 语句`);
    
    for (let i = 0; i < tableStatements.length; i++) {
      const statement = tableStatements[i];
      try {
        await connection.query(statement);
        console.log(`   ✓ 语句 ${i + 1} 执行成功`);
      } catch (err) {
        if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.message.includes('already exists')) {
          console.log(`   - 表已存在，跳过`);
        } else {
          throw err;
        }
      }
    }

    console.log('\n2. 执行日语扩展种子数据迁移...');
    const seedSqlPath = path.join(__dirname, '20260507_seed_japanese_extension.sql');
    const seedSql = fs.readFileSync(seedSqlPath, 'utf8');
    
    // 分割 SQL 语句
    const seedStatements = seedSql
      .split(/;[\r\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    console.log(`   找到 ${seedStatements.length} 条种子数据 SQL 语句`);
    
    for (let i = 0; i < seedStatements.length; i++) {
      const statement = seedStatements[i];
      try {
        const [result] = await connection.query(statement);
        if (result.affectedRows > 0) {
          console.log(`   ✓ 语句 ${i + 1} 执行成功，影响 ${result.affectedRows} 行`);
        } else {
          console.log(`   - 语句 ${i + 1} 执行成功，数据已存在（0 行影响）`);
        }
      } catch (err) {
        console.error(`   ✗ 语句 ${i + 1} 执行失败:`, err.message);
        throw err;
      }
    }

    console.log('\n========================================');
    console.log('迁移完成！');
    console.log('========================================');
    console.log('\n已创建的表:');
    console.log('  - extensions (扩展市场主表)');
    console.log('  - extension_versions (扩展版本历史)');
    console.log('  - user_extensions (用户已安装扩展)');
    console.log('\n已初始化的数据:');
    console.log('  - japanese-language-pack (日语语言包扩展)');
    
  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
