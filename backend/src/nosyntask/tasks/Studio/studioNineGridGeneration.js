/**
 * 影棚九宫组装图生成任务
 *
 * 定位：
 *   影棚作为"环境 + 建筑(多)"组装成品，本任务基于影棚绑定的环境（1:1）
 *   与建筑（1:N），合成一张 3×3 九机位视角组合图，作为影棚整体概念稿。
 *
 * 9 机位布局（英文标注，3×3 网格）：
 *   Row 1: Main View（主视/正面平视） · Left View（左视）     · Right View（右视）
 *   Row 2: Overhead View（俯视）     · Low Angle View（仰视） · Long Shot（远景/全貌）
 *   Row 3: Medium Shot（中景/人物活动区）· Building Detail（建筑细节特写）· Ambience Detail（环境氛围特写）
 *
 * 多图 i2i：
 *   将环境正面/背面图 + 所有建筑外景图作为参考图（imageUrls）传给图像模型，
 *   以保证"同一环境 + 同一组建筑"在九宫内的一致性与可识别度。
 *
 * input: {
 *   studioId:        number,
 *   studioName:      string,
 *   studioDescription: string,
 *   environment:     { id, name, description, time_of_day, weather, lighting, mood,
 *                      image_url, image_back_url } | null,
 *   buildings:       Array<{ id, name, description, structure_type, interior_exterior,
 *                            exterior_image_url, interior_image_url, image_url }>,
 *   imageModel:      string,
 *   textModel?:      string
 * }
 *
 * output: {
 *   studioId:    number,
 *   imageUrl:    string,  // 持久化后的 URL
 *   prompt:      string
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute, queryOne } = require('../../../dbHelper');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { downloadAndStore } = require('../../../utils/fileStorage');

/**
 * AI 生成影棚九宫组装图提示词
 */
