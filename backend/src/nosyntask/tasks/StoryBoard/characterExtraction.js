/**
 * 角色提取处理器
 * input:  { scriptContent, scenes, projectId, textModel }
 * output: { characters: [{ name, appearance, personality, description }] }
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const db = require('../../../db');
const { stripThinkTags, extractCodeBlock, extractJSON, stripInvisible, safeParseJSON } = require('../../../utils/washBody');
const { getVisualStylePrompt } = require('../../../utils/getProjectStyle');
const { filterNonCharacters } = require('../../../utils/characterFilter');

async function handleCharacterExtraction(inputParams, onProgress) {
  const { scenes, scriptContent, textModel: modelName, projectId, scriptId, userId } = inputParams;

  if (!modelName) {
    throw new Error('textModel 参数是必需的');
  }
  
  console.log('[CharacterExtraction] 参数:', { projectId, scriptId, userId, scenesCount: scenes?.length });

  if (onProgress) onProgress(10);

  // 获取项目视觉风格，为角色外貌描述提供时代/风格上下文
  let visualStyleHint = '';
  if (projectId) {
    try {
      const stylePrompt = await getVisualStylePrompt(projectId);
      if (stylePrompt) {
        visualStyleHint = `\n【项目视觉风格】${stylePrompt}\n请确保角色的服装、发型、配饰等外貌描述与上述视觉风格/时代背景一致。\n`;
      }
    } catch (e) {
      console.warn('[CharacterExtraction] 获取项目视觉风格失败，继续提取:', e.message);
    }
  }

  // 构建提示词：优先使用分镜数据，其次使用剧本内容
  let contentForAnalysis = '';
  if (scenes && scenes.length > 0) {
    // 从分镜中提取角色信息
    contentForAnalysis = `分镜数据（共 ${scenes.length} 个镜头）：\n\n`;
    scenes.forEach((scene, idx) => {
      contentForAnalysis += `镜头 ${idx + 1}:\n`;
      contentForAnalysis += `- 描述: ${scene.description || scene.prompt_template}\n`;
      if (scene.characters && scene.characters.length > 0) {
        contentForAnalysis += `- 出现角色: ${scene.characters.join(', ')}\n`;
      }
      if (scene.dialogue) {
        contentForAnalysis += `- 对白: ${scene.dialogue}\n`;
      }
      contentForAnalysis += '\n';
    });
  } else if (scriptContent) {
    contentForAnalysis = `剧本内容：\n${scriptContent}`;
  } else {
    throw new Error('必须提供 scriptContent 或 scenes 参数');
  }

  const fullPrompt = `你是一个专业的剧本分析助手。你的任务是从剧本或分镜中提取角色信息。

**重要：必须输出严格的 JSON 格式！**
- 所有字符串值必须用双引号包裹
- 不要输出缺少引号的值
- 确保 JSON 格式完整
- 只输出 JSON 数组，不要添加其他说明文字
${visualStyleHint}
---

请从以下内容中提取所有角色信息，分析每个角色的外貌、性格和简介。

**重要：只提取有具体名字的角色，不要提取泛称群体如“人群”、“路人”、“群众”、“众人”、“行人”、“观众”、“士兵”、“村民”等。**

${contentForAnalysis}

**重要：必须输出严格的 JSON 格式！**
- 所有字符串值必须用双引号包裹
- 确保 JSON 格式完整，以 ] 结尾
- 只输出 JSON 数组，不要添加其他说明文字

**外貌描述要求 - 极其重要：**
- appearance 字段必须非常详细，包含可直接用于 AI 绘图的具体视觉信息
- 必须明确描述：年龄段、性别、身高体型、肤色、发型（长度/颜色/样式）、瞳色
- 必须明确描述服装的具体款式、颜色、材质、层次（内衣/外衣/披风等）
- 必须描述所有配饰：帽子、头饰、耳环、项链、腰带、武器等
- 如果是古装/历史题材，必须描述符合时代的具体服饰名称（如汉服、铠甲、道袍等）
- 禁止使用模糊描述如"穿着古装"、"传统服饰"，必须具体到款式和颜色

请严格按以下 JSON 格式返回：
[
  {
    "name": "角色名",
    "appearance": "外貌描述（年龄、身材、穿着、特征等，必须非常详细具体）",
    "personality": "性格描述（性格特点、行为习惯等）",
    "description": "角色简介（背景、身份、在故事中的作用等）"
  }
]`;

  if (onProgress) onProgress(30);

  const result = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel: modelName,
    temperature: 0.3
  }, onProgress);

  if (onProgress) onProgress(70);

  // 解析 AI 返回的 JSON
  let characters = [];
  try {
    console.log('[CharacterExtraction] 响应长度:', result.content.length, '字符');

    // 1. 统一清洗
    let jsonStr = stripThinkTags(result.content);
    jsonStr = extractCodeBlock(jsonStr);
    jsonStr = stripInvisible(jsonStr).trim();

    // 2. 尝试解析
    let parsed = safeParseJSON(jsonStr);

    // 3. 如果整体失败，提取 JSON 片段再试
    if (parsed === null) {
      const extracted = extractJSON(jsonStr);
      if (extracted) parsed = safeParseJSON(extracted);
    }

    if (parsed === null) {
      throw new Error('JSON 解析失败');
    }

    // 确保返回数组
    characters = Array.isArray(parsed) ? parsed : (parsed.characters || [parsed]);
    // 过滤非角色群体词
    characters = characters.filter(c => {
      const name = c && c.name;
      if (!name) return false;
      const { isNonCharacterEntity } = require('../../../utils/characterFilter');
      if (isNonCharacterEntity(name)) {
        console.log('[CharacterExtraction] 过滤非角色群体词:', name);
        return false;
      }
      return true;
    });

    console.log('[CharacterExtraction] 成功解析，共', characters.length, '个角色');

  } catch (parseError) {
    console.error('[CharacterExtraction] 解析角色 JSON 失败:', parseError);
    console.error('[CharacterExtraction] 完整响应内容:', result.content);
    throw new Error('角色解析失败，AI 返回的内容无法解析为 JSON: ' + parseError.message);
  }

  if (!Array.isArray(characters) || characters.length === 0) {
    throw new Error('AI 未返回有效的角色数据');
  }

  if (onProgress) onProgress(80);

  // 保存角色到数据库（批量查询已存在记录 + 分离插入/更新）
  if (projectId && userId) {
    console.log('[CharacterExtraction] 保存', characters.length, '个角色到项目', projectId, '集数', scriptId);
    
    const { queryAll, execute } = require('../../../dbHelper');
    
    // 批量查询已存在的角色（1 次 DB 查询代替 N 次）
    const charNames = characters.map(c => c.name).filter(Boolean);
    let existingMap = new Map();
    if (charNames.length > 0) {
      const placeholders = charNames.map(() => '?').join(',');
      const existingRows = await queryAll(
        `SELECT id, name FROM characters WHERE project_id = ? AND user_id = ? AND name IN (${placeholders})`,
        [projectId, userId, ...charNames]
      );
      for (const row of existingRows) {
        existingMap.set(row.name, row.id);
      }
    }
    
    for (const character of characters) {
      try {
        const existingId = existingMap.get(character.name);
        if (existingId) {
          // 更新现有角色（不更新 script_id，保留最初提取的剧集ID，因为角色可能出现在多集）
          await execute(
            `UPDATE characters 
             SET name = ?, appearance = ?, personality = ?, description = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
              character.name,
              character.appearance || '',
              character.personality || '',
              character.description || '',
              existingId
            ]
          );
          console.log('[CharacterExtraction] 更新角色:', character.name, '(保留原script_id)');
        } else {
          // 插入新角色
          await execute(
            `INSERT INTO characters (user_id, project_id, script_id, name, appearance, personality, description, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'ai_extracted')`,
            [
              userId,
              projectId,
              scriptId || null,
              character.name,
              character.appearance || '',
              character.personality || '',
              character.description || ''
            ]
          );
          console.log('[CharacterExtraction] 新增角色:', character.name, '(包含详细信息)');
        }
      } catch (dbError) {
        console.error('[CharacterExtraction] 保存角色失败:', character.name, dbError);
      }
    }
  } else {
    console.warn('[CharacterExtraction] 缺少 projectId 或 userId，跳过数据库保存');
  }

  // 角色创建完成后，重新建立分镜与角色的关联
  if (scriptId && projectId) {
    try {
      const { linkAllForScript } = require('../../../resourceLinks');
      await linkAllForScript(scriptId, projectId);
      console.log('[CharacterExtraction] 角色与分镜关联完成');
    } catch (linkError) {
      console.error('[CharacterExtraction] 资源关联失败（不影响角色提取）:', linkError.message);
    }
  }

  if (onProgress) onProgress(100);

  return {
    characters,
    count: characters.length,
    tokens: result.tokens || 0,
    provider: result._model?.provider || 'unknown'
  };
}

module.exports = handleCharacterExtraction;
