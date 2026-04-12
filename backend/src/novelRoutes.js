/**
 * 小说工作台 API 路由
 * 提供人物管理、场景管理、世界观管理、章节生成等功能
 */

const express = require('express');
const { queryOne, queryAll, execute } = require('./dbHelper');
const { authMiddleware } = require('./middleware');
const { withAIBillingContext } = require('./aiBillingContext');
const { callAIModel } = require('./aiModelService');

const router = express.Router();

// ========== 工具函数 ==========

/**
 * 检查用户是否有权限访问项目
 */
async function checkProjectAccess(userId, projectId) {
  const project = await queryOne(
    'SELECT * FROM projects WHERE id = ? AND (user_id = ? OR EXISTS (SELECT 1 FROM project_collaborators WHERE project_id = ? AND user_id = ?))',
    [projectId, userId, projectId, userId]
  );
  return !!project;
}

/**
 * 获取或创建小说项目配置
 */
async function getOrCreateNovelProject(projectId) {
  let novelProject = await queryOne('SELECT * FROM novel_projects WHERE project_id = ?', [projectId]);
  if (!novelProject) {
    const result = await execute(
      'INSERT INTO novel_projects (project_id) VALUES (?)',
      [projectId]
    );
    novelProject = await queryOne('SELECT * FROM novel_projects WHERE id = ?', [result.insertId]);
  }
  return novelProject;
}

// ========== 小说项目配置 API ==========

// 获取小说项目详情
router.get('/:projectId', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    const novelProject = await getOrCreateNovelProject(projectId);
    
    // 获取统计信息
    const chapterStats = await queryOne(
      'SELECT COUNT(*) as total_chapters, SUM(word_count) as total_words FROM novel_chapters WHERE project_id = ?',
      [projectId]
    );

    res.json({
      ...novelProject,
      stats: {
        total_chapters: chapterStats.total_chapters || 0,
        total_words: chapterStats.total_words || 0
      }
    });
  } catch (error) {
    console.error('[Novel] 获取项目详情失败:', error);
    res.status(500).json({ message: '获取项目详情失败' });
  }
});

// 更新小说项目配置
router.put('/:projectId', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;
    const { world_view, plot_summary, genre, target_word_count } = req.body;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    await getOrCreateNovelProject(projectId);

    await execute(
      `UPDATE novel_projects SET 
        world_view = ?, 
        plot_summary = ?, 
        genre = ?, 
        target_word_count = ? 
       WHERE project_id = ?`,
      [world_view, plot_summary, genre, target_word_count, projectId]
    );

    const updated = await queryOne('SELECT * FROM novel_projects WHERE project_id = ?', [projectId]);
    res.json(updated);
  } catch (error) {
    console.error('[Novel] 更新项目配置失败:', error);
    res.status(500).json({ message: '更新项目配置失败' });
  }
});

// AI生成世界观
router.post('/:projectId/worldview/generate', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;
    const { description, modelName } = req.body;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    // 获取项目基本信息
    const project = await queryOne('SELECT name, description FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }

    // 构建提示词
    const prompt = `你是一位专业的小说世界观设计师。请为以下小说设计一个详细的世界观。

小说名称：${project.name}
小说描述：${description || project.description || '暂无描述'}

请从以下几个方面设计世界观：
1. 时代背景（古代/现代/未来/架空等）
2. 地理环境（主要地域、气候特点）
3. 社会结构（政治体制、社会阶层）
4. 文化习俗（语言、宗教、节日）
5. 特殊设定（魔法系统、科技水平、超自然现象等）
6. 主要势力或组织

请以结构化的方式输出，便于后续使用。字数控制在800-1200字。`;

    // 获取默认文本模型
    const textModel = modelName || await queryOne(
      "SELECT name FROM ai_model_configs WHERE category = 'TEXT' AND is_active = 1 ORDER BY id ASC LIMIT 1"
    ).then(r => r?.name);

    if (!textModel) {
      return res.status(500).json({ message: '没有可用的文本模型' });
    }

    // 调用AI生成
    const result = await withAIBillingContext(
      {
        userId,
        projectId,
        sourceType: 'route',
        operationKey: 'novel_worldview_generate',
        resourceRefs: {}
      },
      () => callAIModel(textModel, {
        messages: [{ role: 'user', content: prompt }]
      })
    );

    const worldView = result.content || result;

    // 保存到数据库
    await getOrCreateNovelProject(projectId);
    await execute(
      'UPDATE novel_projects SET world_view = ? WHERE project_id = ?',
      [worldView, projectId]
    );

    res.json({ world_view: worldView });
  } catch (error) {
    console.error('[Novel] 生成世界观失败:', error);
    res.status(500).json({ message: '生成世界观失败: ' + error.message });
  }
});

