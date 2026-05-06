require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true
  });

  const fixAndRun = async (file) => {
    const sql = fs.readFileSync(path.join('./migrations', file), 'utf8');
    const lines = sql.split(';');
    for (let stmt of lines) {
      stmt = stmt.trim();
      if (!stmt) continue;
      const match = stmt.match(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+IF NOT EXISTS\s+(\w+)\s+(.+)/i);
      if (match) {
        const [, table, col, def] = match;
        const [rows] = await conn.query(
          'SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
          [table, col]
        );
        if (rows[0].cnt === 0) {
          await conn.query('ALTER TABLE ' + table + ' ADD COLUMN ' + col + ' ' + def);
          console.log('  + ' + table + '.' + col);
        } else {
          console.log('  = ' + table + '.' + col + ' (已存在)');
        }
      } else if (stmt.includes('DELIMITER')) {
        console.log('  ! 跳过复杂SQL (含DELIMITER)');
      } else {
        try {
          await conn.query(stmt);
        } catch(e) {
          if (!e.message.includes('Duplicate') && !e.message.includes('already') && !e.message.includes("doesn't exist")) {
            throw e;
          }
        }
      }
    }
  };

  const fixFiles = [
    'add_advanced_camera_params.sql',
    'add_camera_lighting_params.sql',
    'add_costumes.sql',
    'add_first_subscription_discount.sql',
    'add_performance_indexes.sql',
    'add_reference_image_enabled.sql',
    'add_shot_language.sql',
    'add_sketch_history.sql',
    'add_state_category_tags.sql',
    'add_tag_groups.sql',
    'add_task_assignments.sql',
    'add_workflow_version.sql',
    'enhance_character_states.sql'
  ];

  for (const file of fixFiles) {
    try {
      console.log('修复 ' + file + '...');
      await fixAndRun(file);
      console.log('OK ' + file);
    } catch (e) {
      console.error('FAIL ' + file + ' - ' + e.message.split('\n')[0]);
    }
  }

  await conn.end();
})();
