/**
 * 迁移脚本: 创建 speaker_voices 音色管理表
 *
 * 支持:
 * - 用户自定义音色（通过声音复刻创建）
 * - 系统预设音色
 * - 音色与角色的绑定关系
 * - 火山引擎 speaker_id 同步
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
    console.log('执行迁移: 创建 speaker_voices 音色管理表');
    console.log('========================================\n');

    // 1. 创建 speaker_voices 表
    console.log('1. 创建 speaker_voices 表...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS speaker_voices (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL COMMENT '所属用户ID',
        project_id INT DEFAULT NULL COMMENT '关联项目ID（可选）',
        character_id INT DEFAULT NULL COMMENT '绑定角色ID（可选）',

        -- 音色基本信息
        name VARCHAR(128) NOT NULL COMMENT '音色名称（用户自定义）',
        description VARCHAR(512) DEFAULT NULL COMMENT '音色描述',
        gender VARCHAR(16) DEFAULT 'neutral' COMMENT '性别: male/female/neutral',
        age_group VARCHAR(16) DEFAULT 'adult' COMMENT '年龄段: child/teen/young/middle/elder',
        language VARCHAR(16) DEFAULT 'zh-CN' COMMENT '语言',

        -- 火山引擎音色ID（声音复刻后返回）
        speaker_id VARCHAR(128) DEFAULT NULL COMMENT '火山引擎音色ID（voice_id / speaker_id）',
        provider VARCHAR(64) DEFAULT 'volcengine' COMMENT '音色来源平台',
        provider_model_id VARCHAR(128) DEFAULT NULL COMMENT '使用的模型ID（如 seed-tts-2.0）',

        -- 音色来源
        source_type ENUM('preset', 'clone', 'design') DEFAULT 'clone' COMMENT '来源: preset预设/clone复刻/design设计',
        source_audio_url VARCHAR(1024) DEFAULT NULL COMMENT '原始复刻音频URL',
        source_text TEXT DEFAULT NULL COMMENT '音色设计文本描述（用于音色设计API）',

        -- 状态
        status ENUM('training', 'ready', 'failed', 'disabled') DEFAULT 'training' COMMENT '状态: training训练中/ready可用/failed失败/disabled停用',
        status_message VARCHAR(512) DEFAULT NULL COMMENT '状态说明（如失败原因）',

        -- 音色参数（复刻/设计时的参数）
        voice_params JSON DEFAULT NULL COMMENT '音色参数: {pitch, speed, volume, style, emotion}',

        -- 元数据
        metadata JSON DEFAULT NULL COMMENT '扩展元数据（如火山引擎返回的完整信息）',

        -- 使用统计
        use_count INT DEFAULT 0 COMMENT '使用次数',
        last_used_at TIMESTAMP NULL DEFAULT NULL COMMENT '最后使用时间',

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        -- 索引
        INDEX idx_user_id (user_id),
        INDEX idx_project_id (project_id),
        INDEX idx_character_id (character_id),
        INDEX idx_speaker_id (speaker_id),
        INDEX idx_status (status),
        INDEX idx_source_type (source_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='用户音色管理表（支持声音复刻、音色设计）'
    `);
    console.log('   ✓ speaker_voices 表创建成功');

    // 2. 为 characters 表添加 speaker_voice_id 字段（可选绑定）
    console.log('\n2. 添加 characters.speaker_voice_id 字段...');
    try {
      await connection.execute(`
        ALTER TABLE characters
        ADD COLUMN speaker_voice_id INT DEFAULT NULL COMMENT '绑定的自定义音色ID'
      `);
      console.log('   ✓ 成功添加 speaker_voice_id 字段');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('   - speaker_voice_id 字段已存在，跳过');
      } else {
        throw err;
      }
    }

    // 3. 为 character_states 表添加 speaker_voice_id 字段
    console.log('\n3. 添加 character_states.speaker_voice_id 字段...');
    try {
      await connection.execute(`
        ALTER TABLE character_states
        ADD COLUMN speaker_voice_id INT DEFAULT NULL COMMENT '该状态下使用的自定义音色ID（覆盖角色默认）'
      `);
      console.log('   ✓ 成功添加 speaker_voice_id 字段');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('   - speaker_voice_id 字段已存在，跳过');
      } else {
        throw err;
      }
    }

    console.log('\n========================================');
    console.log('迁移完成!');
    console.log('========================================');

  } catch (err) {
    console.error('\n迁移失败:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
