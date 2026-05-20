/**
 * 统一剧本存储层数据迁移脚本
 * 
 * 目标：将所有 script_id IS NULL 的 storyboards 记录迁移到隐式剧本下
 * 步骤：
 *  1. 添加新字段（source_type, raw_content, is_implicit）
 *  2. 按 project_id + episode_number 分组查询自由分镜
 *  3. 每组创建隐式剧本记录
 *  4. 更新 storyboards 的 script_id
 *  5. 验证迁移结果
 * 
 * 幂等设计：可重复执行，已迁移的数据不会重复处理
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true
  });

  console.log('[migrate] ============================================');
  console.log('[migrate] 开始执行统一剧本存储层迁移');
  console.log('[migrate] ============================================');

  try {
    // ========== 阶段 1: 执行 DDL ==========
    console.log('[migrate] 阶段 1: 添加新字段...');
    const sqlPath = path.join(__dirname, '20260519_unify_script_storage.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // 检查字段是否已存在
    const [cols] = await conn.query("SHOW COLUMNS FROM scripts LIKE 'is_implicit'");
    const columnExists = Array.isArray(cols) && cols.length > 0;

    if (columnExists) {
      console.log('[migrate] 字段 is_implicit 已存在，跳过 DDL');
    } else {
      const segments = [];
      let buf = '';
      for (const line of sql.split('\n')) {
        if (line.trim().startsWith('--')) continue;
        buf += line + '\n';
        if (line.trim().endsWith(';')) {
          const stmt = buf.trim();
          if (stmt) segments.push(stmt);
          buf = '';
        }
      }
      if (buf.trim()) segments.push(buf.trim());

      for (const stmt of segments) {
        if (!stmt) continue;
        console.log('[migrate] DDL >>>', stmt.split('\n')[0], '...');
        await conn.query(stmt);
      }
      console.log('[migrate] DDL 执行完成');
    }

    // ========== 阶段 2: 数据迁移 ==========
    console.log('[migrate] 阶段 2: 迁移自由分镜数据...');

    // 2.1 查询所有需要迁移的自由分镜（按 project_id + episode_number 分组）
    const [groups] = await conn.query(`
      SELECT 
        project_id,
        COALESCE(episode_number, 1) as episode_number,
        COUNT(*) as storyboard_count
      FROM storyboards
      WHERE script_id IS NULL
      GROUP BY project_id, COALESCE(episode_number, 1)
      ORDER BY project_id, episode_number
    `);

    if (!Array.isArray(groups) || groups.length === 0) {
      console.log('[migrate] 没有需要迁移的自由分镜数据');
    } else {
      console.log(`[migrate] 发现 ${groups.length} 组自由分镜需要迁移`);

      let migratedGroups = 0;
      let migratedStoryboards = 0;

      for (const group of groups) {
        const { project_id, episode_number, storyboard_count } = group;

        // 2.2 获取该项目的用户ID（用于创建隐式剧本）
        const [projects] = await conn.query(
          'SELECT user_id FROM projects WHERE id = ?',
          [project_id]
        );
        const userId = Array.isArray(projects) && projects.length > 0 
          ? projects[0].user_id 
          : null;

        if (!userId) {
          console.warn(`[migrate] 项目 ${project_id} 不存在，跳过该组`);
          continue;
        }

        // 2.3 检查是否已存在该 project + episode 的隐式剧本
        const [existingScripts] = await conn.query(
          'SELECT id FROM scripts WHERE project_id = ? AND episode_number = ? AND is_implicit = TRUE',
          [project_id, episode_number]
        );

        let implicitScriptId;
        if (Array.isArray(existingScripts) && existingScripts.length > 0) {
          // 已存在隐式剧本，复用
          implicitScriptId = existingScripts[0].id;
          console.log(`[migrate] 复用已有隐式剧本: project=${project_id}, ep=${episode_number}, scriptId=${implicitScriptId}`);
        } else {
          // 2.4 创建隐式剧本记录
          const [result] = await conn.query(
            `INSERT INTO scripts 
             (user_id, project_id, episode_number, title, content, is_implicit, source_type, status) 
             VALUES (?, ?, ?, ?, ?, TRUE, 'implicit', 'completed')`,
            [userId, project_id, episode_number, `第${episode_number}集`, '']
          );
          implicitScriptId = result.insertId;
          console.log(`[migrate] 创建隐式剧本: project=${project_id}, ep=${episode_number}, scriptId=${implicitScriptId}`);
        }

        // 2.5 更新该组所有 storyboards 的 script_id
        const [updateResult] = await conn.query(
          'UPDATE storyboards SET script_id = ? WHERE project_id = ? AND script_id IS NULL AND COALESCE(episode_number, 1) = ?',
          [implicitScriptId, project_id, episode_number]
        );

        const updatedCount = updateResult.affectedRows || 0;
        migratedStoryboards += updatedCount;
        migratedGroups++;
        console.log(`[migrate] 更新 ${updatedCount} 个分镜的 script_id -> ${implicitScriptId}`);
      }

      console.log(`[migrate] 数据迁移完成: ${migratedGroups} 组, ${migratedStoryboards} 个分镜`);
    }

    // ========== 阶段 3: 验证 ==========
    console.log('[migrate] 阶段 3: 验证迁移结果...');

    const [remaining] = await conn.query(
      'SELECT COUNT(*) as count FROM storyboards WHERE script_id IS NULL'
    );
    const remainingCount = remaining[0]?.count || 0;

    const [implicitCount] = await conn.query(
      'SELECT COUNT(*) as count FROM scripts WHERE is_implicit = TRUE'
    );
    const implicitScriptsCount = implicitCount[0]?.count || 0;

    console.log(`[migrate] 验证结果:`);
    console.log(`[migrate]   - script_id IS NULL 的分镜数: ${remainingCount} (应为 0)`);
    console.log(`[migrate]   - 隐式剧本总数: ${implicitScriptsCount}`);

    if (remainingCount > 0) {
      console.warn('[migrate] ⚠️ 仍有未迁移的分镜，请检查！');
    } else {
      console.log('[migrate] ✓ 所有分镜已成功绑定到剧本');
    }

    console.log('[migrate] ============================================');
    console.log('[migrate] 迁移完成');
    console.log('[migrate] ============================================');

  } catch (err) {
    console.error('[migrate] 迁移失败:', err.message);
    console.error(err);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

run();
