/**
 * 多模态首帧/尾帧视觉分析处理器
 *
 * 功能：调用多模态大模型识别图片中的视觉元素，生成结构化分析结果
 *
 * 输入:  { imageUrls: string[], description: string, textModel: string }
 * 输出:  { visualDescription: string, characters: Array, scene: Object, composition: Object }
 *
 * 降级策略：如果模型不支持 vision 或调用失败，返回 null，由调用方回退到纯文本方案
 */

const { callAIModel } = require('../../../aiModelService');
const { trace } = require('../../engine/generationTrace');

/** 安全解析 JSON */
function safeJsonParse(text) {
  if (!text) return null;
  try {
    // 尝试提取 JSON 代码块
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/```\s*([\s\S]*?)```/);
    const jsonText = jsonMatch ? jsonMatch[1].trim() : text.trim();
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

/**
 * 检测模型是否可能支持 vision
 * 基于模型名称和配置进行启发式判断
 * 
 * 纯文本模型（如 DeepSeek Chat、Qwen）明确不支持 image_url，
 * 必须跳过视觉分析以避免 HTTP 400 错误。
 */
function isVisionCapable(modelName) {
  if (!modelName) return false;

  // 纯文本模型明确不支持 vision（黑名单优先）
  const textOnlyKeywords = ['deepseek-chat', 'deepseek reasoner', 'deepseek-v3', 'qwen-plus', 'qwen-turbo', 'qwen-max'];
  const nameLower = modelName.toLowerCase();
  if (textOnlyKeywords.some(k => nameLower.includes(k.toLowerCase()))) {
    return false;
  }

  // 多模态/视觉模型白名单
  const visionKeywords = ['vision', 'multimodal', 'vl', '4o', 'opus', 'gemini', 'pro-vision', 'seed', 'doubao-seed', 'glm-4v'];
  return visionKeywords.some(k => nameLower.includes(k));
}

/**
 * 构建多模态 messages（OpenAI 兼容格式）
 */
function buildVisionMessages(imageUrls, description) {
  const content = [];

  // 先放图片（让模型先看图）
  for (const url of imageUrls) {
    if (url) {
      content.push({
        type: 'image_url',
        image_url: { url }
      });
    }
  }

  // 再放文本提示词
  const textPrompt = `请详细分析上面${imageUrls.length > 1 ? '这些图片' : '这张图片'}中的视觉元素，并参考以下分镜描述：
"${description || '无描述'}"

请输出结构化分析（JSON格式）：
{
  "visualDescription": "详细的画面描述（200字以内）",
  "characters": [
    {
      "name": "角色名（如无法识别填'未知角色'）",
      "appearance": "外貌特征（发型、五官、体型）",
      "clothing": "服装描述（颜色、款式、配饰）",
      "pose": "姿态动作"
    }
  ],
  "scene": {
    "environment": "场景环境（室内/室外、建筑、自然元素）",
    "lighting": "光照条件（方向、色温、强度）",
    "mood": "氛围情绪",
    "colorTone": "主色调和配色方案"
  },
  "composition": {
    "shotType": "景别（特写/近景/中景/全景/远景）",
    "cameraAngle": "机位角度（平视/俯视/仰视）",
    "framing": "构图方式"
  },
  "objects": ["画面中所有可见物体的清单"],
  "detailedElements": [
    {
      "type": "character|object|environment",
      "name": "元素名称",
      "position": "在画面中的位置（如：左侧前景、中央、右侧背景）",
      "size": "相对大小（大/中/小）",
      "material": "材质（如：布料、金属、木质、玻璃、皮肤等）",
      "state": "当前状态（静止/微动/运动中）",
      "motionPotential": "运动潜力：该元素在视频中可能如何运动（轨迹、速度、方式）"
    }
  ],
  "motionAnalysis": {
    "characterMotions": [
      {
        "name": "角色名",
        "currentPose": "当前姿态",
        "possibleActions": ["基于画面可能发生的动作1", "动作2"],
        "physicalConstraints": "物理限制（如：坐姿角色无法突然站立奔跑，手持物品限制手臂运动）",
        "suggestedMotion": "建议的运动轨迹和方式"
      }
    ],
    "objectInteractions": [
      {
        "objects": ["物体A", "物体B"],
        "interactionType": "互动类型（碰撞/支撑/遮挡/传递等）",
        "interactionDynamics": "互动动态描述"
      }
    ],
    "cameraMovementPotential": "基于画面构图推荐的摄像机运动（推/拉/摇/移/跟/升降/环绕），包含运动理由",
    "dynamicComposition": "画面从静态到动态的构图演变建议",
    "lightingDynamics": "光影随运动的变化潜力（如：移动角色经过窗户时光影在脸上扫过）"
  }
}

注意：
1. 必须基于图片实际内容，不要编造图片中没有的元素
2. 角色服装颜色必须准确描述
3. 如果有多张图片，请对比分析它们之间的关系（如首尾帧的连续性）
4. motionAnalysis 必须基于画面中元素的实际物理状态，不要编造不合理的运动
5. 仅输出 JSON，不要输出其他文字`;

  content.push({
    type: 'text',
    text: textPrompt
  });

  return [{ role: 'user', content }];
}

/**
 * 多模态视觉分析主函数
 */
async function handleVisionFrameAnalysis(inputParams, onProgress) {
  const { imageUrls, description, textModel: modelName } = inputParams;

  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    console.log('[VisionAnalysis] 无图片URL，跳过视觉分析');
    return null;
  }

  if (!modelName) {
    console.log('[VisionAnalysis] 无模型配置，跳过视觉分析');
    return null;
  }

  // 检测模型是否支持 vision
  if (!isVisionCapable(modelName)) {
    console.log(`[VisionAnalysis] 模型 ${modelName} 不支持 vision，跳过视觉分析`);
    return null;
  }

  console.log('[VisionAnalysis] 开始视觉分析，图片数:', imageUrls.length, '模型:', modelName);
  if (onProgress) onProgress(10);

  try {
    const messages = buildVisionMessages(imageUrls, description);

    if (onProgress) onProgress(30);

    const result = await callAIModel(modelName, {
      messages,
      maxTokens: 4096,
      temperature: 0.3
    });

    if (onProgress) onProgress(80);

    const content = result?.content || result?.text || '';
    if (!content) {
      console.warn('[VisionAnalysis] 模型返回空内容');
      return null;
    }

    // 解析 JSON 结果
    const parsed = safeJsonParse(content);
    if (!parsed) {
      console.warn('[VisionAnalysis] 无法解析模型返回的 JSON，原始内容:', content.substring(0, 200));
      // 降级：将原始文本作为 visualDescription
      return {
        visualDescription: content.substring(0, 500),
        characters: [],
        scene: {},
        composition: {},
        objects: [],
        _raw: content
      };
    }

    const output = {
      visualDescription: parsed.visualDescription || '',
      characters: parsed.characters || [],
      scene: parsed.scene || {},
      composition: parsed.composition || {},
      objects: parsed.objects || [],
      detailedElements: parsed.detailedElements || [],
      motionAnalysis: parsed.motionAnalysis || {},
      _raw: content
    };

    trace('视觉分析完成', {
      imageCount: imageUrls.length,
      visualDescription: output.visualDescription.substring(0, 100),
      characterCount: output.characters.length
    });

    console.log('[VisionAnalysis] 分析完成，角色数:', output.characters.length);
    if (onProgress) onProgress(100);

    return output;

  } catch (error) {
    console.error('[VisionAnalysis] 视觉分析失败:', error.message);
    // 降级返回 null，由调用方处理
    return null;
  }
}

module.exports = handleVisionFrameAnalysis;
