/**
 * 创建项目任务处理器
 *
 * 输入：
 *   - name: 项目名称
 *   - description: 项目描述
 *   - type: 项目类型 (comic/short_drama/animation/live_action/game)
 *   - coverUrl: 封面 URL（可选）
 *   - userId: 用户 ID
 *
 * 输出 result_data:
 *   {
 *     project: { id, name, description, type, cover_url, status, created_at }
 *   }
 */

const { execute, queryOne } = require('../../../dbHelper');
const { canCreateProject } = require('../../../subscriptionService');

async function handleCreateProject(params, onProgress) {
  const {
    name,
    description = '',
    type = 'comic',
    coverUrl = '',
    userId
  } = params;

  if (!name) {
    throw new Error('create_project: 缺少项目名称');
  }
  if (!userId) {
    throw new Error('create_project: 缺少用户 ID');
  }

  if (onProgress) onProgress(10);

  // 检查项目数量限制
  const projectLimit = await canCreateProject(userId);
  if (!projectLimit.allowed) {
    throw new Error(`您已达到${projectLimit.planDisplayName}的项目数量上限（${projectLimit.maxCount}个）`);
  }

  if (onProgress) onProgress(30);

  // 插入项目
  const result = await execute(
    `INSERT INTO projects (user_id, team_id, name, description, cover_url, type, status, settings_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, null, name.trim(), description.trim(), coverUrl, type, 'draft', '{}']
  );

  if (onProgress) onProgress(70);

  const projectId = result.insertId;
  const project = await queryOne('SELECT * FROM projects WHERE id = ?', [projectId]);

  if (onProgress) onProgress(100);

  console.log(`[CreateProject] 项目创建成功: id=${projectId}, name=${name}, userId=${userId}`);

  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      type: project.type,
      cover_url: project.cover_url,
      status: project.status,
      created_at: project.created_at
    }
  };
}

module.exports = handleCreateProject;
