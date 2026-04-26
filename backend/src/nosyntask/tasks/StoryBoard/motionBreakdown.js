/**
 * 运动分解模块（Motion Breakdown）
 * 
 * 在视频生成前，分析场景中每个可见元素的运动行为，
 * 明确规定哪些元素运动、怎么运动、运动幅度，哪些元素保持静止。
 * 
 * 解决视频生成中的幻觉问题：
 * - 角色/物品莫名消失
 * - 不存在的物品凭空出现
 * - 静止物品被赋予不合理的运动
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { washForJSON } = require('../../../utils/washBody');
const { traced, trace } = require('../../engine/generationTrace');

/**
 * 生成运动分解清单
 * @param {Object} opts
 * @param {string} opts.textModel
 * @param {string} opts.description - 分镜描述
 * @param {Object} opts.variables - 分镜 variables_json
 * @param {boolean} opts.hasAction - 是否有动作
 * @param {string} [opts.characterAppearance] - 角色外貌描述
 * @param {string} [opts.sceneDetail] - 场景详情
 * @returns {string} 运动分解文本（直接嵌入视频提示词）
 *
 * 注：图片层的首/尾帧文本描述（variables.startFrame / endFrame）不再引入，
 * 以避免视频提示词受图片层残留的尾帧描述干扰。
 */
async function _generateMotionBreakdown(opts) {
  const {
    textModel, description, variables, hasAction,
    characterAppearance, sceneDetail
  } = opts;

  const charNames = variables.characters || [];
  const sceneState = variables.scene_state || 'normal';
  const environmentChange = variables.environment_change || '';

  // 构建场景元素上下文
  let elementsContext = '';
  if (charNames.length > 0) {
    elementsContext += `角色: ${charNames.join('、')}`;
    if (characterAppearance) elementsContext += `（${characterAppearance}）`;
    elementsContext += '\n';
  }
  if (variables.location) {
    elementsContext += `场景: ${variables.location}\n`;
  }
  if (sceneDetail) {
    elementsContext += `${sceneDetail}\n`;
  }

  const envBlock = (sceneState === 'modified' && environmentChange)
    ? `环境变化: ${environmentChange}（本镜头中发生）`
    : (sceneState === 'inherit' && environmentChange)
      ? `环境变化: ${environmentChange}（之前镜头已发生，本镜头保持）`
      : '';

  const prompt = `你是一个专业的视频动态规划专家。你需要分析一个分镜，列出场景中每个可见元素的运动行为。

【分镜描述】
${description}

${elementsContext ? `【场景元素】\n${elementsContext}` : ''}
${envBlock ? `【环境状态】\n${envBlock}` : ''}
动作类型: ${hasAction ? '有动作（画面有明显变化）' : '静态镜头（画面变化微小）'}

【你的任务】
列出场景中所有可见元素（角色、物品、环境元素），对每个元素标注：
- MOVING: 说明具体怎么动、动多少、从哪到哪
- STATIC: 明确保持不动（写清楚当前状态）

【关键规则】
1. 首帧中可见的所有元素必须全程存在，除非分镜描述明确说"消失/离开/被摧毁"
2. 不能凭空出现首帧中不存在的新元素（除非分镜描述明确提到"出现/飞来/掉落"）
3. 环境效果（雨、雪、闪电）的强度必须与描述完全匹配，不能自行放大或缩小
4. 静态镜头中，大部分元素应标注为 STATIC，只有微小变化（呼吸、风吹、火焰摇曳等）
5. 角色消失是严重错误——即使有剧烈环境事件（爆炸、闪电），角色也必须全程可见

【输出格式】
输出严格 JSON：
{
  "elements": [
    { "name": "元素名", "type": "MOVING|STATIC", "state": "当前状态描述", "motion": "运动描述（STATIC则写'保持不动'）", "persistence": "全程可见|短暂出现后消失|从X秒开始出现" }
  ],
  "summary": "一句话总结：这个镜头的核心动态是什么（中文）"
}

只输出 JSON，不要其他内容。`;

  const result = await handleBaseTextModelCall({
    prompt,
    textModel,
    maxTokens: 4096,
    think: false,
    temperature: 0.3
  });

  // 解析 JSON
  let parsed = washForJSON(result.content);
  if (!parsed || !Array.isArray(parsed.elements)) {
    try {
      const { jsonrepair } = await import('jsonrepair');
      const repaired = jsonrepair(result.content || '');
      parsed = JSON.parse(repaired);
    } catch (e) {
      console.warn('[MotionBreakdown] JSON 解析失败，跳过运动分解:', e.message);
      trace('运动分解解析失败', { error: e.message, raw: (result.content || '').substring(0, 200) });
      return '';
    }
  }

  if (!parsed || !Array.isArray(parsed.elements) || parsed.elements.length === 0) {
    console.warn('[MotionBreakdown] 元素列表为空，跳过运动分解');
    return '';
  }

  // 转换为视频提示词嵌入文本
  const movingElements = parsed.elements.filter(e => e.type === 'MOVING');
  const staticElements = parsed.elements.filter(e => e.type === 'STATIC');

  let breakdownText = '【Motion Breakdown - 逐元素运动规划，必须严格遵守】\n';
  breakdownText += `核心动态: ${parsed.summary || ''}\n\n`;

  if (movingElements.length > 0) {
    breakdownText += 'MOVING elements (these elements have motion):\n';
    for (const el of movingElements) {
      breakdownText += `- ${el.name}: ${el.motion}`;
      if (el.persistence && el.persistence !== '全程可见') {
        breakdownText += ` [${el.persistence}]`;
      }
      breakdownText += '\n';
    }
    breakdownText += '\n';
  }

  if (staticElements.length > 0) {
    breakdownText += 'STATIC elements (these elements must NOT move, must remain visible throughout):\n';
    for (const el of staticElements) {
      breakdownText += `- ${el.name}: remains ${el.state || 'unchanged'}, do NOT move, do NOT remove\n`;
    }
    breakdownText += '\n';
  }

  breakdownText += `PERSISTENCE RULES:\n`;
  breakdownText += `- Every element visible in the first frame MUST remain visible throughout the entire video unless explicitly marked as "disappearing"\n`;
  breakdownText += `- No new objects may appear that are not described above\n`;
  breakdownText += `- Characters MUST remain visible at all times, even during dramatic events (explosions, lightning, etc.)`;

  trace('运动分解完成', {
    movingCount: movingElements.length,
    staticCount: staticElements.length,
    summary: parsed.summary
  });

  console.log(`[MotionBreakdown] ✅ ${movingElements.length} 个运动元素, ${staticElements.length} 个静止元素 | ${parsed.summary || ''}`);

  return breakdownText;
}

const generateMotionBreakdown = traced('运动分解', _generateMotionBreakdown, {
  extractInput: (opts) => ({ hasAction: opts.hasAction, characters: opts.variables?.characters, location: opts.variables?.location }),
  extractOutput: (text) => ({ length: text?.length || 0, hasContent: !!text })
});

module.exports = { generateMotionBreakdown };
