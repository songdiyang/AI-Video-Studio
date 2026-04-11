/**
 * 分镜视频生成处理器
 * 
 * 流程：
 * 1. 查询分镜数据，获取首尾帧 URL 和 variables_json
 * 2. 校验帧完整性：
 *    - 动作镜头（hasAction=true）：必须有首帧 + 尾帧
 *    - 静态镜头（hasAction=false）：必须有首帧
 * 3. 查询前后镜头描述作为上下文，确保视频衔接连贯
 * 4. 获取镜头完整信息（描述、shotType、emotion），调用文本模型生成视频提示词
 * 5. 构建 imageUrls = [首帧, 尾帧(如果有)]，以 imageUrls + 视频提示词调用视频模型生成视频
 * 6. 保存视频 URL 到数据库
 * 
 * input:  { storyboardId, videoModel, textModel, duration, aspectRatio }
 * output: { videoUrl, model, promptUsed }
 */

const { submitAndPoll } = require('../pollUtils');
const { execute, queryOne, queryAll } = require('../../../dbHelper');
const { downloadAndStore } = require('../../../utils/fileStorage');
const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { requireVisualStyle, getOutputLanguage } = require('../../../utils/getProjectStyle');
const handleCameraRunGeneration = require('./cameraRunGeneration');
const { generateMotionBreakdown } = require('./motionBreakdown');
const { trace } = require('../../engine/generationTrace');
const { assertUpdated, assertPersistedFields } = require('./persistenceGuard');
const { resolveMediaUrl } = require('../base/mediaResultResolver');

