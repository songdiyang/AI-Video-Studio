/**
 * POST /api/scripts/generate
 * 生成剧本（使用工作流引擎）
 */

const { queryOne, execute } = require('../../dbHelper');
const { VISUAL_STYLE_PRESETS } = require('../../utils/getProjectStyle');
const { callAIModel } = require('../../aiModelService');
const { withAIBillingContext } = require('../../aiBillingContext');
const { generationStartService, sendGenerationError } = require('../../modules/generation');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');
const { encodeId } = require('../../utils/workflowId');

// editor 以上的角色可触发剧本生成
const WRITABLE_ROLES = new Set(['owner', 'admin', 'editor']);

/**
 * 自动为项目设置叙事风格（AI推荐）
 * 性能优化：精简prompt + 超时保护 + 默认值回退
 */
async function autoSuggestProjectStyle(projectId, projectName, projectDescription, userId) {
  console.log('[Auto Suggest Style] 项目未设置叙事风格，正在调用AI推荐...');
  
  const visualStyles = Object.keys(VISUAL_STYLE_PRESETS).join('、');
  // 优化：精简prompt，减少token消耗和响应时间
  const prompt = `根据项目信息推荐风格。
名称：${projectName || '未提供'}
描述：${projectDescription || '未提供'}
可选视觉风格：${visualStyles}
返回JSON：{"visualStyle":"","storyStyle":"","storyConstraints":""}
visualStyle从可选列表选，storyStyle如"热血少年漫",storyConstraints用一句话描述。只返回JSON。`;

  // 获取第一个可用的文本模型
  const textModel = await queryOne(
    "SELECT name FROM ai_model_configs WHERE category = 'TEXT' AND is_active = 1 ORDER BY id ASC LIMIT 1"
  );

  if (!textModel) {
    // 无可用模型时使用默认值
    console.log('[Auto Suggest Style] 无可用文本模型，使用默认风格');
    return saveDefaultStyle(projectId);
  }

  try {
    const result = await withAIBillingContext(
      {
        userId,
        projectId,
        sourceType: 'route',
        operationKey: 'project_auto_suggest_style',
        resourceRefs: { projectId }
      },
      () => callAIModel(textModel.name, {
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 256
      })
    );

    // 解析AI返回的JSON
    let suggestions = parseStyleSuggestions(result);
    return await saveStyleToProject(projectId, suggestions);
  } catch (error) {
    // AI调用失败时使用默认值
    console.error('[Auto Suggest Style] AI调用失败，使用默认风格:', error.message);
    return saveDefaultStyle(projectId);
  }
}

/**
 * 解析AI返回的风格建议
 */
function parseStyleSuggestions(result) {
  try {
    let content = result.content || result.text || result.message || '';
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      content = jsonMatch[1].trim();
    }
    // 尝试提取JSON对象
    const jsonObjMatch = content.match(/\{[\s\S]*\}/);
    if (jsonObjMatch) {
      content = jsonObjMatch[0];
    }
    return JSON.parse(content);
  } catch (parseError) {
    console.error('[Auto Suggest Style] JSON解析失败:', parseError);
    return {
      visualStyle: '日系动漫',
      storyStyle: '热血少年漫',
      storyConstraints: ''
    };
  }
}

/**
 * 保存默认风格到项目
 */
async function saveDefaultStyle(projectId) {
  const defaultSettings = {
    visualStyle: '日系动漫',
    visualStylePrompt: VISUAL_STYLE_PRESETS['日系动漫'] || '',
    storyStyle: '热血少年漫',
    storyConstraints: ''
  };
  await execute(
    'UPDATE projects SET settings_json = ? WHERE id = ?',
    [JSON.stringify(defaultSettings), projectId]
  );
  console.log('[Auto Suggest Style] 已设置默认风格:', defaultSettings);
  return defaultSettings;
}

/**
 * 保存风格建议到项目
 */
