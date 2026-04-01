/**
 * 积分系统数据库迁移脚本
 * 
 * 执行：node migrations/add_points_system.js
 */

require('dotenv').config();
const db = require('../src/db');

async function migrate() {
  console.log('开始积分系统迁移...\n');
  
  try {
    await db.initializeDatabase();
    const pool = db.getPool();
    
    // 1. 添加服务费率配置
    console.log('1. 添加服务费率配置...');
    const [existing] = await pool.query(
      "SELECT id FROM system_configs WHERE config_key = 'service_fee_rate'"
    );
    
    if (existing.length === 0) {
      await pool.query(`
        INSERT INTO system_configs (config_key, config_name, config_type, config_value, description, is_active)
        VALUES ('service_fee_rate', '服务费率', 'number', '0.5', 'AI消耗服务费率，0.5表示50%。积分 = 成本 × (1 + 服务费率) / 0.02', 1)
      `);
      console.log('   ✓ 已添加 service_fee_rate 配置，默认值 0.5 (50%)');
    } else {
      console.log('   - service_fee_rate 配置已存在，跳过');
    }
    
    // 2. 添加积分单价配置（只读，用于前端展示）
    console.log('2. 添加积分单价配置...');
    const [pointValue] = await pool.query(
      "SELECT id FROM system_configs WHERE config_key = 'point_value_cny'"
    );
    
    if (pointValue.length === 0) {
      await pool.query(`
        INSERT INTO system_configs (config_key, config_name, config_type, config_value, description, is_active)
        VALUES ('point_value_cny', '积分单价(元)', 'number', '0.02', '1积分对应的人民币金额，固定值', 1)
      `);
      console.log('   ✓ 已添加 point_value_cny 配置，默认值 0.02 (1积分=¥0.02)');
    } else {
      console.log('   - point_value_cny 配置已存在，跳过');
    }
    
    // 3. 为 billing_records 添加积分字段
    console.log('3. 检查 billing_records 表积分字段...');
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_records' AND COLUMN_NAME = 'points_cost'
    `);
    
    if (columns.length === 0) {
      await pool.query(`
        ALTER TABLE billing_records 
        ADD COLUMN points_cost INT DEFAULT 0 COMMENT '消耗积分数' AFTER amount
      `);
      console.log('   ✓ 已添加 points_cost 字段');
    } else {
      console.log('   - points_cost 字段已存在，跳过');
    }
    
    // 4. 检查 users.balance 字段注释（标记为积分）
    console.log('4. 更新 users.balance 字段注释...');
    try {
      await pool.query(`
        ALTER TABLE users MODIFY COLUMN balance DECIMAL(12, 2) DEFAULT 0 COMMENT '积分余额'
      `);
      console.log('   ✓ 已更新 balance 字段注释为"积分余额"');
    } catch (err) {
      console.log('   - balance 字段更新跳过:', err.message);
    }
    
    // 5. 将现有用户余额转换为积分（余额×50，假设原来是元）
    console.log('5. 检查是否需要转换现有余额为积分...');
    const [usersWithBalance] = await pool.query(`
      SELECT id, balance FROM users WHERE balance > 0 AND balance < 1000
    `);
    
    if (usersWithBalance.length > 0) {
      console.log(`   发现 ${usersWithBalance.length} 个用户有小额余额，可能需要转换为积分`);
      console.log('   提示：如果原来余额单位是"元"，需手动执行：');
      console.log('   UPDATE users SET balance = balance * 50 WHERE balance > 0;');
      console.log('   (1元 = 50积分)');
    } else {
      console.log('   - 无需转换');
    }
    
    console.log('\n迁移完成！ (≧∇≦)');
    console.log('\n当前积分计费规则：');
    console.log('  - 1 积分 = ¥0.02');
    console.log('  - 服务费率 = 50%');
    console.log('  - 积分 = ceil(成本 × 1.5 / 0.02)');
    console.log('\n后台可在 system_configs 中调整 service_fee_rate 值');
    
    await db.closeDatabase();
    process.exit(0);
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  }
}

migrate();
