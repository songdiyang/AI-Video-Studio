/**
 * 模板市场 API 路由
 * 
 * 支持提示词配方交易、积分结算、上架管理
 * 路由前缀：/api/marketplace
 */
const express = require('express');
const { queryOne, queryAll, execute } = require('./dbHelper');
const { authMiddleware } = require('./middleware');
const { deductPoints, checkPointsBalance } = require('./pointsService');

const router = express.Router();

const handleBaseTextModelCall = require('./nosyntask/tasks/base/baseTextModelCall');
const { stripThinkTags, extractCodeBlock, stripInvisible, safeParseJSON, extractJSON } = require('./utils/washBody');

// 平台手续费率
const PLATFORM_FEE_RATE = 0.3;
const MIN_PLATFORM_FEE = 1; // 最低1积分

// =============================================
// GET /api/marketplace/templates - 浏览市场
// =============================================
router.get('/templates', async (req, res) => {
  try {
    const {
      recipe_type,
      search,
      sort = 'hot',
      page = 1,
      limit = 20,
      is_free
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = ["t.listing_status = 'listed'", "t.is_public = 1"];
    const params = [];

    if (recipe_type) {
      conditions.push('t.recipe_type = ?');
      params.push(recipe_type);
    }

    if (search) {
      conditions.push('(t.name LIKE ? OR t.tags LIKE ? OR t.description LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (is_free === '1' || is_free === 'true') {
      conditions.push('t.is_free = 1');
    } else if (is_free === '0' || is_free === 'false') {
      conditions.push('t.is_free = 0');
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // 排序
    let orderClause;
    switch (sort) {
      case 'newest':
        orderClause = 'ORDER BY t.listed_at DESC';
        break;
      case 'free':
        orderClause = 'ORDER BY t.is_free DESC, t.purchase_count DESC';
        break;
      case 'paid':
        orderClause = 'ORDER BY t.purchase_count DESC, t.like_count DESC';
        break;
      case 'hot':
      default:
        orderClause = 'ORDER BY t.sort_score DESC, t.purchase_count DESC, t.like_count DESC';
        break;
    }

    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM templates t ${whereClause}`;
    const countResult = await queryOne(countSql, params);
    const total = countResult?.total || 0;

    // 查询列表
    const listSql = `
      SELECT 
        t.id, t.name, t.description, t.recipe_type, t.category,
        t.thumbnail_url, t.preview_urls, t.tags,
        t.price, t.is_free, t.is_official,
        t.like_count, t.comment_count, t.purchase_count,
        t.listed_at, t.created_at,
        t.seller_id,
        u.email as seller_email,
        cp.display_name as seller_name, cp.avatar_url as seller_avatar, cp.badge as seller_badge
      FROM templates t
      LEFT JOIN users u ON t.seller_id = u.id
      LEFT JOIN creator_profiles cp ON t.seller_id = cp.user_id
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    const templates = await queryAll(listSql, [...params, limitNum, offset]);

    // 解析 JSON 字段
    templates.forEach(t => {
      if (t.preview_urls && typeof t.preview_urls === 'string') {
        try { t.preview_urls = JSON.parse(t.preview_urls); } catch(e) { t.preview_urls = []; }
      }
    });

    res.json({
      templates,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    console.error('[Marketplace List] Error:', error.message);
    res.status(500).json({ error: '获取模板列表失败', detail: error.message });
  }
});

// =============================================
// GET /api/marketplace/templates/:id - 模板详情
// =============================================
router.get('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || null;

    const template = await queryOne(`
      SELECT 
        t.*,
        u.email as seller_email,
        cp.display_name as seller_name, cp.avatar_url as seller_avatar,
        cp.bio as seller_bio, cp.badge as seller_badge,
        cp.follower_count as seller_follower_count,
        cp.total_sales as seller_total_sales
      FROM templates t
      LEFT JOIN users u ON t.seller_id = u.id
      LEFT JOIN creator_profiles cp ON t.seller_id = cp.user_id
      WHERE t.id = ?
    `, [id]);

    if (!template) {
      return res.status(404).json({ error: '模板不存在' });
    }

    // 解析 JSON
    ['preview_urls', 'recipe_data', 'template_data'].forEach(field => {
      if (template[field] && typeof template[field] === 'string') {
        try { template[field] = JSON.parse(template[field]); } catch(e) {}
      }
    });

    // 检查当前用户是否已购买
    let hasPurchased = false;
    let hasLiked = false;
    if (userId) {
      const purchase = await queryOne(
        'SELECT id FROM template_purchases WHERE buyer_id = ? AND template_id = ?',
        [userId, id]
      );
      hasPurchased = !!purchase;

      const like = await queryOne(
        'SELECT id FROM template_likes WHERE user_id = ? AND template_id = ?',
        [userId, id]
      );
      hasLiked = !!like;
    }

    // 未购买时隐藏配方核心内容
    if (!hasPurchased && template.recipe_data) {
      const recipeData = template.recipe_data;
      // 只展示脱敏版本：提示词截断到前30字符
      if (recipeData.prompts) {
        const masked = {};
        for (const [key, value] of Object.entries(recipeData.prompts)) {
          if (typeof value === 'string' && value.length > 30) {
            masked[key] = value.substring(0, 30) + '...';
          } else {
            masked[key] = value;
          }
        }
        recipeData.prompts = masked;
      }
    }

    // 增加浏览量
    await execute('UPDATE templates SET use_count = use_count + 1 WHERE id = ?', [id]);

    res.json({
      template,
      hasPurchased,
      hasLiked
    });
  } catch (error) {
    console.error('[Marketplace Detail] Error:', error.message);
    res.status(500).json({ error: '获取模板详情失败', detail: error.message });
  }
});

// =============================================
// POST /api/marketplace/analyze-recipe - AI分析文本提取配方参数
// =============================================
router.post('/analyze-recipe', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { text, recipeType, textModel } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: '请输入待分析文本' });
    }
    if (!recipeType || !['character', 'scene'].includes(recipeType)) {
      return res.status(400).json({ error: '配方类型仅支持 character 或 scene' });
    }
    if (!textModel) {
      return res.status(400).json({ error: '请选择文本模型' });
    }

    let analysisPrompt;
    if (recipeType === 'character') {
      analysisPrompt = `你是一个角色设计专家。请分析以下文本，提取角色的结构化信息。

文本内容：
${text.trim()}

请提取以下属性并以 JSON 格式输出（不要包含任何其他内容）：
{
  "name": "角色名称（从文本中提取，如未提及则生成一个合适的名称）",
  "description": "角色简介（背景、身份、在故事中的作用等，200字以内）",
  "appearance": "外貌特征（必须非常详细具体：发型发色、服装款式颜色、配饰、体型、肤色、年龄特征等，可用于AI绘图，用中文）",
  "personality": "性格描述（性格特点、行为习惯等，用中文）",
  "tags": "标签（3-5个关键词，逗号分隔，如：少女,校服,黑发）"
}

注意：
1. appearance 是AI识别角色的核心依据，必须详细、具体且固定，重点描述可见的外在特征
2. 如果文本中没有明确提到某些属性，请根据上下文合理推断
3. 保持输出纯JSON格式，不要有额外的解释`;
    } else {
      analysisPrompt = `你是一个场景设计专家。请分析以下文本，提取场景的结构化信息。

文本内容：
${text.trim()}

请提取以下属性并以 JSON 格式输出（不要包含任何其他内容）：
{
  "name": "场景名称（简短概括，如：魔法森林、废弃工厂）",
  "description": "场景详细描述（整体描述场景的样貌、结构和氛围，200字以内）",
  "environment": "环境描述（建筑结构、空间布局、物品摆设、自然景观等，用中文）",
  "lighting": "光照描述（光线来源、明暗对比、色调、时间暗示等，用中文）",
  "mood": "氛围描述（紧张、温馨、诡异、宏大等情绪感受，用中文）",
  "tags": "标签（3-5个关键词，逗号分隔，如：室内,夜晚,温馨）"
}

注意：
1. environment/lighting/mood 要尽可能详细和具体，可直接用于AI绘图
2. 保持输出纯JSON格式，不要有额外的解释`;
    }

    const result = await handleBaseTextModelCall({
      prompt: analysisPrompt,
      textModel,
      maxTokens: 2048,
      temperature: 0.3
    });

    // 提取响应内容
    let content = '';
    if (typeof result === 'string') {
      content = result;
    } else if (result && result.content) {
      content = result.content;
    } else if (result && result.text) {
      content = result.text;
    } else if (result && result.message) {
      content = result.message;
    }

    // 解析 JSON
    let parsed;
    try {
      let jsonStr = stripThinkTags(content);
      jsonStr = extractCodeBlock(jsonStr);
      jsonStr = stripInvisible(jsonStr).trim();
      parsed = safeParseJSON(jsonStr);
      if (!parsed) {
        const extracted = extractJSON(jsonStr);
        if (extracted) parsed = safeParseJSON(extracted);
      }
    } catch (parseErr) {
      console.error('[Analyze Recipe] JSON 解析失败:', parseErr.message);
      return res.status(500).json({ error: 'AI 分析结果解析失败，请重试' });
    }

    if (!parsed) {
      return res.status(500).json({ error: 'AI 分析结果解析失败，请重试' });
    }

    res.json({ result: parsed });
  } catch (error) {
    console.error('[Analyze Recipe]', error);
    res.status(500).json({ error: 'AI 分析失败', detail: error.message });
  }
});

