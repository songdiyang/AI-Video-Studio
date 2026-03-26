/**
 * 场景图片生成任务
 * 根据场景信息生成场景图片
 * 
 * input: {
 *   sceneId: number,
 *   sceneName: string,
 *   description: string,
 *   environment: string,
 *   lighting: string,
 *   mood: string,
 *   style: string,
 *   imageModel: string,
 *   aspectRatio: string,
 *   width: number,
 *   height: number
 * }
 * 
 * output: {
 *   imageUrl: string,
 *   sceneId: number
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute, queryOne } = require('../../../dbHelper');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { downloadAndStore } = require('../../../utils/fileStorage');
const { traced, trace } = require('../../engine/generationTrace');
const { assertUpdated, assertPersistedFields } = require('./persistenceGuard');

/**
 * 使用 AI 生成场景图片提示词
 */
async function generateScenePrompt(sceneName, description, environment, lighting, mood, style, textModelName, styleDescription) {
  console.log('[SceneImageGen] 使用 AI 生成场景图片提示词...');

  // 风格一致性描述（来自关联场景分析）
  const styleConsistencyLine = styleDescription 
    ? `\n\n【重要 - 风格一致性要求】\n以下是与本场景关联的场景的视觉风格描述，你生成的提示词必须保持一致的视觉风格：\n${styleDescription}`
    : '';

  const fullPrompt = `你是一个专业的图片生成提示词专家。你的任务是根据场景信息生成高质量的场景图片生成提示词（用于 Stable Diffusion、Midjourney 等 AI 绘图工具）。

要求：
1. 提示词必须用英文输出
2. 使用逗号分隔的关键词格式
3. 包含：场景环境、光照效果、氛围、构图、画质描述
4. 除了排除人物的否定词外，尽量避免使用其他否定词（如 without 等）
5. 简洁明确，突出场景特征
6. 长度控制在 100-150 个单词
7. 重点描述环境细节、光影效果、氛围营造
8. 如果有风格一致性要求，必须严格遵守，确保建筑风格、色调、时代感等保持一致
9. 【严格禁止】这是纯场景/环境图，画面中绝对不能出现任何人物、角色、人影、剪影、行人或任何人体部分。只描述建筑、自然环境、物品、光影等非人物元素
10. 在提示词开头加上 "empty scene, no people, no characters, no figures, uninhabited,"

示例格式：
scene description, environment details, lighting conditions, mood and atmosphere, composition, art style, high quality, detailed, cinematic

---

请为以下场景生成图片提示词：

场景名称：${sceneName || '未命名场景'}
场景描述：${description || '无'}
环境描述：${environment || '无'}
光照描述：${lighting || '无'}
氛围描述：${mood || '无'}
风格要求：${style || '写实风格'}${styleConsistencyLine}

请直接输出英文提示词，不要包含任何解释或其他内容。`;

  // 调用基础文本模型
  const response = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel: textModelName,
    temperature: 0.7
  });

  console.log('[SceneImageGen] baseTextModelCall 响应:', JSON.stringify(response).substring(0, 500));

  // 提取生成的提示词
  let prompt = '';
  
  if (typeof response === 'string') {
    prompt = response;
  } else if (response && response.content) {
    prompt = response.content;
  } else if (response && response.text) {
    prompt = response.text;
  } else if (response && response.message) {
    prompt = response.message;
  } else if (response && response.taskId) {
    throw new Error(`错误：调用了图片生成模型而非文本模型。响应: ${JSON.stringify(response).substring(0, 200)}`);
  }
  
  if (!prompt) {
    console.error('[SceneImageGen] 无法提取提示词，完整响应:', JSON.stringify(response));
    throw new Error(`AI 响应中没有内容。响应类型: ${typeof response}, 响应: ${JSON.stringify(response).substring(0, 200)}`);
  }

  // 清理提示词
  prompt = prompt.trim();
  
  // 移除可能的引号包裹
  if ((prompt.startsWith('"') && prompt.endsWith('"')) || 
      (prompt.startsWith("'") && prompt.endsWith("'"))) {
    prompt = prompt.slice(1, -1);
  }
  
  // 移除换行符
  prompt = prompt.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  
  console.log('[SceneImageGen] 生成的提示词:', prompt.substring(0, 200));
  
  return prompt;
}

/**
 * 生成 B 面（反打/180°反向）场景提示词
 * 基于场景信息和 A 面提示词，生成从相反方向观察同一场景的提示词
 */
