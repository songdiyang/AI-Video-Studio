/**
 * 场景「按项目画风」渲染 Handler
 *
 * 目标：以场景原图 scenes.image_url 作为视觉锚点，注入项目 visualStylePrompt，
 *       生成项目画风专属场景图，回写到 scene_styled_images (scene_id, project_id)。
 *
 * 触发路径：
 *   operationKey = scene_styled_generate
 *   workflowType = scene_styled_generation
 *
 * input: {
 *   sceneId, projectId, styleFingerprint, imageModel
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const { execute, queryOne } = require('../../../dbHelper');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { downloadAndStore, resolveToInternalUrl } = require('../../../utils/fileStorage');

async function upsertSceneStyled({ sceneId, projectId, styleFingerprint, status, imageUrl, error }) {
  const existing = await queryOne(
    'SELECT id FROM scene_styled_images WHERE scene_id = ? AND project_id = ?',
    [sceneId, projectId]
  );
  if (existing) {
    await execute(
      `UPDATE scene_styled_images
       SET image_url = COALESCE(?, image_url),
           style_fingerprint = ?,
           generation_status = ?,
           generation_error = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [imageUrl || null, styleFingerprint, status, error || null, existing.id]
    );
  } else {
    await execute(
      `INSERT INTO scene_styled_images
         (scene_id, project_id, image_url, style_fingerprint, generation_status, generation_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [sceneId, projectId, imageUrl || null, styleFingerprint, status, error || null]
    );
  }
}

async function handleSceneStyledGeneration(inputParams, onProgress) {
  const {
    sceneId,
    projectId,
    styleFingerprint,
    imageModel,
  } = inputParams;

  if (!sceneId || !projectId) {
    throw new Error('sceneId / projectId 均为必填');
  }
  if (!imageModel) {
    throw new Error('imageModel 参数是必需的');
  }

  if (onProgress) onProgress(2);

  const scene = await queryOne(
    `SELECT id, name, description, environment, mood, lighting, spatial_layout, image_url
     FROM scenes WHERE id = ?`,
    [sceneId]
  );
  if (!scene) {
    throw new Error('场景不存在');
  }
  if (!scene.image_url) {
    throw new Error('场景原图尚未生成，请先生成基础场景图');
  }

  const visualStylePrompt = await requireVisualStyle(projectId);
  if (!visualStylePrompt) {
    throw new Error('项目尚未设置视觉风格，无法生成画风版本');
  }

  await upsertSceneStyled({ sceneId, projectId, styleFingerprint, status: 'generating' });

  if (onProgress) onProgress(10);

  const describeParts = [
    scene.name ? `scene: ${scene.name}` : '',
    scene.description ? `description: ${scene.description}` : '',
    scene.environment ? `environment: ${scene.environment}` : '',
    scene.spatial_layout ? `spatial layout: ${scene.spatial_layout}` : '',
    scene.lighting ? `lighting: ${scene.lighting}` : '',
    scene.mood ? `mood: ${scene.mood}` : '',
  ].filter(Boolean).join(', ');

  const prompt = [
    visualStylePrompt,
    'preserve the spatial composition, layout, and key landmarks from the reference image',
    describeParts,
    'wide establishing shot, cinematic landscape composition, no characters, no people',
  ].filter(Boolean).join(', ');

  try {
    const genResult = await handleImageGeneration({
      prompt,
      imageModel,
      aspectRatio: '16:9',
      imageUrls: [resolveToInternalUrl(scene.image_url)],
      strength: 0.32,
    }, (p) => {
      if (onProgress) onProgress(10 + p * 0.8);
    });

    if (!genResult || !genResult.image_url) {
      throw new Error('场景画风图生成未返回 URL');
    }

    const persisted = await downloadAndStore(
      genResult.image_url,
      `images/scenes/${sceneId}/styled/${projectId}/${Date.now()}`,
      { fallbackExt: '.png' }
    );

    await upsertSceneStyled({
      sceneId, projectId, styleFingerprint,
      status: 'completed',
      imageUrl: persisted,
    });

    if (onProgress) onProgress(100);

    return {
      sceneId: Number(sceneId),
      projectId: Number(projectId),
      styleFingerprint,
      imageUrl: persisted,
    };
  } catch (error) {
    await upsertSceneStyled({
      sceneId, projectId, styleFingerprint,
      status: 'failed',
      error: error.message || String(error),
    }).catch(() => {});
    throw error;
  }
}

module.exports = handleSceneStyledGeneration;
