/**
 * 尾帧提示词生成处理器
 *
 * 功能：基于首帧多模态视觉分析结果 + 分镜描述，生成尾帧画面描述
 *
 * 输入:  { firstFrameVisual: object, description: string, endState: string, textModel: string }
 * 输出:  { lastFramePrompt: string }
 *
 * 使用场景：动作镜头在已有首帧但缺少尾帧时，自动生成尾帧提示词用于图片生成
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { trace } = require('../../engine/generationTrace');

/**
 * 将视觉分析结果格式化为文本
 */
function formatVisualAnalysis(visual) {
  if (!visual) return '';

  const parts = [];

  // 角色信息
  if (visual.characters && visual.characters.length > 0) {
    const charLines = visual.characters.map(c => {
      const details = [];
      if (c.appearance) details.push(c.appearance);
      if (c.clothing) details.push(c.clothing);
      if (c.pose) details.push(c.pose);
      return `- ${c.name}: ${details.join('，')}`;
    });
    parts.push('【角色信息】\n' + charLines.join('\n'));
  }

  // 场景信息
  if (visual.scene) {
    const sceneLines = [];
    if (visual.scene.environment) sceneLines.push(`环境: ${visual.scene.environment}`);
    if (visual.scene.lighting) sceneLines.push(`光照: ${visual.scene.lighting}`);
    if (visual.scene.mood) sceneLines.push(`氛围: ${visual.scene.mood}`);
    if (visual.scene.colorTone) sceneLines.push(`色调: ${visual.scene.colorTone}`);
    if (sceneLines.length > 0) {
      parts.push('【场景信息】\n' + sceneLines.join('\n'));
    }
  }

  // 构图信息
  if (visual.composition) {
    const compLines = [];
    if (visual.composition.shotType) compLines.push(`景别: ${visual.composition.shotType}`);
    if (visual.composition.cameraAngle) compLines.push(`机位: ${visual.composition.cameraAngle}`);
    if (visual.composition.framing) compLines.push(`构图: ${visual.composition.framing}`);
    if (compLines.length > 0) {
      parts.push('【构图信息】\n' + compLines.join('\n'));
    }
  }

  // 物体清单
  if (visual.objects && visual.objects.length > 0) {
    parts.push('【画面中的物体】\n' + visual.objects.map(o => `- ${o}`).join('\n'));
  }

  // 整体描述
  if (visual.visualDescription) {
    parts.push('【画面整体描述】\n' + visual.visualDescription);
  }

  return parts.join('\n\n');
}

/**
 * 尾帧提示词生成主函数
 */
async function handleLastFramePromptGeneration(inputParams, onProgress) {
  const {
    firstFrameVisual,
    description,
    endState,
    textModel: modelName,
    variables = {}
  } = inputParams;

  if (!modelName) {
    throw new Error('textModel 参数是必需的');
  }

  if (!firstFrameVisual) {
    throw new Error('firstFrameVisual 参数是必需的（需要先进行多模态首帧分析）');
  }

  console.log('[LastFramePrompt] 开始生成尾帧提示词，模型:', modelName);
  if (onProgress) onProgress(10);

  const visualText = formatVisualAnalysis(firstFrameVisual);
  const hasAction = variables.hasAction || false;

  const promptRequest = `你是一位专业的分镜尾帧描述生成专家。

请基于以下首帧画面信息，生成一张"尾帧"画面的详细描述。

========== 首帧画面分析 ==========
${visualText}

========== 分镜描述 ==========
${description || '无描述'}

========== 动作信息 ==========
${hasAction ? '这是一个有动作的镜头，需要体现动作的结束状态。' : '这是一个静态镜头，尾帧与首帧画面基本相同。'}
${endState ? `结束状态: ${endState}` : '未指定结束状态，请根据分镜描述推断。'}

========== 生成要求 ==========
1. 【角色一致性】尾帧中的角色必须与首帧完全一致：相同的外貌、相同的服装、相同的配饰。严禁改变角色形象。
2. 【场景一致性】场景环境、光照条件、色调必须与首帧一致。
3. 【动作结束】如果是有动作镜头，尾帧必须体现动作的"结束瞬间"——角色姿态是动作完成后的稳定状态。
4. 【构图一致】景别、机位角度、构图方式尽量与首帧保持一致，确保首尾帧衔接自然。
5. 【画面内容】仅描述画面中的静态视觉元素，不要包含运镜指令、动作过程描述。
6. 【无文字】画面中不应出现任何文字、字幕、水印。
7. 【英文输出】请用英文输出画面描述（视频生成模型需要英文提示词）。

请直接输出尾帧画面描述，不要输出解释、分析或JSON格式。描述应该足够详细，能让AI图片生成模型精确还原画面。`;

  if (onProgress) onProgress(30);

  try {
    const result = await handleBaseTextModelCall({
      prompt: promptRequest,
      textModel: modelName,
      maxTokens: 2048,
      temperature: 0.5
    });

    if (onProgress) onProgress(90);

    const lastFramePrompt = result.content || '';
    if (!lastFramePrompt) {
      throw new Error('模型返回空内容');
    }

    trace('尾帧提示词生成完成', {
      promptLength: lastFramePrompt.length,
      promptPreview: lastFramePrompt.substring(0, 100)
    });

    console.log('[LastFramePrompt] 生成完成，长度:', lastFramePrompt.length);
    if (onProgress) onProgress(100);

    return { lastFramePrompt };

  } catch (error) {
    console.error('[LastFramePrompt] 生成失败:', error.message);
    throw new Error(`尾帧提示词生成失败: ${error.message}`);
  }
}

module.exports = handleLastFramePromptGeneration;
