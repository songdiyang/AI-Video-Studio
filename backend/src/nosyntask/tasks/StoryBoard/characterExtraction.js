/**
 * 角色提取处理器
 * input:  { scriptContent, scenes, projectId, textModel }
 * output: { characters: [{ id, name, appearance, personality, description }] }
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const db = require('../../../db');
const { stripThinkTags, extractCodeBlock, extractJSON, stripInvisible, safeParseJSON } = require('../../../utils/washBody');
const { getVisualStylePrompt } = require('../../../utils/getProjectStyle');
const { filterNonCharacters } = require('../../../utils/characterFilter');

// AI 调用超时时间（默认 90 秒）
const AI_CALL_TIMEOUT = parseInt(process.env.CHARACTER_EXTRACTION_AI_TIMEOUT, 10) || 90000;

function withTimeout(promise, ms, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), ms)
    )
  ]);
}

async function handleCharacterExtraction(inputParams, onProgress) {
  const { scenes, scriptContent, textModel: modelName, projectId, scriptId, userId } = inputParams;

  if (!modelName) {
    throw new Error('textModel 参数是必需的');
  }
  
  console.log('[CharacterExtraction] 输入scenes角色汇总:', scenes?.length ? [...new Set(scenes.flatMap(s => s.characters || []))] : '无scenes数据');
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

  const result = await withTimeout(
    handleBaseTextModelCall({
      prompt: fullPrompt,
      textModel: modelName,
      temperature: 0.3
    }, onProgress),
    AI_CALL_TIMEOUT,
    `角色提取 AI 调用超时（${Math.round(AI_CALL_TIMEOUT / 1000)}秒）`
  );

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
          character.id = existingId;
          console.log('[CharacterExtraction] 更新角色:', character.name, '(保留原script_id)');
        } else {
          // 插入新角色
          const insertResult = await execute(
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
          character.id = insertResult.insertId;
          console.log('[CharacterExtraction] 新增角色:', character.name, '(包含详细信息)');
        }
      } catch (dbError) {
        console.error('[CharacterExtraction] 保存角色失败:', character.name, dbError);
      }
    }
  } else {
    console.warn('[CharacterExtraction] 缺少 projectId 或 userId，跳过数据库保存');
  }

  // === 角色交叉校验：对比分镜中的角色名与 AI 提取结果 ===
  const validation = { matched: [], missing: [], filtered: [] };
  if (scenes && scenes.length > 0 && projectId && userId) {
    const { isNonCharacterEntity } = require('../../../utils/characterFilter');
    const { execute: exHelper } = require('../../../dbHelper');
    
    // 从分镜 scenes.characters 收集所有角色名
    const sceneCharNames = new Set();
    for (const scene of scenes) {
      if (Array.isArray(scene.characters)) {
        for (const name of scene.characters) {
          if (name && typeof name === 'string' && name.trim()) {
            sceneCharNames.add(name.trim());
          }
        }
      }
    }

    // 已提取的角色名集合
    const extractedNames = new Set(characters.map(c => c.name));

    // 找出遗漏的角色（在分镜中出现但 AI 未提取）
    const missingNames = [];
    for (const name of sceneCharNames) {
      if (!extractedNames.has(name) && !isNonCharacterEntity(name)) {
        missingNames.push(name);
      }
    }

    // 收集匹配的角色（在分镜中出现且已被 AI 提取）
    for (const name of sceneCharNames) {
      if (extractedNames.has(name)) {
        const char = characters.find(c => c.name === name);
        validation.matched.push({ name, id: char?.id || null });
      } else if (isNonCharacterEntity(name)) {
        validation.filtered.push(name);
      }
    }

    if (missingNames.length > 0) {
      console.log('[CharacterExtraction] 交叉校验发现遗漏角色:', missingNames);

      // 收集遗漏角色出现的场景上下文
      const missingContext = missingNames.map(name => {
        const relatedScenes = scenes.filter(s => 
          Array.isArray(s.characters) && s.characters.includes(name)
        );
        return `角色「${name}」出现在以下场景中：\n` + relatedScenes.map((s, i) => 
          `  场景${i + 1}: ${s.description || s.prompt_template || ''}${s.dialogue ? ` 对白: ${s.dialogue}` : ''}`
        ).join('\n');
      }).join('\n\n');

      // 调用 AI 为遗漏角色生成详情
      let missingCharDetails = new Map();
      try {
        const missingPrompt = `你是一个专业的剧本分析助手。以下角色在分镜中出现但缺少详细信息，请根据场景上下文为每个角色生成详细信息。
${visualStyleHint}
${missingContext}

**重要：必须输出严格的 JSON 格式！**
请严格按以下 JSON 格式返回：
[
  {
    "name": "角色名（必须与上面提供的角色名完全一致）",
    "appearance": "外貌描述（年龄、身材、穿着、特征等，必须非常详细具体，可用于 AI 绘图）",
    "personality": "性格描述（性格特点、行为习惯等）",
    "description": "角色简介（背景、身份、在故事中的作用等）"
  }
]

**外貌描述要求：**
- 必须明确描述：年龄段、性别、身高体型、肤色、发型（长度/颜色/样式）、瞳色
- 必须明确描述服装的具体款式、颜色、材质
- 如果是非人类角色（动物、怪物等），必须描述体型、毛色/皮肤、特征部位等
- 禁止使用模糊描述，必须具体到视觉细节`;

        const missingResult = await withTimeout(
          handleBaseTextModelCall({
            prompt: missingPrompt,
            textModel: modelName,
            temperature: 0.3
          }),
          AI_CALL_TIMEOUT,
          `遗漏角色 AI 补充调用超时（${Math.round(AI_CALL_TIMEOUT / 1000)}秒）`
        );

        // 解析 AI 返回的遗漏角色详情
        let missingJsonStr = stripThinkTags(missingResult.content);
        missingJsonStr = extractCodeBlock(missingJsonStr);
        missingJsonStr = stripInvisible(missingJsonStr).trim();
        let missingParsed = safeParseJSON(missingJsonStr);
        if (missingParsed === null) {
          const extracted = extractJSON(missingJsonStr);
          if (extracted) missingParsed = safeParseJSON(extracted);
        }
        if (missingParsed) {
          const missingArr = Array.isArray(missingParsed) ? missingParsed : (missingParsed.characters || []);
          for (const mc of missingArr) {
            if (mc && mc.name) {
              missingCharDetails.set(mc.name, mc);
            }
          }
          console.log('[CharacterExtraction] AI 生成遗漏角色详情成功，共', missingCharDetails.size, '个');
        }
      } catch (aiErr) {
        console.error('[CharacterExtraction] AI 生成遗漏角色详情失败，将使用空详情:', aiErr.message);
      }

      for (const name of missingNames) {
        try {
          // 批量查询已用 existingMap，直接查 Map 代替逐条 DB 查询
          const existingId = existingMap.get(name);

          if (existingId) {
            // 已在数据库中，用 AI 详情更新并加入返回列表
            const detail = missingCharDetails.get(name) || {};
            if (detail.appearance) {
              await exHelper(
                `UPDATE characters SET appearance = ?, personality = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [detail.appearance || '', detail.personality || '', detail.description || '', existingId]
              );
            }
            characters.push({
              id: existingId,
              name,
              appearance: detail.appearance || '',
              personality: detail.personality || '',
              description: detail.description || '(分镜交叉校验补充)',
              _crossValidated: true
            });
            validation.missing.push({ name, id: existingId, source: 'db_existing' });
            console.log('[CharacterExtraction] 校验补充已有角色:', name, 'id=', existingId, detail.appearance ? '(含AI详情)' : '');
          } else {
            // 插入新角色记录（含 AI 生成的详情）
            const detail = missingCharDetails.get(name) || {};
            const insertResult = await exHelper(
              `INSERT INTO characters (user_id, project_id, script_id, name, appearance, personality, description, source)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'cross_validated')`,
              [
                userId, projectId, scriptId || null, name,
                detail.appearance || '',
                detail.personality || '',
                detail.description || '(分镜交叉校验自动补充)'
              ]
            );
            characters.push({
              id: insertResult.insertId,
              name,
              appearance: detail.appearance || '',
              personality: detail.personality || '',
              description: detail.description || '(分镜交叉校验自动补充)',
              _crossValidated: true
            });
            validation.missing.push({ name, id: insertResult.insertId, source: 'auto_created' });
            console.log('[CharacterExtraction] 校验新增遗漏角色:', name, 'id=', insertResult.insertId, detail.appearance ? '(含AI详情)' : '');
          }
        } catch (cvErr) {
          console.error('[CharacterExtraction] 交叉校验补充角色失败:', name, cvErr.message);
        }
      }
      console.log('[CharacterExtraction] 交叉校验完成，补充了', missingNames.length, '个遗漏角色');
    } else {
      console.log('[CharacterExtraction] 交叉校验通过，无遗漏角色');
    }
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

  console.log('[CharacterExtraction] 校验报告:', JSON.stringify({
    matched: validation.matched.map(m => m.name),
    missing: validation.missing.map(m => m.name),
    filtered: validation.filtered
  }));

  return {
    characters,
    count: characters.length,
    tokens: result.tokens || 0,
    provider: result._model?.provider || 'unknown',
    validation
  };
}

module.exports = handleCharacterExtraction;