// ========== 人物管理 API ==========

// 获取人物列表
router.get('/:projectId/characters', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    const characters = await queryAll(
      'SELECT * FROM novel_characters WHERE project_id = ? ORDER BY role_type, created_at',
      [projectId]
    );

    res.json({ characters });
  } catch (error) {
    console.error('[Novel] 获取人物列表失败:', error);
    res.status(500).json({ message: '获取人物列表失败' });
  }
});

// 创建人物
router.post('/:projectId/characters', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;
    const {
      name, gender, age, personality, weight,
      appearance_face, height, outfit, accessories,
      background_story, role_type
    } = req.body;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: '人物姓名不能为空' });
    }

    const result = await execute(
      `INSERT INTO novel_characters 
       (project_id, name, gender, age, personality, weight, 
        appearance_face, height, outfit, accessories, 
        background_story, role_type) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [projectId, name, gender, age, personality, weight,
       appearance_face, height, 
       JSON.stringify(outfit || {}), 
       JSON.stringify(accessories || {}),
       background_story, role_type]
    );

    const character = await queryOne('SELECT * FROM novel_characters WHERE id = ?', [result.insertId]);
    res.status(201).json(character);
  } catch (error) {
    console.error('[Novel] 创建人物失败:', error);
    res.status(500).json({ message: '创建人物失败' });
  }
});

// 获取人物详情
router.get('/:projectId/characters/:characterId', authMiddleware, async (req, res) => {
  try {
    const { projectId, characterId } = req.params;
    const userId = req.user.id;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    const character = await queryOne(
      'SELECT * FROM novel_characters WHERE id = ? AND project_id = ?',
      [characterId, projectId]
    );

    if (!character) {
      return res.status(404).json({ message: '人物不存在' });
    }

    res.json(character);
  } catch (error) {
    console.error('[Novel] 获取人物详情失败:', error);
    res.status(500).json({ message: '获取人物详情失败' });
  }
});

// 更新人物
router.put('/:projectId/characters/:characterId', authMiddleware, async (req, res) => {
  try {
    const { projectId, characterId } = req.params;
    const userId = req.user.id;
    const {
      name, gender, age, personality, weight,
      appearance_face, height, outfit, accessories,
      background_story, role_type
    } = req.body;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    const character = await queryOne(
      'SELECT * FROM novel_characters WHERE id = ? AND project_id = ?',
      [characterId, projectId]
    );

    if (!character) {
      return res.status(404).json({ message: '人物不存在' });
    }

    await execute(
      `UPDATE novel_characters SET 
        name = ?, gender = ?, age = ?, personality = ?, weight = ?,
        appearance_face = ?, height = ?, outfit = ?, accessories = ?,
        background_story = ?, role_type = ?
       WHERE id = ? AND project_id = ?`,
      [name, gender, age, personality, weight,
       appearance_face, height, 
       JSON.stringify(outfit || {}), 
       JSON.stringify(accessories || {}),
       background_story, role_type,
       characterId, projectId]
    );

    const updated = await queryOne('SELECT * FROM novel_characters WHERE id = ?', [characterId]);
    res.json(updated);
  } catch (error) {
    console.error('[Novel] 更新人物失败:', error);
    res.status(500).json({ message: '更新人物失败' });
  }
});

// 删除人物
router.delete('/:projectId/characters/:characterId', authMiddleware, async (req, res) => {
  try {
    const { projectId, characterId } = req.params;
    const userId = req.user.id;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    await execute(
      'DELETE FROM novel_characters WHERE id = ? AND project_id = ?',
      [characterId, projectId]
    );

    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('[Novel] 删除人物失败:', error);
    res.status(500).json({ message: '删除人物失败' });
  }
});

// ========== 场景管理 API ==========

// 获取场景列表
router.get('/:projectId/scenes', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    const scenes = await queryAll(
      'SELECT * FROM novel_scenes WHERE project_id = ? ORDER BY importance, created_at',
      [projectId]
    );

    res.json({ scenes });
  } catch (error) {
    console.error('[Novel] 获取场景列表失败:', error);
    res.status(500).json({ message: '获取场景列表失败' });
  }
});

// 创建场景
router.post('/:projectId/scenes', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;
    const {
      name, location, space_description, close_up_details,
      history, status, importance
    } = req.body;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: '场景名称不能为空' });
    }

    const result = await execute(
      `INSERT INTO novel_scenes 
       (project_id, name, location, space_description, close_up_details, 
        history, status, importance) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [projectId, name, location, space_description, 
       JSON.stringify(close_up_details || []),
       history, status, importance]
    );

    const scene = await queryOne('SELECT * FROM novel_scenes WHERE id = ?', [result.insertId]);
    res.status(201).json(scene);
  } catch (error) {
    console.error('[Novel] 创建场景失败:', error);
    res.status(500).json({ message: '创建场景失败' });
  }
});