async function generateStudioNineGridPrompt({
  studioName,
  studioDescription,
  environment,
  buildings,
  style,
  textModel
}) {
  const envSummary = environment
    ? [
        `环境名称：${environment.name || ''}`,
        `环境描述：${environment.description || ''}`,
        environment.time_of_day ? `时间：${environment.time_of_day}` : '',
        environment.weather ? `天气：${environment.weather}` : '',
        environment.lighting ? `光照：${environment.lighting}` : '',
        environment.mood ? `氛围：${environment.mood}` : ''
      ].filter(Boolean).join('；')
    : '无绑定环境';

  const buildingSummary = (buildings && buildings.length)
    ? buildings.map((b, i) =>
        `#${i + 1} ${b.name || '未命名'}（${b.structure_type || '通用结构'}，视图=${b.building_view || 'exterior'}）：${b.description || '—'}`
      ).join('\n')
    : '无绑定建筑';

  // 判断整体视角倾向：如果没有环境且所有建筑都选了内景 → 内景模式
  const hasEnv = !!environment;
  const interiorCount = (buildings || []).filter(b => b.building_view === 'interior').length;
  const totalBuildings = (buildings || []).length;
  const isInteriorMode = !hasEnv && totalBuildings > 0 && interiorCount === totalBuildings;

  const exteriorSpec = `
【影棚九宫组装图 - 极其重要】
- 画面整体为 1:1 正方形（square 1:1 aspect ratio），3×3 网格布局（3x3 grid layout, 9 panels total），一张图同时包含 9 个不同机位/视角
- 9 格均围绕**同一个影棚**（同一环境 + 同一组建筑），保持相同的画风/配色/光照/季节/时段
- 第一行（主视角组）：
  · 左上：Main View（正面平视主视角，水平视线，展示影棚主立面与场景主体）
  · 中上：Left View（左侧视角，沿影棚左侧俯瞰或平视）
  · 右上：Right View（右侧视角，沿影棚右侧俯瞰或平视）
- 第二行（高低远）：
  · 左中：Overhead View（俯视/鸟瞰，显示建筑与环境的整体布局）
  · 正中：Low Angle View（仰视/低角度，突出建筑体量与天空）
  · 右中：Long Shot（远景/全貌，包含建筑 + 周边环境氛围）
- 第三行（中景 + 两张细节特写）：
  · 左下：Medium Shot（中景，人物活动尺度，聚焦建筑与地面交接、可通行区）
  · 中下：Building Detail（建筑细节特写，如门窗/屋顶/材质纹理）
  · 右下：Ambience Detail（环境氛围细节特写，如植被/地面/光斑/天气粒子）
- 每一格下方用英文标注对应机位：
  "Main" / "Left" / "Right" / "Overhead" / "Low Angle" / "Long Shot" / "Medium" / "Building Detail" / "Ambience Detail"
- 9 格之间保持相同的建筑群、相同的环境、相同的材质配色、相同的画风与光照，互相呼应
- 画风：概念设定参考图 / production concept sheet，柔和上色，线条清晰，标注感强
- 禁止出现任何人物角色；影棚作为唯一主体；整体氛围需与绑定环境一致`;

  const interiorSpec = `
【影棚九宫组装图（室内版）- 极其重要】
- 画面整体为 1:1 正方形（square 1:1 aspect ratio），3×3 网格布局（3x3 grid layout, 9 panels total），一张图同时包含 9 个不同机位/视角
- 9 格均展示**同一个室内空间**的不同视角，保持相同的画风/配色/光照/室内装饰
- 第一行（主视角组）：
  · 左上：Entrance（入口视角，从门口向室内望去，展示整体空间布局）
  · 中上：Left Wall（左墙视角，面向室内左侧墙壁及陈设）
  · 右上：Right Wall（右墙视角，面向室内右侧墙壁及陈设）
- 第二行（特殊视角）：
  · 左中：Floor Plan（俯视平面图，从天花板向下俯瞰整体房间布局）
  · 正中：Ceiling View（仰视天花板，展示吊灯/横梁/天花装饰）
  · 右中：Back Wall（背墙视角，从入口对面看向后墙及窗户）
- 第三行（细节特写）：
  · 左下：Furniture（家具特写，展示主要家具/陈设的细节与质感）
  · 中下：Material（材质特写，地板/墙面/布艺等材质纹理细节）
  · 右下：Decor Detail（装饰特写，如摆件/挂画/花瓶/灯饰等装饰细节）
- 每一格下方用英文标注对应视角：
  "Entrance" / "Left Wall" / "Right Wall" / "Floor Plan" / "Ceiling" / "Back Wall" / "Furniture" / "Material" / "Decor Detail"
- 9 格之间保持相同的室内空间、相同的装饰风格、相同的材质配色、相同的画风与光照
- 画风：概念设定参考图 / production concept sheet，柔和上色，线条清晰，标注感强
- 禁止出现任何人物角色；室内空间为唯一主体
- 重点：这是**室内场景**，所有 9 个视角都应该展示建筑内部空间，不要出现建筑外观`;

  const spec = isInteriorMode ? interiorSpec : exteriorSpec;
  const modeHint = isInteriorMode
    ? '注意：本影棚为纯室内场景，所有 9 格都应展示建筑内部空间和装饰，不要展示建筑外观。'
    : '';

  const prompt = `你是一个专业的图片生成提示词专家。请根据以下影棚（环境 + 建筑群）组装信息，生成高质量的九机位视角组装图英文提示词（用于 AI 绘图工具，3×3 网格）。

通用要求：
1. 提示词必须用英文输出
2. 使用逗号分隔的关键词格式
3. 长度控制在 100-160 个单词
4. 严格禁止出现任何人物、角色、人影
5. 在提示词开头加上 "${isInteriorMode ? 'interior space assembly sheet' : 'studio assembly sheet'}, no people, no characters,"
${modeHint}
${spec}

影棚名称：${studioName || '未命名影棚'}
影棚描述：${studioDescription || '无'}
绑定环境：${envSummary}
绑定建筑（${buildings?.length || 0} 座）：
${buildingSummary}
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

  if (!text) throw new Error('AI 响应为空，影棚九宫图提示词生成失败');

  text = text.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  }
  text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * 收集可用作参考图的 URL 列表
 *   - 环境：根据 environmentView 挑 1 张（'front' → image_url, 'back' → image_back_url）
 *           若目标面缺失则回退另一面
 *   - 建筑：每座按 link.building_view 挑 1 张（'exterior' → exterior_image_url, 'interior' → interior_image_url）
 *           若目标视图缺失则回退另一视图，再回退 image_url
 * 只保留绝对 URL（相对路径拼接 SITE_PUBLIC_URL 后仍保留），去重后最多 6 张
 */
function collectReferenceImageUrls(environment, environmentView, buildings) {
  const raw = [];
  if (environment) {
    // 环境 AB 两面都作为参考图传入
    if (environment.image_url) raw.push(environment.image_url);
    if (environment.image_back_url) raw.push(environment.image_back_url);
  }
  if (Array.isArray(buildings)) {
    for (const b of buildings) {
      const preferInterior = b.building_view === 'interior';
      const primary = preferInterior ? b.interior_image_url : b.exterior_image_url;
      const fallback = preferInterior ? b.exterior_image_url : b.interior_image_url;
      if (primary) raw.push(primary);
      else if (fallback) raw.push(fallback);
      else if (b.image_url) raw.push(b.image_url);
    }
  }
  // 去重 + 过滤非 http(s) URL
  const siteBase = process.env.SITE_PUBLIC_URL || '';
  const seen = new Set();
  const normalized = [];
  for (const u of raw) {
    if (!u || typeof u !== 'string') continue;
    let full = u;
    if (!/^https?:\/\//i.test(full)) {
      if (!siteBase) continue;
      full = siteBase.replace(/\/+$/, '') + (full.startsWith('/') ? full : `/${full}`);
    }
    if (seen.has(full)) continue;
    seen.add(full);
    normalized.push(full);
  }
  // 多数图像模型对参考图数量有上限，这里最多取前 6 张
  return normalized.slice(0, 6);
}

async function handleStudioNineGridGeneration(inputParams, onProgress) {
  const {
    studioId,
    studioName,
    studioDescription,
    environmentView,
    environment,
    buildings,
    imageModel,
    textModel
  } = inputParams;

  if (!studioId) throw new Error('缺少必要参数：studioId');
  if (!imageModel) throw new Error('imageModel 参数是必需的');
  const hasEnvironment = !!environment;
  const hasBuildings = Array.isArray(buildings) && buildings.length > 0;
  if (!hasEnvironment && !hasBuildings) {
    throw new Error('影棚既未绑定环境也未关联建筑，无法生成九宫组装图');
  }

  // 标记生成中
  await execute(
    "UPDATE studios SET nine_grid_generation_status = 'generating' WHERE id = ?",
    [studioId]
  );
  if (onProgress) onProgress(5);

  try {
    // 取项目视觉风格
    const studioRow = await queryOne('SELECT project_id FROM studios WHERE id = ?', [studioId]);
    const style = await requireVisualStyle(studioRow?.project_id).catch(() => null);

    // 生成 prompt
    let prompt = null;
    if (textModel) {
      prompt = await generateStudioNineGridPrompt({
        studioName,
        studioDescription,
        environment,
        buildings,
        style,
        textModel
      });
    }
    if (!prompt) {
      // fallback（兼容仅环境 / 仅建筑 / 两者并存）
      const bldNames = (buildings || []).map(b => b.name).filter(Boolean).join(', ');
      const envPart = environment
        ? `environment: ${environment.name || ''} ${environment.time_of_day || ''} ${environment.weather || ''} ${environment.mood || ''}`
        : 'no bound environment';
      const bldPart = bldNames ? `buildings: ${bldNames}` : 'no bound buildings';

      // 判断是否全内景模式
      const interiorCount = (buildings || []).filter(b => b.building_view === 'interior').length;
      const totalBuildings = (buildings || []).length;
      const isInteriorFallback = !environment && totalBuildings > 0 && interiorCount === totalBuildings;

      if (isInteriorFallback) {
        prompt = `interior space assembly sheet, no people, no characters, ${studioName || ''}, ${studioDescription || ''}, ${bldPart}, square 1:1 aspect ratio, 3x3 grid layout showing 9 interior views of the same room/space, row1: entrance view looking into room, left wall view, right wall view; row2: overhead floor plan view, ceiling view looking up, back wall view; row3: furniture closeup detail, material texture detail, decor detail, each panel labeled in English, same interior same furniture same materials same lighting across 9 panels, interior design concept sheet, soft watercolor tint, clean lines, ${style || 'realistic cinematic style'}, high detail, all panels must show INTERIOR spaces only`;
      } else {
        prompt = `studio assembly sheet, no people, no characters, ${studioName || ''}, ${studioDescription || ''}, ${envPart}, ${bldPart}, square 1:1 aspect ratio, 3x3 grid layout showing 9 camera angles of the same studio location, row1: main front view, left side view, right side view; row2: overhead aerial view, low angle upward view, long shot establishing view; row3: medium shot, building closeup detail, ambience closeup detail, each panel labeled in English, same environment same buildings same materials same lighting across 9 panels, production concept sheet, soft watercolor tint, clean lines, ${style || 'realistic cinematic style'}, high detail`;
      }
    }
    if (onProgress) onProgress(20);

    console.log(`[StudioNineGridGen] studioId=${studioId} 提示词: ${prompt.substring(0, 200)}...`);

    const imageUrls = collectReferenceImageUrls(environment, environmentView, buildings);
    // 判断内景模式（与 prompt 生成逻辑一致）
    const interiorBldCount = (buildings || []).filter(b => b.building_view === 'interior').length;
    const isInterior = !hasEnvironment && hasBuildings && interiorBldCount === buildings.length;
    console.log(`[StudioNineGridGen] 参考图数量: ${imageUrls.length}（环境采用=${environmentView}，建筑视图分布=${(buildings||[]).map(b => b.building_view).join(',')}，模式=${isInterior ? '内景' : '外景'}）`);

    // 调用图像生成（1920×1920 1:1 九宫格）
    const imageResult = await handleImageGeneration(
      {
        prompt,
        imageModel,
        aspectRatio: '1:1',
        width: 1920,
        height: 1920,
        ...(imageUrls.length > 0 ? { imageUrls } : {})
      },
      (p) => onProgress && onProgress(20 + p * 0.7)
    );

    // 持久化到对象存储
    const storagePath = `images/studios/${studioId}/nine_grid`;
    const persistedUrl = await downloadAndStore(
      imageResult.image_url,
      storagePath,
      { fallbackExt: '.png' }
    );

    // 追加时间戳破缓存（URL 路径固定，重新生成后浏览器可能命中旧缓存）
    const cacheBustedUrl = `${persistedUrl}?t=${Date.now()}`;

    // 写回数据库
    await execute(
      `UPDATE studios
       SET nine_grid_image_url = ?,
           nine_grid_generation_prompt = ?,
           nine_grid_generation_status = 'completed'
       WHERE id = ?`,
      [cacheBustedUrl, prompt, studioId]
    );

    if (onProgress) onProgress(100);
    console.log(`[StudioNineGridGen] 完成: studioId=${studioId}, url=${cacheBustedUrl}`);

    return {
      studioId,
      imageUrl: cacheBustedUrl,
      prompt
    };
  } catch (err) {
    await execute(
      "UPDATE studios SET nine_grid_generation_status = 'failed' WHERE id = ?",
      [studioId]
    ).catch(() => {});
    throw err;
  }
}

module.exports = handleStudioNineGridGeneration;
