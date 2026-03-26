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
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const handleCameraRunGeneration = require('./cameraRunGeneration');
const { generateMotionBreakdown } = require('./motionBreakdown');
const { trace } = require('../../engine/generationTrace');
const { assertUpdated, assertPersistedFields } = require('./persistenceGuard');
const { resolveMediaUrl } = require('../base/mediaResultResolver');

async function handleSceneVideoGeneration(inputParams, onProgress) {
  const { storyboardId, videoModel: modelName, textModel, duration, aspectRatio, resolution, think } = inputParams;

  if (!storyboardId) {
    throw new Error('缺少必要参数: storyboardId');
  }
  if (!modelName) {
    throw new Error('videoModel 参数是必需的');
  }

  console.log('[SceneVideoGen] 开始生成视频，storyboardId:', storyboardId);
  if (onProgress) onProgress(5);

  // 1. 查询分镜数据
  const storyboard = await queryOne(
    'SELECT * FROM storyboards WHERE id = ?',
    [storyboardId]
  );
  if (!storyboard) {
    throw new Error(`分镜 ${storyboardId} 不存在`);
  }

  // 项目视觉风格（必填，未设置则报错）
  const visualStyle = await requireVisualStyle(storyboard.project_id);

  let variables = {};
  try {
    variables = typeof storyboard.variables_json === 'string'
      ? JSON.parse(storyboard.variables_json || '{}')
      : (storyboard.variables_json || {});
  } catch (e) {
    variables = {};
  }

  const hasAction = variables.hasAction || false;
  const description = storyboard.prompt_template || '';
  const firstFrameUrl = storyboard.first_frame_url || null;
  const lastFrameUrl = storyboard.last_frame_url || null;
  trace('查询分镜数据', { storyboardId, idx: storyboard.idx, hasAction, location: variables.location, hasFirstFrame: !!firstFrameUrl, hasLastFrame: !!lastFrameUrl });

  // 2. 校验帧完整性
  if (hasAction) {
    if (!firstFrameUrl || !lastFrameUrl) {
      throw new Error('动作镜头必须包含首帧和尾帧，请先生成首尾帧');
    }
    console.log('[SceneVideoGen] 动作镜头，首帧:', firstFrameUrl, '尾帧:', lastFrameUrl);
  } else {
    if (!firstFrameUrl) {
      throw new Error('静态镜头必须包含首帧，请先生成帧图片');
    }
    console.log('[SceneVideoGen] 静态镜头，首帧:', firstFrameUrl);
  }

  // 3. 查询前后镜头描述（用于视频提示词上下文）
  if (onProgress) onProgress(10);
  let prevSceneDesc = '';
  let nextSceneDesc = '';
  try {
    const scriptId = storyboard.script_id;
    const currentIdx = storyboard.idx;
    if (scriptId != null && currentIdx != null) {
      const neighbors = await queryAll(
        'SELECT idx, prompt_template FROM storyboards WHERE script_id = ? AND idx IN (?, ?) ORDER BY idx ASC',
        [scriptId, currentIdx - 1, currentIdx + 1]
      );
      for (const nb of neighbors) {
        if (nb.idx === currentIdx - 1) prevSceneDesc = nb.prompt_template || '';
        if (nb.idx === currentIdx + 1) nextSceneDesc = nb.prompt_template || '';
      }
    }
  } catch (e) {
    console.warn('[SceneVideoGen] 查询前后镜头失败，跳过上下文:', e.message);
  }

  // 3.5 查询角色外貌和场景详细信息（用于提示词）
  const charNames = variables.characters || [];
  const hasCharacters = charNames.length > 0;
  let characterAppearance = '';
  if (hasCharacters) {
    try {
      // 查询所有角色的外貌信息（通过关联表）
      const appearances = [];
      for (const charName of charNames) {
        const linkedChar = await queryOne(
          `SELECT c.name, c.appearance, c.description
           FROM storyboard_characters sc
           JOIN characters c ON sc.character_id = c.id
           WHERE sc.storyboard_id = ? AND c.name = ?`,
          [storyboardId, charName]
        );
        if (linkedChar && linkedChar.appearance) {
          appearances.push(`${linkedChar.name}: ${linkedChar.appearance}`);
        }
      }
      characterAppearance = appearances.join('\n');
      console.log('[SceneVideoGen] 查询到角色外貌:', characterAppearance.substring(0, 120));
    } catch (e) {
      console.warn('[SceneVideoGen] 查询角色外貌失败:', e.message);
    }
  }

  let sceneDetail = '';
  if (variables.location) {
    try {
      const linkedScene = await queryOne(
        `SELECT s.description, s.environment, s.lighting, s.mood
         FROM storyboard_scenes ss
         JOIN scenes s ON ss.scene_id = s.id
         WHERE ss.storyboard_id = ? AND s.name = ?`,
        [storyboardId, variables.location]
      );
      if (linkedScene) {
        sceneDetail = `场景描述: ${linkedScene.description || ''}\n环境: ${linkedScene.environment || ''}\n光照: ${linkedScene.lighting || ''}\n氛围: ${linkedScene.mood || ''}`;
        console.log('[SceneVideoGen] 查询到场景详情');
      }
    } catch (e) {
      console.warn('[SceneVideoGen] 查询场景详情失败:', e.message);
    }
  }

  // 3.8 & 3.9 并行生成精细运镜 + 运动分解（两者互不依赖，可同时调用）
  let cameraRunPrompt = '';
  let motionBreakdownText = '';
  if (textModel) {
    const [cameraResult, motionResult] = await Promise.allSettled([
      // 精细运镜
      (async () => {
        console.log('[SceneVideoGen] 调用精细运镜生成...');
        const result = await handleCameraRunGeneration(
          { storyboardId, textModel, think },
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
    const dialogueInfo = variables.dialogue
      ? `对话/台词: ${variables.dialogue}`
      : '【无对白镜头】此镜头没有任何角色对白或语音，视频必须完全没有人声';
    const actionInfo = hasAction ? '这是一个有动作的镜头，需要描述动作的完整过程' : '这是一个静态镜头，画面变化较小';
    const styleInfo = visualStyle ? `视觉风格: ${visualStyle}` : '';
    // 上下文传递：传结构化字段（endState/emotion/shotType/location），不传完整描述以避免环境效果污染
    // 保留叙事流、情绪过渡、景别衔接等有价值信息，但过滤掉天气/光照等环境细节
    let prevContext = '';
    if (prevSceneDesc) {
      try {
        const prevSb = await queryOne(
          'SELECT variables_json FROM storyboards WHERE script_id = ? AND idx = ?',
          [storyboard.script_id, storyboard.idx - 1]
        );
        if (prevSb) {
          const prevVars = typeof prevSb.variables_json === 'string' ? JSON.parse(prevSb.variables_json || '{}') : (prevSb.variables_json || {});
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
      } catch (e) {
        prevContext = '';
      }
    }
    let nextContext = '';
    if (nextSceneDesc) {
      try {
        const nextSb = await queryOne(
          'SELECT variables_json FROM storyboards WHERE script_id = ? AND idx = ?',
          [storyboard.script_id, storyboard.idx + 1]
        );
        if (nextSb) {
          const nextVars = typeof nextSb.variables_json === 'string' ? JSON.parse(nextSb.variables_json || '{}') : (nextSb.variables_json || {});
          const nextLoc = nextVars.location || '';
          const nextEmotion = nextVars.emotion || '';
          const nextShotType = nextVars.shotType || '';
          nextContext = `【下一镜头预告】场景: ${nextLoc}，景别: ${nextShotType}，氛围: ${nextEmotion}`;
        }
      } catch (e) {
        nextContext = '';
      }
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

    const promptRequest = `你是一个专业的视频生成提示词专家。

请根据以下分镜描述，生成一个适合视频生成的详细提示词：

分镜描述：${description}
${extraInfo}

要求：
1. 提示词要描述画面中的运动、动作变化和镜头运动
2. 【细节保留】角色的每一个外貌细节都必须原样写入提示词：发色、发型、瞳色、服装款式、服装颜色、配饰等，不得省略或概括。例如"黑色双马尾、红色水手服"必须逐项翻译写出，不能简化为"a girl"
3. 【细节保留】场景的每一个环境细节都必须原样写入提示词：建筑结构、物品摆设、光源方向、色调等，不得省略
4. 镜头类型决定视角和运镜方式
5. 如果有前后镜头衔接信息，确保视频开头与上一镜头结束状态自然衔接。注意区分：持续性环境效果（篝火、风雪、时间光线等）应保持连续，一次性瞬时事件（闪电闪光、爆炸冲击波等）不得带入当前镜头，除非当前镜头描述中明确提到
6. 如果有视觉风格要求，视频必须体现该风格特征
7. 严格遵守角色约束：有角色时保持与参考图一致，无角色时绝对不能出现人物
8. 【环境持续性 - 极其重要】
   - 分镜描述中标注为"持续"/"全程"/"不间断"的环境效果（如暴风雪、下雨、火焰燃烧），必须在提示词中使用 "continuous", "constant", "throughout the entire duration", "never stops" 等关键词，确保整个视频时长内都不停止
   - 禁止让持续性环境效果中途消失或突然停止
9. 【强度校准 - 极其重要】
   - 分镜描述中的强度标注必须精确翻译："微弱"→"very faint/barely visible", "轻微"→"slight/subtle", "中等"→"moderate", "强烈"→"intense/strong", "猛烈"→"violent/fierce"
   - 特别注意："若隐若现"="barely perceptible, extremely faint"，绝不是dramatic或intense
   - 闪电的强度必须严格按描述："微弱电光"→"very faint distant glow within clouds"，不是"lightning bolt/flash"
10. 【室内外环境隔离】
   - 室内镜头中，室外天气效果必须大幅衰减：室外暴风雪→室内仅有微量雪粒从缝隙飘入
   - 室内不可能出现：直接的闪电光照、室外级别的暴风雪、大面积降雨
   - 室内火焰（篝火/蜡烛）受微风影响只会轻微摇曳，不会猛烈晃动或熄灭
11. 【音频控制 - 极其重要】
   - 如果标注为「无对白镜头」，提示词中必须加入 "no speech, no voice, no dialogue, silent" 关键词
   - 涉及口部动作但无对白时："默念"/"默读"/"无声地念" 必须翻译为 "silently mouthing without any audible sound"，绝对不能翻译为 murmuring/muttering/whispering/reciting（这些词都暗示有声音）
   - "叹息"/"呼吸" 等非语言声音：仅在对白字段明确标注时才可出现
   - 无对白的镜头中，角色的任何口部动作都必须用 "silently" 修饰
12. 【运动分解约束 - 极其重要】如果提供了 Motion Breakdown 清单：
   - MOVING 元素：必须按清单描述的方式运动，不得自行增加或减少运动
   - STATIC 元素：必须在整个视频中保持静止且全程可见，禁止消失、移动或变形
   - 禁止出现清单中未列出的新元素（物品/角色/效果）
   - 角色在任何情况下都不得消失，即使发生剧烈环境事件
13. 只输出英文提示词，不要其他解释
14. 【禁止文字/字幕 - 极其重要】视频画面中绝对不能出现任何文字元素。提示词中必须包含 "no text, no subtitles, no captions, no watermark, no title cards, no letters, no words, no typography overlays" 约束，确保画面干净纯粹

提示词：`;

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
  const imageUrls = [firstFrameUrl];
  if (hasAction && lastFrameUrl) {
    imageUrls.push(lastFrameUrl);
  }
  trace('构建视频参考图', { imageUrls, duration, aspectRatio });
  console.log('[SceneVideoGen] imageUrls:', imageUrls);

  const submitParams = {
    prompt: promptUsed,
    imageUrls,
    startFrame: firstFrameUrl,
    endFrame: lastFrameUrl || '_REMOVE_'
  };

  if (duration !== undefined && duration !== null) {
    submitParams.duration = duration;
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
    logTag: 'SceneVideoGen'
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
    duration: duration ?? null,
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
