/**
 * 角色状态「按项目画风」渲染 Handler
 *
 * 目标：以该角色的白膜三视图为参考，叠加目标状态的服装/发型/配饰/年龄等特征，
 *       并注入目标项目的 visualStylePrompt，生成项目画风专属的三视图，
 *       回写到 character_state_styled_images (state_id, project_id) 缓存表。
 *
 * 触发路径：
 *   operationKey = character_state_styled_generate
 *   workflowType = character_state_styled_generation
 *
 * input: {
 *   characterId, stateId, projectId, styleFingerprint,
 *   imageModel, textModel?
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const { execute, queryOne } = require('../../../dbHelper');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { downloadAndStore, resolveToInternalUrl } = require('../../../utils/fileStorage');

// 视角英文提示词
const VIEW_PROMPT = {
  front: 'front view, eye-level shot, facing the camera directly, full body, standing upright with natural relaxed posture, arms at sides',
  side: 'side view, 90-degree profile, full body silhouette, standing upright, arms naturally at sides',
  back: 'back view, rear shot, facing completely away from camera, full body, standing upright',
};

// 白膜/普通状态的服装描述拼装
function buildOutfitClause(state) {
  if (state.is_base_model) {
    return 'nude anatomical base body, no clothing, no accessories, clean neutral body reference';
  }
  const parts = [];
  if (state.outfit) parts.push(`outfit: ${state.outfit}`);
  if (state.hairstyle) parts.push(`hairstyle: ${state.hairstyle}`);
  if (state.accessories) parts.push(`accessories: ${state.accessories}`);
  if (state.age_stage) parts.push(`age stage: ${state.age_stage}`);
  return parts.length > 0 ? parts.join(', ') : 'default outfit, neutral attire';
}

/**
 * 更新缓存行的通用 upsert：保留未传字段
 */
async function upsertStyledRow({ stateId, projectId, styleFingerprint, status, front, side, back, error }) {
  await execute(
    `INSERT INTO character_state_styled_images
       (state_id, project_id, style_fingerprint, front_view_url, side_view_url, back_view_url, generation_status, generation_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       style_fingerprint = VALUES(style_fingerprint),
       front_view_url = COALESCE(VALUES(front_view_url), front_view_url),
       side_view_url  = COALESCE(VALUES(side_view_url),  side_view_url),
       back_view_url  = COALESCE(VALUES(back_view_url),  back_view_url),
       generation_status = VALUES(generation_status),
       generation_error  = VALUES(generation_error)`,
    [stateId, projectId, styleFingerprint, front || null, side || null, back || null, status, error || null]
  );
}

async function handleCharacterStateStyledGeneration(inputParams, onProgress) {
  const {
    characterId,
    stateId,
    projectId,
    styleFingerprint,
    imageModel,
  } = inputParams;

  if (!characterId || !stateId || !projectId) {
    throw new Error('characterId / stateId / projectId 均为必填');
  }
  if (!imageModel) {
    throw new Error('imageModel 参数是必需的');
  }

  if (onProgress) onProgress(2);

  // 1) 读取目标状态
  const state = await queryOne(
    `SELECT id, character_id, is_base_model, outfit, hairstyle, accessories, age_stage
     FROM character_states WHERE id = ? AND character_id = ?`,
    [stateId, characterId]
  );
  if (!state) {
    throw new Error('角色状态不存在');
  }

  // 2) 读取白膜三视图作为参考
  const baseState = await queryOne(
    `SELECT front_view_url, side_view_url, back_view_url
     FROM character_states
     WHERE character_id = ? AND is_base_model = 1
     LIMIT 1`,
    [characterId]
  );
  if (!baseState || !baseState.front_view_url) {
    throw new Error('白膜未就绪，请先完成白膜三视图再生成项目画风版');
  }

  // 3) 视觉风格
  const visualStylePrompt = await requireVisualStyle(projectId);
  if (!visualStylePrompt) {
    throw new Error('项目尚未设置视觉风格，无法生成画风版本');
  }

  // 4) 标记 generating（保险，接口层已先写一次）
  await upsertStyledRow({
    stateId, projectId, styleFingerprint, status: 'generating',
  });

  const storageBase = `images/characters/${characterId}/states/${stateId}/styled/${projectId}`;
  const ts = Date.now();
  const outfitClause = buildOutfitClause(state);

  const baseUrlMap = {
    front: baseState.front_view_url,
    side:  baseState.side_view_url,
    back:  baseState.back_view_url,
  };

  const persistedMap = { front: null, side: null, back: null };
  const progressSlot = { front: [5, 35], side: [35, 65], back: [65, 92] };

  try {
    const views = ['front', 'side', 'back'];
    for (const v of views) {
      const baseUrl = baseUrlMap[v];
      if (!baseUrl) {
        console.log(`[StyledGen] 白膜缺少 ${v} 视图，跳过同向画风图`);
        continue;
      }

      const [pStart, pEnd] = progressSlot[v];
      if (onProgress) onProgress(pStart);

      const prompt = [
        visualStylePrompt,
        'match body proportions and facial features exactly from the reference image',
        outfitClause,
        VIEW_PROMPT[v],
        'single character, solo, one person, full body, clean simple background, even soft lighting, neutral natural expression',
      ].join(', ');

      console.log(`[StyledGen] 生成 ${v} 画风图（state=${stateId}, project=${projectId}, model=${imageModel})`);

      const genResult = await handleImageGeneration({
        prompt,
        imageModel,
        aspectRatio: '9:16',
        imageUrls: [resolveToInternalUrl(baseUrl)],
        strength: 0.28, // 允许一定风格重绘，但保持参考图身型
      }, (p) => {
        if (onProgress) onProgress(pStart + ((pEnd - pStart) * (p / 100)));
      });

      if (!genResult || !genResult.image_url) {
        throw new Error(`${v} 视图生成未返回 URL`);
      }

      const persisted = await downloadAndStore(
        genResult.image_url,
        `${storageBase}/${v}_${ts}`,
        { fallbackExt: '.png' }
      );
      persistedMap[v] = persisted;
    }

    // 5) 完成回写
    await upsertStyledRow({
      stateId, projectId, styleFingerprint,
      status: 'completed',
      front: persistedMap.front,
      side: persistedMap.side,
      back: persistedMap.back,
    });

    if (onProgress) onProgress(100);

    return {
      stateId: Number(stateId),
      projectId: Number(projectId),
      styleFingerprint,
      frontViewUrl: persistedMap.front,
      sideViewUrl: persistedMap.side,
      backViewUrl: persistedMap.back,
    };
  } catch (error) {
    // 失败时写 failed 状态（不清空已成功生成的 URL）
    await upsertStyledRow({
      stateId, projectId, styleFingerprint,
      status: 'failed',
      front: persistedMap.front,
      side: persistedMap.side,
      back: persistedMap.back,
      error: error.message || String(error),
    }).catch(() => {});
    throw error;
  }
}

module.exports = handleCharacterStateStyledGeneration;
