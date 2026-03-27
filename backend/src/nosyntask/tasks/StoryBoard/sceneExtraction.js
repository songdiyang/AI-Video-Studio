/**
 * 场景提取处理器
 * 从分镜中提取场景信息并保存到数据库
 * input:  { scenes, scriptContent, projectId, scriptId, userId, textModel }
 * output: { scenes: [{ name, description, environment, lighting, mood }] }
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const handleRepairJsonResponse = require('./repairJsonResponse');
const { stripThinkTags, extractCodeBlock, extractJSON, stripInvisible, safeParseJSON } = require('../../../utils/washBody');

async function handleSceneExtraction(inputParams, onProgress) {
  const { scenes, scriptContent, textModel: modelName, projectId, scriptId, userId } = inputParams;

  if (!modelName) {
    throw new Error('textModel 参数是必需的');
  }
  
  console.log('[SceneExtraction] 参数:', { projectId, scriptId, userId, scenesCount: scenes?.length });

  if (onProgress) onProgress(10);

  // 从分镜 location 字段收集所有不重复的场景名称
  const locationSet = new Set();
  if (scenes && scenes.length > 0) {
    scenes.forEach(scene => {
      if (scene.location && scene.location.trim()) {
        locationSet.add(scene.location.trim());
      }
    });
  }
  const collectedLocations = Array.from(locationSet);
  console.log('[SceneExtraction] 从分镜收集到的场景名称:', collectedLocations);

  // 构建分镜内容供 AI 参考
  let contentForAnalysis = '';
  if (scenes && scenes.length > 0) {
    contentForAnalysis = `分镜数据（共 ${scenes.length} 个镜头）：\n\n`;
    scenes.forEach((scene, idx) => {
      contentForAnalysis += `镜头 ${idx + 1}:\n`;
      contentForAnalysis += `- 描述: ${scene.description || scene.prompt_template}\n`;
      if (scene.location) {
        contentForAnalysis += `- 地点: ${scene.location}\n`;
      }
      if (scene.emotion) {
        contentForAnalysis += `- 氛围: ${scene.emotion}\n`;
      }
      contentForAnalysis += '\n';
    });
  } else if (scriptContent) {
    contentForAnalysis = `剧本内容：\n${scriptContent}`;
  } else {
    throw new Error('必须提供 scriptContent 或 scenes 参数');
  }

  // 构建场景名称固定列表
  const locationListText = collectedLocations.length > 0
    ? `\n\n【固定场景名称列表 - 禁止修改】\n以下是从分镜中提取的所有场景名称，你必须为每一个场景都输出对应的信息，且 name 字段必须与下面的名称完全一致，不得修改、合并或省略任何一个：\n${collectedLocations.map((loc, i) => `${i + 1}. ${loc}`).join('\n')}\n`
    : '';

  const fullPrompt = `你是一个专业的场景分析助手。你的任务是为给定的场景名称补充详细的场景信息。

**重要：必须输出严格的 JSON 格式！**
- 所有字符串值必须用双引号包裹
- 不要输出缺少引号的值
- 确保 JSON 格式完整
- 只输出 JSON 数组，不要添加其他说明文字
${locationListText}
---

以下是分镜/剧本内容，请根据内容为每个场景补充详细信息：

${contentForAnalysis}

**核心规则：**
1. **禁止修改场景名称** — name 字段必须与固定列表中的名称完全一致
2. **禁止合并场景** — 即使场景相似（如"房子内"和"房子外"），也必须分别输出
3. **禁止遗漏场景** — 固定列表中的每个场景都必须出现在输出中
4. 为每个场景提供详细的环境描述、光照描述和氛围描述
5. 根据分镜中该场景出现的上下文来推断环境、光照和氛围

**重要：必须输出严格的 JSON 格式！**
- 确保 JSON 格式完整，以 ] 结尾
- 只输出 JSON 数组，不要添加其他说明文字
- 输出的场景数量必须等于 ${collectedLocations.length || '分镜中出现的场景数'}

请严格按以下 JSON 格式返回：
[
  {
    "name": "场景名称（必须与固定列表完全一致）",
    "description": "场景整体描述",
    "environment": "环境描述（建筑结构、空间布局、物品摆设等）",
    "lighting": "光照描述（光线来源、明暗对比、色调等）",
    "mood": "氛围描述（紧张、温馨、诡异等）"
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
  let extractedScenes = [];
  try {
    console.log('[SceneExtraction] 响应长度:', result.content.length, '字符');

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
      // 4. jsonrepair 库修复
      console.log('[SceneExtraction] 直接解析失败，使用 jsonrepair 修复...');
      try {
        const { jsonrepair } = await import('jsonrepair');
        const repaired = jsonrepair(jsonStr);
        parsed = JSON.parse(repaired);
        console.log('[SceneExtraction] ✅ jsonrepair 修复成功');
      } catch (repairLibError) {
        console.error('[SceneExtraction] ❌ jsonrepair 修复失败:', repairLibError.message);

        // 5. 最后手段：调用 AI 修复
        console.log('[SceneExtraction] 🔧 调用 AI 修复任务...');
        try {
          const repairResult = await handleRepairJsonResponse({
            incompleteJson: jsonStr,
            originalPrompt: fullPrompt,
            textModel: modelName
          }, (progress) => {
            if (onProgress) onProgress(70 + progress * 0.1);
          });

          if (repairResult.success && repairResult.repairedJson) {
            parsed = repairResult.repairedJson;
            console.log('[SceneExtraction] ✅ AI 修复成功');
          } else {
            throw new Error('AI 修复也失败: ' + (repairResult.error || 'unknown'));
          }
        } catch (aiRepairError) {
          console.error('[SceneExtraction] ❌ AI 修复失败:', aiRepairError);
          throw new Error('JSON 解析失败，jsonrepair 和 AI 修复均失败');
        }
      }
    }

    if (parsed === null) {
      throw new Error('JSON 解析失败');
    }

    // 确保返回数组
    extractedScenes = Array.isArray(parsed) ? parsed : (parsed.scenes || [parsed]);
    console.log('[SceneExtraction] 成功解析，共', extractedScenes.length, '个场景');

  } catch (parseError) {
    console.error('[SceneExtraction] 解析场景 JSON 失败:', parseError);
    console.error('[SceneExtraction] 完整响应内容:', result.content);
    throw new Error('场景解析失败，AI 返回的内容无法解析为 JSON: ' + parseError.message);
  }

  if (!Array.isArray(extractedScenes) || extractedScenes.length === 0) {
    console.warn('[SceneExtraction] AI 未返回有效的场景数据，返回空数组');
    extractedScenes = [];
  }

  // 校验：确保收集到的每个场景名都在结果中，缺失的自动补上
  if (collectedLocations.length > 0) {
    const returnedNames = new Set(extractedScenes.map(s => s.name));
    for (const loc of collectedLocations) {
      if (!returnedNames.has(loc)) {
        console.warn('[SceneExtraction] AI 遗漏场景，自动补充:', loc);
        extractedScenes.push({
          name: loc,
          description: '',
          environment: '',
          lighting: '',
          mood: ''
        });
      }
    }
    console.log('[SceneExtraction] 校验后场景数:', extractedScenes.length, '(预期:', collectedLocations.length, ')');
  }

  if (onProgress) onProgress(80);

  // 保存场景到数据库（批量查询已存在记录 + 分离插入/更新）
  if (projectId && userId && extractedScenes.length > 0) {
    console.log('[SceneExtraction] 保存', extractedScenes.length, '个场景到项目', projectId);
    
    const { queryAll, execute } = require('../../../dbHelper');
    
    // 批量查询已存在的场景（1 次 DB 查询代替 N 次）
    const sceneNames = extractedScenes.map(s => s.name).filter(Boolean);
    let existingMap = new Map();
    if (sceneNames.length > 0) {
      const placeholders = sceneNames.map(() => '?').join(',');
      const existingRows = await queryAll(
        `SELECT id, name FROM scenes WHERE project_id = ? AND user_id = ? AND name IN (${placeholders})`,
        [projectId, userId, ...sceneNames]
      );
      for (const row of existingRows) {
        existingMap.set(row.name, row.id);
      }
    }
    
    for (const scene of extractedScenes) {
      try {
        const existingId = existingMap.get(scene.name);
        if (existingId) {
          // 更新现有场景
          await execute(
            `UPDATE scenes 
             SET description = ?, environment = ?, lighting = ?, mood = ?, script_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
              scene.description || '',
              scene.environment || '',
              scene.lighting || '',
              scene.mood || '',
              scriptId || null,
              existingId
            ]
          );
          console.log('[SceneExtraction] 更新场景:', scene.name);
        } else {
          // 插入新场景
          await execute(
            `INSERT INTO scenes (user_id, project_id, script_id, name, description, environment, lighting, mood, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai_extracted')`,
            [
              userId,
              projectId,
              scriptId || null,
              scene.name,
              scene.description || '',
              scene.environment || '',
              scene.lighting || '',
              scene.mood || ''
            ]
          );
          console.log('[SceneExtraction] 新增场景:', scene.name);
        }
      } catch (dbError) {
        console.error('[SceneExtraction] 保存场景失败:', scene.name, dbError);
      }
    }
  } else {
    console.warn('[SceneExtraction] 缺少 projectId 或 userId，或没有场景数据，跳过数据库保存');
  }

  if (onProgress) onProgress(100);

  return {
    scenes: extractedScenes,
    count: extractedScenes.length,
    tokens: result.tokens || 0,
    provider: result._model?.provider || 'unknown'
  };
}

module.exports = handleSceneExtraction;
