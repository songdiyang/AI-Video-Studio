/**
 * AI 驱动的参考图选择器
 * 
 * 将所有可用参考图（带标签）+ 完整分镜上下文（含 variables_json）交给 AI，
 * 由 AI 决定使用哪些参考图、以什么顺序排列。
 * 
 * 替代原来 frameGeneration/singleFrameGeneration 中的硬编码 sceneState switch 逻辑。
 * 
 * 输入：textModel, frameType, 当前/上一镜头完整数据, 所有可用图片清单
 * 输出：按权重排序的参考图 URL 数组 + AI 的选择理由（用于 debug）
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { washForJSON } = require('../../../utils/washBody');
const { think } = require('../../config/workflow_fieldtable');
const { traced } = require('../../engine/generationTrace');

/**
 * @param {Object} opts
 * @param {string} opts.textModel - 文本模型名称
 * @param {string} opts.frameType - 'start' | 'end' | 'single'
 * @param {Object} opts.currentShot - 当前镜头完整数据
 *   { prompt_template, variables_json(已解析对象), first_frame_url, last_frame_url }
 * @param {Object|null} opts.prevShot - 上一镜头完整数据（同结构），首镜头为 null
 * @param {Array} opts.availableImages - 可用参考图清单
 *   [{ id: string, label: string, url: string, description: string }]
 * @returns {{ selectedUrls: string[], reasoning: string }}
 */
