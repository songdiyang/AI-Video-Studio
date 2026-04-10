/**
 * 摄像机与打光参数迁移运行脚本
 */
const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const CAMERA_LIGHTING_FIELDS = [
  { name: 'focal_length', type: "VARCHAR(32) DEFAULT NULL", comment: '焦距类型' },
  { name: 'focal_length_mm', type: 'SMALLINT DEFAULT NULL', comment: '具体焦距mm值' },
  { name: 'camera_distance', type: "VARCHAR(32) DEFAULT NULL", comment: '摄像机距离' },
  { name: 'lighting_direction', type: "VARCHAR(32) DEFAULT NULL", comment: '光线方向' },
  { name: 'lighting_quality', type: "VARCHAR(32) DEFAULT NULL", comment: '光线质量' },
  { name: 'lighting_color', type: "VARCHAR(32) DEFAULT NULL", comment: '光线色温' },
  { name: 'lighting_intensity', type: "VARCHAR(32) DEFAULT NULL", comment: '光线对比度' },
  { name: 'lighting_source', type: "VARCHAR(32) DEFAULT NULL", comment: '光源类型' },
];

// 旧字段到新字段的迁移映射
const LENS_TYPE_MIGRATION = [
  { lens_type: 'wide', focal_length: 'wide', focal_length_mm: 28 },
  { lens_type: 'standard', focal_length: 'standard', focal_length_mm: 50 },
  { lens_type: 'telephoto', focal_length: 'telephoto', focal_length_mm: 200 },
  { lens_type: 'macro', focal_length: 'macro', focal_length_mm: 100 },
  { lens_type: 'fisheye', focal_length: 'ultra_wide', focal_length_mm: 18 },
];

const LIGHTING_MOOD_MIGRATION = [
  { lighting_mood: 'high_key', lighting_intensity: 'high_key' },
  { lighting_mood: 'low_key', lighting_intensity: 'low_key' },
  { lighting_mood: 'chiaroscuro', lighting_intensity: 'high_contrast' },
  { lighting_mood: 'silhouette', lighting_intensity: 'silhouette' },
  { lighting_mood: 'backlit', lighting_intensity: 'low_key' },
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
    console.log('摄像机与打光参数迁移');
    console.log('========================================\n');

    // Step 1: 添加新字段
    for (const field of CAMERA_LIGHTING_FIELDS) {
      console.log(`添加 storyboards.${field.name} 字段...`);
      try {
        await connection.execute(
          `ALTER TABLE storyboards ADD COLUMN ${field.name} ${field.type} COMMENT '${field.comment}'`
        );
        console.log(`  OK: ${field.name}`);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log(`  SKIP: ${field.name} 已存在`);
        } else {
          throw err;
        }
      }
    }

    // Step 2: 迁移旧 lens_type 数据
    console.log('\n迁移旧 lens_type 数据到 focal_length...');
    for (const m of LENS_TYPE_MIGRATION) {
      const [result] = await connection.execute(
        `UPDATE storyboards SET focal_length = ?, focal_length_mm = ? WHERE lens_type = ? AND focal_length IS NULL`,
        [m.focal_length, m.focal_length_mm, m.lens_type]
      );
      console.log(`  lens_type=${m.lens_type} -> focal_length=${m.focal_length} (${result.affectedRows} rows)`);
    }

    // Step 3: 迁移旧 lighting_mood 数据
    console.log('\n迁移旧 lighting_mood 数据到 lighting_intensity...');
    for (const m of LIGHTING_MOOD_MIGRATION) {
      const [result] = await connection.execute(
        `UPDATE storyboards SET lighting_intensity = ? WHERE lighting_mood = ? AND lighting_intensity IS NULL`,
        [m.lighting_intensity, m.lighting_mood]
      );
      console.log(`  lighting_mood=${m.lighting_mood} -> lighting_intensity=${m.lighting_intensity} (${result.affectedRows} rows)`);
    }

    console.log('\n========================================');
    console.log('摄像机与打光参数迁移完成!');
    console.log('========================================');
  } catch (err) {
    console.error('\n迁移失败:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
