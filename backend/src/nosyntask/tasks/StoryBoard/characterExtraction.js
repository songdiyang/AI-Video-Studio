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
  const { scenes, scriptContent, textModel: modelName, projectId, scriptId, userId, appendMode, conflictStrategy } = inputParams;

  // 解析冲突策略：兼容旧版 appendMode 参数
  // conflictStrategy: 'skip'（跳过同名）| 'overwrite'（覆盖更新）| 'smart'（智能覆盖，只更新空白字段）
  const effectiveStrategy = conflictStrategy || (appendMode ? 'skip' : 'overwrite');

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

  const fullPrompt = `你是一个专业的剧本分析助手。你的任务是从剧本或分镜中提取角色信息，并将角色外貌严格分为「白膜体貌」和「服装装饰」两层。

**重要：必须输出严格的 JSON 格式！**
- 所有字符串值必须用双引号包裹
- 不要输出缺少引号的值
- 确保 JSON 格式完整
- 只输出 JSON 数组，不要添加其他说明文字
${visualStyleHint}
---

请从以下内容中提取所有角色信息，分析每个角色的外貌、性格和简介。

**重要：只提取有具体名字的角色，不要提取泛称群体如"人群"、"路人"、"群众"、"众人"、"行人"、"观众"、"士兵"、"村民"等。**

${contentForAnalysis}

**重要：必须输出严格的 JSON 格式！**
- 所有字符串值必须用双引号包裹
- 确保 JSON 格式完整，以 ] 结尾
- 只输出 JSON 数组，不要添加其他说明文字

**外貌分层描述要求 - 极其重要：**
角色的外貌必须分为三层（身体/服装/手持道具），这是为了先生成白膜基础体，再按状态叠加服装与道具：

1. base_appearance（白膜体貌 - 不可更换的身体特征，作为所有状态的生成基准）：
   - 必须明确描述：初始年龄段（如幼年/少年/青年）、性别、身高体型
   - 必须明确描述：发型（长度/颜色/样式）、瞳色、眼型、脸型、五官特征
   - 必须描述：永久身体标记（疤痕、胎记、纹身等）
   - **绝对不能包含任何服装、配饰、装备、手持道具等可更换物品的描述**
   - **绝对不能包含任何临时性污垢、泥土、灰尘、湿身、血迹等可清洁/可恢复的状态描述**——这些属于可叠加的「效果状态」，不属于白膜
   - **注意：白膜的年龄是角色的基准初始年龄。如果剧本中该角色在不同阶段有不同的年龄/身高体型，这些变化属于「时间状态」，不要写入白膜，而是在 time_states 中体现**

2. outfit_appearance（服装装饰 - 可更换的穿戴物品）：
   - 必须明确描述服装的具体款式、颜色、材质、层次（内衣/外衣/披风等）
   - 必须描述所有穿戴类配饰：帽子、头饰、耳环、项链、腰带等
   - 如果是古装/历史题材，必须描述符合时代的具体服饰名称（如汉服、铠甲、道袍等）
   - 禁止使用模糊描述如"穿着古装"、"传统服饰"，必须具体到款式和颜色
   - **绝对不能包含手里拿着/抱着/背着的可拆离物品**（如剑、书本、胡萝卜、水杯、伞、包袋等）——这些属于第 4 层

3. appearance（完整外貌 = base_appearance + outfit_appearance 的自然组合）：
   - 将白膜体貌和服装装饰组合成一段完整的外貌描述
   - 不要把手持道具写进来

4. held_props（手持道具 - 当前剧本中该角色典型携带/手持的可拆离物品）：
   - 只收录角色"手里拿着/抱着/背着/随身携带"的可拆离物品，如：剑、盾、书本、胡萝卜、水杯、法杖、灯笼、包袋、雨伞、武器等
   - 不包含穿戴类（帽子/耳环/项链/腰带属于 outfit_appearance）
   - 不包含永久身体特征（疤痕/胎记等属于 base_appearance）
   - 如果剧本中该角色未明确手持任何物品，返回空字符串 ""
   - 多个道具用中文逗号分隔，如："长剑，水囊"

5. time_states（时间状态变化 - 可选，如果剧本中角色有明显年龄/体型变化）：
   - 只收录剧本中明确出现的、与白膜初始状态不同的年龄阶段
   - 每个时间状态包含：age_stage（童年/少年/青年/中年/老年）、height_change（身高变化描述，如"长高到180cm"）、body_change（体型变化描述，如"变得健壮"）
   - 如果剧本中角色没有年龄变化，返回空数组 []

请严格按以下 JSON 格式返回：
[
  {
    "name": "角色名",
    "base_appearance": "白膜体貌描述（初始年龄、性别、体型、肤色、发型瞳色、五官等不可更换的身体特征）",
    "outfit_appearance": "服装装饰描述（服装款式/颜色/材质、穿戴类配饰、鞋子等）",
    "held_props": "手持道具描述（剧本中该角色手里拿着/抱着/携带的可拆离物品，如剑、书本、胡萝卜等，没有则填空字符串）",
    "appearance": "完整外貌描述（白膜体貌 + 服装装饰的自然组合，不含手持道具）",
    "time_states": [
      {"age_stage": "少年", "height_change": "长高到150cm", "body_change": "体型变得修长"}
    ],
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

  // 解析角色分层外貌：确保 base_appearance / outfit_appearance / held_props / time_states 存在
  // 兼容旧版 AI 输出（可能不包含 base_appearance / outfit_appearance / held_props / time_states）
  for (const character of characters) {
    if (!character.base_appearance && character.appearance) {
      // 旧版 AI 输出没有分层，直接使用完整 appearance 作为兜底
      character.base_appearance = character.appearance;
      character.outfit_appearance = '';
    }
    if (typeof character.held_props !== 'string') {
      character.held_props = '';
    }
    if (!character.appearance) {
      character.appearance = [character.base_appearance, character.outfit_appearance].filter(Boolean).join('；') || '';
    }
    if (!Array.isArray(character.time_states)) {
      character.time_states = [];
    }
  }

  // 保存角色到数据库（批量查询已存在记录 + 分离插入/更新）
  if (projectId && userId) {
    console.log('[CharacterExtraction] 保存', characters.length, '个角色到项目', projectId, '集数', scriptId);
    
    const { queryAll, execute, queryOne } = require('../../../dbHelper');
    
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
          if (effectiveStrategy === 'skip') {
            // 跳过策略：跳过同名角色，不更新
            character.id = existingId;
            console.log('[CharacterExtraction] 跳过同名角色:', character.name, '(保留原有数据)');
          } else if (effectiveStrategy === 'smart') {
            // 智能覆盖策略：只更新空白字段
            const existing = await queryOne('SELECT appearance, base_appearance, outfit_appearance, personality, description FROM characters WHERE id = ?', [existingId]);
            const newAppearance = existing.appearance || character.appearance || '';
            const newBaseAppearance = existing.base_appearance || character.base_appearance || '';
            const newOutfitAppearance = existing.outfit_appearance || character.outfit_appearance || '';
            const newPersonality = existing.personality || character.personality || '';
            const newDescription = existing.description || character.description || '';
            await execute(
              `UPDATE characters 
               SET appearance = ?, base_appearance = ?, outfit_appearance = ?, personality = ?, description = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [newAppearance, newBaseAppearance, newOutfitAppearance, newPersonality, newDescription, existingId]
            );
            character.id = existingId;
            console.log('[CharacterExtraction] 智能覆盖角色:', character.name, '(只填充空白字段)');
          } else {
            // 覆盖策略：更新现有角色（含分层外貌字段）
            await execute(
              `UPDATE characters 
               SET name = ?, appearance = ?, base_appearance = ?, outfit_appearance = ?, personality = ?, description = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [
                character.name,
                character.appearance || '',
                character.base_appearance || '',
                character.outfit_appearance || '',
                character.personality || '',
                character.description || '',
                existingId
              ]
            );
            character.id = existingId;
            // 更新白膜状态的 appearance 为 base_appearance（白膜不携带任何道具）
            try {
              await execute(
                `UPDATE character_states SET appearance = ? WHERE character_id = ? AND is_base_model = 1`,
                [character.base_appearance || '', existingId]
              );
              // 更新默认服装状态的 outfit + held_props（手持道具叠加到该状态）
              await execute(
                `UPDATE character_states SET outfit = ?, appearance = ?, held_props = ? WHERE character_id = ? AND is_base_model = 0 AND name = '默认服装'`,
                [character.outfit_appearance || '', character.appearance || '', character.held_props || '', existingId]
              );
              // 查询默认服装状态的 ID，供后续 costume 关联使用
              const defaultState = await queryOne(
                `SELECT id FROM character_states WHERE character_id = ? AND is_base_model = 0 AND name = '默认服装' LIMIT 1`,
                [existingId]
              );
              if (defaultState) {
                character.defaultStateId = defaultState.id;
              }
            } catch (stateErr) {
              console.warn('[CharacterExtraction] 更新角色白膜/服装状态失败:', character.name, stateErr.message);
            }
            console.log('[CharacterExtraction] 更新角色:', character.name, '(含分层外貌+手持道具)');
          }
        } else {
          // 插入新角色（含分层外貌字段）
          const insertResult = await execute(
            `INSERT INTO characters (user_id, project_id, script_id, name, appearance, base_appearance, outfit_appearance, personality, description, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_extracted')`,
            [
              userId,
              projectId,
              scriptId || null,
              character.name,
              character.appearance || '',
              character.base_appearance || '',
              character.outfit_appearance || '',
              character.personality || '',
              character.description || ''
            ]
          );
          character.id = insertResult.insertId;

          // 创建白膜状态：appearance 使用 base_appearance（直接使用分层结果，无需事后清洗）
          const gender = character.gender || 'unknown';
          const baseStateResult = await execute(
            `INSERT INTO character_states (
              character_id, is_base_model, name, description, appearance, gender, is_active, generation_status
            ) VALUES (?, 1, '基础白膜', '角色基础白膜版本，用于生成各状态的参考基准', ?, ?, 1, 'idle')`,
            [character.id, character.base_appearance || '', gender]
          );

          // 创建默认服装状态：outfit 使用 outfit_appearance，held_props 使用剧本拆出的手持道具
          const costumeStateResult = await execute(
            `INSERT INTO character_states (
              character_id, is_base_model, name, description, appearance, outfit, held_props, gender, is_active, generation_status, state_category
            ) VALUES (?, 0, '默认服装', '角色默认服装状态', ?, ?, ?, ?, 0, 'idle', 'costume')`,
            [character.id, character.appearance || '', character.outfit_appearance || '', character.held_props || '', gender]
          );
          character.defaultStateId = costumeStateResult.insertId;

          // 创建时间状态：如果剧本中有年龄/体型变化
          if (character.time_states && character.time_states.length > 0) {
            for (const ts of character.time_states) {
              const timeAppearance = [
                character.base_appearance,
                ts.height_change || '',
                ts.body_change || ''
              ].filter(Boolean).join('；');
              await execute(
                `INSERT INTO character_states (
                  character_id, is_base_model, name, description, appearance, age_stage, gender, is_active, generation_status, state_category
                ) VALUES (?, 0, ?, ?, ?, ?, ?, 0, 'idle', 'time')`,
                [
                  character.id,
                  `${ts.age_stage || '时间变化'}`,
                  `角色在${ts.age_stage || '不同阶段'}时的体貌状态`,
                  timeAppearance || character.base_appearance || '',
                  ts.age_stage || '',
                  gender
                ]
              );
            }
            console.log('[CharacterExtraction] 创建时间状态:', character.name, character.time_states.length, '个');
          }

          console.log('[CharacterExtraction] 新增角色:', character.name, '(含白膜+默认服装状态+手持道具+时间状态)');
        }
      } catch (dbError) {
        console.error('[CharacterExtraction] 保存角色失败:', character.name, dbError);
      }
    }

    // === 为角色创建/更新服装资源（costumes）===
    for (const character of characters) {
      if (!character.id || !character.outfit_appearance) continue;
      try {
        // 检查角色是否已有 costume 关联
        const existingLink = await queryOne(
          `SELECT cc.costume_id FROM character_costumes cc WHERE cc.character_id = ? LIMIT 1`,
          [character.id]
        );
        if (existingLink) {
          // 更新现有 costume 的描述
          await execute(
            `UPDATE costumes SET description = ?, outfit_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [character.outfit_appearance, character.outfit_appearance, existingLink.costume_id]
          );
          // 将 costume_id 关联到默认服装状态
          if (character.defaultStateId) {
            await execute(
              `UPDATE character_states SET costume_id = ? WHERE id = ?`,
              [existingLink.costume_id, character.defaultStateId]
            );
          }
        } else {
          // 创建新 costume
          const costumeResult = await execute(
            `INSERT INTO costumes (user_id, project_id, name, description, category, gender, outfit_prompt, generation_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [
              userId,
              projectId,
              `${character.name}的默认服装`,
              character.outfit_appearance,
              '日常',
              character.gender || 'unisex',
              character.outfit_appearance
            ]
          );
          // 建立角色与服装的关联
          await execute(
            `INSERT INTO character_costumes (character_id, costume_id, is_equipped) VALUES (?, ?, 1)`,
            [character.id, costumeResult.insertId]
          );
          // 将 costume_id 关联到默认服装状态
          if (character.defaultStateId) {
            await execute(
              `UPDATE character_states SET costume_id = ? WHERE id = ?`,
              [costumeResult.insertId, character.defaultStateId]
            );
          }
          console.log('[CharacterExtraction] 创建服装资源:', character.name, costumeResult.insertId);
        }
      } catch (costumeErr) {
        console.warn('[CharacterExtraction] 创建服装资源失败:', character.name, costumeErr.message);
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
        const missingPrompt = `你是一个专业的剧本分析助手。以下角色在分镜中出现但缺少详细信息，请根据场景上下文为每个角色生成详细信息，并将角色外貌严格分为「白膜体貌」「服装装饰」「手持道具」三层。
${visualStyleHint}
${missingContext}

**重要：必须输出严格的 JSON 格式！**
请严格按以下 JSON 格式返回：
[
  {
    "name": "角色名（必须与上面提供的角色名完全一致）",
    "base_appearance": "白膜体貌描述（年龄、性别、体型、肤色、发型瞳色、五官等不可更换的身体特征，不能包含服装与道具）",
    "outfit_appearance": "服装装饰描述（服装款式/颜色/材质、穿戴类配饰、鞋子等，不能包含手里的可拆离物品）",
    "held_props": "手持道具描述（剧本中该角色手里拿着/抱着/背着的可拆离物品，没有则填空字符串）",
    "appearance": "完整外貌描述（白膜体貌 + 服装装饰的自然组合，不含手持道具）",
    "personality": "性格描述（性格特点、行为习惯等）",
    "description": "角色简介（背景、身份、在故事中的作用等）"
  }
]

**外貌分层描述要求：**
- base_appearance: 只包含不可更换的身体特征（年龄、性别、体型、肤色、发型发色、瞳色、五官、永久身体标记），绝对不能包含服装与道具
- outfit_appearance: 只包含可更换的穿戴物品（服装款式/颜色/材质、穿戴类配饰、鞋子等），禁止把手里拿的东西写进来
- held_props: 只包含手里拿着/抱着/背着/随身携带的可拆离物品（如剑、书本、胡萝卜、水杯、伞、灯笼、包袋、武器等），无则空字符串
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
            // 已在数据库中
            if (effectiveStrategy === 'skip') {
              // 跳过策略：跳过，不更新
              characters.push({
                id: existingId,
                name,
                appearance: '',
                personality: '',
                description: '(跳过更新)',
                _crossValidated: true
              });
              validation.missing.push({ name, id: existingId, source: 'skipped' });
              console.log('[CharacterExtraction] 跳过交叉校验已有角色:', name);
            } else if (effectiveStrategy === 'smart') {
              // 智能覆盖策略：只填充空白字段
              const detail = missingCharDetails.get(name) || {};
              if (detail.appearance) {
                await exHelper(
                  `UPDATE characters SET 
                    appearance = COALESCE(NULLIF(appearance, ''), ?),
                    base_appearance = COALESCE(NULLIF(base_appearance, ''), ?),
                    outfit_appearance = COALESCE(NULLIF(outfit_appearance, ''), ?),
                    personality = COALESCE(NULLIF(personality, ''), ?),
                    description = COALESCE(NULLIF(description, ''), ?),
                    updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?`,
                  [detail.appearance, detail.base_appearance || detail.appearance, detail.outfit_appearance, detail.personality, detail.description, existingId]
                );
                // 同步更新白膜状态
                try {
                  await exHelper(
                    `UPDATE character_states SET appearance = COALESCE(NULLIF(appearance, ''), ?) WHERE character_id = ? AND is_base_model = 1`,
                    [detail.base_appearance || detail.appearance || '', existingId]
                  );
                  // 智能覆盖：默认服装状态的 outfit/held_props 为空时才填充
                  await exHelper(
                    `UPDATE character_states SET
                        outfit = COALESCE(NULLIF(outfit, ''), ?),
                        held_props = COALESCE(NULLIF(held_props, ''), ?)
                     WHERE character_id = ? AND is_base_model = 0 AND name = '默认服装'`,
                    [detail.outfit_appearance || '', detail.held_props || '', existingId]
                  );
                } catch (e) { /* ignore */ }
              }
              characters.push({
                id: existingId,
                name,
                appearance: detail.appearance || '',
                personality: detail.personality || '',
                description: detail.description || '(智能覆盖补充)',
                _crossValidated: true
              });
              validation.missing.push({ name, id: existingId, source: 'smart_update' });
              console.log('[CharacterExtraction] 智能覆盖交叉校验已有角色:', name);
            } else {
              // 覆盖策略：用 AI 详情更新并加入返回列表
              const detail = missingCharDetails.get(name) || {};
              if (detail.appearance) {
                await exHelper(
                  `UPDATE characters SET appearance = ?, base_appearance = ?, outfit_appearance = ?, personality = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                  [detail.appearance || '', detail.base_appearance || detail.appearance || '', detail.outfit_appearance || '', detail.personality || '', detail.description || '', existingId]
                );
                // 同步更新白膜状态 + 默认服装状态（含手持道具）
                try {
                  await exHelper(
                    `UPDATE character_states SET appearance = ? WHERE character_id = ? AND is_base_model = 1`,
                    [detail.base_appearance || detail.appearance || '', existingId]
                  );
                  await exHelper(
                    `UPDATE character_states SET outfit = ?, appearance = ?, held_props = ? WHERE character_id = ? AND is_base_model = 0 AND name = '默认服装'`,
                    [detail.outfit_appearance || '', detail.appearance || '', detail.held_props || '', existingId]
                  );
                } catch (e) { /* ignore */ }
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
            }
          } else {
            // 插入新角色记录（含 AI 生成的详情 + 分层外貌 + 白膜/服装状态）
            const detail = missingCharDetails.get(name) || {};
            const baseApp = detail.base_appearance || detail.appearance || '';
            const outfitApp = detail.outfit_appearance || '';
            const fullApp = detail.appearance || baseApp;
            const insertResult = await exHelper(
              `INSERT INTO characters (user_id, project_id, script_id, name, appearance, base_appearance, outfit_appearance, personality, description, source)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'cross_validated')`,
              [
                userId, projectId, scriptId || null, name,
                fullApp, baseApp, outfitApp,
                detail.personality || '',
                detail.description || '(分镜交叉校验自动补充)'
              ]
            );
            const newCharId = insertResult.insertId;
            // 创建白膜状态
            try {
              await exHelper(
                `INSERT INTO character_states (character_id, is_base_model, name, description, appearance, gender, is_active, generation_status)
                 VALUES (?, 1, '基础白膜', '角色基础白膜版本', ?, 'unknown', 1, 'idle')`,
                [newCharId, baseApp]
              );
              // 创建默认服装状态（含手持道具）
              await exHelper(
                `INSERT INTO character_states (character_id, is_base_model, name, description, appearance, outfit, held_props, gender, is_active, generation_status, state_category)
                 VALUES (?, 0, '默认服装', '角色默认服装状态', ?, ?, ?, 'unknown', 0, 'idle', '"costume"')`,
                [newCharId, fullApp, outfitApp, detail.held_props || '']
              );
            } catch (stateErr) {
              console.warn('[CharacterExtraction] 创建遗漏角色的白膜/服装状态失败:', name, stateErr.message);
            }
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

  // === 异步触发白膜+默认服装三视图生成 ===
  // 对每个新创建或被覆盖更新的角色，如果提供了 imageModel，则异步触发白膜三视图生成
  // 白膜生成完成后，前端可通过工作流监听自动触发默认服装状态生成
  const { imageModel } = inputParams;
  const charactersNeedingViews = characters.filter(c => c.id && effectiveStrategy !== 'skip');
  if (imageModel && charactersNeedingViews.length > 0 && projectId) {
    console.log(`[CharacterExtraction] 异步触发 ${charactersNeedingViews.length} 个角色的白膜三视图生成...`);
    // 异步触发，不阻塞主流程
    setImmediate(async () => {
      const handleCharacterViewsGeneration = require('./characterViewsGeneration');
      const { queryOne: qo } = require('../../../dbHelper');
      for (const character of charactersNeedingViews) {
        try {
          // 获取角色的白膜状态 ID
          const baseState = await qo(
            'SELECT id, gender FROM character_states WHERE character_id = ? AND is_base_model = 1',
            [character.id]
          );
          if (!baseState) {
            console.warn(`[CharacterExtraction] 角色 ${character.name} 无白膜状态，跳过三视图生成`);
            continue;
          }
          // 先生成白膜三视图
          console.log(`[CharacterExtraction] 开始生成角色 ${character.name} 的白膜三视图...`);
          await handleCharacterViewsGeneration({
            characterId: character.id,
            characterName: character.name,
            appearance: character.base_appearance || character.appearance || '',
            description: character.description || '',
            personality: character.personality || '',
            projectId,
            imageModel,
            textModel: modelName,
            isBaseModel: true,
            gender: baseState.gender || 'unknown',
            stateId: baseState.id
          }, null);
          console.log(`[CharacterExtraction] ✅ 角色 ${character.name} 白膜三视图生成完成`);

          // 白膜生成完成后，获取默认服装状态并生成服装三视图
          // 多查一个 held_props，保证自动三视图与状态字段语义一致
          const costumeState = await qo(
            `SELECT id, outfit, held_props FROM character_states WHERE character_id = ? AND is_base_model = 0 AND name = '默认服装'`,
            [character.id]
          );
          if (costumeState) {
            console.log(`[CharacterExtraction] 开始生成角色 ${character.name} 的默认服装三视图...`);
            await handleCharacterViewsGeneration({
              characterId: character.id,
              characterName: character.name,
              appearance: character.appearance || '',
              description: character.description || '',
              personality: character.personality || '',
              projectId,
              imageModel,
              textModel: modelName,
              isBaseModel: false,
              gender: baseState.gender || 'unknown',
              stateId: costumeState.id,
              outfit: costumeState.outfit || character.outfit_appearance || '',
              heldProps: costumeState.held_props || ''
            }, null);
            console.log(`[CharacterExtraction] ✅ 角色 ${character.name} 默认服装三视图生成完成`);
          }
        } catch (viewGenErr) {
          console.error(`[CharacterExtraction] 角色 ${character.name} 三视图生成失败:`, viewGenErr.message);
        }
      }
    });
  } else if (!imageModel && charactersNeedingViews.length > 0) {
    console.log('[CharacterExtraction] 未提供 imageModel，跳过自动三视图生成（前端可手动触发）');
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
