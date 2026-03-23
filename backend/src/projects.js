const express = require('express');
const { queryOne, queryAll, execute } = require('./dbHelper');
const { authMiddleware } = require('./middleware');
const { VISUAL_STYLE_PRESETS } = require('./utils/getProjectStyle');
const { callAIModel } = require('./aiModelService');
const { withAIBillingContext } = require('./aiBillingContext');
const { getEffectiveProjectRole, PERMISSION_LEVELS } = require('./middleware/collaborationAuth');

const router = express.Router();

// 获取视觉风格预设列表
router.get('/style-presets', authMiddleware, (req, res) => {
  const presets = Object.entries(VISUAL_STYLE_PRESETS).map(([label, prompt]) => ({ label, prompt }));
  res.json({ presets });
});

// AI 智能推荐项目设置
router.post('/suggest-settings', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { name, description } = req.body;

  if (!name && !description) {
    return res.status(400).json({ message: '请提供项目名称或描述' });
  }

  try {
    // 构建提示词
    const visualStyles = Object.keys(VISUAL_STYLE_PRESETS).join('、');
    const prompt = `你是一个专业的动漫/影视项目顾问。请根据以下项目信息，推荐最合适的风格设置。

项目名称：${name || '未提供'}
项目描述：${description || '未提供'}

可选的视觉风格：${visualStyles}

请以JSON格式返回推荐结果，格式如下：
{
  "visualStyle": "推荐的视觉风格（必须从可选列表中选择一个）",
  "storyStyle": "推荐的叙事风格（如：热血少年漫、悬疑推理、浪漫爱情、温馨日常、奇幻冒险等）",
  "storyConstraints": "推荐的剧本约束（如：不要魔法元素、现代都市背景、避免暴力描写等，用简短的一句话描述）"
}

注意：
1. visualStyle 必须严格从可选列表中选择
2. storyStyle 和 storyConstraints 要根据项目名称和描述的语义来推断
3. 只返回JSON，不要有其他文字说明`;

    // 调用AI模型（使用第一个可用的文本模型）
    const textModel = await queryOne(
      "SELECT name FROM ai_model_configs WHERE category = 'TEXT' AND is_active = 1 ORDER BY id ASC LIMIT 1"
    );

    if (!textModel) {
      return res.status(500).json({ message: '没有可用的文本模型' });
    }

    const result = await withAIBillingContext(
      {
        userId,
        projectId: null,
        sourceType: 'route',
        operationKey: 'project_suggest_settings',
        resourceRefs: {}
      },
      () => callAIModel(textModel.name, {
        messages: [{ role: 'user', content: prompt }]
      })
    );

    // 解析AI返回的JSON
    let suggestions;
    try {
      // 尝试从返回内容中提取JSON
      let content = result.content || result.text || result.message || '';
      
      // 如果内容包含markdown代码块，提取其中的JSON
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        content = jsonMatch[1].trim();
      }
      
      suggestions = JSON.parse(content);
    } catch (parseError) {
      console.error('[Suggest Settings] JSON解析失败:', parseError);
      // 返回默认推荐
      suggestions = {
        visualStyle: '日系动漫',
        storyStyle: '热血少年漫',
        storyConstraints: ''
      };
    }

    // 验证 visualStyle 是否在预设列表中
    if (!VISUAL_STYLE_PRESETS[suggestions.visualStyle]) {
      suggestions.visualStyle = '日系动漫';
    }

    // 添加对应的 visualStylePrompt
    suggestions.visualStylePrompt = VISUAL_STYLE_PRESETS[suggestions.visualStyle] || '';

    res.json({ suggestions });
  } catch (error) {
    console.error('[Suggest Settings]', error);
    res.status(error.status || 500).json({ message: error.message || 'AI推荐失败，请稍后重试' });
  }
});

