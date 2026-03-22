const express = require('express');
const { queryOne, queryAll, execute } = require('./dbHelper');
const { authMiddleware } = require('./middleware');

const router = express.Router();

/**
 * GET /api/community/showcases - 作品广场
 * query 参数：filter(hot/newest/featured), page, limit, tags
 */
router.get('/showcases', async (req, res) => {
  try {
    const {
      filter = 'hot',
      page = 1,
      limit = 20,
      tags
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    // 构建查询条件
    const conditions = ["s.status = 'published'"];
    const params = [];

    if (filter === 'featured') {
      conditions.push('s.is_featured = 1');
    }

    if (tags) {
      conditions.push('s.tags LIKE ?');
      params.push(`%${tags}%`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // 排序
    let orderClause;
    switch (filter) {
      case 'newest':
        orderClause = 'ORDER BY s.published_at DESC';
        break;
      case 'featured':
        orderClause = 'ORDER BY s.published_at DESC';
        break;
      case 'hot':
      default:
        orderClause = 'ORDER BY (s.view_count + s.like_count * 3) DESC';
        break;
    }

    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM showcases s ${whereClause}`;
    const countResult = await queryOne(countSql, params);
    const total = countResult?.total || 0;

    // 查询列表
    const listSql = `
      SELECT 
        s.id, s.user_id, s.title, s.description, s.cover_url, s.preview_url,
        s.tags, s.view_count, s.like_count, s.is_featured, s.published_at,
        u.id as creator_id, u.email as creator_email,
        cp.display_name as creator_name, cp.avatar_url as creator_avatar, cp.badge as creator_badge
      FROM showcases s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN creator_profiles cp ON s.user_id = cp.user_id
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    const showcases = await queryAll(listSql, [...params, limitNum, offset]);

    res.json({
      showcases,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[Showcases List]', error);
    res.status(500).json({ error: '获取作品列表失败' });
  }
});

/**
 * GET /api/community/showcases/:id - 作品详情
 */
router.get('/showcases/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const showcase = await queryOne(`
      SELECT 
        s.*,
        u.id as creator_id, u.email as creator_email,
        cp.display_name as creator_name, cp.avatar_url as creator_avatar, 
        cp.bio as creator_bio, cp.badge as creator_badge,
        p.name as project_name, p.type as project_type, p.cover_url as project_cover
      FROM showcases s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN creator_profiles cp ON s.user_id = cp.user_id
      LEFT JOIN projects p ON s.project_id = p.id
      WHERE s.id = ?
    `, [id]);

    if (!showcase) {
      return res.status(404).json({ error: '作品不存在' });
    }

    // 增加浏览量
    await execute('UPDATE showcases SET view_count = view_count + 1 WHERE id = ?', [id]);

    // 更新创作者总浏览量
    if (showcase.user_id) {
      await execute(`
        UPDATE creator_profiles 
        SET total_views = total_views + 1 
        WHERE user_id = ?
      `, [showcase.user_id]);
    }

    res.json(showcase);
  } catch (error) {
    console.error('[Showcase Detail]', error);
    res.status(500).json({ error: '获取作品详情失败' });
  }
});

/**
 * POST /api/community/showcases - 创建作品展示（需认证）
 * body: { projectId, title, description, coverUrl, previewUrl, tags }
 */
router.post('/showcases', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId, title, description, coverUrl, previewUrl, tags } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: '请选择要展示的项目' });
    }

    if (!title) {
      return res.status(400).json({ error: '作品标题不能为空' });
    }

    // 验证项目属于当前用户
    const project = await queryOne(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?',
      [projectId, userId]
    );

    if (!project) {
      return res.status(403).json({ error: '只能展示自己的项目' });
    }

    const result = await execute(`
      INSERT INTO showcases (user_id, project_id, title, description, cover_url, preview_url, tags, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
    `, [userId, projectId, title, description || '', coverUrl || '', previewUrl || '', tags || '']);

    const newShowcase = await queryOne('SELECT * FROM showcases WHERE id = ?', [result.insertId]);

    res.status(201).json({ 
      message: '作品创建成功', 
      showcase: newShowcase 
    });
  } catch (error) {
    console.error('[Showcase Create]', error);
    res.status(500).json({ error: '创建作品失败' });
  }
});

/**
 * PUT /api/community/showcases/:id - 更新作品展示（需认证）
 * body: { title, description, coverUrl, previewUrl, tags, status }
 */
router.put('/showcases/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { title, description, coverUrl, previewUrl, tags, status } = req.body;

    // 验证作品属于当前用户
    const existing = await queryOne(
      'SELECT * FROM showcases WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!existing) {
      return res.status(404).json({ error: '作品不存在或无权修改' });
    }

    // 检查是否需要设置 published_at
    let publishedAtClause = '';
    const updateParams = [];

    if (status === 'published' && existing.status !== 'published') {
      publishedAtClause = ', published_at = NOW()';
    }

    await execute(`
      UPDATE showcases 
      SET title = ?, description = ?, cover_url = ?, preview_url = ?, tags = ?, status = ?, updated_at = NOW() ${publishedAtClause}
      WHERE id = ? AND user_id = ?
    `, [
      title || existing.title,
      description !== undefined ? description : existing.description,
      coverUrl !== undefined ? coverUrl : existing.cover_url,
      previewUrl !== undefined ? previewUrl : existing.preview_url,
      tags !== undefined ? tags : existing.tags,
      status || existing.status,
      id,
      userId
    ]);

    // 如果状态变为 published，更新创作者作品数
    if (status === 'published' && existing.status !== 'published') {
      await execute(`
        UPDATE creator_profiles 
        SET total_works = total_works + 1 
        WHERE user_id = ?
      `, [userId]);
    }

    const updatedShowcase = await queryOne('SELECT * FROM showcases WHERE id = ?', [id]);

    res.json({ 
      message: '作品更新成功', 
      showcase: updatedShowcase 
    });
  } catch (error) {
    console.error('[Showcase Update]', error);
    res.status(500).json({ error: '更新作品失败' });
  }
});

/**
 * POST /api/community/showcases/:id/like - 点赞作品（需认证）
 */
router.post('/showcases/:id/like', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // 获取作品
    const showcase = await queryOne('SELECT user_id FROM showcases WHERE id = ?', [id]);

    if (!showcase) {
      return res.status(404).json({ error: '作品不存在' });
    }

    // 增加点赞数（简单实现）
    await execute('UPDATE showcases SET like_count = like_count + 1 WHERE id = ?', [id]);

    // 更新创作者总点赞数
    if (showcase.user_id) {
      await execute(`
        UPDATE creator_profiles 
        SET total_likes = total_likes + 1 
        WHERE user_id = ?
      `, [showcase.user_id]);
    }

    // 查询最新的 like_count
    const updated = await queryOne('SELECT like_count FROM showcases WHERE id = ?', [id]);

    res.json({ liked: true, likeCount: updated?.like_count || 0 });
  } catch (error) {
    console.error('[Showcase Like]', error);
    res.status(500).json({ error: '点赞失败' });
  }
});

/**
 * GET /api/community/leaderboard - 创作者排行榜
 * query 参数：period(weekly/monthly/all), limit
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const { period = 'all', limit = 20 } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    let sql;
    let params = [limitNum];

    if (period === 'weekly' || period === 'monthly') {
      // 根据最近时间段的作品浏览量排序
      const days = period === 'weekly' ? 7 : 30;
      sql = `
        SELECT 
          cp.user_id, cp.display_name, cp.avatar_url, cp.badge,
          cp.total_works, cp.total_views, cp.total_likes,
          COALESCE(SUM(s.view_count), 0) as period_views
        FROM creator_profiles cp
        LEFT JOIN showcases s ON cp.user_id = s.user_id 
          AND s.status = 'published' 
          AND s.published_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        WHERE cp.is_public = 1
        GROUP BY cp.user_id, cp.display_name, cp.avatar_url, cp.badge, cp.total_works, cp.total_views, cp.total_likes
        ORDER BY period_views DESC
        LIMIT ?
      `;
      params = [days, limitNum];
    } else {
      // 全部时间：按 total_views + total_likes*3 排序
      sql = `
        SELECT 
          user_id, display_name, avatar_url, badge,
          total_works, total_views, total_likes,
          (total_views + total_likes * 3) as score
        FROM creator_profiles
        WHERE is_public = 1
        ORDER BY score DESC
        LIMIT ?
      `;
    }

    const leaderboard = await queryAll(sql, params);

    // 添加排名
    const rankedLeaderboard = leaderboard.map((item, index) => ({
      rank: index + 1,
      ...item
    }));

    res.json({ leaderboard: rankedLeaderboard, period });
  } catch (error) {
    console.error('[Leaderboard]', error);
    res.status(500).json({ error: '获取排行榜失败' });
  }
});

/**
 * GET /api/community/creators/:id - 创作者主页
 */
router.get('/creators/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 查询创作者档案
    const creator = await queryOne(`
      SELECT 
        cp.*,
        u.email as user_email
      FROM creator_profiles cp
      LEFT JOIN users u ON cp.user_id = u.id
      WHERE cp.user_id = ?
    `, [id]);

    if (!creator) {
      return res.status(404).json({ error: '创作者不存在' });
    }

    // 解析 social_links JSON
    if (creator.social_links && typeof creator.social_links === 'string') {
      try {
        creator.social_links = JSON.parse(creator.social_links);
      } catch (e) {
        creator.social_links = {};
      }
    }

    // 查询已发布的作品列表
    const showcases = await queryAll(`
      SELECT id, title, description, cover_url, preview_url, tags, view_count, like_count, published_at
      FROM showcases
      WHERE user_id = ? AND status = 'published'
      ORDER BY published_at DESC
    `, [id]);

    res.json({
      creator,
      showcases
    });
  } catch (error) {
    console.error('[Creator Profile]', error);
    res.status(500).json({ error: '获取创作者信息失败' });
  }
});

/**
 * GET /api/community/creators/:id/showcases - 创作者作品列表（分页）
 * query 参数：page（默认1）, limit（默认20）
 */
router.get('/creators/:id/showcases', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    // 查询总数
    const countResult = await queryOne(
      `SELECT COUNT(*) as total FROM showcases WHERE user_id = ? AND status = 'published'`,
      [id]
    );
    const total = countResult?.total || 0;

    // 查询作品列表
    const showcases = await queryAll(`
      SELECT 
        id, user_id, title, description, cover_url, preview_url, 
        tags, view_count, like_count, is_featured, published_at, created_at
      FROM showcases
      WHERE user_id = ? AND status = 'published'
      ORDER BY published_at DESC
      LIMIT ? OFFSET ?
    `, [id, limitNum, offset]);

    res.json({
      showcases,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[Creator Showcases]', error);
    res.status(500).json({ error: '获取创作者作品列表失败' });
  }
});

/**
 * PUT /api/community/profile - 更新/创建创作者档案（需认证）
 * body: { displayName, avatarUrl, bio, socialLinks }
 */
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { displayName, avatarUrl, bio, socialLinks } = req.body;

    // 检查是否已有档案
    const existing = await queryOne(
      'SELECT * FROM creator_profiles WHERE user_id = ?',
      [userId]
    );

    const socialLinksJson = typeof socialLinks === 'string' 
      ? socialLinks 
      : JSON.stringify(socialLinks || {});

    if (existing) {
      // 更新现有档案
      await execute(`
        UPDATE creator_profiles 
        SET display_name = ?, avatar_url = ?, bio = ?, social_links = ?, updated_at = NOW()
        WHERE user_id = ?
      `, [
        displayName || existing.display_name,
        avatarUrl !== undefined ? avatarUrl : existing.avatar_url,
        bio !== undefined ? bio : existing.bio,
        socialLinksJson,
        userId
      ]);
    } else {
      // 创建新档案
      await execute(`
        INSERT INTO creator_profiles (user_id, display_name, avatar_url, bio, social_links, is_public)
        VALUES (?, ?, ?, ?, ?, 1)
      `, [userId, displayName || '', avatarUrl || '', bio || '', socialLinksJson]);
    }

    const profile = await queryOne(
      'SELECT * FROM creator_profiles WHERE user_id = ?',
      [userId]
    );

    // 解析 social_links
    if (profile.social_links && typeof profile.social_links === 'string') {
      try {
        profile.social_links = JSON.parse(profile.social_links);
      } catch (e) {
        profile.social_links = {};
      }
    }

    res.json({ 
      message: existing ? '档案更新成功' : '档案创建成功', 
      profile 
    });
  } catch (error) {
    console.error('[Profile Update]', error);
    res.status(500).json({ error: '更新档案失败' });
  }
});

module.exports = router;