// =============================================
// POST /api/marketplace/templates - 发布配方
// =============================================
router.post('/templates', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name, description, recipe_type, category,
      thumbnailUrl, previewUrls, tags,
      recipeData, templateData,
      price, is_free,
      isPublic
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: '模板名称不能为空' });
    }

    if (!recipe_type || !['character', 'scene', 'script'].includes(recipe_type)) {
      return res.status(400).json({ error: '配方类型无效' });
    }

    if (!recipeData) {
      return res.status(400).json({ error: '配方数据不能为空' });
    }

    const priceInt = Math.max(0, parseInt(price, 10) || 0);
    const isFree = is_free ? 1 : (priceInt === 0 ? 1 : 0);
    const actualPrice = isFree ? 0 : priceInt;
    const recipeDataJson = typeof recipeData === 'string' ? recipeData : JSON.stringify(recipeData);
    const templateDataJson = typeof templateData === 'string' ? templateData : JSON.stringify(templateData || {});
    const previewUrlsJson = previewUrls ? JSON.stringify(previewUrls) : null;

    const result = await execute(`
      INSERT INTO templates (
        creator_id, seller_id, name, description, category,
        thumbnail_url, preview_urls, tags,
        template_data, recipe_data,
        recipe_type, price, is_free,
        is_public, listing_status, review_status,
        sort_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'pending', ?)
    `, [
      userId, userId, name, description || '', category || recipe_type,
      thumbnailUrl || '', previewUrlsJson, tags || '',
      templateDataJson, recipeDataJson,
      recipe_type, actualPrice, isFree,
      isPublic !== false ? 1 : 0,
      isFree ? 10 : 0 // 免费模板初始排序分更高
    ]);

    // 确保卖家有 creator_profile
    const existingProfile = await queryOne(
      'SELECT user_id FROM creator_profiles WHERE user_id = ?', [userId]
    );
    if (!existingProfile) {
      await execute(`
        INSERT INTO creator_profiles (user_id, display_name, is_public)
        VALUES (?, '', 1)
      `, [userId]);
    }

    const newTemplate = await queryOne('SELECT * FROM templates WHERE id = ?', [result.insertId]);

    res.status(201).json({
      message: '配方发布成功，待审核后上架',
      template: newTemplate
    });
  } catch (error) {
    console.error('[Marketplace Create]', error);
    res.status(500).json({ error: '发布配方失败', detail: error.message });
  }
});