async function generateReverseScenePrompt(sceneName, description, environment, lighting, mood, style, textModelName, aFacePrompt, styleDescription) {
  console.log('[SceneImageGen] 生成 B 面（反打）场景提示词...');

  const styleConsistencyLine = styleDescription
    ? `\n\n【重要 - 风格一致性要求】\n${styleDescription}`
    : '';

  const fullPrompt = `你是一个专业的图片生成提示词专家。你需要为同一个场景生成一个"反打"（Reverse Shot）视角的提示词。

【180° 轴线原则】
在电影拍摄中，同一个场景通常只需要 A/B 两个视角：
- A 面（正打）：从场景的一端看向另一端（已生成）
- B 面（反打）：从相反方向看回来（你需要生成的）

【A 面提示词（已生成，供参考）】
${aFacePrompt}

【场景信息】
场景名称：${sceneName || '未命名场景'}
场景描述：${description || '无'}
环境描述：${environment || '无'}
光照描述：${lighting || '无'}
氛围描述：${mood || '无'}
风格要求：${style || '写实风格'}${styleConsistencyLine}

【B 面生成规则】
1. 摄像机转 180°，从相反方向拍摄同一场景
2. A 面背景中的主要元素（如佛像、窗户、大门）现在在摄像机身后，不应出现
3. B 面背景应该是 A 面中摄像机所在位置方向的场景元素（如 A 面对着佛像拍，B 面背景就是大门/走廊方向）
4. 光线方向必须与 A 面镜像翻转（A 面逆光 → B 面顺光，A 面光从左来 → B 面光从右来）
5. 色调、氛围、画质风格必须与 A 面保持一致（同一个场景，只是视角不同）
6. 同样是无人空镜，不能出现任何人物
7. 在提示词开头加上 "empty scene, no people, no characters, no figures, uninhabited,"
8. 使用逗号分隔的英文关键词格式，长度控制在 100-150 个单词

请直接输出 B 面的英文提示词，不要包含任何解释。`;

  const response = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel: textModelName,
    maxTokens: 2000,
    temperature: 0.7
  });

  let prompt = '';
  if (typeof response === 'string') {
    prompt = response;
  } else if (response && response.content) {
    prompt = response.content;
  } else if (response && response.text) {
    prompt = response.text;
  } else if (response && response.message) {
    prompt = response.message;
  }

  if (!prompt) {
    throw new Error(`B 面提示词生成失败：AI 响应中没有内容`);
  }

  prompt = prompt.trim();
  if ((prompt.startsWith('"') && prompt.endsWith('"')) ||
      (prompt.startsWith("'") && prompt.endsWith("'"))) {
    prompt = prompt.slice(1, -1);
  }
  prompt = prompt.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  console.log('[SceneImageGen] B 面提示词:', prompt.substring(0, 200));
  return prompt;
}

/**
 * 场景图片生成主处理器（A/B 双面生成）
 */
