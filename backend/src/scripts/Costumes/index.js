/**
 * 服装资源管理 API
 * 端点:
 * - GET /api/costumes - 获取项目的服装列表
 * - POST /api/costumes - 创建服装
 * - GET /api/costumes/:id - 获取单个服装
 * - PUT /api/costumes/:id - 更新服装
 * - DELETE /api/costumes/:id - 删除服装
 */
const express = require('express');
const { queryOne, queryAll, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { generationStartService, sendGenerationError } = require('../../modules/generation');

const router = express.Router();

module.exports = router;
  router.get('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { projectId, category, gender } = req.query;

    try {
      let sql = `SELECT c.*, ch.name as character_name, ch.id as character_id
                   FROM costumes c
                   LEFT JOIN character_costumes cc ON c.id = cc.costume_id
                   LEFT JOIN characters ch ON cc.character_id = ch.id
                   WHERE c.user_id = ?`;
      const params = [userId];

      if (projectId) {
        sql += ' AND c.project_id = ?';
        params.push(Number(projectId));
      }

      if (category) {
        sql += ' AND c.category = ?';
        params.push(category);
      }

      if (gender && gender !== 'all') {
        sql += ' AND (c.gender = ? OR c.gender = "unisex")';
        params.push(gender);
      }

      sql += ' ORDER BY c.created_at DESC';

      const costumes = await queryAll(sql, params);
      res.json({ costumes });
    } catch (error) {
      console.error('[Get Costumes]', error);
      res.status(500).json({ message: '获取服装列表失败' });
    }
  });

  // POST /api/costumes - 创建服装
  router.post('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const {
      projectId, name, description, category, gender,
      outfit_prompt, image_url, front_view_url, side_view_url, back_view_url, tags
    } = req.body;

    if (!projectId || !name) {
      return res.status(400).json({ message: '项目ID和服装名称不能为空' });
    }

    try {
      // 验证用户是否属于该项目
      const project = await queryOne(
        'SELECT id FROM projects WHERE id = ? AND user_id = ?',
        [projectId, userId]
      );

      if (!project) {
        return res.status(403).json({ message: '无权在此项目中创建服装' });
      }

      const result = await execute(
        `INSERT INTO costumes (
          user_id, project_id, name, description, category, gender,
          outfit_prompt, image_url, front_view_url, side_view_url, back_view_url, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, projectId, name.trim(), description || '', category || '', gender || 'unisex',
          outfit_prompt || '', image_url || '', front_view_url || '', side_view_url || '', back_view_url || '', tags || ''
        ]
      );

      const costume = await queryOne('SELECT * FROM costumes WHERE id = ?', [result.insertId]);
      res.status(201).json({ message: '服装创建成功', costume });
    } catch (error) {
      console.error('[Create Costume]', error);
      res.status(500).json({ message: '创建服装失败' });
    }
  });

  // GET /api/costumes/:id - 获取单个服装
  router.get('/:id', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
      const costume = await queryOne(
        `SELECT c.* FROM costumes c
         JOIN projects p ON c.project_id = p.id
         WHERE c.id = ? AND p.user_id = ?`,
        [id, userId]
      );

      if (!costume) {
        return res.status(404).json({ message: '服装不存在或无权访问' });
      }

      res.json({ costume });
    } catch (error) {
      console.error('[Get Costume]', error);
      res.status(500).json({ message: '获取服装失败' });
    }
  });

  // PUT /api/costumes/:id - 更新服装
  router.put('/:id', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      name, description, category, gender,
      outfit_prompt, image_url, front_view_url, side_view_url, back_view_url, tags
    } = req.body;

    try {
      // 验证权限
      const existing = await queryOne(
        `SELECT c.id FROM costumes c
         JOIN projects p ON c.project_id = p.id
         WHERE c.id = ? AND p.user_id = ?`,
        [id, userId]
      );

      if (!existing) {
        return res.status(404).json({ message: '服装不存在或无权访问' });
      }

      await execute(
        `UPDATE costumes SET
          name = ?, description = ?, category = ?, gender = ?,
          outfit_prompt = ?, image_url = ?, front_view_url = ?, side_view_url = ?, back_view_url = ?, tags = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          name?.trim(), description || '', category || '', gender || 'unisex',
          outfit_prompt || '', image_url || '', front_view_url || '', side_view_url || '', back_view_url || '', tags || '',
          id
        ]
      );

      const costume = await queryOne('SELECT * FROM costumes WHERE id = ?', [id]);
      res.json({ message: '服装更新成功', costume });
    } catch (error) {
      console.error('[Update Costume]', error);
      res.status(500).json({ message: '更新服装失败' });
    }
  });

  // DELETE /api/costumes/:id - 删除服装
  router.delete('/:id', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
      // 验证权限
      const existing = await queryOne(
        `SELECT c.id FROM costumes c
         JOIN projects p ON c.project_id = p.id
         WHERE c.id = ? AND p.user_id = ?`,
        [id, userId]
      );

      if (!existing) {
        return res.status(404).json({ message: '服装不存在或无权访问' });
      }

      await execute('DELETE FROM costumes WHERE id = ?', [id]);
      res.json({ message: '服装删除成功' });
    } catch (error) {
      console.error('[Delete Costume]', error);
      res.status(500).json({ message: '删除服装失败' });
    }
  });

  // POST /api/costumes/:id/generate-views - 生成服装设定图
  router.post('/:id/generate-views', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const costumeId = Number(req.params.id);

    try {
      const result = await generationStartService.start({
        operationKey: 'costume_views_generate',
        rawInput: {
          costumeId,
          ...req.body
        },
        actor: { userId }
      });

      res.json(result.response || {
        message: '服装设定图生成已启动',
        jobId: result.jobId,
        costumeId,
        status: 'generating'
      });
    } catch (error) {
      sendGenerationError(res, error, '生成服装设定图失败', '[Generate Costume Views]');
    }
  });
