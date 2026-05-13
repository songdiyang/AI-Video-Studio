/**
 * POST /api/scripts/optimize
 * 基于用户指令对剧本进行AI优化/改写
 */

const { queryOne, execute } = require('../../dbHelper');
const { callAIModel } = require('../../aiModelService');
const { withAIBillingContext } = require('../../aiBillingContext');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');

const WRITABLE_ROLES = new Set(['owner', 'admin', 'editor']);

async function optimizeScript(req, res) {
  const { scriptId, content: directContent, instruction, textModel: modelName, saveMode = 'new' } = req.body || {};
  const userId = req.user.id;

  if (!instruction || !instruction.trim()) {
    return res.status(400).json({ message: '请提供优化指令' });
  }

  let content = directContent;
  let scriptTitle = '未命名剧本';
  let targetProjectId = null;
  let targetEpisode = 1;
  let originalScriptId = scriptId;

  try {
    // 如果传了 scriptId，从数据库读取
    if (scriptId) {
      const script = await queryOne(
        'SELECT id, user_id, project_id, title, content, episode_number FROM scripts WHERE id = ?',
        [scriptId]
      );
      if (!script) {
        return res.status(404).json({ message: '剧本不存在' });
      }

      // 鉴权
      if (script.user_id !== userId) {
        const role = script.project_id
          ? await getEffectiveProjectRole(userId, script.project_id)
          : null;
        if (!role || !WRITABLE_ROLES.has(role)) {
          return res.status(403).json({ message: '无权优化该剧本' });
        }
      }

      content = script.content;
      scriptTitle = script.title || '未命名剧本';
      targetProjectId = script.project_id;
      targetEpisode = script.episode_number || 1;
      originalScriptId = script.id;
    }

    // 剧本内容允许为空，为空时返回友好提示
    if (!content || !content.trim()) {
      return res.json({
        success: true,
        originalScriptId,
        savedScriptId: null,
        projectId: targetProjectId,
        episodeNumber: targetEpisode,
        title: `${scriptTitle}（优化版）`,
        originalContent: '',
        optimizedContent: '',
        changes: ['剧本内容为空，无需优化'],
        tokensUsed: 0,
        model: effectiveModel,
        instruction,
        saveMode,
        message: '剧本内容为空，无需优化'
      });
    }

    // 内容截断（避免prompt过长，保留前10000字）
    const maxContentLength = 10000;
    const truncatedContent = content.length > maxContentLength
      ? content.slice(0, maxContentLength) + '\n\n...（内容已截断，仅优化前10000字）'
      : content;

    // 获取文本模型
    let effectiveModel = modelName;
    if (!effectiveModel) {
      const model = await queryOne(
        "SELECT name FROM ai_model_configs WHERE category = 'TEXT' AND is_active = 1 ORDER BY id ASC LIMIT 1"
      );
      if (!model) {
        return res.status(500).json({ message: '无可用文本模型' });
      }
      effectiveModel = model.name;
    }

    // 调用AI优化
    const optimized = await performOptimization(truncatedContent, scriptTitle, instruction, effectiveModel);

    // 根据 saveMode 处理保存逻辑
    let savedScriptId = null;
    if (saveMode === 'overwrite' && originalScriptId) {
      // 覆盖原剧本
      await execute(
        'UPDATE scripts SET content = ?, model_provider = ?, token_used = token_used + ?, updated_at = NOW() WHERE id = ?',
        [optimized.content, effectiveModel, optimized.tokens || 0, originalScriptId]
      );
      savedScriptId = originalScriptId;
    } else if (saveMode === 'new' && targetProjectId) {
      // 保存为新版本（下一集）
      const lastEpisode = await queryOne(
        'SELECT MAX(episode_number) as max_ep FROM scripts WHERE project_id = ?',
        [targetProjectId]
      );
      const newEpisode = (lastEpisode?.max_ep || 0) + 1;

      const result = await execute(
        'INSERT INTO scripts (user_id, project_id, episode_number, title, content, status, model_provider, token_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, targetProjectId, newEpisode, `${scriptTitle}（优化版）`, optimized.content, 'completed', effectiveModel, optimized.tokens || 0]
      );
      savedScriptId = result.insertId;
      targetEpisode = newEpisode;
    }

    res.json({
      success: true,
      originalScriptId,
      savedScriptId,
      projectId: targetProjectId,
      episodeNumber: targetEpisode,
      title: `${scriptTitle}（优化版）`,
      originalContent: content,
      optimizedContent: optimized.content,
      changes: optimized.changes,
      tokensUsed: optimized.tokens,
      model: effectiveModel,
      instruction,
      saveMode,
      message: saveMode === 'overwrite' ? '剧本已更新' : '优化版本已保存'
    });
  } catch (error) {
    console.error('[Optimize Script]', error);
    res.status(500).json({ message: '优化失败：' + error.message });
  }
}

/**
 * 执行AI优化
 */
async function performOptimization(content, title, instruction, modelName) {
  const prompt = `你是一位专业剧本编辑。请根据用户的优化指令，对以下剧本进行改写和完善。

## 优化指令
${instruction}

## 剧本标题
${title}

## 原剧本内容
${content}

## 要求
1. 保持剧本的整体剧情和核心情节不变
2. 根据优化指令进行针对性的修改
3. 保持角色性格的一致性
4. 保持场景描述的清晰和画面感
5. 输出完整的优化后剧本

## 输出格式
请返回以下格式：

[OPTIMIZED_SCRIPT]
（优化后的完整剧本内容）
[/OPTIMIZED_SCRIPT]

[CHANGES]
1. 改动点1
2. 改动点2
3. 改动点3
[/CHANGES]

只返回上述格式，不要其他说明。`;

  const result = await withAIBillingContext(
    {
      userId: null,
      sourceType: 'route',
      operationKey: 'script_optimize',
      resourceRefs: {}
    },
    () => callAIModel(modelName, {
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 8192,
      temperature: 0.7
    })
  );

  const raw = result.content || result.text || '';

  // 提取优化后的剧本
  const scriptMatch = raw.match(/\[OPTIMIZED_SCRIPT\]([\s\S]*?)\[\/OPTIMIZED_SCRIPT\]/);
  const changesMatch = raw.match(/\[CHANGES\]([\s\S]*?)\[\/CHANGES\]/);

  const optimizedContent = scriptMatch ? scriptMatch[1].trim() : raw;

  // 提取改动点
  let changes = [];
  if (changesMatch) {
    changes = changesMatch[1]
      .trim()
      .split('\n')
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .filter(line => line.length > 0);
  }

  return {
    content: optimizedContent,
    changes: changes.length > 0 ? changes : ['已根据指令进行优化'],
    tokens: result.tokens || 0
  };
}

module.exports = optimizeScript;