// 获取所有工程（包含协作项目和团队项目）
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    // 1. 获取用户自己的项目
    const ownProjects = await queryAll(
      `SELECT p.*, 'owner' as my_role, u.email as owner_username
       FROM projects p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = ?`,
      [userId]
    );

    // 2. 获取用户作为协作者的项目
    const collaboratedProjects = await queryAll(
      `SELECT p.*, pc.role as my_role, u.email as owner_username
       FROM projects p
       JOIN project_collaborators pc ON p.id = pc.project_id AND pc.user_id = ?
       JOIN users u ON p.user_id = u.id`,
      [userId]
    );

    // 3. 获取用户团队的项目（排除已在上述列表中的）
    const teamProjects = await queryAll(
      `SELECT p.*, tm.role as my_role, u.email as owner_username, t.name as team_name
       FROM projects p
       JOIN teams t ON p.team_id = t.id AND t.is_active = 1
       JOIN team_members tm ON t.id = tm.team_id AND tm.user_id = ?
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id != ?
         AND p.id NOT IN (
           SELECT project_id FROM project_collaborators WHERE user_id = ?
         )`,
      [userId, userId, userId]
    );

    // 合并并标记来源
    const allProjects = [
      ...ownProjects.map(p => ({ ...p, source: 'own' })),
      ...collaboratedProjects.map(p => ({ ...p, source: 'collaboration' })),
      ...teamProjects.map(p => ({ ...p, source: 'team' }))
    ];

    // 按更新时间排序
    allProjects.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    res.json({ projects: allProjects });
  } catch (error) {
    console.error('[Projects List]', error.message, error.stack);
    res.status(500).json({ message: '获取工程列表失败', error: error.message });
  }
});

// 获取单个工程（支持协作访问）
router.get('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    // 检查用户对项目的权限
    const userRole = await getEffectiveProjectRole(userId, id);

    if (!userRole) {
      return res.status(403).json({ message: '您没有访问该项目的权限' });
    }

    const project = await queryOne(
      `SELECT p.*, u.email as owner_username, t.name as team_name
       FROM projects p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN teams t ON p.team_id = t.id
       WHERE p.id = ?`,
      [id]
    );

    if (!project) {
      return res.status(404).json({ message: '工程不存在' });
    }

    res.json({ ...project, my_role: userRole });
  } catch (error) {
    console.error('[Project Detail]', error);
    res.status(500).json({ message: '获取工程失败' });
  }
});

// 创建工程（支持指定团队）
router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { name, description, cover_url, type, status, settings_json, team_id } = req.body;

  if (!name) {
    return res.status(400).json({ message: '工程名称不能为空' });
  }

  try {
    // 如果指定了团队，检查用户是否有权限
    if (team_id) {
      const { getTeamRole } = require('./middleware/collaborationAuth');
      const teamRole = await getTeamRole(userId, team_id);
      if (!teamRole || PERMISSION_LEVELS[teamRole] < PERMISSION_LEVELS['editor']) {
        return res.status(403).json({ message: '您没有在该团队创建项目的权限' });
      }
    }

    const result = await execute(
      `INSERT INTO projects (user_id, team_id, name, description, cover_url, type, status, settings_json) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, team_id || null, name, description || '', cover_url || '', type || 'comic', status || 'draft', settings_json || '{}']
    );

    const id = result.insertId;
    const project = await queryOne('SELECT * FROM projects WHERE id = ?', [id]);

    res.json({ message: '工程创建成功', project });
  } catch (error) {
    console.error('[Project Create]', error);
    res.status(500).json({ message: '创建工程失败' });
  }
});

// 更新工程（支持协作者编辑）
router.put('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { name, description, cover_url, type, status, settings_json, team_id } = req.body;

  try {
    // 检查用户权限（需要 editor 以上）
    const userRole = await getEffectiveProjectRole(userId, id);
    if (!userRole || PERMISSION_LEVELS[userRole] < PERMISSION_LEVELS['editor']) {
      return res.status(403).json({ message: '您没有编辑该项目的权限' });
    }

    const existing = await queryOne('SELECT * FROM projects WHERE id = ?', [id]);

    if (!existing) {
      return res.status(404).json({ message: '工程不存在' });
    }

    // 修改团队归属需要 owner 权限
    let newTeamId = existing.team_id;
    if (team_id !== undefined && team_id !== existing.team_id) {
      if (userRole !== 'owner') {
        return res.status(403).json({ message: '只有项目所有者可以修改团队归属' });
      }
      newTeamId = team_id;
    }

    await execute(
      `UPDATE projects 
       SET name = ?, description = ?, cover_url = ?, type = ?, status = ?, settings_json = ?, team_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name || existing.name,
        description !== undefined ? description : existing.description,
        cover_url !== undefined ? cover_url : existing.cover_url,
        type || existing.type,
        status || existing.status,
        settings_json !== undefined ? settings_json : existing.settings_json,
        newTeamId,
        id
      ]
    );

    const project = await queryOne('SELECT * FROM projects WHERE id = ?', [id]);

    res.json({ message: '工程更新成功', project });
  } catch (error) {
    console.error('[Project Update]', error);
    res.status(500).json({ message: '更新工程失败' });
  }
});

