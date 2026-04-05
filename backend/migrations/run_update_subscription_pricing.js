/**
 * 迁移脚本：更新订阅套餐定价
 * 日期: 2026-04-06
 * 说明: 重命名套餐标识并更新所有价格和积分配额
 * 
 * 新套餐定价:
 *   免费版(free): ¥0/月, 200积分/月
 *   基础版(basic): ¥99/月(首月¥49.9), ¥990/年, 10,000积分/月
 *   专业版(pro): ¥299/月, ¥2,990/年, 30,000积分/月
 *   旗舰版(premium): ¥888/月, ¥8,880/年, 90,000积分/月
 *   企业版(enterprise): 定制方案（保持不变）
 */

const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nanostory'
  });

  console.log('========================================');
  console.log('开始执行: 更新订阅套餐定价');
  console.log('========================================\n');

  try {
    // 查看当前套餐
    const [currentPlans] = await connection.execute(
      'SELECT id, name, display_name, price_monthly, price_yearly, max_api_calls_monthly FROM subscription_plans ORDER BY sort_order ASC'
    );
    console.log('[当前套餐]:');
    currentPlans.forEach(p => {
      console.log(`  ${p.name}: ¥${p.price_monthly}/月, ¥${p.price_yearly}/年, ${p.max_api_calls_monthly}积分/月`);
    });
    console.log('');

    // 1. 更新/插入免费版
    console.log('[步骤 1/5] 更新免费版...');
    const [freeExists] = await connection.execute("SELECT id FROM subscription_plans WHERE name = 'free'");
    if (freeExists.length > 0) {
      await connection.execute(`
        UPDATE subscription_plans SET
          display_name = '免费版',
          price_monthly = 0.00, price_yearly = 0.00,
          first_month_price = NULL, first_year_price = NULL,
          max_projects = 3, max_api_calls_monthly = 200, max_team_members = 1,
          features_json = '["基础AI工具","3个项目","200积分/月","社区浏览"]',
          sort_order = 0
        WHERE name = 'free'
      `);
    } else {
      await connection.execute(`
        INSERT INTO subscription_plans (name, display_name, price_monthly, price_yearly, first_month_price, first_year_price, max_projects, max_api_calls_monthly, max_team_members, features_json, sort_order, is_active)
        VALUES ('free', '免费版', 0.00, 0.00, NULL, NULL, 3, 200, 1, '["基础AI工具","3个项目","200积分/月","社区浏览"]', 0, 1)
      `);
    }
    console.log('  ✓ 免费版已更新: ¥0/月, 200积分/月');

    // 2. 更新 starter → basic
    console.log('[步骤 2/5] 更新基础版 (starter → basic)...');
    const [starterExists] = await connection.execute("SELECT id FROM subscription_plans WHERE name = 'starter'");
    if (starterExists.length > 0) {
      await connection.execute(`
        UPDATE subscription_plans SET
          name = 'basic', display_name = '基础版',
          price_monthly = 99.00, price_yearly = 990.00,
          first_month_price = 49.90, first_year_price = NULL,
          max_projects = 20, max_api_calls_monthly = 10000, max_team_members = 5,
          features_json = '["完整工作流","20个项目","10,000积分/月","模板库访问","社区排行榜"]',
          sort_order = 1
        WHERE name = 'starter'
      `);
    } else {
      await connection.execute(`
        UPDATE subscription_plans SET
          display_name = '基础版',
          price_monthly = 99.00, price_yearly = 990.00,
          first_month_price = 49.90, first_year_price = NULL,
          max_projects = 20, max_api_calls_monthly = 10000, max_team_members = 5,
          features_json = '["完整工作流","20个项目","10,000积分/月","模板库访问","社区排行榜"]',
          sort_order = 1
        WHERE name = 'basic'
      `);
    }
    console.log('  ✓ 基础版已更新: ¥99/月(首月¥49.9), ¥990/年, 10,000积分/月');

    // 3. 更新 creator → pro
    console.log('[步骤 3/5] 更新专业版 (creator → pro)...');
    const [creatorExists] = await connection.execute("SELECT id FROM subscription_plans WHERE name = 'creator'");
    if (creatorExists.length > 0) {
      await connection.execute(`
        UPDATE subscription_plans SET
          name = 'pro', display_name = '专业版',
          price_monthly = 299.00, price_yearly = 2990.00,
          first_month_price = NULL, first_year_price = NULL,
          max_projects = -1, max_api_calls_monthly = 30000, max_team_members = 15,
          features_json = '["无限项目","30,000积分/月","团队协作","高级AI模型","优先支持"]',
          sort_order = 2
        WHERE name = 'creator'
      `);
    } else {
      await connection.execute(`
        UPDATE subscription_plans SET
          display_name = '专业版',
          price_monthly = 299.00, price_yearly = 2990.00,
          first_month_price = NULL, first_year_price = NULL,
          max_projects = -1, max_api_calls_monthly = 30000, max_team_members = 15,
          features_json = '["无限项目","30,000积分/月","团队协作","高级AI模型","优先支持"]',
          sort_order = 2
        WHERE name = 'pro'
      `);
    }
    console.log('  ✓ 专业版已更新: ¥299/月, ¥2,990/年, 30,000积分/月');

    // 4. 更新 studio → premium
    console.log('[步骤 4/5] 更新旗舰版 (studio → premium)...');
    const [studioExists] = await connection.execute("SELECT id FROM subscription_plans WHERE name = 'studio'");
    if (studioExists.length > 0) {
      await connection.execute(`
        UPDATE subscription_plans SET
          name = 'premium', display_name = '旗舰版',
          price_monthly = 888.00, price_yearly = 8880.00,
          first_month_price = NULL, first_year_price = NULL,
          max_projects = -1, max_api_calls_monthly = 90000, max_team_members = -1,
          features_json = '["无限项目","90,000积分/月","无限团队成员","全部AI模型","API访问权限","专属客服"]',
          sort_order = 3
        WHERE name = 'studio'
      `);
    } else {
      await connection.execute(`
        UPDATE subscription_plans SET
          display_name = '旗舰版',
          price_monthly = 888.00, price_yearly = 8880.00,
          first_month_price = NULL, first_year_price = NULL,
          max_projects = -1, max_api_calls_monthly = 90000, max_team_members = -1,
          features_json = '["无限项目","90,000积分/月","无限团队成员","全部AI模型","API访问权限","专属客服"]',
          sort_order = 3
        WHERE name = 'premium'
      `);
    }
    console.log('  ✓ 旗舰版已更新: ¥888/月, ¥8,880/年, 90,000积分/月');

    // 5. 确保企业版排序正确
    console.log('[步骤 5/5] 更新企业版排序...');
    await connection.execute("UPDATE subscription_plans SET sort_order = 4 WHERE name = 'enterprise'");
    console.log('  ✓ 企业版排序已更新');

    // 验证结果
    const [updatedPlans] = await connection.execute(
      'SELECT id, name, display_name, price_monthly, price_yearly, first_month_price, max_api_calls_monthly, max_team_members, sort_order FROM subscription_plans ORDER BY sort_order ASC'
    );
    console.log('\n[更新后套餐]:');
    updatedPlans.forEach(p => {
      const firstMonth = p.first_month_price ? ` (首月¥${p.first_month_price})` : '';
      console.log(`  ${p.name}(${p.display_name}): ¥${p.price_monthly}/月${firstMonth}, ¥${p.price_yearly}/年, ${p.max_api_calls_monthly}积分/月, ${p.max_team_members}人`);
    });

    console.log('\n========================================');
    console.log('套餐定价更新完成!');
    console.log('========================================');
  } catch (err) {
    console.error('\n迁移失败:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

run();
