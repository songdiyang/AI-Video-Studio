/**
 * 运行迁移：20260426_character_scene_bindings.sql
 * + 为 characters 表增加当前装配字段（active_costume_state_id / active_expression_state_id）
 *
 * 用法：node backend/migrations/run_20260426_character_scene_bindings.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].c > 0;
}

async function addColumnIfNotExists(conn, table, column, definition) {
  const exists = await columnExists(conn, table, column);
  if (exists) {
    console.log(`  [skip] ${table}.${column} 已存在`);
    return;
  }
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`  [ok]   ${table}.${column} 已添加`);
}

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true,
  });

  try {
    console.log('[1/2] 执行 SQL 文件：20260426_character_scene_bindings.sql');
    const sqlPath = path.join(__dirname, '20260426_character_scene_bindings.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await conn.query(sql);
    console.log('  [ok] 5 个表创建/回填完成');

    console.log('[2/2] 为 characters 增加当前装配字段');
    await addColumnIfNotExists(
      conn,
      'characters',
      'active_costume_state_id',
      "INT NULL COMMENT '当前装配的服装状态ID（character_states.id）'"
    );
    await addColumnIfNotExists(
      conn,
      'characters',
      'active_expression_state_id',
      "INT NULL COMMENT '当前装配的表情/姿态状态ID（character_states.id）'"
    );

    console.log('\n✅ 迁移完成');
  } catch (e) {
    console.error('❌ 迁移失败:', e.message);
    console.error(e.stack);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

run();
