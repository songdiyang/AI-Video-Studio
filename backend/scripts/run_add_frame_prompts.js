/**
 * 执行 add_frame_prompts.sql 迁移
 * 为 storyboards 表添加 first_frame_prompt / last_frame_prompt 字段
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function run() {
  let connection;
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const env = {};
    envContent.split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key) env[key] = value;
      }
    });

    connection = await mysql.createConnection({
      host: env.MYSQL_HOST || 'localhost',
      port: Number(env.MYSQL_PORT) || 3306,
      user: env.MYSQL_USER || 'root',
      password: env.MYSQL_PASSWORD || '',
      database: env.MYSQL_DATABASE || 'nanostory',
      multipleStatements: true
    });
    console.log('✓ 已连接数据库 %s@%s/%s', env.MYSQL_USER, env.MYSQL_HOST, env.MYSQL_DATABASE);

    const sqlPath = path.join(__dirname, '..', 'migrations', 'add_frame_prompts.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    await connection.query(sql);
    console.log('✅ 迁移完成：first_frame_prompt / last_frame_prompt 字段已就绪');
  } catch (err) {
    console.error('❌ 迁移失败:', err.message);
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
}

run();
