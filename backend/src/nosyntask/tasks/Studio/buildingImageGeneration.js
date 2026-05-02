/**
 * 建筑结构图生成任务
 * 根据建筑信息（名称、描述、室内/室外、结构类型）生成建筑图片
 * 支持分别生成室内图(interior)和室外图(exterior)
 *
 * input: {
 *   buildingId: number,
 *   buildingName: string,
 *   description: string,
 *   interiorExterior: string,
 *   structureType: string,
 *   imageModel: string,
 *   textModel: string,
 *   viewType?: string,        // 'interior' | 'exterior' | null(默认兼容旧逻辑)
 *   generationPrompt?: string (已有提示词时直接使用)
 * }
 *
 * output: {
 *   imageUrl: string,
 *   buildingId: number,
 *   viewType: string | null
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute, queryOne } = require('../../../dbHelper');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { downloadAndStore } = require('../../../utils/fileStorage');

/**
 * AI 生成建筑图片提示词
 * @param {string} viewType - 'interior' | 'exterior' | null，指定生成室内还是室外视角
 *   - 'exterior'：四方位正交视图（front/back/left/right）合成 2×2 网格，建筑参考图
 *   - 'interior'：房屋内部设计草图 / 线稿平立面，表达空间布局与家具陈设
 */
async function generateBuildingPrompt(buildingName, description, interiorExterior, structureType, style, textModel, viewType) {
  const effectiveView = viewType || interiorExterior || 'exterior';
  const isInterior = effectiveView === 'interior';
  const viewLabel = isInterior ? '室内设计草图' : '室外四方位参考图';

  const exteriorSpec = `
【外景专项要求 - 极其重要】
- 画面整体为 16:9 横向宽幅（wide 16:9 aspect ratio），2×2 网格布局（2x2 grid layout），一张图同时包含四个正交视角：
  · 左上：front view（正面）
  · 右上：back view（背面）
  · 左下：left side view（左侧面）
  · 右下：right side view（右侧面）
- 每一格下方标注视角名称（labeled "Front" / "Back" / "Left" / "Right"）
- 四格之间保持相同的建筑、相同的材质、相同的配色、相同的画风、相同的光照、相同的比例
- 相机固定为正交投影（orthographic projection），视线水平，无透视畸变
- 白色或极简背景，建筑作为唯一主体
- 建筑参考图样式（architectural reference sheet / turnaround sheet style, 16:9 wide composition）`;

  const interiorSpec = `
【内景专项要求 - 极其重要】
- 画面为"室内设计草图"（interior design sketch）风格：手绘线稿 + 轻度水彩淡彩上色
- 展示建筑内部空间布局：家具陈设、墙体分隔、门窗位置、动线
- 可采用等距轴测视角（isometric cutaway）或一点透视室内视图
- 线条干净、标注感强、设计图风格（architectural interior design sketch, concept art）
- 暖色调柔和打光，表达材质与氛围但不追求照片级写实`;

  const prompt = `你是一个专业的图片生成提示词专家。请根据以下建筑信息生成高质量的建筑${viewLabel}提示词（用于 AI 绘图工具）。

通用要求：
1. 提示词必须用英文输出
2. 使用逗号分隔的关键词格式
3. 长度控制在 80-140 个单词
4. 严格禁止出现任何人物、角色、人影
5. 在提示词开头加上 "single isolated building, no people, no characters,"
${isInterior ? interiorSpec : exteriorSpec}

建筑名称：${buildingName || '未命名'}
建筑描述：${description || '无'}
指定视角：${viewLabel}
结构类型：${structureType || '无'}
视觉风格：${style || '写实风格'}

请直接输出英文提示词，不要包含任何解释或其他内容。`;

  const response = await handleBaseTextModelCall({
    prompt,
    textModel,
    temperature: 0.7
  });

  let text = '';
  if (typeof response === 'string') text = response;
  else if (response?.content) text = response.content;
  else if (response?.text) text = response.text;
  else if (response?.message) text = response.message;

  if (!text) throw new Error('AI 响应为空，建筑提示词生成失败');

  text = text.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  }
  text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  return text;
}

