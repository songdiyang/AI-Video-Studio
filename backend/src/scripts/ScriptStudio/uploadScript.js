/**
 * POST /api/scripts/upload
 * 上传剧本文件（.txt / .md），支持直接保存或AI分析模式
 */

const multer = require('multer');
const { queryOne, execute } = require('../../dbHelper');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');
const { callAIModel } = require('../../aiModelService');
const { withAIBillingContext } = require('../../aiBillingContext');

const WRITABLE_ROLES = new Set(['owner', 'admin', 'editor']);

// 内存存储，不落地磁盘
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/plain', 'text/markdown', 'application/octet-stream'];
    const ext = file.originalname.toLowerCase();
    const isAllowedType = allowed.includes(file.mimetype);
    const isAllowedExt = ext.endsWith('.txt') || ext.endsWith('.md');
    if (isAllowedType || isAllowedExt) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .txt 和 .md 文件'));
    }
  }
});

/**
 * 读取上传文件内容为 UTF-8 文本
 */
function readFileContent(buffer, originalname) {
  // 尝试多种编码
  const encodings = ['utf-8', 'utf8', 'gbk', 'gb2312', 'big5'];
  for (const enc of encodings) {
    try {
      const decoder = new TextDecoder(enc, { fatal: true });
      const text = decoder.decode(buffer);
      if (text.length > 0 && !text.includes('\u0000')) {
        return text;
      }
    } catch {
      // 尝试下一个编码
    }
  }
  // 兜底：直接按 utf-8 解码（非 fatal）
  return buffer.toString('utf-8');
}

async function uploadScript(req, res) {
  const { projectId, episodeNumber, title, mode = 'save', content: directContent } = req.body || {};
  const userId = req.user.id;
  const file = req.file;

  // 支持文件上传或直接文本输入
  let content = directContent;
  if (!content && file) {
    content = readFileContent(file.buffer, file.originalname);
  }

  if (!content) {
    return res.status(400).json({ message: '请上传剧本文件或输入剧本内容' });
  }

  const targetProjectId = projectId ? Number(projectId) : null;
  const targetEpisode = episodeNumber ? Number(episodeNumber) : null;

  try {
    // 协作鉴权
    if (targetProjectId) {
      const role = await getEffectiveProjectRole(userId, targetProjectId);
      if (!role || !WRITABLE_ROLES.has(role)) {
        return res.status(403).json({ message: '无权在该项目上传剧本' });
      }
    }

    content = content.trim();
    if (!content) {
      return res.status(400).json({ message: '剧本内容为空' });
    }

    // 内容长度限制（约10万字）
    if (content.length > 100000) {
      return res.status(400).json({ message: '文件内容过长，请控制在10万字以内' });
    }

    // 确定集数
    let finalEpisode = targetEpisode;
    if (targetProjectId && !finalEpisode) {
      const last = await queryOne(
        'SELECT MAX(episode_number) as max_ep FROM scripts WHERE project_id = ?',
        [targetProjectId]
      );
      finalEpisode = (last?.max_ep || 0) + 1;
    } else if (!finalEpisode) {
      finalEpisode = 1;
    }

    // 检查集数是否已存在（仅项目剧本）
    if (targetProjectId) {
      const existing = await queryOne(
        'SELECT id FROM scripts WHERE project_id = ? AND episode_number = ?',
        [targetProjectId, finalEpisode]
      );
      if (existing) {
        return res.status(400).json({ message: `第${finalEpisode}集已存在，请编辑或删除后重试` });
      }
    }

    // 提取标题（从文件名、传入标题或内容首行）
    const fileTitle = title || (file && file.originalname.replace(/\.[^.]+$/, '')) || '未命名剧本';

    // 直接保存模式
    if (mode === 'save') {
      const result = await execute(
        'INSERT INTO scripts (user_id, project_id, episode_number, title, content, status, model_provider, token_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, targetProjectId, finalEpisode, fileTitle, content, 'completed', 'upload', 0]
      );
      const scriptId = result.insertId;

      return res.json({
        success: true,
        scriptId,
        projectId: targetProjectId,
        episodeNumber: finalEpisode,
        title: fileTitle,
        content,
        mode: 'save',
        message: targetProjectId
          ? `第${finalEpisode}集剧本上传成功`
          : '已保存到个人剧本库'
      });
    }

    // AI分析模式：先保存为草稿，再调用AI分析
    const result = await execute(
      'INSERT INTO scripts (user_id, project_id, episode_number, title, content, status, model_provider, token_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, targetProjectId, finalEpisode, fileTitle, content, 'completed', 'upload', 0]
    );
    const scriptId = result.insertId;

    // 调用AI进行结构化分析
    const analysis = await analyzeScriptContent(content, fileTitle);

    return res.json({
      success: true,
      scriptId,
      projectId: targetProjectId,
      episodeNumber: finalEpisode,
      title: fileTitle,
      content,
      mode: 'analyze',
      analysis,
      message: '剧本上传并分析完成'
    });
  } catch (error) {
    console.error('[Upload Script]', error);
    res.status(500).json({ message: '上传失败：' + error.message });
  }
}

/**
 * AI分析剧本内容
 */
async function analyzeScriptContent(content, title) {
  const prompt = `请对以下剧本进行结构化分析，返回JSON格式：

剧本标题：${title}
剧本内容（前5000字）：
${content.slice(0, 5000)}

请分析并返回以下字段的JSON：
{
  "sceneCount": 场景数量（数字）,
  "characters": ["角色名1", "角色名2"],
  "structure": "剧情结构描述（如：三幕式、线性叙事等）",
  "style": "风格标签（如：悬疑、喜剧、热血等）",
  "suggestions": ["优化建议1", "优化建议2", "优化建议3"],
  "summary": "剧本内容摘要（100字以内）"
}

只返回JSON，不要其他文字。`;

  try {
    // 获取第一个可用文本模型
    const { queryOne } = require('../../dbHelper');
    const textModel = await queryOne(
      "SELECT name FROM ai_model_configs WHERE category = 'TEXT' AND is_active = 1 ORDER BY id ASC LIMIT 1"
    );

    if (!textModel) {
      return { error: '无可用文本模型' };
    }

    const result = await callAIModel(textModel.name, {
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2048,
      temperature: 0.3
    });

    const raw = result.content || result.text || '';
    // 提取JSON
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { error: 'AI分析结果解析失败', raw: raw.slice(0, 200) };
  } catch (err) {
    console.error('[Analyze Script]', err);
    return { error: 'AI分析失败：' + err.message };
  }
}

// 导出 multer 中间件和处理函数
uploadScript.middleware = upload.single('file');
module.exports = uploadScript;