// 获取场景详情
router.get('/:projectId/scenes/:sceneId', authMiddleware, async (req, res) => {
  try {
    const { projectId, sceneId } = req.params;
    const userId = req.user.id;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    const scene = await queryOne(
      'SELECT * FROM novel_scenes WHERE id = ? AND project_id = ?',
      [sceneId, projectId]
    );

    if (!scene) {
      return res.status(404).json({ message: '场景不存在' });
    }

    res.json(scene);
  } catch (error) {
    console.error('[Novel] 获取场景详情失败:', error);
    res.status(500).json({ message: '获取场景详情失败' });
  }
});

// 更新场景
router.put('/:projectId/scenes/:sceneId', authMiddleware, async (req, res) => {
  try {
    const { projectId, sceneId } = req.params;
    const userId = req.user.id;
    const {
      name, location, space_description, close_up_details,
      history, status, importance
    } = req.body;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    const scene = await queryOne(
      'SELECT * FROM novel_scenes WHERE id = ? AND project_id = ?',
      [sceneId, projectId]
    );

    if (!scene) {
      return res.status(404).json({ message: '场景不存在' });
    }

    await execute(
      `UPDATE novel_scenes SET 
        name = ?, location = ?, space_description = ?, close_up_details = ?,
        history = ?, status = ?, importance = ?
       WHERE id = ? AND project_id = ?`,
      [name, location, space_description, 
       JSON.stringify(close_up_details || []),
       history, status, importance,
       sceneId, projectId]
    );

    const updated = await queryOne('SELECT * FROM novel_scenes WHERE id = ?', [sceneId]);
    res.json(updated);
  } catch (error) {
    console.error('[Novel] 更新场景失败:', error);
    res.status(500).json({ message: '更新场景失败' });
  }
});

// 删除场景
router.delete('/:projectId/scenes/:sceneId', authMiddleware, async (req, res) => {
  try {
    const { projectId, sceneId } = req.params;
    const userId = req.user.id;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    await execute(
      'DELETE FROM novel_scenes WHERE id = ? AND project_id = ?',
      [sceneId, projectId]
    );

    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('[Novel] 删除场景失败:', error);
    res.status(500).json({ message: '删除场景失败' });
  }
});

// ========== 章节生成 API ==========

