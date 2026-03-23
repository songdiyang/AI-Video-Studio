/**
 * 项目类型扩展迁移执行脚本
 * 执行 add_project_type_expansion.sql 中的迁移
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function runMigration() {
  console.log('========================================');
  console.log('项目类型扩展迁移');
  console.log('========================================\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nanostory',
    multipleStatements: true, // 允许执行多条SQL语句
  });

  try {
    console.log('数据库连接成功\n');

    // 读取SQL迁移脚本
    const sqlPath = path.join(__dirname, 'add_project_type_expansion.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // 分割SQL语句（按分号分割，但要处理注释）
    const statements = sqlContent
      .split(/;[\r\n]+/)
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--'));

    console.log(`准备执行 ${statements.length} 条SQL语句\n`);

    // 开始事务
    await connection.beginTransaction();

    let successCount = 0;
    let skipCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt || stmt.length < 5) continue;

      // 提取语句类型用于日志
      const stmtType = stmt.split(/\s+/)[0].toUpperCase();
      const briefDesc = stmt.substring(0, 60).replace(/\n/g, ' ') + '...';

      try {
        console.log(`[${i + 1}/${statements.length}] 执行: ${stmtType} - ${briefDesc}`);
        await connection.execute(stmt);
        successCount++;
        console.log(`    ✓ 成功\n`);
      } catch (error) {
        // 处理一些可以忽略的错误
        if (error.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`    ⚠ 表已存在，跳过\n`);
          skipCount++;
        } else if (error.code === 'ER_DUP_KEYNAME') {
          console.log(`    ⚠ 索引已存在，跳过\n`);
          skipCount++;
        } else if (error.code === 'ER_DUP_ENTRY') {
          console.log(`    ⚠ 数据已存在，跳过\n`);
          skipCount++;
        } else {
          console.error(`    ✗ 失败: ${error.message}\n`);
          throw error;
        }
      }
    }

    // 提交事务
    await connection.commit();

    console.log('========================================');
    console.log('迁移完成！');
    console.log(`成功: ${successCount} 条`);
    console.log(`跳过: ${skipCount} 条`);
    console.log('========================================\n');

    // 验证迁移结果
    console.log('验证迁移结果...\n');

    // 检查项目类型配置
    const [typeConfigs] = await connection.execute(
      'SELECT type_code, type_name FROM project_type_configs WHERE is_active = TRUE ORDER BY sort_order'
    );
    console.log('已配置的项目类型:');
    typeConfigs.forEach(config => {
      console.log(`  - ${config.type_code}: ${config.type_name}`);
    });

    // 检查现有项目的类型分布
    const [projectStats] = await connection.execute(
      'SELECT type, COUNT(*) as count FROM projects GROUP BY type'
    );
    console.log('\n现有项目类型分布:');
    if (projectStats.length === 0) {
      console.log('  (暂无项目)');
    } else {
      projectStats.forEach(stat => {
        console.log(`  - ${stat.type}: ${stat.count} 个项目`);
      });
    }

    // 检查新表是否创建成功
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME IN ('project_type_configs', 'novel_chapters', 'novel_outlines', 'manga_pages', 'video_effects')`,
      [process.env.DB_NAME || 'nanostory']
    );
    console.log('\n新创建的表:');
    tables.forEach(table => {
      console.log(`  - ${table.TABLE_NAME}`);
    });

    console.log('\n迁移验证完成！');

  } catch (error) {
    // 回滚事务
    await connection.rollback();
    console.error('迁移失败，已回滚:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
    console.log('\n数据库连接已关闭');
  }
}

// 执行迁移
runMigration().catch(console.error);