// 获取项目的 AI 模型选择
router.get('/:id/models', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const project = await queryOne(
      'SELECT use_models FROM projects WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!project) {
      return res.status(404).json({ message: '工程不存在' });
    }

    let useModels = {};
    try {
      useModels = typeof project.use_models === 'string'
        ? JSON.parse(project.use_models)
        : project.use_models || {};
    } catch (e) {
      useModels = {};
    }

    res.json({ useModels });
  } catch (error) {
    console.error('[Project Models Get]', error);
    res.status(500).json({ message: '获取模型配置失败' });
  }
});

// 更新项目的 AI 模型选择
router.put('/:id/models', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { useModels } = req.body;

  try {
    const existing = await queryOne(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!existing) {
      return res.status(404).json({ message: '工程不存在' });
    }

    await execute(
      'UPDATE projects SET use_models = ? WHERE id = ? AND user_id = ?',
      [JSON.stringify(useModels || {}), id, userId]
    );

    res.json({ message: '模型配置已保存', useModels });
  } catch (error) {
    console.error('[Project Models Update]', error);
    res.status(500).json({ message: '保存模型配置失败' });
  }
});

// ==================== 小说相关 API ====================

// 获取小说大纲列表
router.get('/:id/novel/outlines', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    // 检查用户权限
    const userRole = await getEffectiveProjectRole(userId, id);
    if (!userRole) {
      return res.status(403).json({ message: '您没有访问该项目的权限' });
    }

    // 检查项目是否存在且类型为小说
    const project = await queryOne('SELECT * FROM projects WHERE id = ?', [id]);
    if (!project) {
      return res.status(404).json({ message: '工程不存在' });
    }

    // 获取大纲列表
    const outlines = await queryAll(
      `SELECT * FROM novel_outlines 
       WHERE project_id = ? 
       ORDER BY created_at DESC`,
      [id]
    );

    res.json({ outlines });
  } catch (error) {
    console.error('[Novel Outlines Get]', error);
    res.status(500).json({ message: '获取大纲列表失败' });
  }
});

// 创建/更新小说大纲
router.post('/:id/novel/outlines', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { title, content, structure } = req.body;

  try {
    // 检查用户权限（需要 editor 以上）
    const userRole = await getEffectiveProjectRole(userId, id);
    if (!userRole || PERMISSION_LEVELS[userRole] < PERMISSION_LEVELS['editor']) {
      return res.status(403).json({ message: '您没有编辑该项目的权限' });
    }

    const result = await execute(
      `INSERT INTO novel_outlines (project_id, title, content, structure) 
       VALUES (?, ?, ?, ?)`,
      [id, title || '未命名大纲', content || '', JSON.stringify(structure || {})]
    );

    const outline = await queryOne('SELECT * FROM novel_outlines WHERE id = ?', [result.insertId]);
    res.json({ message: '大纲创建成功', outline });
  } catch (error) {
    console.error('[Novel Outline Create]', error);
    res.status(500).json({ message: '创建大纲失败' });
  }
});

