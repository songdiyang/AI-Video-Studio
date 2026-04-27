/**
 * 角色-项目 一对多绑定 API
 *
 * 数据来源：character_project_bindings 表（T1 迁移）
 *   - binding_type = 'owner' 表示"原生项目"（由 characters.project_id 回填）
 *   - binding_type = 'reference' 表示"引用/共享"
 *
 * 端点：
 * - GET    /api/characters/:id/bindings                 读取该角色绑定的所有项目
 * - POST   /api/characters/:id/bindings                 添加项目绑定 { projectId }
 * - DELETE /api/characters/:id/bindings/:projectId      解除项目绑定（不能解除 owner 绑定）
 */
const { queryOne, queryAll, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');

async function requireCharacterOwned(userId, characterId) {
  const character = await queryOne(
    'SELECT * FROM characters WHERE id = ?',
    [characterId]
  );
  if (!character) return { error: { status: 404, message: '角色不存在' } };
  if (character.user_id !== userId) return { error: { status: 403, message: '无权访问该角色' } };
  return { character };
}

module.exports = (router) => {
  // 读取所有绑定项目
  router.get('/:id/bindings', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
      const check = await requireCharacterOwned(userId, id);
      if (check.error) return res.status(check.error.status).json({ message: check.error.message });

      const bindings = await queryAll(
        `SELECT b.project_id, b.binding_type, b.created_at,
                p.title AS project_title, p.type AS project_type
         FROM character_project_bindings b
         LEFT JOIN projects p ON p.id = b.project_id
         WHERE b.character_id = ?
         ORDER BY b.binding_type = 'owner' DESC, b.created_at ASC`,
        [id]
      );

      res.json({ characterId: Number(id), bindings });
    } catch (error) {
      console.error('[Character Bindings GET]', error);
      res.status(500).json({ message: '获取角色绑定失败' });
    }
  });

  // 添加绑定（shared）
  router.post('/:id/bindings', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { projectId } = req.body || {};

    if (!projectId) return res.status(400).json({ message: '缺少 projectId' });

    try {
      const check = await requireCharacterOwned(userId, id);
      if (check.error) return res.status(check.error.status).json({ message: check.error.message });

      // 校验该用户对目标项目有编辑权限
      const role = await getEffectiveProjectRole(userId, projectId);
      if (!role || role === 'viewer') {
        return res.status(403).json({ message: '无权向该项目添加角色' });
      }

      // 已存在 → 幂等返回
      const exists = await queryOne(
        'SELECT * FROM character_project_bindings WHERE character_id = ? AND project_id = ?',
        [id, projectId]
      );
      if (exists) {
        return res.json({ message: '角色已绑定该项目', binding: exists });
      }

      await execute(
        `INSERT INTO character_project_bindings (character_id, project_id, binding_type, created_at)
         VALUES (?, ?, 'reference', NOW())`,
        [id, projectId]
      );

      const binding = await queryOne(
        'SELECT * FROM character_project_bindings WHERE character_id = ? AND project_id = ?',
        [id, projectId]
      );
      res.status(201).json({ message: '已添加项目绑定', binding });
    } catch (error) {
      console.error('[Character Bindings POST]', error);
      res.status(500).json({ message: '添加项目绑定失败' });
    }
  });

  // 解除绑定（不能解除 owner 绑定）
  router.delete('/:id/bindings/:projectId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, projectId } = req.params;

    try {
      const check = await requireCharacterOwned(userId, id);
      if (check.error) return res.status(check.error.status).json({ message: check.error.message });

      const binding = await queryOne(
        'SELECT * FROM character_project_bindings WHERE character_id = ? AND project_id = ?',
        [id, projectId]
      );
      if (!binding) return res.status(404).json({ message: '绑定不存在' });
      if (binding.binding_type === 'owner') {
        return res.status(400).json({
          message: '不能解除原生项目绑定（请先将角色迁移到其它项目或删除角色）',
          code: 'CANNOT_UNBIND_OWNER',
        });
      }

      await execute(
        'DELETE FROM character_project_bindings WHERE character_id = ? AND project_id = ?',
        [id, projectId]
      );
      res.json({ message: '已解除项目绑定' });
    } catch (error) {
      console.error('[Character Bindings DELETE]', error);
      res.status(500).json({ message: '解除项目绑定失败' });
    }
  });
};