async function saveStyleToProject(projectId, suggestions) {
  // 验证 visualStyle 是否在预设列表中
  if (!VISUAL_STYLE_PRESETS[suggestions.visualStyle]) {
    suggestions.visualStyle = '日系动漫';
  }
  suggestions.visualStylePrompt = VISUAL_STYLE_PRESETS[suggestions.visualStyle] || '';

  const settingsObj = {
    visualStyle: suggestions.visualStyle,
    visualStylePrompt: suggestions.visualStylePrompt,
    storyStyle: suggestions.storyStyle || '热血少年漫',
    storyConstraints: suggestions.storyConstraints || ''
  };

  await execute(
    'UPDATE projects SET settings_json = ? WHERE id = ?',
    [JSON.stringify(settingsObj), projectId]
  );

  console.log('[Auto Suggest Style] 已自动设置项目风格:', settingsObj);
  return settingsObj;
}

async function generateScript(req, res) {
  const { projectId, title, description, style, length, episodeNumber, textModel } = req.body || {};
  const userId = req.user.id;

  // 验证 projectId
  if (!projectId) {
    return res.status(400).json({ message: '缺少项目ID' });
  }

  if (!textModel) {
    return res.status(400).json({ message: '缺少模型名称，请选择一个文本模型' });
  }

  // 确定集数（默认为下一集）
  let targetEpisode = episodeNumber;
  
  try {
    // 协作鉴权：owner / admin / editor 均可触发剧本生成
    const projectRole = await getEffectiveProjectRole(userId, projectId);
    if (!projectRole || !WRITABLE_ROLES.has(projectRole)) {
      return res.status(403).json({ message: '无权在该项目生成剧本' });
    }
  
    // === 性能优化：合并多个查询为一个联合查询 ===
    // 原先有 5 次独立查询，现在合并为 1 次
    const combinedQuery = await queryOne(`
      SELECT 
        p.id as project_id,
        p.name as project_name,
        p.description as project_description,
        p.settings_json,
        (SELECT MAX(episode_number) FROM scripts WHERE project_id = ?) as max_episode,
        (SELECT id FROM scripts WHERE project_id = ? AND episode_number = ? LIMIT 1) as existing_script_id,
        (SELECT status FROM scripts WHERE project_id = ? AND episode_number = ? LIMIT 1) as existing_script_status,
        (SELECT updated_at FROM scripts WHERE project_id = ? AND episode_number = ? LIMIT 1) as existing_script_updated_at
      FROM projects p
      WHERE p.id = ?
    `, [projectId, projectId, episodeNumber || 9999, projectId, episodeNumber || 9999, projectId, episodeNumber || 9999, projectId]);
  
    if (!combinedQuery || !combinedQuery.project_id) {
      return res.status(404).json({ message: '项目不存在' });
    }

    const project = {
      id: combinedQuery.project_id,
      name: combinedQuery.project_name,
      description: combinedQuery.project_description,
      settings_json: combinedQuery.settings_json
    };
    // 性能优化：直接从合并查询结果检查风格，避免额外查询
    let hasStoryStyle = false;
    if (combinedQuery.settings_json) {
      try {
        const settings = typeof combinedQuery.settings_json === 'string' 
          ? JSON.parse(combinedQuery.settings_json) 
          : combinedQuery.settings_json;
        hasStoryStyle = !!settings.storyStyle;
      } catch (e) {
        hasStoryStyle = false;
      }
    }

    // 检查项目是否设置了叙事风格，未设置则自动推荐
    if (!hasStoryStyle) {
      try {
        await autoSuggestProjectStyle(projectId, project.name, project.description, userId);
      } catch (suggestError) {
        console.error('[Generate Script] 自动设置叙事风格失败:', suggestError);
        // 性能优化：失败时使用默认值而不是报错
        await saveDefaultStyle(projectId);
      }
    }

    // 如果没有指定集数，自动计算下一集编号
    if (!targetEpisode) {
      targetEpisode = (combinedQuery.max_episode || 0) + 1;
    }

    // 检查该集是否已存在（使用合并查询的结果）
    let scriptId;
    if (combinedQuery.existing_script_id && combinedQuery.existing_script_status) {
      if (combinedQuery.existing_script_status === 'generating') {
        // 陈旧状态检测：若 generating 状态超过 10 分钟未更新，视为卡死的任务，允许重启
        const updatedAt = combinedQuery.existing_script_updated_at;
        const STALE_MINUTES = 10;
        const isStale = updatedAt && (Date.now() - new Date(updatedAt).getTime()) > STALE_MINUTES * 60 * 1000;
        if (!isStale) {
          return res.status(400).json({ message: `第${targetEpisode}集正在生成中，请稍候` });
        }
        console.warn(`[Generate Script] 检测到陈旧的 generating 状态（>${STALE_MINUTES}分钟），强制重置脚本 ID=${combinedQuery.existing_script_id}`);
        await execute(
          'UPDATE scripts SET status = ?, title = ?, content = \'\', updated_at = NOW() WHERE id = ?',
          ['generating', title || `第${targetEpisode}集`, combinedQuery.existing_script_id]
        );
        scriptId = combinedQuery.existing_script_id;
      } else if (combinedQuery.existing_script_status === 'draft' || combinedQuery.existing_script_status === 'failed') {
        // 草稿或生成失败状态，允许重新生成
        await execute(
          'UPDATE scripts SET status = ?, title = ?, updated_at = NOW() WHERE id = ?',
          ['generating', title || `第${targetEpisode}集`, combinedQuery.existing_script_id]
        );
        scriptId = combinedQuery.existing_script_id;
      } else if (combinedQuery.existing_script_status === 'completed') {
        // 已完成 → 允许用户重新生成（覆盖原有剧本）
        console.log(`[Generate Script] 第${targetEpisode}集已完成，用户要求重新生成，覆盖原有剧本`);
        await execute(
          'UPDATE scripts SET status = ?, title = ?, content = \'\', updated_at = NOW() WHERE id = ?',
          ['generating', title || `第${targetEpisode}集`, combinedQuery.existing_script_id]
        );
        scriptId = combinedQuery.existing_script_id;
      } else {
        return res.status(400).json({ message: `第${targetEpisode}集已存在（状态：${combinedQuery.existing_script_status}），请编辑或生成下一集` });
      }
    } else {
      // 创建生成中的剧本记录（标记为 AI 生成来源）
      const insertResult = await execute(
        'INSERT INTO scripts (user_id, project_id, episode_number, title, content, status, source_type) VALUES (?, ?, ?, ?, ?, ?, ?)', 
        [userId, projectId, targetEpisode, title || `第${targetEpisode}集`, '', 'generating', 'ai_generated']
      );
      scriptId = insertResult.insertId;
    }

    console.log('[Generate Script] 准备启动工作流:', {
      workflowType: 'script_only',
      userId,
      projectId,
      targetEpisode
    });
    
    const result = await generationStartService.start({
      operationKey: 'script_generate',
      rawInput: {
        projectId,
        title: title || `第${targetEpisode}集`,
        description: description || '',
        style: style || '电影感',
        length: length || '短篇',
        textModel,
        episodeNumber: targetEpisode
      },
      actor: { userId }
    });
    
    console.log('[Generate Script] 工作流创建成功:', result);
    
    const jobId = result.jobId;

    // 返回工作流信息（jobId 统一编码为 16 进制字符串，与 /api/workflows/:jobId 路由保持一致）
    res.json({
      jobId: encodeId(jobId),
      scriptId,
      episodeNumber: targetEpisode,
      title: title || `第${targetEpisode}集`,
      status: 'generating',
      message: `第${targetEpisode}集剧本生成已启动，请等待完成`
    });
  } catch (error) {
    sendGenerationError(res, error, '生成失败', '[Generate Script]');
  }
}

module.exports = generateScript;