// 更新小说大纲
router.put('/:id/novel/outlines/:outlineId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id, outlineId } = req.params;
  const { title, content, structure } = req.body;

  try {
    // 检查用户权限（需要 editor 以上）
    const userRole = await getEffectiveProjectRole(userId, id);
    if (!userRole || PERMISSION_LEVELS[userRole] < PERMISSION_LEVELS['editor']) {
      return res.status(403).json({ message: '您没有编辑该项目的权限' });
    }

    await execute(
      `UPDATE novel_outlines 
       SET title = ?, content = ?, structure = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND project_id = ?`,
      [title, content, JSON.stringify(structure || {}), outlineId, id]
    );

    const outline = await queryOne('SELECT * FROM novel_outlines WHERE id = ?', [outlineId]);
    res.json({ message: '大纲更新成功', outline });
  } catch (error) {
    console.error('[Novel Outline Update]', error);
    res.status(500).json({ message: '更新大纲失败' });
  }
});

// 删除小说大纲
router.delete('/:id/novel/outlines/:outlineId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id, outlineId } = req.params;

  try {
    // 检查用户权限（需要 editor 以上）
    const userRole = await getEffectiveProjectRole(userId, id);
    if (!userRole || PERMISSION_LEVELS[userRole] < PERMISSION_LEVELS['editor']) {
      return res.status(403).json({ message: '您没有编辑该项目的权限' });
    }

    await execute('DELETE FROM novel_outlines WHERE id = ? AND project_id = ?', [outlineId, id]);
    res.json({ message: '大纲删除成功' });
  } catch (error) {
    console.error('[Novel Outline Delete]', error);
    res.status(500).json({ message: '删除大纲失败' });
  }
});

// AI 生成小说大纲
router.post('/:id/novel/outlines/generate', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { prompt, genre, tone } = req.body;

  try {
    // 检查用户权限（需要 editor 以上）
    const userRole = await getEffectiveProjectRole(userId, id);
    if (!userRole || PERMISSION_LEVELS[userRole] < PERMISSION_LEVELS['editor']) {
      return res.status(403).json({ message: '您没有编辑该项目的权限' });
    }

    // 获取项目信息
    const project = await queryOne('SELECT * FROM projects WHERE id = ?', [id]);
    if (!project) {
      return res.status(404).json({ message: '工程不存在' });
    }

    // 获取可用的文本模型
    const textModel = await queryOne(
      "SELECT name FROM ai_model_configs WHERE category = 'TEXT' AND is_active = 1 ORDER BY id ASC LIMIT 1"
    );

    if (!textModel) {
      return res.status(500).json({ message: '没有可用的文本模型' });
    }

    // 构建生成提示词
    const aiPrompt = `请为以下小说项目生成一个详细的大纲：

项目名称：${project.name}
项目描述：${project.description || '暂无描述'}
${genre ? `类型：${genre}` : ''}
${tone ? `风格：${tone}` : ''}
${prompt ? `额外要求：${prompt}` : ''}

请生成一个包含以下内容的JSON格式大纲：
{
  "title": "大纲标题",
  "content": "大纲详细内容",
  "structure": {
    "acts": [
      {
        "name": "第一幕/第二幕等",
        "summary": "该幕的主要内容",
        "chapters": ["章节1", "章节2"]
      }
    ]
  }
}

只返回JSON，不要有其他文字说明。`;

    // 调用AI模型
    const result = await withAIBillingContext(
      {
        userId,
        projectId: id,
        sourceType: 'route',
        operationKey: 'novel_outline_generate',
        resourceRefs: {}
      },
      () => callAIModel(textModel.name, {
        messages: [{ role: 'user', content: aiPrompt }]
      })
    );

    // 解析AI返回的JSON
    let generatedOutline;
    try {
      let content = result.content || result.text || result.message || '';
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        content = jsonMatch[1].trim();
      }
      generatedOutline = JSON.parse(content);
    } catch (parseError) {
      console.error('[Novel Outline Generate] JSON解析失败:', parseError);
      return res.status(500).json({ message: 'AI生成结果解析失败' });
    }

    // 保存生成的大纲
    const saveResult = await execute(
      `INSERT INTO novel_outlines (project_id, title, content, structure, is_ai_generated) 
       VALUES (?, ?, ?, ?, ?)`,
      [id, generatedOutline.title || 'AI生成大纲', generatedOutline.content || '', JSON.stringify(generatedOutline.structure || {}), 1]
    );

    const outline = await queryOne('SELECT * FROM novel_outlines WHERE id = ?', [saveResult.insertId]);
    res.json({ message: '大纲生成成功', outline });
  } catch (error) {
    console.error('[Novel Outline Generate]', error);
    res.status(500).json({ message: '生成大纲失败' });
  }
});

