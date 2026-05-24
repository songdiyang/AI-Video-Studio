/**
 * 分镜视频生成处理器
 * 
 * 流程：
 * 1. 查询分镜数据，获取首尾帧 URL 和 variables_json
 * 2. 校验帧完整性：
 *    - 动作镜头（hasAction=true）：首尾帧均为可选参考
 *    - 静态镜头（hasAction=false）：至少需要一张帧图片（首帧或尾帧均可）
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
const handleVisionFrameAnalysis = require('./visionFrameAnalysis');
const handleLastFramePromptGeneration = require('./lastFramePromptGeneration');
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
  
  // 强制要求视频提示词，不再向后兼容降级到图片提示词
  if (!storyboard.video_prompt) {
    throw new Error('分镜缺少视频提示词，请在导演空间的"视频提示词"标签中编辑后再生成视频');
  }
  const description = storyboard.video_prompt;
  
  const firstFrameUrl = storyboard.first_frame_url || null;
  const lastFrameUrl = storyboard.last_frame_url || null;
  const effectiveStartFrame = firstFrameUrl || lastFrameUrl;
  trace('查询分镜数据', { storyboardId, idx: storyboard.idx, hasAction, location: variables.location, hasFirstFrame: !!firstFrameUrl, hasLastFrame: !!lastFrameUrl, effectiveStartFrame: !!effectiveStartFrame, useVideoPrompt: true });

  // 2. 校验帧完整性（至少需要一张帧图片；动作镜头允许纯提示词）
  if (hasAction) {
    if (firstFrameUrl && lastFrameUrl) {
      console.log('[SceneVideoGen] 动作镜头，首帧:', firstFrameUrl, '尾帧:', lastFrameUrl);
    } else if (effectiveStartFrame) {
      console.log('[SceneVideoGen] 动作镜头，仅有单张帧图片作为参考:', effectiveStartFrame);
    } else {
      console.log('[SceneVideoGen] 动作镜头，无首尾帧，使用纯提示词生成视频');
    }
  } else {
    if (!effectiveStartFrame) {
      throw new Error('缺少帧图片，请先生成至少一张首帧或尾帧');
    }
    console.log('[SceneVideoGen] 静态镜头，参考帧:', effectiveStartFrame);
  }

  if (onProgress) onProgress(10);

  // 3. 并行查询：视觉风格(仅独立调用) + 前后镜头(仅独立调用) + 角色外貌(批量) + 场景详情
  const charNames = variables.characters || [];
  const hasCharacters = charNames.length > 0;
  const scriptId = storyboard.script_id;
  const currentIdx = storyboard.idx;
  let characterAppearance = '';
  let characterMap = {}; // 角色名→外貌映射，用于台词时关联外貌
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
            `SELECT c.name, c.appearance, c.base_appearance, c.outfit_appearance, c.description,
                    cs.name AS active_state_name, cs.outfit AS active_outfit, cs.hairstyle AS active_hairstyle, cs.accessories AS active_accessories, cs.age_stage AS active_age_stage
             FROM storyboard_characters sc
             JOIN characters c ON sc.character_id = c.id
             LEFT JOIN character_states cs ON cs.character_id = c.id AND cs.is_active = 1 AND cs.is_base_model = 0
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
    characterMap = {};
    if (charResult.status === 'fulfilled' && charResult.value.length > 0) {
      characterAppearance = charResult.value
        .filter(c => c.appearance || c.base_appearance)
        .map(c => {
          const parts = [];
          if (c.base_appearance) parts.push(c.base_appearance);
          const outfitDesc = c.active_outfit || c.outfit_appearance;
          if (outfitDesc) parts.push(outfitDesc);
          if (c.active_hairstyle) parts.push(`发型: ${c.active_hairstyle}`);
          if (c.active_accessories) parts.push(`配饰: ${c.active_accessories}`);
          if (c.active_age_stage) parts.push(`年龄: ${c.active_age_stage}`);
          const fullAppearance = parts.length > 0 ? parts.join('；') : c.appearance;
          return `${c.name}: ${fullAppearance}${c.active_state_name ? ` (状态: ${c.active_state_name})` : ''}`;
        })
        .join('\n');
      // 同时构建角色名→外貌映射
      charResult.value.forEach(c => {
        if (c.name) {
          const parts = [];
          if (c.base_appearance) parts.push(c.base_appearance);
          const outfitDesc = c.active_outfit || c.outfit_appearance;
          if (outfitDesc) parts.push(outfitDesc);
          characterMap[c.name] = parts.length > 0 ? parts.join('；') : (c.appearance || c.description || '');
        }
      });
      console.log('[SceneVideoGen] 查询到角色外貌（含白膜/服装分层）:', characterAppearance.substring(0, 120));
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
            `SELECT c.name, c.appearance, c.base_appearance, c.outfit_appearance, c.description,
                    cs.name AS active_state_name, cs.outfit AS active_outfit, cs.hairstyle AS active_hairstyle, cs.accessories AS active_accessories, cs.age_stage AS active_age_stage
             FROM storyboard_characters sc
             JOIN characters c ON sc.character_id = c.id
             LEFT JOIN character_states cs ON cs.character_id = c.id AND cs.is_active = 1 AND cs.is_base_model = 0
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
    characterMap = {};
    if (charResult.status === 'fulfilled' && charResult.value.length > 0) {
      characterAppearance = charResult.value
        .filter(c => c.appearance || c.base_appearance)
        .map(c => {
          const parts = [];
          if (c.base_appearance) parts.push(c.base_appearance);
          const outfitDesc = c.active_outfit || c.outfit_appearance;
          if (outfitDesc) parts.push(outfitDesc);
          if (c.active_hairstyle) parts.push(`发型: ${c.active_hairstyle}`);
          if (c.active_accessories) parts.push(`配饰: ${c.active_accessories}`);
          if (c.active_age_stage) parts.push(`年龄: ${c.active_age_stage}`);
          const fullAppearance = parts.length > 0 ? parts.join('；') : c.appearance;
          return `${c.name}: ${fullAppearance}${c.active_state_name ? ` (状态: ${c.active_state_name})` : ''}`;
        })
        .join('\n');
      // 同时构建角色名→外貌映射
      charResult.value.forEach(c => {
        if (c.name) {
          const parts = [];
          if (c.base_appearance) parts.push(c.base_appearance);
          const outfitDesc = c.active_outfit || c.outfit_appearance;
          if (outfitDesc) parts.push(outfitDesc);
          characterMap[c.name] = parts.length > 0 ? parts.join('；') : (c.appearance || c.description || '');
        }
      });
      console.log('[SceneVideoGen] 查询到角色外貌（含白膜/服装分层）:', characterAppearance.substring(0, 120));
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

  // 提前获取 outputLang，避免 Promise.allSettled 内部 IIFE 引用时 TDZ 错误
  const outputLang = textModel ? await getOutputLanguage(storyboard.project_id) : null;

  // 3.8 多模态视觉分析（首帧/尾帧图片识别）
  let visualAnalysis = null;
  let lastFramePrompt = null;

  if (textModel && effectiveStartFrame) {
    try {
      console.log('[SceneVideoGen] 开始多模态视觉分析...');
      const analysisImages = [];
      if (effectiveStartFrame) analysisImages.push(effectiveStartFrame);
      if (hasAction && lastFrameUrl && lastFrameUrl !== effectiveStartFrame) {
        analysisImages.push(lastFrameUrl);
      }

      visualAnalysis = await handleVisionFrameAnalysis(
        {
          imageUrls: analysisImages,
          description,
          textModel
        },
        (p) => { if (onProgress) onProgress(10 + p * 0.08); }
      );

      if (visualAnalysis) {
        trace('多模态视觉分析完成', {
          visualDescription: visualAnalysis.visualDescription?.substring(0, 100),
          characterCount: visualAnalysis.characters?.length
        });
        console.log(`\x1b[32m[SceneVideoGen] 视觉分析完成: ${visualAnalysis.visualDescription?.substring(0, 80)}...\x1b[0m`);

        // 动作镜头且缺少尾帧时，自动生成尾帧提示词
        if (hasAction && !lastFrameUrl && visualAnalysis) {
          try {
            console.log('[SceneVideoGen] 动作镜头缺少尾帧，基于视觉分析生成尾帧提示词...');
            const lastFrameResult = await handleLastFramePromptGeneration(
              {
                firstFrameVisual: visualAnalysis,
                description,
                endState: variables.endState || '',
                textModel,
                variables
              },
              (p) => { if (onProgress) onProgress(18 + p * 0.02); }
            );
            lastFramePrompt = lastFrameResult.lastFramePrompt;
            trace('尾帧提示词生成完成', { lastFramePrompt: lastFramePrompt?.substring(0, 100) });
            console.log(`\x1b[32m[SceneVideoGen] 尾帧提示词: ${lastFramePrompt?.substring(0, 80)}...\x1b[0m`);
          } catch (lfErr) {
            console.warn('[SceneVideoGen] 尾帧提示词生成失败:', lfErr.message);
          }
        }
      } else {
        console.log('[SceneVideoGen] 视觉分析返回空，将使用纯文本方案');
      }
    } catch (visionErr) {
      console.warn('[SceneVideoGen] 多模态视觉分析失败，降级到纯文本方案:', visionErr.message);
      visualAnalysis = null;
    }
  }

  // 3.9 并行生成精细运镜 + 运动分解（作为补充，不依赖视觉分析）
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
          (p) => { if (onProgress) onProgress(20 + p * 0.05); }
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
          sceneDetail
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
    const styleInfo = visualStyleValue ? `视觉风格: ${visualStyleValue}` : '';

    // 判断是否为真人实拍风格
    const isLiveAction = visualStyleValue && (
      /写实|电影|摄影|纪实|realistic|cinematic|photography/i.test(visualStyleValue)
    );

    // 真人风格：使用感情叠加理论增强情绪表达
    let emotionInfo = '';
    if (variables.emotion) {
      if (isLiveAction) {
        emotionInfo = `【情绪表达 - 感情叠加理论】
情绪标签: ${variables.emotion}
真人面部表情极少是单一情绪。请运用感情叠加理论处理角色表情：
① 将"${variables.emotion}"分解为2-4种基础情绪的百分比混合（如 40% sadness + 30% determination + 30% nostalgia）
② 基础情绪谱: joy, sadness, anger, fear, surprise, disgust, contempt, trust, hope, resignation, determination, nostalgia
③ 将情绪配方翻译为具体的面部微表情：眉毛形态、眼睛状态（瞳孔/眼角/泪光）、嘴角弧度、面部肌肉张力
④ 在视频中，微表情应有细微的动态变化（如眼神闪烁、嘴角微颤），而非僵硬的静态表情`;
      } else {
        emotionInfo = `情绪/氛围: ${variables.emotion}`;
      }
    }
    let dialogueInfo;
    if (variables.dialogues && Array.isArray(variables.dialogues) && variables.dialogues.length > 0) {
      const lines = variables.dialogues.map(d => {
        const appearance = characterMap[d.character];
        // 带外貌描述，让视频模型能通过外观识别画面中哪个角色在说话
        return appearance
          ? `${d.character}（外貌：${appearance}）说："${d.line}" `
          : `${d.character}说："${d.line}" `;
      }).join('\n');
      dialogueInfo = `【角色台词】\n${lines}\n（重要：请根据外貌描述在画面中识别说话角色，说话角色的嘴型必须与台词同步，未说话的角色嘴唇不可动，需根据外貌明确区分说话者和旁听者）`;
    } else if (variables.dialogue) {
      dialogueInfo = `【台词】"${variables.dialogue}"（说话角色的嘴型必须与台词同步，未说话的角色嘴唇不可动）`;
    } else {
      dialogueInfo = '【无台词】本镜头无角色对话或语音，视频必须完全安静无声';
    }
    // 画外音信息
    const voiceoverText = variables.voiceover ? `【画外音/旁白】${variables.voiceover}（画面中应有旁白/解说声音，但不是场景中角色说的，是画外旁白）` : '';
    const actionInfo = hasAction ? '这是一个有动作的镜头，需要描述动作的完整过程' : '这是一个静态镜头，画面变化较小';
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
    // 结束状态仅在尾帧图存在时启用：其文本描述与尾帧画面强绑定，
    // 尾帧删除后再注入会让视频残留「已删除尾帧的影子」
    const endStateInfo = (lastFrameUrl && variables.endState)
      ? `【镜头结束状态】${variables.endState}（视频结束时画面必须呈现此状态）`
      : '';

    // 角色信息：优先使用多模态视觉分析结果，回退到数据库查询结果
    let charBlock;
    let charConstraint;
    if (hasCharacters) {
      let appearanceLine = '';
      if (visualAnalysis && visualAnalysis.characters && visualAnalysis.characters.length > 0) {
        // 使用多模态分析的角色外貌（更精准）
        appearanceLine = '\n外貌特征（基于首帧图片识别）: ' + visualAnalysis.characters.map(c => {
          const parts = [];
          if (c.appearance) parts.push(c.appearance);
          if (c.clothing) parts.push(c.clothing);
          if (c.pose) parts.push(c.pose);
          return `${c.name}: ${parts.join('，')}`;
        }).join('；');
      } else if (characterAppearance) {
        // 回退到数据库查询
        appearanceLine = `\n外貌特征: ${characterAppearance}`;
      }
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

    // 场景信息：优先使用多模态视觉分析结果
    let sceneBlock;
    if (visualAnalysis && visualAnalysis.scene) {
      const vs = visualAnalysis.scene;
      const sceneLines = [];
      if (vs.environment) sceneLines.push(`环境: ${vs.environment}`);
      if (vs.lighting) sceneLines.push(`光照: ${vs.lighting}`);
      if (vs.mood) sceneLines.push(`氛围: ${vs.mood}`);
      if (vs.colorTone) sceneLines.push(`色调: ${vs.colorTone}`);
      sceneBlock = `【场景详情（基于首帧图片识别）】\n${sceneLines.join('\n')}\n（已提供场景参考图作为首帧背景，视频场景必须一致）`;
    } else if (sceneDetail) {
      sceneBlock = `【场景详情】\n${sceneDetail}\n（已提供场景参考图作为首帧背景，视频场景必须一致）`;
    } else {
      sceneBlock = '';
    }

    // sceneBlock 已在上方定义（优先使用多模态视觉分析结果）

    const extraInfo = [charBlock, locInfo, sceneBlock, shotInfo, emotionInfo, dialogueInfo, voiceoverText, actionInfo, cameraInfo, endStateInfo, styleInfo, charConstraint, prevContext, nextContext, motionBreakdownText].filter(Boolean).join('\n');

    // outputLang 已在上方 Promise.allSettled 之前获取，此处复用

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
8. [Dialogue Lip-Sync] CRITICAL for audio generation: When character dialogue is provided, you MUST explicitly describe WHO is speaking and their appearance to identify them. Format: "[CharacterName]（外貌描述）说[dialogue]，嘴唇与台词同步". Non-speaking characters must keep their mouths closed. The speaking character must have visible lip movement matching the dialogue. Each speaking character must be identified by name AND appearance in the prompt so the video model knows exactly which person is talking.
9. [Dialogue Audio] When dialogue is present and generate_audio is enabled, the prompt must contain the actual dialogue text in quotes so the model can generate the spoken audio. E.g. "绅士（黑色西装、灰色领带）说'你画的不错'，嘴唇与台词同步，女孩微笑聆听，嘴唇紧闭"
11. [Audio Control] If marked as "No Dialogue" and no voiceover is provided, include "no speech, no voice, no dialogue, silent". If voiceover/narration is specified, include the narration voice description as off-screen narration audio. For silent mouth movements: use "silently mouthing without any audible sound", NEVER use murmuring/muttering/whispering
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

  // 5. 构建 imageUrls 并生成视频（支持单张帧图片：优先首帧，回退尾帧）
  if (onProgress) onProgress(20);
  const imageUrls = [];
  if (effectiveStartFrame) imageUrls.push(effectiveStartFrame);
  if (hasAction && lastFrameUrl && firstFrameUrl) {
    imageUrls.push(lastFrameUrl);
  }
  
  // 优先使用分镜中存储的时长，其次使用传入参数，并限制在 4-12 秒范围内（Seedance 1.5 Pro 官方限定 4-12s）
  let finalDuration = variables.duration || storyboard.duration || duration;
  if (finalDuration !== undefined && finalDuration !== null) {
    const parsed = parseFloat(finalDuration);
    finalDuration = isNaN(parsed) ? 5 : Math.max(4, Math.min(12, parsed));
  } else {
    finalDuration = 5; // 无时长参数时默认5秒
  }
  
  trace('构建视频参考图', { imageUrls, duration: finalDuration, aspectRatio });
  console.log('[SceneVideoGen] imageUrls:', imageUrls, '时长:', finalDuration);

  const submitParams = {
    prompt: promptUsed,
  };

  // 仅在有参考图时传递
  if (imageUrls.length > 0) {
    submitParams.imageUrls = imageUrls;
    submitParams.startFrame = effectiveStartFrame;
  }
  if (hasAction && lastFrameUrl && firstFrameUrl) {
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

  // 有台词或画外音时，自动开启音频生成（Seedance 1.5 Pro 支持 generate_audio）
  const hasDialogues = variables.dialogues && Array.isArray(variables.dialogues) && variables.dialogues.length > 0;
  const hasDialogue = !!variables.dialogue;
  const hasVoiceover = !!variables.voiceover;
  if (hasDialogues || hasDialogue || hasVoiceover) {
    submitParams.generate_audio = true;
    console.log('[SceneVideoGen] 检测到台词/画外音，开启音频生成 generate_audio=true');
  }

  let result;
  try {
    result = await submitAndPoll(modelName, submitParams, {
      intervalMs: 3000,
      maxDurationMs: 3600000,
      logTag: 'SceneVideoGen',
      onProgress: onProgress ? (p) => {
        // 将 submitAndPoll 的 30-90% 进度映射到 20-85%（留 5% 给下载）
        const mapped = 20 + Math.round((p - 30) * (85 - 20) / (90 - 30));
        onProgress(Math.min(mapped, 85));
      } : undefined
    });
  } catch (videoErr) {
    // 检测 "real person" 内容安全错误，自动降级为纯文本模式（去掉参考图）重试
    // 匹配两种格式：API 原始错误（"real person"）和自定义 handler 友好消息（"真人"/"安全策略"）
    const errMsg = (videoErr.message || '').toLowerCase();
    const isRealPersonError = errMsg.includes('real person') || errMsg.includes('real face') || errMsg.includes('real human') || errMsg.includes('真人');
    if (isRealPersonError && (submitParams.imageUrls || submitParams.startFrame)) {
      console.warn('[SceneVideoGen] 检测到 "real person" 安全策略错误，自动降级为纯文本模式重试（去掉参考图）');
      trace('视频生成降级重试', { reason: 'real_person_content_policy', originalImageCount: imageUrls.length });

      const fallbackParams = { ...submitParams };
      delete fallbackParams.imageUrls;
      delete fallbackParams.startFrame;
      delete fallbackParams.endFrame;

      result = await submitAndPoll(modelName, fallbackParams, {
        intervalMs: 3000,
        maxDurationMs: 3600000,
        logTag: 'SceneVideoGen-Fallback',
        onProgress: onProgress ? (p) => {
          const mapped = 20 + Math.round((p - 30) * (85 - 20) / (90 - 30));
          onProgress(Math.min(mapped, 85));
        } : undefined
      });
      console.log('[SceneVideoGen] 纯文本模式降级重试成功');
    } else {
      throw videoErr;
    }
  }

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

  // 回写视频 URL 到帧历史记录（当前批次）
  try {
    // 找到当前 is_current=true 的 first 帧记录，获取其 batch_id
    const currentFirstFrame = await queryOne(
      `SELECT id, batch_id FROM storyboard_frame_history WHERE storyboard_id = ? AND frame_type = 'first' AND is_current = TRUE`,
      [storyboardId]
    );
    if (currentFirstFrame) {
      if (currentFirstFrame.batch_id) {
        // 更新同一批次的所有记录
        await execute(
          'UPDATE storyboard_frame_history SET video_url = ? WHERE batch_id = ?',
          [persistedVideoUrl, currentFirstFrame.batch_id]
        );
        console.log('[SceneVideoGen] 视频 URL 已回写到帧历史批次:', currentFirstFrame.batch_id);
      } else {
        // 无 batch_id 的老数据，只更新当前 first 帧记录
        await execute(
          'UPDATE storyboard_frame_history SET video_url = ? WHERE id = ?',
          [persistedVideoUrl, currentFirstFrame.id]
        );
        console.log('[SceneVideoGen] 视频 URL 已回写到帧历史记录:', currentFirstFrame.id);
      }
    }
  } catch (e) {
    console.warn('[SceneVideoGen] 回写视频到帧历史失败（不影响主流程）:', e.message);
  }

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
