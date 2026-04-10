/**
 * 迁移脚本: 添加角色声音配置字段
 * 
 * 为 characters 表添加 voice_config 字段，支持为每个角色配置特定的声音类型
 */
const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    console.log('========================================');
    console.log('执行迁移: 添加角色声音配置字段');
    console.log('========================================\n');

    // 1. 为 characters 表添加 voice_config 字段
    console.log('1. 添加 characters.voice_config 字段...');
    try {
      await connection.execute(`
        ALTER TABLE characters 
        ADD COLUMN voice_config JSON DEFAULT NULL 
        COMMENT '角色声音配置（JSON格式：包含音色、语调、语速、音量等参数）'
      `);
      console.log('    ✓ 成功添加 voice_config 字段');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('    - voice_config 字段已存在，跳过');
      } else {
        throw err;
      }
    }

    // 2. 为 character_states 表也添加 voice_config 字段（不同状态可能有不同声音）
    console.log('\n2. 添加 character_states.voice_config 字段...');
    try {
      await connection.execute(`
        ALTER TABLE character_states 
        ADD COLUMN voice_config JSON DEFAULT NULL 
        COMMENT '该状态下的声音配置（覆盖角色默认配置）'
      `);
      console.log('    ✓ 成功添加 voice_config 字段');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('    - voice_config 字段已存在，跳过');
      } else {
        throw err;
      }
    }

    console.log('\n========================================');
    console.log('迁移完成!');
    console.log('========================================');
    console.log('\n声音配置 JSON 结构示例:');
    console.log(JSON.stringify({
      voiceId: 'zh-CN-XiaoxiaoNeural',
      voiceName: '晓晓',
      gender: 'female',
      age: 'young',
      pitch: 0,
      speed: 1.0,
      volume: 1.0,
      style: 'cheerful',
      emotion: 'neutral',
      description: '年轻女性，活泼开朗的声音'
    }, null, 2));
  } catch (err) {
    console.error('\n迁移失败:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