// =============================================
// PUT /api/marketplace/templates/:id - 编辑模板
// =============================================
router.put('/templates/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      name, description, category,
      thumbnailUrl, previewUrls, tags,
      recipeData, price, is_free, isPublic
    } = req.body;

    const existing = await queryOne('SELECT * FROM templates WHERE id = ? AND seller_id = ?', [id, userId]);
    if (!existing) {
      return res.status(404).json({ error: '模板不存在或无权编辑' });
    }

    // 已上架的模板不允许修改配方核心内容（需先下架）
    if (existing.listing_status === 'listed' && recipeData) {
      return res.status(400).json({ error: '已上架模板不能修改配方内容，请先下架' });
    }

    const priceInt = Math.max(0, parseInt(price, 10) || 0);
    const isFree = is_free !== undefined ? (is_free ? 1 : 0) : (priceInt === 0 ? 1 : existing.is_free);
    const actualPrice = isFree ? 0 : (price !== undefined ? priceInt : existing.price);

    const recipeDataJson = recipeData ? (typeof recipeData === 'string' ? recipeData : JSON.stringify(recipeData)) : existing.recipe_data;
    const previewUrlsJson = previewUrls ? JSON.stringify(previewUrls) : existing.preview_urls;

    await execute(`
      UPDATE templates 
      SET name = ?, description = ?, category = ?,
          thumbnail_url = ?, preview_urls = ?, tags = ?,
          recipe_data = ?, price = ?, is_free = ?, is_public = ?,
          updated_at = NOW()
      WHERE id = ? AND seller_id = ?
    `, [
      name || existing.name,
      description !== undefined ? description : existing.description,
      category || existing.category,
      thumbnailUrl !== undefined ? thumbnailUrl : existing.thumbnail_url,
      previewUrlsJson,
      tags !== undefined ? tags : existing.tags,
      recipeDataJson,
      actualPrice,
      isFree,
      isPublic !== undefined ? (isPublic ? 1 : 0) : existing.is_public,
      id, userId
    ]);

    const updated = await queryOne('SELECT * FROM templates WHERE id = ?', [id]);
    res.json({ message: '模板更新成功', template: updated });
  } catch (error) {
    console.error('[Marketplace Update]', error);
    res.status(500).json({ error: '更新模板失败', detail: error.message });
  }
});

