/**
 * 场景参考图工具模块（State-Aware Dynamic Asset Flow）
 * 
 * 提供两个核心能力：
 * 1. generateUpdatedSceneImage — modified 镜头后生成干净空镜场景图（无角色）
 * 2. queryActiveSceneUrl — inherit 镜头自查数据库，获取最近一次 modified 生成的空镜 URL
 * 
 * 被 frameGeneration.js / singleFrameGeneration.js 调用，保证单独调用也能正确处理场景状态
 */

const { queryOne, execute } = require('../../../dbHelper');
const handleImageGeneration = require('../base/imageGeneration');
const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { downloadAndStore } = require('../../../utils/fileStorage');

/**
 * 生成更新版空镜场景图（不含角色，仅环境）
 * 当场景发生 modified 时，用原始场景图 + 环境变化描述生成一张干净的场景图
 * 生成后自动写入该分镜的独立字段 updated_scene_url
 * 
 * @param {Object} opts
 * @param {number} opts.storyboardId - 当前分镜 ID
 * @param {string} opts.location - 场景名称
 * @param {string} opts.environmentChange - 环境变化描述（英文）
 * @param {string} opts.imageModel - 图片模型名称
 * @param {string} opts.textModel - 文本模型名称
 * @param {string} opts.aspectRatio
 * @returns {string|null} 持久化后的空镜场景图 URL，失败返回 null
 */
async function generateUpdatedSceneImage({ storyboardId, location, environmentChange, imageModel, textModel, aspectRatio }) {
  console.log(`[SceneRefUtils] 🎨 生成更新版场景图：场景「${location}」，变化: ${environmentChange}`);

  // 1. 查询影棚关联的环境信息（优先从影棚获取场景参考图）
  let sceneRow = null;
  const studioRow = await queryOne(
    `SELECT st.name, st.description AS studio_description, st.nine_grid_image_url,
            st.environment_view,
            e.name AS env_name, e.description AS env_description,
            e.image_url AS env_front_url, e.image_back_url AS env_back_url
     FROM storyboard_scenes ssc
     JOIN studios st ON ssc.studio_id = st.id
     LEFT JOIN environments e ON st.environment_id = e.id
     WHERE ssc.storyboard_id = ? AND st.name = ?`,
    [storyboardId, location]
  );

  if (studioRow) {
    // 选择影棚偏好视角的环境图作为参考
    const envUrl = studioRow.environment_view === 'back'
      ? (studioRow.env_back_url || studioRow.env_front_url)
      : (studioRow.env_front_url || studioRow.env_back_url);
    sceneRow = {
      name: studioRow.name,
      description: studioRow.env_description || studioRow.studio_description || `${location}场景`,
      environment: studioRow.env_description || `${location}场景`,
      lighting: '自然光',
      mood: '中性',
      image_url: studioRow.nine_grid_image_url || envUrl
    };
  } else {
    // 兜底：尝试旧 scenes 表（兼容老数据）
    sceneRow = await queryOne(
      `SELECT s.name, s.description, s.environment, s.lighting, s.mood, s.image_url
       FROM storyboard_scenes ss
       JOIN scenes s ON ss.scene_id = s.id
       WHERE ss.storyboard_id = ? AND s.name = ?`,
      [storyboardId, location]
    );
  }

  if (!sceneRow || !sceneRow.image_url) {
    console.warn(`[SceneRefUtils] 场景「${location}」未找到原始场景图，跳过空镜生成`);
    return null;
  }

  // 2. 生成空镜场景提示词
  const scenePromptResult = await handleBaseTextModelCall({
    prompt: `你是一个专业的场景图片提示词专家。

请根据以下场景信息和环境变化，生成一张「纯场景空镜」的图片提示词：

原始场景：${sceneRow.name}
场景描述：${sceneRow.description}
环境：${sceneRow.environment}
光照：${sceneRow.lighting}
氛围：${sceneRow.mood}

【环境变化 - 必须体现】
${environmentChange}

要求：
1. 画面中绝对不能出现任何人物、角色、人影
2. 必须包含上述环境变化（如碎杯子、洒落的液体等）
3. 保持原始场景的空间结构、建筑风格、色调不变
4. 使用中性机位（不要特写或极端角度），展示场景全貌
5. 提示词开头加 "empty scene, no people, no characters, no figures,"
6. 只输出英文提示词，不要其他解释`,
    textModel,
    maxTokens: 1000,
    temperature: 0.5
  });

  const scenePrompt = scenePromptResult.content || `empty scene, no people, ${environmentChange}, ${sceneRow.environment}`;
  console.log(`[SceneRefUtils] 空镜提示词: ${scenePrompt.substring(0, 100)}...`);

  // 3. 用原始场景图作为参考，生成更新版场景图
  const imageResult = await handleImageGeneration({
    prompt: scenePrompt,
    imageModel,
    imageUrl: sceneRow.image_url,
    aspectRatio
  });

  const generatedUrl = imageResult.image_url;
  if (!generatedUrl) {
    console.warn('[SceneRefUtils] 空镜场景图生成失败，无返回 URL');
    return null;
  }

  // 4. 持久化到 MinIO
  const persistedUrl = await downloadAndStore(
    generatedUrl,
    `images/scenes/updated/${storyboardId}/${location.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_')}`,
    { fallbackExt: '.png' }
  );

  // 5. 写入分镜的独立字段 updated_scene_url
  try {
    await execute(
      'UPDATE storyboards SET updated_scene_url = ? WHERE id = ?',
      [persistedUrl, storyboardId]
    );
    console.log(`[SceneRefUtils] ✅ updated_scene_url 已写入分镜 ${storyboardId}`);
  } catch (e) {
    console.error('[SceneRefUtils] 写入 updated_scene_url 失败:', e.message);
  }

  console.log(`[SceneRefUtils] ✅ 更新版场景图已生成: ${persistedUrl}`);
  return persistedUrl;
}

/**
 * 查询最近一次同 location 的 modified 镜头所生成的空镜场景图 URL
 * 用于 inherit 镜头在单独调用时自行获取 activeSceneUrl
 * 
 * @param {number} scriptId - 剧本 ID
 * @param {number} currentIdx - 当前镜头 idx
 * @param {string} location - 场景名称
 * @returns {string|null} 最近 modified 镜头的 updated_scene_url，未找到返回 null
 */
async function queryActiveSceneUrl(scriptId, currentIdx, location) {
  if (!scriptId || currentIdx == null || !location) return null;

  // 向前查找同 location 最近的 modified 镜头，直接读取独立字段 updated_scene_url
  const row = await queryOne(
    `SELECT updated_scene_url FROM storyboards 
     WHERE script_id = ? AND idx < ? 
       AND updated_scene_url IS NOT NULL 
       AND JSON_UNQUOTE(JSON_EXTRACT(variables_json, '$.location')) = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(variables_json, '$.scene_state')) = 'modified'
     ORDER BY idx DESC LIMIT 1`,
    [scriptId, currentIdx, location]
  );

  if (row && row.updated_scene_url) {
    console.log(`[SceneRefUtils] 查询到场景「${location}」最近 modified 空镜: ${row.updated_scene_url}`);
    return row.updated_scene_url;
  }

  console.log(`[SceneRefUtils] 场景「${location}」未找到 modified 空镜记录`);
  return null;
}

module.exports = { generateUpdatedSceneImage, queryActiveSceneUrl };
