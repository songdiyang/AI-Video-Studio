/**
 * 资源包体系迁移脚本
 * 
 * 新建 user_resource_packs 表，将现有用户余额迁移为初始资源包
 */

const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// 加载 .env 文件（直接解析文件内容，处理特殊字符）
const envPath = path.join(__dirname, '..', '.env');
const envConfig = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    // 不 trim 值，保留原始内容（密码可能含空格和特殊字符）
    envConfig[key] = trimmed.substring(eqIdx + 1);
  }
}

async function runMigration() {
  const connection = await mysql.createConnection({
    host: envConfig.MYSQL_HOST || process.env.MYSQL_HOST,
    port: parseInt(envConfig.MYSQL_PORT || process.env.MYSQL_PORT) || 3306,
    user: envConfig.MYSQL_USER || process.env.MYSQL_USER,
    password: envConfig.MYSQL_PASSWORD || process.env.MYSQL_PASSWORD,
    database: envConfig.MYSQL_DATABASE || process.env.MYSQL_DATABASE
  });

  try {
    console.log('========================================');
    console.log('开始执行资源包体系迁移...');
    console.log('========================================\n');

    // =============================================
    // 1. 创建 user_resource_packs 表
    // =============================================
    console.log('[步骤 1/3] 创建 user_resource_packs 表...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_resource_packs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL COMMENT '资源包名称',
        total_points INT NOT NULL COMMENT '总积分',
        remaining_points INT NOT NULL COMMENT '剩余积分',
        source_type ENUM('purchase','gift','subscription','admin') DEFAULT 'purchase' COMMENT '来源类型',
        source_id INT COMMENT '关联ID',
        period_start DATETIME NOT NULL COMMENT '有效期开始',
        period_end DATETIME NOT NULL COMMENT '有效期结束',
        status ENUM('active','expired','used_up') DEFAULT 'active',
        is_gift TINYINT(1) DEFAULT 0 COMMENT '是否赠送',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_status (status),
        INDEX idx_period_end (period_end),
        INDEX idx_user_status (user_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户资源包'
    `);
    console.log('    ✓ user_resource_packs 表已就绪');

    // =============================================
    // 2. 创建 points_adjustment_log 表（如不存在）
    // =============================================
    console.log('[步骤 2/3] 确保 points_adjustment_log 表存在...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS points_adjustment_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        admin_id INT NOT NULL,
        admin_employee_id VARCHAR(50),
        adjustment_type ENUM('add','subtract') NOT NULL,
        amount INT NOT NULL,
        balance_before INT NOT NULL,
        balance_after INT NOT NULL,
        reason TEXT,
        mail_id INT,
        resource_pack_id INT COMMENT '关联的资源包ID',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_admin_id (admin_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('    ✓ points_adjustment_log 表已就绪');

    // =============================================
    // 3. 迁移现有用户余额为初始资源包
    // =============================================
    console.log('[步骤 3/3] 迁移现有用户余额为初始资源包...');
    
    // 查询所有有余额的用户（排除余额为0或NULL的）
    const [users] = await connection.execute(
      'SELECT id, balance FROM users WHERE balance > 0'
    );
    
    let migratedCount = 0;
    const now = new Date();
    // 有效期到下个月同日的前一天 23:59:59
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    periodEnd.setDate(periodEnd.getDate() - 1);
    periodEnd.setHours(23, 59, 59, 0);

    for (const user of users) {
      const balance = Math.round(Number(user.balance) || 0);
      if (balance <= 0) continue;

      // 检查该用户是否已有资源包（防止重复迁移）
      const [existing] = await connection.execute(
        'SELECT id FROM user_resource_packs WHERE user_id = ? AND source_type = ? AND name = ?',
        [user.id, 'admin', '初始积分']
      );
      if (existing.length > 0) continue;

      await connection.execute(
        `INSERT INTO user_resource_packs (user_id, name, total_points, remaining_points, source_type, period_start, period_end, status, is_gift)
         VALUES (?, '初始积分', ?, ?, 'admin', ?, ?, 'active', 0)`,
        [user.id, balance, balance, now, periodEnd]
      );
      migratedCount++;
    }
    
    console.log(`    ✓ 已迁移 ${migratedCount} 个用户的余额为初始资源包`);
    console.log(`    （有效期至 ${periodEnd.toISOString().slice(0, 10)}）`);

    console.log('\n========================================');
    console.log('资源包体系迁移完成!');
    console.log('========================================');
    console.log('新增表：');
    console.log('  - user_resource_packs (用户资源包)');
    console.log('  - points_adjustment_log (积分调整日志)');
    console.log('========================================');
  } catch (err) {
    console.error('\n迁移失败:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
