const express = require('express');
const { queryOne, queryAll, execute } = require('./dbHelper');
const { authMiddleware } = require('./middleware');

const router = express.Router();

/**
 * GET /api/templates - 浏览模板列表
 * query 参数：category, search, sort(popular/newest/most_used), page, limit
 */
router.get('/', async (req, res) => {
  try {
    const {
      category,
      search,
      sort = 'popular',
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    // 构建查询条件
    const conditions = ['t.is_public = 1'];
    const params = [];

    if (category) {
      conditions.push('t.category = ?');
      params.push(category);
    }

    if (search) {
      conditions.push('(t.name LIKE ? OR t.tags LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 排序
    let orderClause;
    switch (sort) {
      case 'newest':
        orderClause = 'ORDER BY t.created_at DESC';
        break;
      case 'most_used':
        orderClause = 'ORDER BY t.use_count DESC';
        break;
      case 'popular':
      default:
        orderClause = 'ORDER BY (t.use_count * 2 + TIMESTAMPDIFF(DAY, t.created_at, NOW()) * -1) DESC';
        break;
    }

    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM templates t ${whereClause}`;
    const countResult = await queryOne(countSql, params);
    const total = countResult?.total || 0;

    // 查询列表 - 简化查询，避免 creator_profiles 表不存在的问题
    const listSql = `
      SELECT 
        t.id, t.name, t.description, t.category, t.thumbnail_url,
        t.tags, t.use_count, t.is_official, t.created_at,
        t.creator_id,
        u.email as creator_email
      FROM templates t
      LEFT JOIN users u ON t.creator_id = u.id
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    const templates = await queryAll(listSql, [...params, limitNum, offset]);

    res.json({
      templates,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[Templates List] Error:', error.message, error.stack);
    res.status(500).json({ error: '获取模板列表失败', detail: error.message });
  }
});

/**
 * GET /api/templates/:id - 获取模板详情
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const template = await queryOne(`
      SELECT 
        t.*,
        t.creator_id,
        u.email as creator_email
      FROM templates t
      LEFT JOIN users u ON t.creator_id = u.id
      WHERE t.id = ?
    `, [id]);

    if (!template) {
      return res.status(404).json({ error: '模板不存在' });
    }

    // 解析 template_data JSON
    if (template.template_data && typeof template.template_data === 'string') {
      try {
        template.template_data = JSON.parse(template.template_data);
      } catch (e) {
        // 保持原样
      }
    }

    res.json(template);
  } catch (error) {
    console.error('[Template Detail] Error:', error.message, error.stack);
    res.status(500).json({ error: '获取模板详情失败', detail: error.message });
  }
});

/**
 * POST /api/templates - 创建模板（需认证）
 * body: { name, description, category, thumbnailUrl, templateData, tags, isPublic }
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, category, thumbnailUrl, templateData, tags, isPublic } = req.body;

    if (!name) {
      return res.status(400).json({ error: '模板名称不能为空' });
    }

    const templateDataJson = typeof templateData === 'string' 
      ? templateData 
      : JSON.stringify(templateData || {});

    const result = await execute(`
      INSERT INTO templates (creator_id, name, description, category, thumbnail_url, template_data, tags, is_public)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      name,
      description || '',
      category || 'general',
      thumbnailUrl || '',
      templateDataJson,
      tags || '',
      isPublic ? 1 : 0
    ]);

    const newTemplate = await queryOne('SELECT * FROM templates WHERE id = ?', [result.insertId]);

    res.status(201).json({ 
      message: '模板创建成功', 
      template: newTemplate 
    });
  } catch (error) {
    console.error('[Template Create]', error);
    res.status(500).json({ error: '创建模板失败' });
  }
});

/**
 * POST /api/templates/:id/use - 使用模板（需认证）
 * 增加 use_count，根据 template_data 创建新项目
 */
router.post('/:id/use', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // 获取模板
    const template = await queryOne('SELECT * FROM templates WHERE id = ?', [id]);

    if (!template) {
      return res.status(404).json({ error: '模板不存在' });
    }

    // 增加使用次数
    await execute('UPDATE templates SET use_count = use_count + 1 WHERE id = ?', [id]);

    // 解析模板数据
    let templateData = {};
    if (template.template_data) {
      try {
        templateData = typeof template.template_data === 'string' 
          ? JSON.parse(template.template_data) 
          : template.template_data;
      } catch (e) {
        templateData = {};
      }
    }

    // 根据模板创建新项目
    const projectName = templateData.projectName || `${template.name} - 副本`;
    const projectDescription = templateData.projectDescription || template.description || '';
    const projectType = templateData.projectType || 'comic';
    const settingsJson = templateData.settings ? JSON.stringify(templateData.settings) : '{}';

    const projectResult = await execute(`
      INSERT INTO projects (user_id, name, description, type, status, settings_json)
      VALUES (?, ?, ?, ?, 'draft', ?)
    `, [userId, projectName, projectDescription, projectType, settingsJson]);

    const newProjectId = projectResult.insertId;

    res.json({ 
      message: '模板应用成功', 
      projectId: newProjectId 
    });
  } catch (error) {
    console.error('[Template Use]', error);
    res.status(500).json({ error: '使用模板失败' });
  }
});

module.exports = router;
