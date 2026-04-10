const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    await connection.execute("ALTER TABLE ai_model_configs ADD COLUMN supported_resolutions TEXT");
    console.log('OK: supported_resolutions column added successfully');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('SKIP: supported_resolutions column already exists');
    } else {
      throw e;
    }
  } finally {
    await connection.end();
  }
}

run().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
