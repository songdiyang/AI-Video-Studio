/**
 * 精细动态运镜提示词生成处理器
 * 
 * 基于电影学运镜理论，结合分镜描述、首尾帧、endState、上下文镜头信息，
 * 为每个镜头生成精细的动态运镜提示词（英文），直接用于视频生成模型。
 * 
 * 输入：
 *   - storyboardId: 分镜 ID
 *   - textModel: 文本模型名称
 *   - firstFrameUrl: 首帧图片 URL（可选，用于理解画面构图）
 *   - lastFrameUrl: 尾帧图片 URL（可选，动作镜头）
 *   图片参数会自动派生
 * 输出：
 *   - cameraRunPrompt: 精细运镜英文提示词
 *   - cameraRunAnalysis: 运镜分析（中文，供调试）
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { queryOne, queryAll, execute } = require('../../../dbHelper');
const { requireVisualStyle, getOutputLanguage } = require('../../../utils/getProjectStyle');

/** 安全解析 variables_json */
function safeParseVariables(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

/** 从邻居行构建 shotData */
function buildShotData(nb) {
  const nbVars = safeParseVariables(nb.variables_json);
  return {
    description: nb.prompt_template || '',
    shotType: nbVars.shotType || '',
    endState: nbVars.endState || '',
    cameraMovement: nbVars.cameraMovement || '',
    hasAction: nbVars.hasAction || false,
    emotion: nbVars.emotion || '',
    firstFrameUrl: nb.first_frame_url || null,
    lastFrameUrl: nb.last_frame_url || null
  };
}

/**
 * 精细运镜生成
 * 
 * inputParams._context 可选预取上下文（由 sceneVideoGeneration 传入以避免重复 DB 查询）：
 *   { storyboard, variables, visualStyle, prevNeighbor, nextNeighbor, characterAppearance }
 */
async function handleCameraRunGeneration(inputParams, onProgress) {
  const { storyboardId, textModel, think, _context } = inputParams;

  if (!storyboardId) throw new Error('缺少必要参数: storyboardId');
  if (!textModel) throw new Error('textModel 参数是必需的');

  console.log('[CameraRunGen] 开始生成精细运镜, storyboardId:', storyboardId);
  if (onProgress) onProgress(5);

  // 1. 优先使用预取上下文，否则从 DB 查询
  let storyboard, variables, visualStyle, prevShot, nextShot, characterAppearance, outputLang;

  if (_context) {
    // 由父级传入，跳过全部 DB 查询
    storyboard = _context.storyboard;
    variables = _context.variables;
    visualStyle = _context.visualStyle;
    characterAppearance = _context.characterAppearance || '';
    prevShot = _context.prevNeighbor ? buildShotData(_context.prevNeighbor) : null;
    nextShot = _context.nextNeighbor ? buildShotData(_context.nextNeighbor) : null;
    outputLang = _context.outputLang || { languageCode: 'en', languageName: 'English', promptInstruction: 'Output ONLY in English.' };
    console.log('[CameraRunGen] 使用预取上下文，跳过 DB 查询');
  } else {
    // 独立调用：并行查询分镜+视觉风格，再查邻居+角色
    storyboard = await queryOne('SELECT * FROM storyboards WHERE id = ?', [storyboardId]);
    if (!storyboard) throw new Error(`分镜 ${storyboardId} 不存在`);

    variables = safeParseVariables(storyboard.variables_json);

    const scriptId = storyboard.script_id;
    const currentIdx = storyboard.idx;
    const charNames = variables.characters || [];

    // 并行查询：视觉风格 + 邻居镜头 + 角色外貌 + 输出语言
    const [vsResult, nbResult, charResult, langResult] = await Promise.allSettled([
      requireVisualStyle(storyboard.project_id),
      (scriptId != null && currentIdx != null)
        ? queryAll(
            'SELECT idx, prompt_template, variables_json, first_frame_url, last_frame_url FROM storyboards WHERE script_id = ? AND idx IN (?, ?) ORDER BY idx ASC',
            [scriptId, currentIdx - 1, currentIdx + 1]
          )
        : Promise.resolve([]),
      charNames.length > 0
        ? queryAll(
            `SELECT c.name, c.appearance FROM storyboard_characters sc
             JOIN characters c ON sc.character_id = c.id
             WHERE sc.storyboard_id = ? AND c.name IN (${charNames.map(() => '?').join(',')})`,
            [storyboardId, ...charNames]
          )
        : Promise.resolve([]),
      getOutputLanguage(storyboard.project_id)
    ]);

    if (vsResult.status === 'rejected') throw vsResult.reason;
    visualStyle = vsResult.value;

    prevShot = null;
    nextShot = null;
    if (nbResult.status === 'fulfilled') {
      for (const nb of nbResult.value) {
        if (nb.idx === currentIdx - 1) prevShot = buildShotData(nb);
        if (nb.idx === currentIdx + 1) nextShot = buildShotData(nb);
      }
    }

    characterAppearance = '';
    if (charResult.status === 'fulfilled') {
      characterAppearance = charResult.value
        .filter(c => c.appearance)
        .map(c => {
          // 提取简短的视觉标识符（50字以内），用于视频提示词中区分角色
          const shortDesc = (c.appearance || '').slice(0, 50).replace(/\n/g, ' ');
          return `${c.name}: ${shortDesc || '未设置外貌描述'}`;
        })
        .join('\n');
    }

    outputLang = langResult.status === 'fulfilled' ? langResult.value : { languageCode: 'en', languageName: 'English', promptInstruction: 'Output ONLY in English.' };
  }

  const description = storyboard.prompt_template || '';
  const hasAction = variables.hasAction || false;
  const shotType = variables.shotType || '';
  const emotion = variables.emotion || '';
  const cameraMovement = variables.cameraMovement || '';
  const endState = variables.endState || '';
  const startFrameDesc = variables.startFrame || '';
  const endFrameDesc = variables.endFrame || '';
  let dialogue = '';
  if (variables.dialogues && Array.isArray(variables.dialogues) && variables.dialogues.length > 0) {
    dialogue = variables.dialogues.map(d => `${d.character} says "${d.line}"`).join('; ');
  } else {
    dialogue = variables.dialogue || '';
  }
  const duration = variables.duration || (hasAction ? 3 : 2);
  const firstFrameUrl = storyboard.first_frame_url || null;
  const lastFrameUrl = storyboard.last_frame_url || null;
  const charNames = variables.characters || [];
  const currentIdx = storyboard.idx;

  if (onProgress) onProgress(30);

  // 4. 构建精细运镜提示词请求
  const isFirstShot = (currentIdx === 0 || currentIdx === null);

  // 上一镜头上下文
  const prevContext = prevShot
    ? `【上一镜头（第${currentIdx}镜）】
描述: ${prevShot.description}
景别: ${prevShot.shotType}
运镜: ${prevShot.cameraMovement || 'static'}
结束状态: ${prevShot.endState}
情绪: ${prevShot.emotion}
${prevShot.hasAction ? '（动作镜头）' : '（静态镜头）'}`
    : (isFirstShot ? '【这是第一个镜头，没有前序镜头】' : '【上一镜头信息不可用】');

  // 下一镜头上下文
  const nextContext = nextShot
    ? `【下一镜头（第${currentIdx + 2}镜）】
描述: ${nextShot.description}
景别: ${nextShot.shotType}
运镜: ${nextShot.cameraMovement || 'static'}
情绪: ${nextShot.emotion}`
    : '【这是最后一个镜头或下一镜头信息不可用】';

  // 当前镜头信息
  const currentShotInfo = `【当前镜头（第${currentIdx + 1}镜）】
描述: ${description}
景别: ${shotType}
基础运镜方向: ${cameraMovement || 'static'}
是否有动作: ${hasAction ? '是' : '否'}
${hasAction ? `首帧描述: ${startFrameDesc}\n尾帧描述: ${endFrameDesc}` : ''}
结束状态: ${endState}
情绪氛围: ${emotion}
对白: ${dialogue || '无'}
建议时长: ${duration}秒
${charNames.length > 0 ? `角色: ${charNames.join('、')}` : '无角色（空镜头）'}
${characterAppearance ? `\n角色视觉标识符（用于视频提示词）：\n${characterAppearance}` : ''}
视觉风格: ${visualStyle}`;

  // 首尾帧参考说明
  const frameRefInfo = firstFrameUrl
    ? `【参考帧信息】
- 首帧已生成（画面起点）${lastFrameUrl ? '\n- 尾帧已生成（画面终点，动作镜头）' : ''}
- 运镜提示词必须描述从首帧到${lastFrameUrl ? '尾帧' : '镜头结束'}的完整镜头运动过程`
    : '【无参考帧，仅根据描述生成运镜】';

  const fullPrompt = `You are a senior cinematographer. Generate a precise camera movement prompt for an AI video generator.

Available techniques: Dolly In/Out, Zoom In/Out, Dolly Zoom, Pan, Tilt, Track, Arc/Orbit, Crane Up/Down, Handheld, Steadicam.
Pacing rules: slow=contemplative/sad, medium=narrative, fast=tension/action, sudden stop=shock, acceleration=urgency.
Transition logic: match-direction=smooth, reverse-direction=contrast, static→dynamic=new event, dynamic→static=settle.

---

${prevContext}

${currentShotInfo}

${nextContext}

${frameRefInfo}

---

Generate the camera movement prompt for the current shot.

【Output Requirements】
1. Output a single English paragraph, directly usable by video generation AI
2. Must include:
   - Camera movement type, direction, and rotation angle (e.g. "slow dolly in", "smooth pan left to right")
   - Movement speed and pacing (e.g. "gradually accelerating", "steady pace")
   - Start and end framing states (e.g. "starting from a wide establishing shot, ending on a close-up")
   - If characters have actions, describe how character motion coordinates with camera movement
   - If there is dialogue, describe lip movement and expression changes
3. Camera movement must naturally connect with the previous shot's end state (if available)
4. The final frame must match the endState description
5. Camera style must match the emotional tone
6. Duration ~${duration}s, pace the movement accordingly
7. Output ONLY the ${outputLang.languageName} prompt, no explanations, no line breaks, no numbering
8. [Language Purity] ${outputLang.promptInstruction} Translate all source terms to the target language faithfully.`;

  if (onProgress) onProgress(40);

  const result = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel,
    maxTokens: 4096,
    temperature: 0.6,
    think
  });

  const cameraRunPrompt = (result.content || '').trim();
  console.log('[CameraRunGen] 运镜提示词:', cameraRunPrompt.substring(0, 120) + '...');

  if (onProgress) onProgress(90);

  // 5. 保存运镜提示词到 variables_json
  try {
    variables.cameraRunPrompt = cameraRunPrompt;
    await execute(
      'UPDATE storyboards SET variables_json = ? WHERE id = ?',
      [JSON.stringify(variables), storyboardId]
    );
    console.log('[CameraRunGen] 运镜提示词已保存到 variables_json');
  } catch (e) {
    console.warn('[CameraRunGen] 保存运镜提示词失败:', e.message);
  }

  if (onProgress) onProgress(100);

  return {
    cameraRunPrompt,
    storyboardId,
    shotType,
    cameraMovement,
    duration
  };
}

module.exports = handleCameraRunGeneration;