// 获取小说章节列表
router.get('/:id/novel/chapters', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    // 检查用户权限
    const userRole = await getEffectiveProjectRole(userId, id);
    if (!userRole) {
      return res.status(403).json({ message: '您没有访问该项目的权限' });
    }

    // 获取章节列表
    const chapters = await queryAll(
      `SELECT * FROM novel_chapters 
       WHERE project_id = ? 
       ORDER BY chapter_number ASC`,
      [id]
    );

    res.json({ chapters });
  } catch (error) {
    console.error('[Novel Chapters Get]', error);
    res.status(500).json({ message: '获取章节列表失败' });
  }
});

// 创建小说章节
router.post('/:id/novel/chapters', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { title, content, chapter_number, outline_id } = req.body;

  try {
    // 检查用户权限（需要 editor 以上）
    const userRole = await getEffectiveProjectRole(userId, id);
    if (!userRole || PERMISSION_LEVELS[userRole] < PERMISSION_LEVELS['editor']) {
      return res.status(403).json({ message: '您没有编辑该项目的权限' });
    }

    // 如果没有指定章节号，自动获取下一个
    let chapterNum = chapter_number;
    if (!chapterNum) {
      const lastChapter = await queryOne(
        'SELECT MAX(chapter_number) as max_num FROM novel_chapters WHERE project_id = ?',
        [id]
      );
      chapterNum = (lastChapter?.max_num || 0) + 1;
    }

    const result = await execute(
      `INSERT INTO novel_chapters (project_id, outline_id, chapter_number, title, content) 
       VALUES (?, ?, ?, ?, ?)`,
      [id, outline_id || null, chapterNum, title || `第${chapterNum}章`, content || '']
    );

    const chapter = await queryOne('SELECT * FROM novel_chapters WHERE id = ?', [result.insertId]);
    res.json({ message: '章节创建成功', chapter });
  } catch (error) {
    console.error('[Novel Chapter Create]', error);
    res.status(500).json({ message: '创建章节失败' });
  }
});

// 更新小说章节
router.put('/:id/novel/chapters/:chapterId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id, chapterId } = req.params;
  const { title, content, chapter_number, status, word_count } = req.body;

  try {
    // 检查用户权限（需要 editor 以上）
    const userRole = await getEffectiveProjectRole(userId, id);
    if (!userRole || PERMISSION_LEVELS[userRole] < PERMISSION_LEVELS['editor']) {
      return res.status(403).json({ message: '您没有编辑该项目的权限' });
    }

    await execute(
      `UPDATE novel_chapters 
       SET title = ?, content = ?, chapter_number = ?, status = ?, word_count = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND project_id = ?`,
      [title, content, chapter_number, status || 'draft', word_count || 0, chapterId, id]
    );

    const chapter = await queryOne('SELECT * FROM novel_chapters WHERE id = ?', [chapterId]);
    res.json({ message: '章节更新成功', chapter });
  } catch (error) {
    console.error('[Novel Chapter Update]', error);
    res.status(500).json({ message: '更新章节失败' });
  }
});