// 触发章节生成任务
router.post('/:projectId/chapters/:chapterId/generate', authMiddleware, async (req, res) => {
  try {
    const { projectId, chapterId } = req.params;
    const userId = req.user.id;
    const { modelName, generationType = 'full' } = req.body;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    // 检查章节是否存在
    const chapter = await queryOne(
      'SELECT * FROM novel_chapters WHERE id = ? AND project_id = ?',
      [chapterId, projectId]
    );

    if (!chapter) {
      return res.status(404).json({ message: '章节不存在' });
    }

    // 获取项目配置
    const novelProject = await getOrCreateNovelProject(projectId);

    // 获取人物列表
    const characters = await queryAll(
      'SELECT * FROM novel_characters WHERE project_id = ?',
      [projectId]
    );

    // 获取场景列表
    const scenes = await queryAll(
      'SELECT * FROM novel_scenes WHERE project_id = ?',
      [projectId]
    );

    // 获取前3章的剧情简述
    const prevChapters = await queryAll(
      `SELECT summary, title, chapter_number 
       FROM novel_chapters 
       WHERE project_id = ? AND chapter_number < ? AND summary IS NOT NULL
       ORDER BY chapter_number DESC 
       LIMIT 3`,
      [projectId, chapter.chapter_number]
    );

    // 创建异步任务（通过 nosyntask 系统）
    const { createTask } = require('./nosyntask/taskManager');
    
    const task = await createTask({
      taskType: 'novel_chapter_generation',
      projectId,
      userId,
      params: {
        chapterId,
        projectId,
        chapterNumber: chapter.chapter_number,
        chapterTitle: chapter.title,
        generationType,
        modelName,
        worldView: novelProject.world_view,
        plotSummary: novelProject.plot_summary,
        characters: characters.map(c => ({
          id: c.id,
          name: c.name,
          gender: c.gender,
          age: c.age,
          personality: c.personality,
          appearance: c.appearance_face,
          background: c.background_story,
          roleType: c.role_type
        })),
        scenes: scenes.map(s => ({
          id: s.id,
          name: s.name,
          location: s.location,
          description: s.space_description,
          history: s.history
        })),
        prevSummaries: prevChapters.map(c => ({
          chapterNumber: c.chapter_number,
          title: c.title,
          summary: c.summary
        }))
      }
    });

    res.json({
      message: '章节生成任务已创建',
      taskId: task.id,
      status: task.status
    });
  } catch (error) {
    console.error('[Novel] 创建章节生成任务失败:', error);
    res.status(500).json({ message: '创建章节生成任务失败: ' + error.message });
  }
});

// 获取章节生成历史
router.get('/:projectId/chapters/:chapterId/generations', authMiddleware, async (req, res) => {
  try {
    const { projectId, chapterId } = req.params;
    const userId = req.user.id;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    const generations = await queryAll(
      `SELECT * FROM novel_chapter_generations 
       WHERE chapter_id = ? AND project_id = ? 
       ORDER BY created_at DESC`,
      [chapterId, projectId]
    );

    res.json({ generations });
  } catch (error) {
    console.error('[Novel] 获取生成历史失败:', error);
    res.status(500).json({ message: '获取生成历史失败' });
  }
});

// 获取小说完整数据（用于AI生成）
router.get('/:projectId/context', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    if (!await checkProjectAccess(userId, projectId)) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    // 并行获取所有相关数据
    const [novelProject, characters, scenes, chapters] = await Promise.all([
      getOrCreateNovelProject(projectId),
      queryAll('SELECT * FROM novel_characters WHERE project_id = ?', [projectId]),
      queryAll('SELECT * FROM novel_scenes WHERE project_id = ?', [projectId]),
      queryAll(
        'SELECT id, chapter_number, title, summary FROM novel_chapters WHERE project_id = ? ORDER BY chapter_number',
        [projectId]
      )
    ]);

    res.json({
      project: novelProject,
      characters,
      scenes,
      chapters: chapters.map(c => ({
        id: c.id,
        chapterNumber: c.chapter_number,
        title: c.title,
        summary: c.summary
      }))
    });
  } catch (error) {
    console.error('[Novel] 获取小说上下文失败:', error);
    res.status(500).json({ message: '获取小说上下文失败' });
  }
});

module.exports = router;
