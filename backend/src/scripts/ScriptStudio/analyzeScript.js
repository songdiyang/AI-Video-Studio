/**
 * POST /api/scripts/analyze
 * 对已有剧本进行AI结构化分析
 */

const { queryOne } = require('../../dbHelper');
const { callAIModel } = require('../../aiModelService');
const { withAIBillingContext } = require('../../aiBillingContext');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');

const WRITABLE_ROLES = new Set(['owner', 'admin', 'editor']);

async function analyzeScript(req, res) {
  const { scriptId, content: directContent } = req.body || {};
  const userId = req.user.id;

  let content = directContent;
  let scriptTitle = '未命名剧本';
  let targetScriptId = scriptId;

  try {
    // 如果传了 scriptId，从数据库读取
    if (scriptId) {
      const script = await queryOne(
        'SELECT id, user_id, project_id, title, content FROM scripts WHERE id = ?',
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
          return res.status(403).json({ message: '无权分析该剧本' });
        }
      }

      content = script.content;
      scriptTitle = script.title || '未命名剧本';
      targetScriptId = script.id;
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ message: '剧本内容不能为空' });
    }

    // 内容截断（避免prompt过长）
    const maxContentLength = 8000;
    const truncatedContent = content.length > maxContentLength
      ? content.slice(0, maxContentLength) + '\n\n...（内容已截断，仅分析前8000字）'
      : content;

    const analysis = await performAnalysis(truncatedContent, scriptTitle);

    res.json({
      success: true,
      scriptId: targetScriptId,
      analysis,
      contentLength: content.length,
      message: '分析完成'
    });
  } catch (error) {
    console.error('[Analyze Script]', error);
    res.status(500).json({ message: '分析失败：' + error.message });
  }
}

/**
 * 执行AI分析
 */
async function performAnalysis(content, title) {
  const prompt = `你是一位资深剧本分析师。请对以下剧本进行深度结构化分析。

## 分析要求

1. **场景统计**：统计场景数量，列出每个场景的简要描述
2. **角色分析**：提取所有角色，分析每个角色的戏份和性格特征
3. **剧情结构**：判断剧本的结构类型（三幕式、英雄之旅、线性叙事等）
4. **风格标签**：给出3-5个风格标签
5. **叙事节奏**：分析剧本的节奏特点（紧凑/舒缓/起伏等）
6. **优化建议**：给出3-5条具体的优化建议
7. **内容摘要**：100字以内的剧情摘要

## 输出格式

请严格返回以下JSON格式，不要包含其他文字：

{
  "sceneCount": 数字,
  "scenes": [
    { "index": 1, "title": "场景标题", "description": "场景简要描述" }
  ],
  "characters": [
    { "name": "角色名", "importance": "主角/配角/龙套", "trait": "性格特征" }
  ],
  "structure": "剧情结构描述",
  "style": ["风格标签1", "风格标签2", "风格标签3"],
  "pacing": "节奏分析",
  "suggestions": ["建议1", "建议2", "建议3"],
  "summary": "剧情摘要"
}

## 剧本信息

标题：${title}
内容：
${content}`;

  // 获取第一个可用文本模型
  const textModel = await queryOne(
    "SELECT name FROM ai_model_configs WHERE category = 'TEXT' AND is_active = 1 ORDER BY id ASC LIMIT 1"
  );

  if (!textModel) {
    throw new Error('无可用文本模型');
  }

  const result = await withAIBillingContext(
    {
      userId: null, // 由调用方传入
      sourceType: 'route',
      operationKey: 'script_analyze',
      resourceRefs: {}
    },
    () => callAIModel(textModel.name, {
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
      temperature: 0.3
    })
  );

  const raw = result.content || result.text || '';

  // 提取JSON
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI返回格式异常');
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    console.error('[Analyze Script] JSON解析失败:', parseErr);
    // 尝试修复常见的JSON问题
    const cleaned = jsonMatch[0]
      .replace(/,\s*([}\]])/g, '$1') // 移除尾随逗号
      .replace(/\n/g, '\\n'); // 处理换行
    return JSON.parse(cleaned);
  }
}

module.exports = analyzeScript;