// 删除小说章节
router.delete('/:id/novel/chapters/:chapterId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id, chapterId } = req.params;

  try {
    // 检查用户权限（需要 editor 以上）
    const userRole = await getEffectiveProjectRole(userId, id);
    if (!userRole || PERMISSION_LEVELS[userRole] < PERMISSION_LEVELS['editor']) {
      return res.status(403).json({ message: '您没有编辑该项目的权限' });
    }

    await execute('DELETE FROM novel_chapters WHERE id = ? AND project_id = ?', [chapterId, id]);
    res.json({ message: '章节删除成功' });
  } catch (error) {
    console.error('[Novel Chapter Delete]', error);
    res.status(500).json({ message: '删除章节失败' });
  }
});

// 删除工程（仅所有者）
router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    // 检查用户权限（需要 owner）
    const userRole = await getEffectiveProjectRole(userId, id);
    if (userRole !== 'owner') {
      return res.status(403).json({ message: '只有项目所有者可以删除项目' });
    }

    const existing = await queryOne('SELECT * FROM projects WHERE id = ?', [id]);

    if (!existing) {
      return res.status(404).json({ message: '工程不存在' });
    }

    // 手动级联删除关联数据（按照依赖关系顺序删除）
    // 1. 删除 sketch_history（通过 storyboards 关联）
    await execute(`
      DELETE sh FROM sketch_history sh
      INNER JOIN storyboards sb ON sh.storyboard_id = sb.id
      WHERE sb.project_id = ?
    `, [id]);

    // 2. 删除 storyboard_characters 和 storyboard_scenes（通过 storyboards 关联）
    await execute(`
      DELETE sbc FROM storyboard_characters sbc
      INNER JOIN storyboards sb ON sbc.storyboard_id = sb.id
      WHERE sb.project_id = ?
    `, [id]);

    await execute(`
      DELETE sbs FROM storyboard_scenes sbs
      INNER JOIN storyboards sb ON sbs.storyboard_id = sb.id
      WHERE sb.project_id = ?
    `, [id]);

    // 3. 删除 generation_tasks
    await execute('DELETE FROM generation_tasks WHERE project_id = ?', [id]);

    // 4. 删除 workflow_jobs
    await execute('DELETE FROM workflow_jobs WHERE project_id = ?', [id]);

    // 5. 删除 storyboards
    await execute('DELETE FROM storyboards WHERE project_id = ?', [id]);

    // 6. 删除 characters
    await execute('DELETE FROM characters WHERE project_id = ?', [id]);

    // 7. 删除 scenes
    await execute('DELETE FROM scenes WHERE project_id = ?', [id]);

    // 8. 删除 props
    await execute('DELETE FROM props WHERE project_id = ?', [id]);

    // 9. 删除 scripts
    await execute('DELETE FROM scripts WHERE project_id = ?', [id]);

    // 10. 删除 project_collaborators
    await execute('DELETE FROM project_collaborators WHERE project_id = ?', [id]);

    // 11. 删除 showcases（作品展示）
    await execute('DELETE FROM showcases WHERE project_id = ?', [id]);

    // 12. 删除小说相关数据
    await execute('DELETE FROM novel_chapters WHERE project_id = ?', [id]);
    await execute('DELETE FROM novel_outlines WHERE project_id = ?', [id]);

    // 13. 最后删除项目本身
    await execute('DELETE FROM projects WHERE id = ?', [id]);

    res.json({ message: '工程删除成功' });
  } catch (error) {
    console.error('[Project Delete]', error);
    res.status(500).json({ message: '删除工程失败: ' + error.message });
  }
});

module.exports = router;
