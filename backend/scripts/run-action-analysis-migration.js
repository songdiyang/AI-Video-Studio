#!/usr/bin/env node
/**
 * 执行动作分析字段迁移
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('开始执行动作分析字段迁移...');
  
  // 读取 .env 文件获取数据库配置
  const envPath = path.join(__dirname, '../.env');
  const envContent = fs.readFileSync(envPath, 'utf-8');
  
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nanostory'
  };
  
  // 从 .env 解析配置
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      const trimmedKey = key.trim();
      const trimmedValue = value.trim().replace(/^["']|["']$/g, '');
      if (trimmedKey === 'DB_HOST') dbConfig.host = trimmedValue;
      if (trimmedKey === 'DB_USER') dbConfig.user = trimmedValue;
      if (trimmedKey === 'DB_PASSWORD') dbConfig.password = trimmedValue;
      if (trimmedKey === 'DB_NAME') dbConfig.database = trimmedValue;
    }
  });
  
  console.log('数据库配置:', { ...dbConfig, password: '***' });
  
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('数据库连接成功');
    
    // 读取 SQL 文件
    const sqlPath = path.join(__dirname, '../migrations/add_action_analysis_fields.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
    
    // 分割 SQL 语句（按分号分割）
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`找到 ${statements.length} 条 SQL 语句`);
    
    // 逐条执行
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`执行 ${i + 1}/${statements.length}: ${statement.substring(0, 80)}...`);
      
      try {
        await connection.query(statement);
        console.log(`✓ 成功`);
      } catch (err) {
        // 忽略已存在的字段/索引错误
        if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEY') {
          console.log(`ℹ 已存在，跳过`);
        } else {
          console.error(`✗ 失败:`, err.message);
          throw err;
        }
      }
    }
    
    console.log('\n✅ 迁移完成！');
  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('数据库连接已关闭');
    }
  }
}

runMigration();