/** 安全解析 variables_json，失败时返回空对象 */
function safeParseVariables(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

/**
 * 分镜视频生成处理器
 * 
 * inputParams._context 可选预取上下文（由 batchSceneVideoGeneration 传入以避免重复 DB 查询）：
 *   { storyboard, variables, visualStyle, prevNeighbor, nextNeighbor }
 *   角色外貌和场景详情由于每个分镜不同，仍由本函数并行查询
 * 
 * input:  { storyboardId, videoModel, textModel, duration, aspectRatio }
 * output: { videoUrl, model, promptUsed }
 */

async function handleSceneVideoGeneration(inputParams, onProgress) {
  const { storyboardId, videoModel: modelName, textModel, duration, aspectRatio, resolution, think, _context } = inputParams;

  if (!storyboardId) {
    throw new Error('缺少必要参数: storyboardId');
  }
  if (!modelName) {
    throw new Error('videoModel 参数是必需的');
  }

  console.log('[SceneVideoGen] 开始生成视频，storyboardId:', storyboardId);
  if (onProgress) onProgress(5);

  // 1. 获取分镜数据（优先使用预取上下文）
  let storyboard, variables, visualStyleValue, prevNeighbor, nextNeighbor;

  if (_context) {
    // 由批量处理器传入，跳过分镜查询+视觉风格+邻居查询
    storyboard = _context.storyboard;
    variables = _context.variables;
    visualStyleValue = _context.visualStyle;
    prevNeighbor = _context.prevNeighbor || null;
    nextNeighbor = _context.nextNeighbor || null;
    console.log('[SceneVideoGen] 使用预取上下文，跳过基础 DB 查询');
  } else {
    // 独立调用：从 DB 查询
    storyboard = await queryOne(
      'SELECT * FROM storyboards WHERE id = ?',
      [storyboardId]
    );
    if (!storyboard) {
      throw new Error(`分镜 ${storyboardId} 不存在`);
    }
    variables = safeParseVariables(storyboard.variables_json);
  }
  const hasAction = variables.hasAction || false;
  const description = storyboard.prompt_template || '';
  const firstFrameUrl = storyboard.first_frame_url || null;
  const lastFrameUrl = storyboard.last_frame_url || null;
  trace('查询分镜数据', { storyboardId, idx: storyboard.idx, hasAction, location: variables.location, hasFirstFrame: !!firstFrameUrl, hasLastFrame: !!lastFrameUrl });

  // 2. 校验帧完整性（静态镜头必须有首帧；动作镜头首尾帧为可选参考）
  if (hasAction) {
    if (firstFrameUrl && lastFrameUrl) {
      console.log('[SceneVideoGen] 动作镜头，首帧:', firstFrameUrl, '尾帧:', lastFrameUrl);
    } else if (firstFrameUrl) {
      console.log('[SceneVideoGen] 动作镜头，仅有首帧（尾帧缺失，不强制依赖）:', firstFrameUrl);
    } else {
      console.log('[SceneVideoGen] 动作镜头，无首尾帧，使用纯提示词生成视频');
    }
  } else {
    if (!firstFrameUrl) {
      throw new Error('静态镜头必须包含首帧，请先生成帧图片');
    }
    console.log('[SceneVideoGen] 静态镜头，首帧:', firstFrameUrl);
  }

  if (onProgress) onProgress(10);

  // 3. 并行查询：视觉风格(仅独立调用) + 前后镜头(仅独立调用) + 角色外貌(批量) + 场景详情
  const charNames = variables.characters || [];
  const hasCharacters = charNames.length > 0;
  const scriptId = storyboard.script_id;
  const currentIdx = storyboard.idx;
  let characterAppearance = '';
  let sceneDetail = '';

  if (!_context) {
    // 独立调用：需要查询视觉风格和邻居
    const [vsResult, neighborsResult, charResult, sceneResult] = await Promise.allSettled([
      requireVisualStyle(storyboard.project_id),
      (scriptId != null && currentIdx != null)
        ? queryAll(
            'SELECT idx, prompt_template, variables_json FROM storyboards WHERE script_id = ? AND idx IN (?, ?) ORDER BY idx ASC',
            [scriptId, currentIdx - 1, currentIdx + 1]
          )
        : Promise.resolve([]),
      hasCharacters
        ? queryAll(
            `SELECT c.name, c.appearance, c.description
             FROM storyboard_characters sc
             JOIN characters c ON sc.character_id = c.id
             WHERE sc.storyboard_id = ? AND c.name IN (${charNames.map(() => '?').join(',')})`,
            [storyboardId, ...charNames]
          )
        : Promise.resolve([]),
      variables.location
        ? queryOne(
            `SELECT s.description, s.environment, s.lighting, s.mood
             FROM storyboard_scenes ss
             JOIN scenes s ON ss.scene_id = s.id
             WHERE ss.storyboard_id = ? AND s.name = ?`,
            [storyboardId, variables.location]
          )
        : Promise.resolve(null)
    ]);

    if (vsResult.status === 'rejected') throw vsResult.reason;
    visualStyleValue = vsResult.value;

    prevNeighbor = null;
    nextNeighbor = null;
    if (neighborsResult.status === 'fulfilled') {
      for (const nb of neighborsResult.value) {
        if (nb.idx === currentIdx - 1) prevNeighbor = nb;
        if (nb.idx === currentIdx + 1) nextNeighbor = nb;
      }
    } else {
      console.warn('[SceneVideoGen] 查询前后镜头失败，跳过上下文:', neighborsResult.reason?.message);
    }

    characterAppearance = '';
    if (charResult.status === 'fulfilled' && charResult.value.length > 0) {
      characterAppearance = charResult.value
        .filter(c => c.appearance)
        .map(c => `${c.name}: ${c.appearance}`)
        .join('\n');
      console.log('[SceneVideoGen] 查询到角色外貌:', characterAppearance.substring(0, 120));
    } else if (charResult.status === 'rejected') {
      console.warn('[SceneVideoGen] 查询角色外貌失败:', charResult.reason?.message);
    }

    sceneDetail = '';
    if (sceneResult.status === 'fulfilled' && sceneResult.value) {
      const ls = sceneResult.value;
      sceneDetail = `场景描述: ${ls.description || ''}\n环境: ${ls.environment || ''}\n光照: ${ls.lighting || ''}\n氛围: ${ls.mood || ''}`;
      console.log('[SceneVideoGen] 查询到场景详情');
    } else if (sceneResult.status === 'rejected') {
      console.warn('[SceneVideoGen] 查询场景详情失败:', sceneResult.reason?.message);
    }
  } else {
    // 预取模式：仅查询角色外貌 + 场景详情（每个分镜不同）
    const [charResult, sceneResult] = await Promise.allSettled([
      hasCharacters
        ? queryAll(
            `SELECT c.name, c.appearance, c.description
             FROM storyboard_characters sc
             JOIN characters c ON sc.character_id = c.id
             WHERE sc.storyboard_id = ? AND c.name IN (${charNames.map(() => '?').join(',')})`,
            [storyboardId, ...charNames]
          )
        : Promise.resolve([]),
      variables.location
        ? queryOne(
            `SELECT s.description, s.environment, s.lighting, s.mood
             FROM storyboard_scenes ss
             JOIN scenes s ON ss.scene_id = s.id
             WHERE ss.storyboard_id = ? AND s.name = ?`,
            [storyboardId, variables.location]
          )
        : Promise.resolve(null)
    ]);

    characterAppearance = '';
    if (charResult.status === 'fulfilled' && charResult.value.length > 0) {
      characterAppearance = charResult.value
        .filter(c => c.appearance)
        .map(c => `${c.name}: ${c.appearance}`)
        .join('\n');
      console.log('[SceneVideoGen] 查询到角色外貌:', characterAppearance.substring(0, 120));
    } else if (charResult.status === 'rejected') {
      console.warn('[SceneVideoGen] 查询角色外貌失败:', charResult.reason?.message);
    }

    sceneDetail = '';
    if (sceneResult.status === 'fulfilled' && sceneResult.value) {
      const ls = sceneResult.value;
      sceneDetail = `场景描述: ${ls.description || ''}\n环境: ${ls.environment || ''}\n光照: ${ls.lighting || ''}\n氛围: ${ls.mood || ''}`;
      console.log('[SceneVideoGen] 查询到场景详情');
    } else if (sceneResult.status === 'rejected') {
      console.warn('[SceneVideoGen] 查询场景详情失败:', sceneResult.reason?.message);
    }
  }

  const prevSceneDesc = prevNeighbor?.prompt_template || '';
  const nextSceneDesc = nextNeighbor?.prompt_template || '';

  // 3.8 & 3.9 并行生成精细运镜 + 运动分解（两者互不依赖，可同时调用）
  let cameraRunPrompt = '';
  let motionBreakdownText = '';
  if (textModel) {
    const [cameraResult, motionResult] = await Promise.allSettled([
      // 精细运镜
      (async () => {
        console.log('[SceneVideoGen] 调用精细运镜生成...');
        const result = await handleCameraRunGeneration(
          {
            storyboardId, textModel, think,
            _context: {
              storyboard,
              variables,
              visualStyle: visualStyleValue,
              prevNeighbor: prevNeighbor,
              nextNeighbor: nextNeighbor,
              characterAppearance,
              outputLang
            }
          },
          (p) => { if (onProgress) onProgress(10 + p * 0.05); }
        );
        const prompt = result.cameraRunPrompt || '';
        trace('精细运镜生成完成', { prompt });
        console.log(`\x1b[32m[SceneVideoGen] 精细运镜提示词: ${prompt}\x1b[0m`);
        return prompt;
      })(),
      // 运动分解
      (async () => {
        trace('开始生成运动分解清单');
        const text = await generateMotionBreakdown({
          textModel,
          description,
          variables,
          hasAction,
          characterAppearance,
          sceneDetail,
          startFrameDesc: variables.startFrame || '',
          endFrameDesc: variables.endFrame || ''
        });
        trace('运动分解清单结果', { content: text });
        return text;
      })()
    ]);

    if (cameraResult.status === 'fulfilled') {
      cameraRunPrompt = cameraResult.value;
    } else {
      console.warn('[SceneVideoGen] 精细运镜生成失败，降级使用基础运镜:', cameraResult.reason?.message);
    }
    if (motionResult.status === 'fulfilled') {
      motionBreakdownText = motionResult.value;
    } else {
      console.warn('[SceneVideoGen] 运动分解生成失败，继续生成视频:', motionResult.reason?.message);
    }
  }

  // 4. 生成视频提示词
  let promptUsed = description;

  if (textModel) {
    console.log('[SceneVideoGen] 使用文本模型生成视频提示词...');

    const locInfo = variables.location ? `场景: ${variables.location}` : '无特定场景';
    const shotInfo = variables.shotType ? `镜头类型: ${variables.shotType}` : '';
    const emotionInfo = variables.emotion ? `情绪/氛围: ${variables.emotion}` : '';
    let dialogueInfo;
    if (variables.dialogues && Array.isArray(variables.dialogues) && variables.dialogues.length > 0) {
      const lines = variables.dialogues.map(d => `${d.character}："${d.line}"`).join('\n');
      dialogueInfo = `对话/台词:\n${lines}`;
    } else if (variables.dialogue) {
      dialogueInfo = `对话/台词: ${variables.dialogue}`;
    } else {
      dialogueInfo = '【无对白镜头】此镜头没有任何角色对白或语音，视频必须完全没有人声';
    }
    const actionInfo = hasAction ? '这是一个有动作的镜头，需要描述动作的完整过程' : '这是一个静态镜头，画面变化较小';
    const styleInfo = visualStyleValue ? `视觉风格: ${visualStyleValue}` : '';
    // 上下文传递：传结构化字段（endState/emotion/shotType/location），不传完整描述以避免环境效果污染
    // 保留叙事流、情绪过渡、景别衔接等有价值信息，但过滤掉天气/光照等环境细节
    // 直接使用并行查询阶段已获取的前后镜头数据（含 variables_json），无需再次查询 DB
    let prevContext = '';
    if (prevNeighbor) {
      const prevVars = safeParseVariables(prevNeighbor.variables_json);
      const prevEndState = prevVars.endState || '';
      const prevLoc = prevVars.location || '';
      const prevEmotion = prevVars.emotion || '';
      const prevShotType = prevVars.shotType || '';
      const prevHasAction = prevVars.hasAction || false;
      const isSameScene = prevLoc && variables.location && prevLoc === variables.location;
      prevContext = `【上一镜头衔接信息】
场景: ${prevLoc}${isSameScene ? '（同一场景，需保持空间连续性）' : '（不同场景，已切换）'}
景别: ${prevShotType}
情绪: ${prevEmotion}
动作: ${prevHasAction ? '有动作' : '静态'}
结束状态: ${prevEndState}
（衔接规则：
① 角色姿态/位置/朝向必须与上述结束状态一致
② 光线和时间必须连续：上一镜头是深夜则当前不能变白天，黄昏不能变正午
③ 持续性环境效果（篝火燃烧、风雪等）必须保持一致
④ 一次性瞬时事件（闪电、爆炸闪光等）不得带入当前镜头，除非当前镜头描述中明确提到）`;
    }
    let nextContext = '';
    if (nextNeighbor) {
      const nextVars = safeParseVariables(nextNeighbor.variables_json);
      const nextLoc = nextVars.location || '';
      const nextEmotion = nextVars.emotion || '';
      const nextShotType = nextVars.shotType || '';
      nextContext = `【下一镜头预告】场景: ${nextLoc}，景别: ${nextShotType}，氛围: ${nextEmotion}`;
    }
    const cameraInfo = cameraRunPrompt
      ? `【精细运镜提示词 - 必须融入】\n${cameraRunPrompt}`
      : (variables.cameraMovement ? `【运镜指令】${variables.cameraMovement}（视频必须体现此镜头运动）` : '');
    const endStateInfo = variables.endState ? `【镜头结束状态】${variables.endState}（视频结束时画面必须呈现此状态）` : '';

    // 角色信息：有角色时提供详细外貌+参考图一致性约束，无角色时明确排除人物
    let charBlock;
    let charConstraint;
    if (hasCharacters) {
      const appearanceLine = characterAppearance ? `\n外貌特征: ${characterAppearance}` : '';
      charBlock = `【角色信息】
角色: ${charNames.join('、')}${appearanceLine}
（角色参考图已融入首帧，视频中角色必须与首帧完全一致）`;
      charConstraint = `【角色一致性约束】
- 视频中的角色外貌、服装、发型必须与首帧图片中的角色完全一致
- 严禁出现首帧中不存在的额外人物
- 角色的身体结构必须符合正常人体比例：头部在肩膀上方，四肢正常连接
- 禁止出现畸变：双头、多臂、头部位置异常、面部扭曲等
- 角色动作应自然流畅，保持首帧中的角色身份不变`;
    } else {
      charBlock = '【无角色镜头】这个镜头没有任何角色参与';
      charConstraint = `【无角色约束】
- 画面中不应出现任何人物、人影或人形轮廓
- 仅描述场景环境、自然元素、物体的运动和变化
- 如果首帧图片中没有人物，视频中也绝对不能凭空出现人物`;
    }

    // 场景详细信息
    const sceneBlock = sceneDetail
      ? `【场景详情】\n${sceneDetail}\n（已提供场景参考图作为首帧背景，视频场景必须一致）`
      : '';

    const extraInfo = [charBlock, locInfo, sceneBlock, shotInfo, emotionInfo, dialogueInfo, actionInfo, cameraInfo, endStateInfo, styleInfo, charConstraint, prevContext, nextContext, motionBreakdownText].filter(Boolean).join('\n');

    // 获取项目输出语言设置
    const outputLang = await getOutputLanguage(storyboard.project_id);

    // 条件化规则：仅在相关场景存在时才添加，减少无关 token 消耗
    const hasEnvEffects = /持续|全程|不间断|暴风雪|下雨|火焰|燃烧|篝火/.test(description);
    const hasIntensityMarkers = /微弱|轻微|中等|强烈|猛烈|若隐若现|电光/.test(description);
    const isIndoorScene = /室内|屋内|房间|客厅|卧室|帐篷|洞穴/.test(description) || /室内|屋内/.test(variables.location || '');
    const hasOutdoorWeather = /风雪|暴风|闪电|降雨|雨/.test(description);

    let conditionalRules = '';
    if (hasEnvEffects) {
      conditionalRules += `\n8. [Environment Persistence] Effects described as "持续"/"全程"/"不间断" must use "continuous", "constant", "throughout the entire duration" in the prompt. Never let persistent effects stop mid-video.`;
    }
    if (hasIntensityMarkers) {
      conditionalRules += `\n9. [Intensity Calibration] Translate intensity exactly: "微弱"→"very faint/barely visible", "轻微"→"slight/subtle", "中等"→"moderate", "强烈"→"intense/strong", "若隐若现"→"barely perceptible, extremely faint". "微弱电光"→"very faint distant glow within clouds", NOT "lightning bolt".`;
    }
    if (isIndoorScene && hasOutdoorWeather) {
      conditionalRules += `\n10. [Indoor/Outdoor Isolation] Indoor scenes: outdoor weather effects must be greatly attenuated (outdoor blizzard → only tiny snow particles drifting through cracks). No direct lightning illumination, no outdoor-level storms, no heavy rain indoors. Indoor flames only sway gently.`;
    }

    const promptRequest = `You are a professional video generation prompt expert.

Generate a detailed ${outputLang.languageName} prompt for video generation based on the following storyboard:

Storyboard description: ${description}
${extraInfo}

Rules:
1. Describe motion, action changes, and camera movement in the scene
2. [Detail Preservation] Every character appearance detail must be translated verbatim: hair color, hairstyle, eye color, clothing style, colors, accessories. e.g. "黑色双马尾、红色水手服" → "black twin-tails, red sailor uniform", never simplify to "a girl"
3. [Detail Preservation] Every scene environment detail must be preserved: architecture, object placement, light source direction, color tone
4. Shot type determines perspective and camera movement style
5. If previous shot context exists, ensure natural transition from its end state. Persistent effects (fire, snow, lighting) must continue; one-time events (lightning flash, explosion) must NOT carry over unless explicitly mentioned
6. If visual style is specified, the video must reflect that style
7. Strictly follow character constraints: maintain consistency with reference frame if characters present; absolutely no humans if no-character shot${conditionalRules}
11. [Audio Control] If marked as "无对白镜头", include "no speech, no voice, no dialogue, silent". For silent mouth movements: use "silently mouthing without any audible sound", NEVER use murmuring/muttering/whispering
12. [Motion Breakdown] If Motion Breakdown is provided: MOVING elements must move as described, STATIC elements must remain still and visible throughout. No unlisted elements may appear. Characters must never disappear.
13. [Language Purity] ${outputLang.promptInstruction} Translate ALL source material faithfully into the target language. Do not mix languages.
14. [No Text] Include "no text, no subtitles, no captions, no watermark, no written words in any language" constraint

Prompt:`;

    const result = await handleBaseTextModelCall({
      prompt: promptRequest,
      textModel,
      temperature: 0.7
    });

    promptUsed = result.content || description;
    trace('生成视频提示词', { prompt: promptUsed });
    console.log(`\x1b[32m[SceneVideoGen] 视频提示词: ${promptUsed}\x1b[0m`);
  } else {
    console.log('[SceneVideoGen] 无文本模型，使用原始描述作为视频提示词');
  }

  // 5. 构建 imageUrls 并生成视频
  if (onProgress) onProgress(20);
  const imageUrls = [];
  if (firstFrameUrl) imageUrls.push(firstFrameUrl);
  if (hasAction && lastFrameUrl) {
    imageUrls.push(lastFrameUrl);
  }
  
  // 优先使用分镜中存储的时长，其次使用传入参数，并限制在 4-12 秒范围内（Seedance 1.5 Pro 官方限定 4-12s）
  let finalDuration = variables.duration || storyboard.duration || duration;
  if (finalDuration !== undefined && finalDuration !== null) {
<<<<<<< HEAD
    const parsed = parseFloat(finalDuration);
    finalDuration = isNaN(parsed) ? 5 : Math.max(2, Math.min(12, parsed));
  } else {
    finalDuration = 5; // 无时长参数时默认5秒
=======
    finalDuration = Math.max(4, Math.min(12, parseFloat(finalDuration)));
>>>>>>> 41b2bc9c (feat: 多项功能优化与修复)
  }
  
  trace('构建视频参考图', { imageUrls, duration: finalDuration, aspectRatio });
  console.log('[SceneVideoGen] imageUrls:', imageUrls, '时长:', finalDuration);

  const submitParams = {
    prompt: promptUsed,
  };

  // 仅在有参考图时传递
  if (imageUrls.length > 0) {
    submitParams.imageUrls = imageUrls;
    submitParams.startFrame = firstFrameUrl || '_REMOVE_';
  }
  if (lastFrameUrl) {
    submitParams.endFrame = lastFrameUrl;
  } else {
    submitParams.endFrame = '_REMOVE_';
  }

  if (finalDuration !== undefined && finalDuration !== null) {
    submitParams.duration = finalDuration;
  }
  if (aspectRatio) {
    submitParams.aspectRatio = aspectRatio;
  }
  if (resolution) {
    submitParams.resolution = resolution;
  }

  const result = await submitAndPoll(modelName, submitParams, {
    intervalMs: 3000,
    maxDurationMs: 3600000,
    logTag: 'SceneVideoGen',
    onProgress: onProgress ? (p) => {
      // 将 submitAndPoll 的 30-90% 进度映射到 20-85%（留 5% 给下载）
      const mapped = 20 + Math.round((p - 30) * (85 - 20) / (90 - 30));
      onProgress(Math.min(mapped, 85));
    } : undefined
  });

  const mediaResolution = resolveMediaUrl(result, 'video');
  console.log('[SceneVideoGen] 返回字段诊断:', {
    modelName,
    storyboardId,
    mappedKeys: result && typeof result === 'object' ? Object.keys(result) : [],
    queryKeys: result?._queryResult && typeof result._queryResult === 'object' ? Object.keys(result._queryResult) : [],
    rawQueryKeys: result?._rawQueryResult && typeof result._rawQueryResult === 'object' ? Object.keys(result._rawQueryResult) : [],
    submitKeys: result?._submitResult && typeof result._submitResult === 'object' ? Object.keys(result._submitResult) : [],
    selectedUrl: mediaResolution.mediaUrl,
    resolvedFrom: mediaResolution.resolvedFrom,
    urlCandidates: mediaResolution.candidates,
    duration: finalDuration ?? null,
    aspectRatio: aspectRatio || null
  });

  if (!mediaResolution.mediaUrl) {
    throw new Error(`视频模型 "${modelName}" 返回成功但未找到视频 URL，请检查 response_mapping / query_success_mapping 配置`);
  }

  if (onProgress) onProgress(90);

  // 5. 持久化视频到 MinIO（路径含时间戳，避免重新生成时 URL 相同导致 UPDATE affectedRows=0）
  const videoTimestamp = Date.now();
  const persistedVideoUrl = await downloadAndStore(
    mediaResolution.mediaUrl,
    `videos/${storyboardId}/video_${videoTimestamp}`,
    { fallbackExt: '.mp4' }
  );

  // 保存视频 URL 到数据库
  const updateResult = await execute(
    'UPDATE storyboards SET video_url = ? WHERE id = ?',
    [persistedVideoUrl, storyboardId]
  );
  assertUpdated(updateResult, '[SceneVideoGen] 视频');
  await assertPersistedFields({
    table: 'storyboards',
    id: storyboardId,
    fields: ['video_url'],
    label: '[SceneVideoGen] 视频'
  });
  trace('视频持久化完成', { url: persistedVideoUrl, model: modelName, promptUsed, refImages: imageUrls });
  console.log('[SceneVideoGen] 视频已保存:', persistedVideoUrl);

  if (onProgress) onProgress(100);
  console.log('[SceneVideoGen] 视频生成完成');

  return {
    video_url: persistedVideoUrl,
    videoUrl: persistedVideoUrl,
    model: modelName,
    promptUsed
  };
}

module.exports = handleSceneVideoGeneration;
