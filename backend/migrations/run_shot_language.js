/**
 * 镜头语言参数迁移运行脚本
 */
const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const SHOT_LANGUAGE_FIELDS = [
  { name: 'sketch_url', type: 'TEXT DEFAULT NULL', comment: '草图URL' },
  { name: 'sketch_type', type: "VARCHAR(32) DEFAULT NULL", comment: '草图类型' },
  { name: 'sketch_data', type: 'JSON DEFAULT NULL', comment: '草图数据' },
  { name: 'control_strength', type: "DECIMAL(3,2) DEFAULT 0.85", comment: 'ControlNet控制强度' },
  { name: 'is_locked', type: 'BOOLEAN DEFAULT FALSE', comment: '是否锁定' },
  { name: 'locked_at', type: 'DATETIME DEFAULT NULL', comment: '锁定时间' },
  { name: 'locked_by', type: 'VARCHAR(255) DEFAULT NULL', comment: '锁定者' },
  { name: 'shot_size', type: 'VARCHAR(32) DEFAULT NULL', comment: '景别' },
  { name: 'camera_height', type: 'VARCHAR(32) DEFAULT NULL', comment: '机位高度' },
  { name: 'camera_movement', type: 'VARCHAR(64) DEFAULT NULL', comment: '镜头运动' },
  { name: 'lens_type', type: 'VARCHAR(32) DEFAULT NULL', comment: '镜头类型' },
  { name: 'focus_point', type: 'VARCHAR(255) DEFAULT NULL', comment: '焦点位置' },
  { name: 'depth_of_field', type: 'VARCHAR(32) DEFAULT NULL', comment: '景深' },
  { name: 'lighting_mood', type: 'VARCHAR(64) DEFAULT NULL', comment: '光影氛围' },
  { name: 'composition_rule', type: 'VARCHAR(64) DEFAULT NULL', comment: '构图法则' },
  { name: 'axis_position', type: 'VARCHAR(32) DEFAULT NULL', comment: '轴线位置' },
  { name: 'screen_direction', type: 'VARCHAR(32) DEFAULT NULL', comment: '屏幕方向' },
  { name: 'shot_duration', type: 'DECIMAL(5,2) DEFAULT NULL', comment: '镜头时长' },
  { name: 'transition_type', type: 'VARCHAR(32) DEFAULT NULL', comment: '转场类型' },
];

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
    console.log('镜头语言参数迁移');
    console.log('========================================\n');

    for (const field of SHOT_LANGUAGE_FIELDS) {
      console.log(`添加 storyboards.${field.name} 字段...`);
      try {
        await connection.execute(
          `ALTER TABLE storyboards ADD COLUMN ${field.name} ${field.type} COMMENT '${field.comment}'`
        );
        console.log(`  ✓ 成功添加 ${field.name}`);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log(`  - ${field.name} 已存在，跳过`);
        } else {
          throw err;
        }
      }
    }

    console.log('\n========================================');
    console.log('镜头语言参数迁移完成!');
    console.log('========================================');
  } catch (err) {
    console.error('\n迁移失败:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
