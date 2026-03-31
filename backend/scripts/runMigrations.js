const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  let connection;
  
  try {
    // 读取 .env 文件
    const envPath = path.join(__dirname, '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    
    // 解析环境变量
    const env = {};
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        env[key.trim()] = value.trim();
      }
    });
    
    // 连接数据库
    connection = await mysql.createConnection({
      host: env.MYSQL_HOST || 'localhost',
      port: env.MYSQL_PORT || 3306,
      user: env.MYSQL_USER || 'root',
      password: env.MYSQL_PASSWORD || '',
      database: env.MYSQL_DATABASE || 'nanostory'
    });
    
    console.log('已连接到数据库');
    
    // 读取迁移文件
    const migrationPath = path.join(__dirname, '..', 'migrations', 'add_project_invite.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    // 执行迁移
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        await connection.query(statement);
        console.log('✓ 执行成功');
      }
    }
    
    console.log('\n✅ 迁移完成！');
    console.log('已创建以下表：');
    console.log('  - project_invites (项目邀请表)');
    console.log('  - team_project_join_requests (团队项目加入申请表)');
    console.log('  - team_project_members (团队项目成员表)');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigration();
