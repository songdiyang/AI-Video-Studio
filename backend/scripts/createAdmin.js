/**
 * 创建或升级管理员账号脚本
 * 
 * 使用方法:
 *   node scripts/createAdmin.js <email> <password>
 * 
 * 示例:
 *   node scripts/createAdmin.js admin@nanostory.com admin123456
 * 
 * 功能:
 *   - 如果账号已存在，会升级为管理员并更新密码
 *   - 如果账号不存在，会创建新的管理员账号
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'nanostory',
};

async function createAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('\n📋 使用方法: node scripts/createAdmin.js <email> <password>\n');
    console.log('示例: node scripts/createAdmin.js admin@nanostory.com admin123456\n');
    process.exit(1);
  }

  const [email, password] = args;

  // 验证邮箱格式
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error('\n❌ 错误: 邮箱格式不正确\n');
    process.exit(1);
  }

  // 验证密码长度
  if (password.length < 6) {
    console.error('\n❌ 错误: 密码至少需要6个字符\n');
    process.exit(1);
  }

  let connection;
  
  try {
    console.log('\n🔗 连接数据库...');
    connection = await mysql.createConnection(dbConfig);
    
    // 检查用户是否存在
    const [existingUsers] = await connection.execute(
      'SELECT id, email, role FROM users WHERE email = ?',
      [email]
    );

    const passwordHash = await bcrypt.hash(password, 10);

    if (existingUsers.length > 0) {
      // 用户已存在，升级为管理员
      const user = existingUsers[0];
      await connection.execute(
        'UPDATE users SET role = ?, password_hash = ?, updated_at = NOW() WHERE id = ?',
        ['admin', passwordHash, user.id]
      );
      
      console.log(`\n✅ 管理员账号已更新!`);
      console.log(`   📧 邮箱: ${email}`);
      console.log(`   🔑 密码: ${password}`);
      console.log(`   👑 角色: admin (原角色: ${user.role})`);
    } else {
      // 创建新用户
      const [result] = await connection.execute(
        'INSERT INTO users (email, password_hash, role, balance, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
        [email, passwordHash, 'admin', 0]
      );
      
      console.log(`\n✅ 管理员账号创建成功!`);
      console.log(`   📧 邮箱: ${email}`);
      console.log(`   🔑 密码: ${password}`);
      console.log(`   👑 角色: admin`);
      console.log(`   🆔 用户ID: ${result.insertId}`);
    }

    console.log(`\n📝 登录后台信息:`);
    console.log(`   🌐 地址: /admin/login`);
    console.log(`   🔐 访问密钥: ${process.env.ADMIN_ACCESS_KEY || '(未配置，请在.env中设置ADMIN_ACCESS_KEY)'}`);
    console.log('');

  } catch (error) {
    console.error('\n❌ 操作失败:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

createAdmin();