async function _selectReferenceImages({ textModel, frameType, currentShot, prevShot, availableImages }) {
  if (!textModel) {
    throw new Error('[RefSelector] 缺少 textModel，无法进行 AI 参考图选择');
  }

  if (!availableImages || availableImages.length === 0) {
    throw new Error('[RefSelector] 无可用参考图，无法进行参考图选择');
  }

  // 构建可用图片清单文本
  const imageListText = availableImages.map(img =>
    `  - ID: "${img.id}" | 标签: ${img.label} | 说明: ${img.description}`
  ).join('\n');

  // 当前镜头结构化上下文
  const curVars = currentShot.variables_json || {};
  const curLocation = curVars.location || '';
  const curSceneState = curVars.scene_state || 'normal';
  const curEnvChange = curVars.environment_change || '';
  const curHasAction = curVars.hasAction || false;
  const curDialogue = curVars.dialogue || '';
  const curShotType = curVars.shotType || '';
  const curEndState = curVars.endState || '';

  const currentContext = `【当前镜头】
描述: ${currentShot.prompt_template || ''}
场景: ${curLocation}
景别: ${curShotType || '未指定'}
动作类型: ${curHasAction ? '有动作（首帧→尾帧有明显变化）' : '静态镜头（画面变化微小）'}
对白: ${curDialogue || '无对白'}
场景状态: ${curSceneState}${curEnvChange ? `（环境变化: ${curEnvChange}）` : ''}
结束状态: ${curEndState || '未指定'}
已有首帧: ${currentShot.first_frame_url ? '是' : '否'}
已有尾帧: ${currentShot.last_frame_url ? '是' : '否'}
正在生成: ${frameType === 'start' ? '首帧（动作开始前的静止画面）' : frameType === 'end' ? '尾帧（动作完成后的静止画面）' : '单帧（无动作镜头的唯一画面）'}`;

  // 上一镜头结构化上下文
  let prevContext = '【上一镜头】无（这是第一个镜头）';
  if (prevShot) {
    const prevVars = prevShot.variables_json || {};
    const prevLocation = prevVars.location || '未知';
    const prevShotType = prevVars.shotType || '未指定';
    const prevEndState = prevVars.endState || '';
    const isSameScene = prevLocation && curLocation && prevLocation === curLocation;
    prevContext = `【上一镜头】
描述: ${prevShot.prompt_template || ''}
场景: ${prevLocation}${isSameScene ? '（与当前镜头同一场景）' : `（与当前镜头「${curLocation}」不同场景）`}
景别: ${prevShotType}
结束状态: ${prevEndState || '未指定'}
已有首帧: ${prevShot.first_frame_url ? '是' : '否'}
已有尾帧: ${prevShot.last_frame_url ? '是' : '否'}`;
  }

  const prompt = `你是一个专业的 AI 图片生成参考图选择专家。你需要根据分镜上下文，从可用参考图中选择最合适的图片并排序。

${currentContext}

${prevContext}

【可用参考图清单】
${imageListText}

【选择规则】
1. 参考图的排列顺序决定权重：排在前面的图片对生成结果影响更大
2. 角色参考图用于保持角色外貌一致性（发型、服装、体型）——但不要让 AI 复制角色立绘的姿势
3. 场景参考图用于保持场景环境一致性——注意场景状态：
   - "normal": 使用场景图（A面或B面，见规则10）
   - "modified": 本镜头环境正在变化，不要用原始场景图（它展示的是变化前的状态），如果有"上一镜头尾帧"则优先用它作为环境基准
   - "inherit": 环境已在之前镜头中被改变，优先用"更新版空镜场景图"而非原始场景图
4. 【跨场景判断 - 重要】上一镜头尾帧的使用必须考虑场景是否相同：
   - 同一场景：上一镜头尾帧用于保持镜头间连续性（角色姿势、位置、光线衔接），应优先选择
   - 不同场景：上一镜头尾帧通常不应选择（场景已切换，尾帧中的环境不适用于当前场景）。除非当前描述明确要求与上一镜头的视觉衔接
   ❗❗ 但即使同一场景，也要判断视角是否兼容，见规则 9
9. 【视角冲突判断 - 非常重要】上一镜头尾帧的拍摄视角可能与当前镜头完全不同。图片生成模型会强烈参考参考图的视角/构图，而不仅仅是内容。如果上一镜头尾帧的视角与当前镜头矛盾，参考图会误导生成结果：
   - 上一镜头是远景/中景背影，当前镜头是正面特写 → 不要选 prev_end_frame（背影视角会覆盖“正面”指令）
   - 上一镜头是正面特写，当前镜头是背影/侧面 → 不要选 prev_end_frame（正面视角会覆盖“背影”指令）
   - 景别大幅变化（如远景→特写、全景→大特写）→ 慎重选择 prev_end_frame，因为构图差异太大
   - 只有景别相近且拍摄方向一致时，prev_end_frame 才能真正帮助连续性
   注意：通过上一镜头的「描述」「景别」「结束状态」来推断其拍摄视角，再与当前镜头的景别/描述对比
5. 当前镜头首帧（仅生成尾帧时可用）用于保持同镜头内连续性——注意：如果环境在本镜头中发生了变化（scene_state=modified），首帧展示的是变化前/中的状态，尾帧应该展示变化后的状态，不要让首帧的环境状态过度主导尾帧
6. 根据景别和描述选择角色视图：
   - 侧面镜头、过肩镜头 → 优先用侧面视图
   - 背面镜头、角色背对观众 → 优先用背面视图
   - 角色侧对/背对观众说话 → 同时选该角度视图 + 正面图（保证面部一致性）
   - 正面/特写镜头 → 优先用正面视图
7. 无角色的空镜头不需要角色参考图
8. 一般选 2-4 张参考图即可，不要选太多（会稀释每张图的影响力）
10. 【A/B 面场景图选择 - 重要】如果候选图中同时存在 scene_original（A面）和 scene_reverse（B面），必须根据摄像机位置选择正确的面：
   - 通过上一镜头结束状态推断角色朝向，结合当前镜头景别判断摄像机方向
   - 摄像机在场景 A 面方向 → 选 scene_original（A面背景在角色身后）
   - 摄像机在场景 B 面方向（如正面特写角色，而角色面朝 A 面方向）→ 选 scene_reverse（B面背景在角色身后）
   - 如果无法判断方向（首镜头或无朝向信息），默认选 scene_original
   - 不要同时选两面（会混淆图片模型的空间认知）

【输出格式】
输出严格 JSON 对象：
{
  "selected": ["图片ID1", "图片ID2", ...],
  "reasoning": "简要说明选择理由（中文，一句话）"
}

只输出 JSON，不要其他内容。`;

  const result = await handleBaseTextModelCall({
    prompt,
    textModel,
    think: true,
    temperature: 0.4
  });

  // 检测 token 截断导致 content 为空
  if (!result.content && result.finishReason === 'length') {
    throw new Error('[RefSelector] AI 推理 token 不足，content 为空（finishReason=length），请检查模型 maxTokens 配置');
  }

  // 1. 先用 washForJSON 解析
  let parsed = washForJSON(result.content);

  // 2. 解析失败则尝试 jsonrepair
  if (!parsed || !Array.isArray(parsed.selected)) {
    console.warn('[RefSelector] washForJSON 解析失败，尝试 jsonrepair...');
    try {
      const { jsonrepair } = await import('jsonrepair');
      const rawContent = result.content || '';
      const repaired = jsonrepair(rawContent);
      parsed = JSON.parse(repaired);
      console.log('[RefSelector] ✅ jsonrepair 修复成功');
    } catch (repairError) {
      throw new Error(`[RefSelector] AI 输出解析失败且 jsonrepair 修复失败: 原始输出="${(result.content || '').substring(0, 200)}"`);
    }
  }

  if (!parsed || !Array.isArray(parsed.selected)) {
    throw new Error(`[RefSelector] AI 输出格式错误：缺少 selected 数组。原始输出="${(result.content || '').substring(0, 200)}"`);
  }

  // 将 ID 映射回 URL，保持 AI 指定的顺序
  const idToUrl = {};
  for (const img of availableImages) {
    idToUrl[img.id] = img.url;
  }
  const selectedUrls = parsed.selected
    .filter(id => idToUrl[id])
    .map(id => idToUrl[id]);

  const reasoning = parsed.reasoning || '';

  if (selectedUrls.length === 0) {
    throw new Error(`[RefSelector] AI 选择的图片 ID 全部无法映射: selected=[${parsed.selected.join(', ')}], available=[${availableImages.map(i => i.id).join(', ')}]`);
  }

  return { selectedUrls, reasoning };
}

const selectReferenceImages = traced('AI参考图选择', _selectReferenceImages, {
  extractInput: (opts) => ({ frameType: opts.frameType, candidates: opts.availableImages?.map(i => i.id) }),
  extractOutput: (r) => ({ selectedCount: r.selectedUrls?.length, reasoning: r.reasoning })
});

module.exports = { selectReferenceImages };