// =============================================
// DELETE /api/marketplace/templates/:id - 删除模板
// =============================================
router.delete('/templates/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const existing = await queryOne('SELECT * FROM templates WHERE id = ? AND seller_id = ?', [id, userId]);
    if (!existing) {
      return res.status(404).json({ error: '模板不存在或无权删除' });
    }

    if (existing.listing_status === 'listed') {
      return res.status(400).json({ error: '请先下架模板再删除' });
    }

    await execute('DELETE FROM templates WHERE id = ? AND seller_id = ?', [id, userId]);
    res.json({ message: '模板已删除' });
  } catch (error) {
    console.error('[Marketplace Delete]', error);
    res.status(500).json({ error: '删除模板失败', detail: error.message });
  }
});

// =============================================
// POST /api/marketplace/templates/:id/purchase - 购买配方
// =============================================
router.post('/templates/:id/purchase', authMiddleware, async (req, res) => {
  const connection = await require('mysql2/promise').createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    await connection.beginTransaction();
    const userId = req.user.id;
    const { id } = req.params;

    // 获取模板（加锁）
    const [templateRows] = await connection.execute(
      'SELECT * FROM templates WHERE id = ? FOR UPDATE', [id]
    );
    const template = templateRows[0];

    if (!template) {
      await connection.rollback();
      return res.status(404).json({ error: '模板不存在' });
    }

    if (template.listing_status !== 'listed') {
      await connection.rollback();
      return res.status(400).json({ error: '模板未上架' });
    }

    // 不能购买自己的模板
    if (template.seller_id === userId) {
      await connection.rollback();
      return res.status(400).json({ error: '不能购买自己的模板' });
    }

    // 检查是否已购买
    const [existingPurchase] = await connection.execute(
      'SELECT id FROM template_purchases WHERE buyer_id = ? AND template_id = ?',
      [userId, id]
    );
    if (existingPurchase.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: '已购买过此模板', alreadyPurchased: true });
    }

    const price = template.price || 0;
    const isFree = template.is_free === 1;

    // 积分结算
    let platformFee = 0;
    let sellerRevenue = 0;

    if (!isFree && price > 0) {
      // 检查余额
      const balanceCheck = await checkPointsBalance(userId, price);
      if (!balanceCheck.hasBalance) {
        await connection.rollback();
        return res.status(402).json({ error: '积分余额不足', required: price, current: balanceCheck.balance });
      }

      // 扣除买家积分
      const deductResult = await deductPoints(userId, price);
      if (!deductResult.success) {
        await connection.rollback();
        return res.status(402).json({ error: '积分扣除失败' });
      }

      // 计算手续费和卖家收入
      platformFee = Math.max(MIN_PLATFORM_FEE, Math.ceil(price * PLATFORM_FEE_RATE));
      sellerRevenue = price - platformFee;

      // 卖家积分到账
      if (sellerRevenue > 0) {
        await connection.execute(
          'UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE id = ?',
          [sellerRevenue, template.seller_id]
        );

        // 记录卖家收入流水
        await connection.execute(`
          INSERT INTO billing_records (user_id, type, points, charge_status, description, created_at)
          VALUES (?, 'marketplace_sale', ?, 'completed', ?, NOW())
        `, [template.seller_id, sellerRevenue, `模板"${template.name}"销售收入`]);
      }
    }

    // 写入购买记录
    await connection.execute(`
      INSERT INTO template_purchases (buyer_id, template_id, seller_id, price, platform_fee, seller_revenue)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [userId, id, template.seller_id, price, platformFee, sellerRevenue]);

    // 更新模板统计
    await connection.execute(
      'UPDATE templates SET purchase_count = purchase_count + 1, total_revenue = total_revenue + ? WHERE id = ?',
      [sellerRevenue, id]
    );

    // 更新卖家统计
    await connection.execute(`
      UPDATE creator_profiles 
      SET total_sales = total_sales + 1, total_earnings = total_earnings + ?
      WHERE user_id = ?
    `, [sellerRevenue, template.seller_id]);

    // 更新排序分
    await connection.execute(
      'UPDATE templates SET sort_score = sort_score + 1 WHERE id = ?',
      [id]
    );

    await connection.commit();

    // 获取完整配方数据返回给买家
    let recipeData = template.recipe_data;
    if (recipeData && typeof recipeData === 'string') {
      try { recipeData = JSON.parse(recipeData); } catch(e) {}
    }

    res.json({
      message: isFree ? '免费配方获取成功' : '购买成功',
      purchase: {
        templateId: parseInt(id),
        price,
        platformFee,
        sellerRevenue,
        recipeData
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('[Marketplace Purchase]', error);
    res.status(500).json({ error: '购买失败', detail: error.message });
  } finally {
    await connection.end();
  }
});

// =============================================
// POST /api/marketplace/templates/:id/list - 上架
// =============================================
router.post('/templates/:id/list', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const template = await queryOne('SELECT * FROM templates WHERE id = ? AND seller_id = ?', [id, userId]);
    if (!template) {
      return res.status(404).json({ error: '模板不存在或无权操作' });
    }

    if (template.listing_status === 'listed') {
      return res.status(400).json({ error: '模板已上架' });
    }

    if (!template.recipe_data) {
      return res.status(400).json({ error: '请先填写配方数据' });
    }

    // 上架（MVP阶段跳过审核，直接通过）
    await execute(`
      UPDATE templates 
      SET listing_status = 'listed', listed_at = NOW(), review_status = 'approved',
          sort_score = COALESCE(sort_score, 0) + (CASE WHEN is_free = 1 THEN 10 ELSE 0 END)
      WHERE id = ?
    `, [id]);

    res.json({ message: '上架成功' });
  } catch (error) {
    console.error('[Marketplace List]', error);
    res.status(500).json({ error: '上架失败', detail: error.message });
  }
});

// =============================================
// POST /api/marketplace/templates/:id/delist - 下架
// =============================================
router.post('/templates/:id/delist', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const template = await queryOne('SELECT * FROM templates WHERE id = ? AND seller_id = ?', [id, userId]);
    if (!template) {
      return res.status(404).json({ error: '模板不存在或无权操作' });
    }

    await execute("UPDATE templates SET listing_status = 'delisted' WHERE id = ?", [id]);
    res.json({ message: '下架成功' });
  } catch (error) {
    console.error('[Marketplace Delist]', error);
    res.status(500).json({ error: '下架失败', detail: error.message });
  }
});

// =============================================
// 社交互动路由
// =============================================

// POST /api/marketplace/templates/:id/like - 点赞/取消点赞
router.post('/templates/:id/like', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const template = await queryOne('SELECT id, like_count FROM templates WHERE id = ?', [id]);
    if (!template) return res.status(404).json({ error: '模板不存在' });

    const existingLike = await queryOne(
      'SELECT id FROM template_likes WHERE template_id = ? AND user_id = ?',
      [id, userId]
    );

    if (existingLike) {
      await execute('DELETE FROM template_likes WHERE template_id = ? AND user_id = ?', [id, userId]);
      await execute('UPDATE templates SET like_count = GREATEST(0, like_count - 1) WHERE id = ?', [id]);
      const updated = await queryOne('SELECT like_count FROM templates WHERE id = ?', [id]);
      res.json({ liked: false, likeCount: updated?.like_count || 0 });
    } else {
      await execute('INSERT INTO template_likes (template_id, user_id) VALUES (?, ?)', [id, userId]);
      await execute('UPDATE templates SET like_count = like_count + 1 WHERE id = ?', [id]);
      const updated = await queryOne('SELECT like_count FROM templates WHERE id = ?', [id]);
      res.json({ liked: true, likeCount: updated?.like_count || 0 });
    }
  } catch (error) {
    console.error('[Template Like]', error);
    res.status(500).json({ error: '点赞操作失败' });
  }
});

// GET /api/marketplace/templates/:id/comments - 评论列表
router.get('/templates/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const total = (await queryOne(
      "SELECT COUNT(*) as total FROM template_comments WHERE template_id = ? AND status = 'visible'",
      [id]
    ))?.total || 0;

    const comments = await queryAll(`
      SELECT c.id, c.content, c.parent_id, c.like_count, c.created_at, c.user_id,
             u.email as user_email,
             cp.display_name as user_name, cp.avatar_url as user_avatar
      FROM template_comments c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN creator_profiles cp ON c.user_id = cp.user_id
      WHERE c.template_id = ? AND c.status = 'visible'
      ORDER BY c.created_at ASC
      LIMIT ? OFFSET ?
    `, [id, limitNum, offset]);

    res.json({
      comments,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    console.error('[Template Comments]', error);
    res.status(500).json({ error: '获取评论失败' });
  }
});

// POST /api/marketplace/templates/:id/comments - 发表评论
router.post('/templates/:id/comments', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { content, parentId } = req.body;

    if (!content || !content.trim()) return res.status(400).json({ error: '评论内容不能为空' });
    if (content.length > 500) return res.status(400).json({ error: '评论内容不能超过500字' });

    const template = await queryOne('SELECT id FROM templates WHERE id = ?', [id]);
    if (!template) return res.status(404).json({ error: '模板不存在' });

    const result = await execute(
      'INSERT INTO template_comments (template_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)',
      [id, userId, content.trim(), parentId || null]
    );
    await execute('UPDATE templates SET comment_count = comment_count + 1 WHERE id = ?', [id]);
    const comment = await queryOne('SELECT * FROM template_comments WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: '评论成功', comment });
  } catch (error) {
    console.error('[Template Comment Create]', error);
    res.status(500).json({ error: '发表评论失败' });
  }
});

// DELETE /api/marketplace/comments/:id - 删除评论
router.delete('/comments/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const comment = await queryOne('SELECT * FROM template_comments WHERE id = ? AND user_id = ?', [id, userId]);
    if (!comment) return res.status(404).json({ error: '评论不存在或无权删除' });

    await execute("UPDATE template_comments SET status = 'hidden' WHERE id = ?", [id]);
    await execute('UPDATE templates SET comment_count = GREATEST(0, comment_count - 1) WHERE id = ?', [comment.template_id]);
    res.json({ message: '评论已删除' });
  } catch (error) {
    console.error('[Template Comment Delete]', error);
    res.status(500).json({ error: '删除评论失败' });
  }
});

// =============================================
// 关注/粉丝路由
// =============================================

// POST /api/marketplace/follow/:userId - 关注/取关
router.post('/follow/:userId', authMiddleware, async (req, res) => {
  try {
    const followerId = req.user.id;
    const followingId = parseInt(req.params.userId, 10);
    if (followerId === followingId) return res.status(400).json({ error: '不能关注自己' });

    const targetUser = await queryOne('SELECT id FROM users WHERE id = ?', [followingId]);
    if (!targetUser) return res.status(404).json({ error: '用户不存在' });

    const existing = await queryOne(
      'SELECT id FROM user_follows WHERE follower_id = ? AND following_id = ?',
      [followerId, followingId]
    );

    if (existing) {
      await execute('DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId]);
      await execute('UPDATE creator_profiles SET following_count = GREATEST(0, following_count - 1) WHERE user_id = ?', [followerId]);
      await execute('UPDATE creator_profiles SET follower_count = GREATEST(0, follower_count - 1) WHERE user_id = ?', [followingId]);
      res.json({ following: false });
    } else {
      await execute('INSERT INTO user_follows (follower_id, following_id) VALUES (?, ?)', [followerId, followingId]);
      await execute('UPDATE creator_profiles SET following_count = following_count + 1 WHERE user_id = ?', [followerId]);
      await execute('UPDATE creator_profiles SET follower_count = follower_count + 1 WHERE user_id = ?', [followingId]);
      res.json({ following: true });
    }
  } catch (error) {
    console.error('[Follow]', error);
    res.status(500).json({ error: '关注操作失败' });
  }
});

// GET /api/marketplace/followers - 我的粉丝
router.get('/followers', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const followers = await queryAll(`
      SELECT uf.follower_id as user_id, uf.created_at as followed_at,
             cp.display_name, cp.avatar_url, cp.badge, u.email
      FROM user_follows uf
      LEFT JOIN creator_profiles cp ON uf.follower_id = cp.user_id
      LEFT JOIN users u ON uf.follower_id = u.id
      WHERE uf.following_id = ? ORDER BY uf.created_at DESC LIMIT 50
    `, [userId]);
    const total = (await queryOne('SELECT follower_count as total FROM creator_profiles WHERE user_id = ?', [userId]))?.total || 0;
    res.json({ followers, total });
  } catch (error) {
    console.error('[Followers]', error);
    res.status(500).json({ error: '获取粉丝列表失败' });
  }
});

// GET /api/marketplace/following - 我的关注
router.get('/following', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const following = await queryAll(`
      SELECT uf.following_id as user_id, uf.created_at as followed_at,
             cp.display_name, cp.avatar_url, cp.badge, cp.follower_count, u.email
      FROM user_follows uf
      LEFT JOIN creator_profiles cp ON uf.following_id = cp.user_id
      LEFT JOIN users u ON uf.following_id = u.id
      WHERE uf.follower_id = ? ORDER BY uf.created_at DESC LIMIT 50
    `, [userId]);
    const total = (await queryOne('SELECT following_count as total FROM creator_profiles WHERE user_id = ?', [userId]))?.total || 0;
    res.json({ following, total });
  } catch (error) {
    console.error('[Following]', error);
    res.status(500).json({ error: '获取关注列表失败' });
  }
});

// =============================================
// 卖家管理路由
// =============================================

// GET /api/marketplace/my-templates - 我发布的模板
router.get('/my-templates', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, status } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['t.seller_id = ?'];
    const params = [userId];
    if (status) { conditions.push('t.listing_status = ?'); params.push(status); }
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const templates = await queryAll(`
      SELECT id, name, description, recipe_type, thumbnail_url, preview_urls,
             price, is_free, listing_status, like_count, comment_count,
             purchase_count, total_revenue, listed_at, created_at
      FROM templates t ${whereClause}
      ORDER BY t.created_at DESC LIMIT ? OFFSET ?
    `, [...params, limitNum, offset]);

    const total = (await queryOne(`SELECT COUNT(*) as total FROM templates t ${whereClause}`, params))?.total || 0;

    templates.forEach(t => {
      if (t.preview_urls && typeof t.preview_urls === 'string') {
        try { t.preview_urls = JSON.parse(t.preview_urls); } catch(e) { t.preview_urls = []; }
      }
    });

    res.json({ templates, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } });
  } catch (error) {
    console.error('[My Templates]', error);
    res.status(500).json({ error: '获取我的模板失败' });
  }
});

// GET /api/marketplace/my-purchases - 我购买的配方
router.get('/my-purchases', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const purchases = await queryAll(`
      SELECT tp.id, tp.price, tp.seller_revenue, tp.created_at as purchased_at,
             t.id as template_id, t.name as template_name, t.recipe_type,
             t.thumbnail_url, t.recipe_data,
             cp.display_name as seller_name, cp.avatar_url as seller_avatar
      FROM template_purchases tp
      LEFT JOIN templates t ON tp.template_id = t.id
      LEFT JOIN creator_profiles cp ON tp.seller_id = cp.user_id
      WHERE tp.buyer_id = ?
      ORDER BY tp.created_at DESC LIMIT ? OFFSET ?
    `, [userId, limitNum, offset]);

    const total = (await queryOne('SELECT COUNT(*) as total FROM template_purchases WHERE buyer_id = ?', [userId]))?.total || 0;

    purchases.forEach(p => {
      if (p.recipe_data && typeof p.recipe_data === 'string') {
        try { p.recipe_data = JSON.parse(p.recipe_data); } catch(e) {}
      }
    });

    res.json({ purchases, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } });
  } catch (error) {
    console.error('[My Purchases]', error);
    res.status(500).json({ error: '获取购买记录失败' });
  }
});

// GET /api/marketplace/earnings - 收入统计
router.get('/earnings', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await queryOne(`
      SELECT COALESCE(SUM(seller_revenue), 0) as total_earnings,
             COUNT(*) as total_sales_count
      FROM template_purchases WHERE seller_id = ?
    `, [userId]);

    const recentSales = await queryAll(`
      SELECT tp.price, tp.seller_revenue, tp.created_at, t.name as template_name, u.email as buyer_email
      FROM template_purchases tp
      LEFT JOIN templates t ON tp.template_id = t.id
      LEFT JOIN users u ON tp.buyer_id = u.id
      WHERE tp.seller_id = ? ORDER BY tp.created_at DESC LIMIT 10
    `, [userId]);

    const templateStats = await queryAll(`
      SELECT id, name, recipe_type, price, is_free, purchase_count, total_revenue, like_count, listing_status
      FROM templates WHERE seller_id = ? ORDER BY total_revenue DESC
    `, [userId]);

    res.json({
      stats: { totalEarnings: stats?.total_earnings || 0, totalSalesCount: stats?.total_sales_count || 0 },
      recentSales,
      templateStats
    });
  } catch (error) {
    console.error('[Earnings]', error);
    res.status(500).json({ error: '获取收入统计失败' });
  }
});

// GET /api/marketplace/shop/:userId - 用户小店
router.get('/shop/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const creator = await queryOne(`
      SELECT cp.*, u.email FROM creator_profiles cp LEFT JOIN users u ON cp.user_id = u.id WHERE cp.user_id = ?
    `, [userId]);

    if (!creator) return res.status(404).json({ error: '用户不存在' });

    if (creator.social_links && typeof creator.social_links === 'string') {
      try { creator.social_links = JSON.parse(creator.social_links); } catch(e) { creator.social_links = {}; }
    }

    let isFollowing = false;
    const currentUserId = req.user?.id;
    if (currentUserId && currentUserId !== parseInt(userId, 10)) {
      const follow = await queryOne('SELECT id FROM user_follows WHERE follower_id = ? AND following_id = ?', [currentUserId, userId]);
      isFollowing = !!follow;
    }

    const total = (await queryOne(
      "SELECT COUNT(*) as total FROM templates WHERE seller_id = ? AND listing_status = 'listed' AND is_public = 1", [userId]
    ))?.total || 0;

    const templates = await queryAll(`
      SELECT id, name, description, recipe_type, thumbnail_url, preview_urls,
             price, is_free, like_count, comment_count, purchase_count, listed_at
      FROM templates WHERE seller_id = ? AND listing_status = 'listed' AND is_public = 1
      ORDER BY sort_score DESC, purchase_count DESC LIMIT ? OFFSET ?
    `, [userId, limitNum, offset]);

    templates.forEach(t => {
      if (t.preview_urls && typeof t.preview_urls === 'string') {
        try { t.preview_urls = JSON.parse(t.preview_urls); } catch(e) { t.preview_urls = []; }
      }
    });

    res.json({ creator, isFollowing, templates, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } });
  } catch (error) {
    console.error('[Shop]', error);
    res.status(500).json({ error: '获取小店信息失败' });
  }
});


module.exports = router;
