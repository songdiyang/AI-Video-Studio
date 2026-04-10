/**
 * 运行积分单价调整迁移脚本
 * 积分单价从 ¥0.02 调整为 ¥0.01（1积分=1分钱）
 * 
 * 执行：node migrations/run_update_point_value.js
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    console.log('开始执行积分单价调整迁移...\n');

    // 1. 更新积分单价配置
    console.log('1. 更新积分单价配置 (0.02 → 0.01)...');
    const [configResult] = await connection.execute(`
      UPDATE system_configs 
      SET config_value = '0.01',
          description = '1积分对应的人民币金额(元)，1积分=¥0.01=1分钱'
      WHERE config_key = 'point_value_cny' 
      AND is_active = 1
    `);
    console.log(`   ✓ 更新了 ${configResult.affectedRows} 条配置记录`);

    // 2. 订阅套餐积分翻倍（单价减半，积分翻倍保持同等价值）
    console.log('2. 订阅套餐积分翻倍...');
    const [plansBefore] = await connection.execute(
      'SELECT id, name, monthly_points FROM subscription_plans WHERE is_active = 1'
    );
    console.log('   调整前:');
    plansBefore.forEach(p => console.log(`     ${p.name}: ${p.monthly_points} 积分`));

    const [plansResult] = await connection.execute(`
      UPDATE subscription_plans 
      SET monthly_points = monthly_points * 2
      WHERE is_active = 1
    `);
    console.log(`   ✓ 更新了 ${plansResult.affectedRows} 个套餐`);

    const [plansAfter] = await connection.execute(
      'SELECT id, name, monthly_points FROM subscription_plans WHERE is_active = 1'
    );
    console.log('   调整后:');
    plansAfter.forEach(p => console.log(`     ${p.name}: ${p.monthly_points} 积分`));

    // 3. 验证配置
    console.log('\n3. 验证配置...');
    const [configCheck] = await connection.execute(
      "SELECT config_key, config_value FROM system_configs WHERE config_key = 'point_value_cny'"
    );
    if (configCheck.length > 0) {
      console.log(`   ✓ point_value_cny = ${configCheck[0].config_value}`);
    }

    console.log('\n迁移完成！ (≧∇≦)');
    console.log('积分单价已从 ¥0.02 调整为 ¥0.01（1积分=1分钱）');
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
