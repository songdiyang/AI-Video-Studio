/**
 * 迁移脚本：导演学高级参数增强
 * 为 storyboards 表添加 montage_type 和 pov_character 字段
 */

const { execute } = require('../src/db');

async function run() {
  console.log('=== 开始迁移：add_advanced_camera_params ===');

  const fields = [
    { name: 'montage_type', type: "VARCHAR(32) DEFAULT NULL", comment: '蒙太奇类型' },
    { name: 'pov_character', type: "VARCHAR(128) DEFAULT NULL", comment: '主观视角角色名' },
  ];

  for (const field of fields) {
    try {
      await execute(`ALTER TABLE storyboards ADD COLUMN ${field.name} ${field.type} COMMENT '${field.comment}'`);
      console.log(`  ✓ 添加字段 ${field.name}`);
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log(`  - 字段 ${field.name} 已存在，跳过`);
      } else {
        throw err;
      }
    }
  }

  console.log('=== 迁移完成 ===');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('迁移失败:', err);
    process.exit(1);
  });