async function handleBuildingImageGeneration(inputParams, onProgress) {
  const {
    buildingId,
    buildingName,
    description,
    interiorExterior,
    structureType,
    imageModel,
    textModel,
    viewType,
    generationPrompt
  } = inputParams;

  if (!buildingId) throw new Error('缺少必要参数：buildingId');
  if (!imageModel) throw new Error('imageModel 参数是必需的');

  // 归一化 viewType：'interior' / 'exterior' / 'both'
  // 若未指定，依据 interior_exterior 推导：both → both，interior → interior，其余 → exterior
  let normalizedView;
  if (viewType === 'interior' || viewType === 'exterior' || viewType === 'both') {
    normalizedView = viewType;
  } else if (interiorExterior === 'both') {
    normalizedView = 'both';
  } else if (interiorExterior === 'interior') {
    normalizedView = 'interior';
  } else {
    normalizedView = 'exterior';
  }

  // 标记生成中
  await execute(
    "UPDATE buildings SET generation_status = 'generating' WHERE id = ?",
    [buildingId]
  );

  if (onProgress) onProgress(5);

  try {
    // 获取项目视觉风格
    const building = await queryOne('SELECT project_id FROM buildings WHERE id = ?', [buildingId]);
    const style = await requireVisualStyle(building?.project_id).catch(() => null);

    // 单视角生成的封装：返回 { prompt, persistedUrl }
    const generateSingleView = async (singleView, progressStart, progressSpan) => {
      // 每个视角独立生成 prompt（外景四方位 / 内景设计草图，差异显著，不复用）
      let prompt = null;
      if (textModel) {
        prompt = await generateBuildingPrompt(
          buildingName, description, interiorExterior, structureType, style, textModel, singleView
        );
      }
      if (!prompt) {
        // fallback
        if (singleView === 'interior') {
          prompt = `single isolated building, no people, no characters, ${buildingName || ''}, ${description || ''}, interior design sketch, architectural interior concept art, hand drawn lines with soft watercolor, isometric cutaway view, furniture layout, spatial plan, ${structureType || ''}, clean lines, warm lighting, high detail`;
        } else {
          prompt = `single isolated building, no people, no characters, ${buildingName || ''}, ${description || ''}, wide 16:9 aspect ratio, 2x2 grid layout showing four orthographic views, front view top-left, back view top-right, left side view bottom-left, right side view bottom-right, labeled Front Back Left Right, same building same materials same color palette same art style same lighting, orthographic projection, architectural reference sheet, turnaround sheet, white clean background, ${structureType || ''}, high quality, detailed`;
        }
      }

      console.log(`[BuildingImageGen] view=${singleView} 提示词: ${prompt.substring(0, 160)}...`);

      // 外景 4 视角采用 16:9 横向布局（一张图四格横向排列更清晰）；内景 1:1
      const isExterior = singleView === 'exterior';
      const width = isExterior ? 1920 : 1024;
      const height = isExterior ? 1080 : 1024;
      const aspectRatio = isExterior ? '16:9' : '1:1';

      const imageResult = await handleImageGeneration({
        prompt,
        imageModel,
        aspectRatio,
        width,
        height
      }, (p) => onProgress && onProgress(progressStart + p * progressSpan));

      const storagePath = `images/buildings/${buildingId}/${singleView}`;
      const persistedUrl = await downloadAndStore(
        imageResult.image_url,
        storagePath,
        { fallbackExt: '.png' }
      );

      return { prompt, persistedUrl };
    };

    let exteriorPersisted = null;
    let interiorPersisted = null;
    let lastPrompt = null;

    if (normalizedView === 'exterior' || normalizedView === 'both') {
      const { prompt, persistedUrl } = await generateSingleView(
        'exterior',
        10,
        normalizedView === 'both' ? 0.40 : 0.80
      );
      exteriorPersisted = persistedUrl;
      lastPrompt = prompt;
      await execute(
        "UPDATE buildings SET exterior_image_url = ? WHERE id = ?",
        [exteriorPersisted, buildingId]
      );
    }

    if (normalizedView === 'interior' || normalizedView === 'both') {
      const progressStart = normalizedView === 'both' ? 55 : 10;
      const progressSpan = normalizedView === 'both' ? 0.40 : 0.80;
      try {
        const { prompt, persistedUrl } = await generateSingleView('interior', progressStart, progressSpan);
        interiorPersisted = persistedUrl;
        lastPrompt = prompt;
        await execute(
          "UPDATE buildings SET interior_image_url = ? WHERE id = ?",
          [interiorPersisted, buildingId]
        );
      } catch (interiorErr) {
        // both 模式下：内景失败不影响已生成的外景
        if (normalizedView === 'both' && exteriorPersisted) {
          console.warn(`[BuildingImageGen] 内景生成失败，保留已完成的外景: ${interiorErr.message}`);
        } else {
          throw interiorErr;
        }
      }
    }

    // 写回最后一次有效 prompt（供参考/调试；两视角差异很大，这里只存最近一次）
    if (lastPrompt) {
      await execute(
        'UPDATE buildings SET generation_prompt = ? WHERE id = ?',
        [lastPrompt, buildingId]
      );
    }

    // 标记完成
    await execute(
      "UPDATE buildings SET generation_status = 'completed' WHERE id = ?",
      [buildingId]
    );

    if (onProgress) onProgress(100);
    console.log(`[BuildingImageGen] 建筑图片生成完成: buildingId=${buildingId}, view=${normalizedView}, exterior=${!!exteriorPersisted}, interior=${!!interiorPersisted}`);

    return {
      buildingId,
      viewType: normalizedView,
      exteriorImageUrl: exteriorPersisted,
      interiorImageUrl: interiorPersisted,
      // 兼容旧返回结构
      imageUrl: exteriorPersisted || interiorPersisted
    };
  } catch (err) {
    // 标记失败
    await execute(
      "UPDATE buildings SET generation_status = 'failed' WHERE id = ?",
      [buildingId]
    ).catch(() => {});
    throw err;
  }
}

module.exports = handleBuildingImageGeneration;
