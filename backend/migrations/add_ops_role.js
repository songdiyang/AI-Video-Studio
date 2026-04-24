/**
 * 数据库迁移：添加 ops（运维）角色
 * 
 * 运维角色拥有有限的管理后台权限：
 * - 可查看仪表盘、服务仪表盘
 * - 可查看模型性能统计
 * - 可管理普通用户（不能管理管理员）
 * - 可查看订阅管理、反馈管理、错误监控、公告管理、操作日志
 * - 不能访问 AI 模型配置、限流配置、计费配置、站点设置
 */

const { execute } = require('../src/dbHelper');

async function up() {
  console.log('[Migration] 添加 ops 角色到用户表...');
  
  await execute(`
    ALTER TABLE users 
    MODIFY COLUMN role ENUM('user', 'admin', 'ops') DEFAULT 'user' 
    COMMENT '用户角色：user=普通用户, admin=管理员, ops=运维'
  `);
  
  console.log('[Migration] ops 角色添加成功');
}

async function down() {
  // 先确保没有 ops 角色的用户
  await execute("UPDATE users SET role = 'user' WHERE role = 'ops'");
  
  await execute(`
    ALTER TABLE users 
    MODIFY COLUMN role ENUM('user', 'admin') DEFAULT 'user' 
    COMMENT '用户角色：user=普通用户, admin=管理员'
  `);
  
  console.log('[Migration] ops 角色已移除');
}

// 直接运行迁移
if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
  const { initializeDatabase } = require('../src/db');
  
  initializeDatabase()
    .then(() => up())
    .then(() => {
      console.log('[Migration] 迁移完成');
      process.exit(0);
    })
    .catch(err => {
      console.error('[Migration] 迁移失败:', err);
      process.exit(1);
    });
}

module.exports = { up, down };
