/**
 * 团队角色修复脚本
 * 用法: node scripts/fix-team-role.js <teamId> <userId> <newRole>
 * 示例: node scripts/fix-team-role.js 1 2 admin
 * 
 * 可选角色: viewer, editor, admin, owner
 */

require('dotenv').config();
const { initializeDatabase } = require('../src/db');
const { queryOne, queryAll, execute } = require('../src/dbHelper');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // 无参数时显示所有团队和成员信息
    await initializeDatabase();
    
    console.log('\n=== 团队列表 ===');
    const teams = await queryAll(`
      SELECT t.id, t.name, t.owner_id, u.email as owner_email 
      FROM teams t 
      JOIN users u ON t.owner_id = u.id
      ORDER BY t.id
    `);
    teams.forEach(t => {
      console.log(`[${t.id}] ${t.name} (所有者: ${t.owner_email}, ID: ${t.owner_id})`);
    });
    
    console.log('\n=== 成员角色 ===');
    const members = await queryAll(`
      SELECT tm.team_id, t.name as team_name, tm.user_id, u.email, tm.role 
      FROM team_members tm 
      JOIN teams t ON tm.team_id = t.id 
      JOIN users u ON tm.user_id = u.id 
      ORDER BY tm.team_id, tm.role DESC
    `);
    members.forEach(m => {
      console.log(`  团队[${m.team_id}] ${m.team_name}: ${m.email} (ID: ${m.user_id}) => ${m.role}`);
    });
    
    console.log('\n用法: node scripts/fix-team-role.js <teamId> <userId> <newRole>');
    console.log('示例: node scripts/fix-team-role.js 1 2 admin');
    process.exit(0);
  }
  
  if (args.length < 3) {
    console.error('参数不足！用法: node scripts/fix-team-role.js <teamId> <userId> <newRole>');
    process.exit(1);
  }
  
  const [teamId, userId, newRole] = args;
  const validRoles = ['viewer', 'editor', 'admin', 'owner'];
  
  if (!validRoles.includes(newRole)) {
    console.error(`无效角色: ${newRole}，可选: ${validRoles.join(', ')}`);
    process.exit(1);
  }
  
  await initializeDatabase();
  
  // 检查团队是否存在
  const team = await queryOne('SELECT * FROM teams WHERE id = ?', [teamId]);
  if (!team) {
    console.error(`团队不存在: ${teamId}`);
    process.exit(1);
  }
  
  // 检查用户是否存在
  const user = await queryOne('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) {
    console.error(`用户不存在: ${userId}`);
    process.exit(1);
  }
  
  // 检查是否已是成员
  const member = await queryOne(
    'SELECT * FROM team_members WHERE team_id = ? AND user_id = ?',
    [teamId, userId]
  );
  
  if (member) {
    // 更新角色
    await execute(
      'UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?',
      [newRole, teamId, userId]
    );
    console.log(`✓ 已更新角色: ${user.email} 在团队 "${team.name}" 中的角色从 ${member.role} 改为 ${newRole}`);
  } else {
    // 添加为成员
    await execute(
      'INSERT INTO team_members (team_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)',
      [teamId, userId, newRole, userId]
    );
    console.log(`✓ 已添加成员: ${user.email} 加入团队 "${team.name}"，角色为 ${newRole}`);
  }
  
  // 如果设置为 owner，也更新 teams 表的 owner_id
  if (newRole === 'owner') {
    await execute('UPDATE teams SET owner_id = ? WHERE id = ?', [userId, teamId]);
    console.log(`✓ 已将团队所有者更新为: ${user.email}`);
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error('错误:', err.message);
  process.exit(1);
});