async function handleSceneImageGeneration(inputParams, onProgress) {
  const { 
    sceneId, 
    sceneName, 
    description, 
    environment, 
    lighting, 
    mood, 
    style: inputStyle, 
    imageModel: resolvedImageModel,
    textModel: resolvedTextModel,
    aspectRatio,
    resolution,
    width,
    height,
    referenceImageUrl,
    styleDescription
  } = inputParams;


  // 项目视觉风格（必填，未设置则报错）
  let projectId = null;
  if (sceneId) {
    const scene = await queryOne('SELECT project_id FROM scenes WHERE id = ?', [sceneId]);
    projectId = scene?.project_id;
  }
  const style = await requireVisualStyle(projectId);

  console.log('[SceneImageGen] 开始生成场景图片:', {
    sceneId,
    sceneName,
    style: style.substring(0, 60) + (style.length > 60 ? '...' : ''),
    imageModel: resolvedImageModel,
    aspectRatio: aspectRatio || `${width}x${height}`,
    hasReferenceImage: !!referenceImageUrl,
    hasStyleDescription: !!styleDescription
  });

  // 参数验证
  if (!sceneId) {
    throw new Error('缺少必要参数：sceneId');
  }

  if (!sceneName && !description && !environment) {
    throw new Error('场景信息不足：至少需要提供场景名称、描述或环境描述之一');
  }

  if (!resolvedImageModel) {
    throw new Error('imageModel 参数是必需的');
  }

  if (onProgress) onProgress(5);

  console.log('[SceneImageGen] 使用文本模型:', resolvedTextModel);
  console.log('[SceneImageGen] 使用图片模型:', resolvedImageModel);

  if (onProgress) onProgress(10);

  // 步骤1：生成 A 面（正打）场景图片提示词
  console.log('[SceneImageGen] 生成 A 面（正打）场景提示词...');
  const scenePrompt = await generateScenePrompt(
    sceneName, description, environment, lighting, mood,
    style, resolvedTextModel, styleDescription
  );
  console.log(`\x1b[32m[SceneImageGen] A 面提示词: ${scenePrompt}\x1b[0m`);
  trace('A面提示词生成完成', { prompt: scenePrompt });

  if (onProgress) onProgress(15);

  // 步骤2：生成 B 面（反打）场景图片提示词
  let reversePrompt = '';
  if (resolvedTextModel) {
    reversePrompt = await generateReverseScenePrompt(
      sceneName, description, environment, lighting, mood,
      style, resolvedTextModel, scenePrompt, styleDescription
    );
    console.log(`\x1b[32m[SceneImageGen] B 面提示词: ${reversePrompt}\x1b[0m`);
    trace('B面提示词生成完成', { prompt: reversePrompt });
  }

  if (onProgress) onProgress(25);

  // 步骤3：并行生成 A/B 两面场景图片
  console.log('[SceneImageGen] 并行生成 A/B 两面场景图片...');
  const imageParamsA = { prompt: scenePrompt, imageModel: resolvedImageModel, aspectRatio, resolution, width, height };
  if (referenceImageUrl) {
    imageParamsA.imageUrl = referenceImageUrl;
    console.log('[SceneImageGen] A 面使用参考图:', referenceImageUrl);
  }

  // A/B 面并行生成
  const generateA = handleImageGeneration(imageParamsA, (progress) => {
    if (onProgress) onProgress(25 + progress * 0.3); // 25% -> 55%
  });

  let generateB = null;
  if (reversePrompt) {
    const imageParamsB = { prompt: reversePrompt, imageModel: resolvedImageModel, aspectRatio, resolution, width, height };
    if (referenceImageUrl) {
      imageParamsB.imageUrl = referenceImageUrl;
    }
    generateB = handleImageGeneration(imageParamsB, (progress) => {
      if (onProgress) onProgress(55 + progress * 0.3); // 55% -> 85%
    });
  }

  const [imageResultA, imageResultB] = await Promise.all([
    generateA,
    generateB || Promise.resolve(null)
  ]);

  const imageUrlA = imageResultA.image_url;
  const imageUrlB = imageResultB?.image_url || null;
  console.log('[SceneImageGen] ✅ A 面生成完成:', imageUrlA);
  trace('A面图片生成完成', { url: imageUrlA });
  if (imageUrlB) {
    console.log('[SceneImageGen] ✅ B 面生成完成:', imageUrlB);
    trace('B面图片生成完成', { url: imageUrlB });
  }

  if (onProgress) onProgress(85);

  // 步骤4：持久化到 MinIO
  const persistedImageUrl = await downloadAndStore(
    imageUrlA,
    `images/scenes/${sceneId}/scene_a`,
    { fallbackExt: '.png' }
  );

  let persistedReverseUrl = null;
  if (imageUrlB) {
    persistedReverseUrl = await downloadAndStore(
      imageUrlB,
      `images/scenes/${sceneId}/scene_b`,
      { fallbackExt: '.png' }
    );
  }

  if (onProgress) onProgress(92);

  // 步骤5：保存图片 URL 到数据库
  if (sceneId && persistedImageUrl) {
    const updateResult = await execute(
      `UPDATE scenes 
       SET image_url = ?, 
           reverse_image_url = ?,
           generation_prompt = ?, 
           reverse_generation_prompt = ?,
           generation_status = 'completed', 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [persistedImageUrl, persistedReverseUrl, scenePrompt, reversePrompt || null, sceneId]
    );
    assertUpdated(updateResult, '[SceneImageGen] 场景图片');
    await assertPersistedFields({
      table: 'scenes',
      id: sceneId,
      fields: persistedReverseUrl ? ['image_url', 'reverse_image_url'] : ['image_url'],
      label: '[SceneImageGen] 场景图片'
    });
    console.log('[SceneImageGen] ✅ A/B 面场景图片已保存到数据库');
    trace('A/B面持久化完成', { imageUrl: persistedImageUrl, reverseImageUrl: persistedReverseUrl });
  }

  if (onProgress) onProgress(100);

  return {
    imageUrl: persistedImageUrl,
    reverseImageUrl: persistedReverseUrl,
    sceneId,
    prompt: scenePrompt,
    reversePrompt: reversePrompt || null,
    imageModel: resolvedImageModel,
    textModel: resolvedTextModel
  };
}

module.exports = handleSceneImageGeneration;
