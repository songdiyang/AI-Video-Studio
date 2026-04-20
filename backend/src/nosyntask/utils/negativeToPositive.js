/**
 * 反向提示词转正向提示词工具
 * 
 * 将 negative prompt（描述画面中不应出现的内容）转换为正向提示词（描述画面应该出现的内容），
 * 然后与原始正向提示词合并，使所有图片模型都能利用反向提示词的引导信息。
 * 
 * 策略：
 * 1. 如果提供了 textModel，使用 AI 进行精准转换（语义理解更准确）
 * 2. 否则使用规则映射进行快速转换（零延迟、零成本）
 * 3. 内置 LRU 缓存，相同 negative_prompt 不重复转换
 */

const { callAIModel } = require('../../aiModelService');

// ============================================================
// 规则映射表：常见反向提示词 → 正向表达
// ============================================================
const NEGATIVE_TO_POSITIVE_MAP = {
  // 质量类
  '模糊': '清晰锐利',
  '低质量': '高质量精细',
  '低分辨率': '高分辨率',
  '像素化': '细腻平滑',
  '噪点': '干净无噪点',
  '压缩痕迹': '无损画质',
  ' jpeg压缩': '高清无损',
  '失真': '清晰无失真',
  '过曝': '曝光准确',
  '欠曝': '光线充足',
  '过暗': '明暗适度',
  '过亮': '光线自然',

  // 形态类
  '变形': '形态准确',
  '扭曲': '比例协调',
  '畸形': '形态正常',
  '多余肢体': '肢体数量正确',
  '多余手指': '手指数量正确',
  '多余手臂': '手臂数量正确',
  '多余腿': '腿部数量正确',
  '肢体错误': '肢体结构正确',
  '解剖错误': '解剖结构准确',
  '比例失调': '比例协调',
  '结构错误': '结构准确',

  // 画面缺陷类
  '水印': '干净无水印',
  '文字': '无文字画面',
  '签名': '无签名画面',
  '标志': '无标志画面',
  'logo': '无logo画面',
  '字幕': '无字幕画面',
  '边框': '无边框画面',
  '黑边': '无边框干净画面',

  // 风格冲突类
  '卡通': '写实风格',
  '动漫': '写实风格',
  '插画': '真实照片风格',
  '3d渲染': '真实照片风格',
  '游戏风格': '真实照片风格',
  '写实': '动漫风格',
  '真人': '动漫风格',
  '照片': '插画风格',
  '真实照片': '艺术绘画风格',

  // 情绪冲突类
  '微笑': '严肃表情',
  '笑容': '沉稳表情',
  '悲伤': '积极表情',
  '哭泣': '平静表情',
  '明亮': '暗调氛围',
  '阴暗': '明亮色调',
  '开心': '沉稳氛围',

  // 内容排除类
  '背景杂乱': '背景简洁干净',
  '背景干扰': '背景纯净',
  '多余元素': '画面简洁',
  '多余物体': '构图简洁',
  '不相关内容': '内容聚焦',

  // 英文常见词
  'blurry': 'sharp and clear',
  'low quality': 'high quality',
  'distorted': 'accurate form',
  'deformed': 'properly formed',
  'extra limbs': 'correct number of limbs',
  'extra fingers': 'correct number of fingers',
  'watermark': 'clean no watermark',
  'text': 'no text',
  'signature': 'no signature',
  'cropped': 'full frame',
  'out of frame': 'within frame',
  'worst quality': 'best quality',
  'normal quality': 'high quality',
  'jpeg artifacts': 'artifact-free',
  'ugly': 'aesthetically pleasing',
  'duplicate': 'unique composition',
  'morbid': 'healthy appearance',
  'mutation': 'natural form',
};

// 缓存：negative_prompt → 转换后的正向表达
const conversionCache = new Map();
const CACHE_MAX_SIZE = 200;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30分钟

/**
 * 规则转换：将反向提示词逐词转换为正向表达
 * @param {string} negativePrompt - 反向提示词（中文逗号或英文逗号分隔）
 * @returns {string} 正向表达
 */
function ruleBasedConvert(negativePrompt) {
  if (!negativePrompt || typeof negativePrompt !== 'string') return '';
  
  // 支持中英文逗号分隔
  const terms = negativePrompt.split(/[,，、;；\s]+/).filter(t => t.trim());
  const positiveTerms = [];
  
  for (const term of terms) {
    const trimmed = term.trim().toLowerCase();
    
    // 精确匹配
    if (NEGATIVE_TO_POSITIVE_MAP[trimmed]) {
      positiveTerms.push(NEGATIVE_TO_POSITIVE_MAP[trimmed]);
      continue;
    }
    
    // 原文匹配（保留大小写）
    if (NEGATIVE_TO_POSITIVE_MAP[term.trim()]) {
      positiveTerms.push(NEGATIVE_TO_POSITIVE_MAP[term.trim()]);
      continue;
    }
    
    // 前缀否定词处理
    let converted = term.trim();
    if (converted.startsWith('不')) {
      // "不清晰" → "清晰"
      const withoutNeg = converted.substring(1);
      if (withoutNeg) positiveTerms.push(withoutNeg);
    } else if (converted.startsWith('无') && converted.length > 1) {
      // "无水印" → "干净无水印" (保留"无"语义，但转为正面描述)
      positiveTerms.push(converted);
    } else if (converted.startsWith('非') && converted.length > 1) {
      // "非写实" → "写实风格以外" → 用正面描述
      positiveTerms.push(converted.substring(1) + '以外风格');
    } else if (converted.startsWith('no ') || converted.startsWith('no-')) {
      // 英文 "no text" → "without text" 风格
      positiveTerms.push('clean ' + converted.substring(converted.indexOf(' ') + 1 || converted.indexOf('-') + 1));
    } else {
      // 未知词汇：尝试从映射表中模糊匹配
      let matched = false;
      for (const [negKey, posVal] of Object.entries(NEGATIVE_TO_POSITIVE_MAP)) {
        if (trimmed.includes(negKey) || negKey.includes(trimmed)) {
          positiveTerms.push(posVal);
          matched = true;
          break;
        }
      }
      if (!matched) {
        // 无法转换的词，加上"避免"语义的正面描述
        positiveTerms.push('准确的' + converted);
      }
    }
  }
  
  return positiveTerms.join('，');
}

/**
 * AI转换：使用文本模型将反向提示词转为正向表达
 * @param {string} negativePrompt - 反向提示词
 * @param {string} textModel - 文本模型名称
 * @param {string} [originalPrompt] - 原始正向提示词（提供上下文帮助AI更精准转换）
 * @returns {Promise<string>} 正向表达
 */
async function aiBasedConvert(negativePrompt, textModel, originalPrompt) {
  const systemPrompt = `你是一个专业的图像提示词转换器。你的任务是将反向提示词（描述画面中不应出现的内容）转换为正向提示词（描述画面中应该出现的内容），使转换后的内容可以作为正向引导信息帮助图像生成。

规则：
1. 将每个反向描述转为对应的正向肯定描述
2. 转换要语义准确，不能丢失原始反向提示词想排除的内容信息
3. 输出格式：用中文逗号分隔的短语列表
4. 只输出转换结果，不要解释
5. 示例：
   - 输入："模糊，低质量，变形，多余肢体，水印"
   - 输出："清晰锐利，高质量精细，形态准确，肢体数量正确，干净无水印"`;

  const userPrompt = originalPrompt 
    ? `原始正向提示词上下文：${originalPrompt.substring(0, 200)}\n\n请将以下反向提示词转换为正向提示词：${negativePrompt}`
    : `请将以下反向提示词转换为正向提示词：${negativePrompt}`;

  try {
    const response = await callAIModel(textModel, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      maxTokens: 512,
      temperature: 0.3  // 低温度保证稳定输出
    });

    let result = '';
    if (typeof response === 'string') {
      result = response;
    } else if (response?.content) {
      result = response.content;
    } else if (response?.text) {
      result = response.text;
    } else if (response?.message) {
      result = response.message;
    }

    // 清理：去除引号包裹和多余空白
    result = result.replace(/^["'""]+|["'""]+$/g, '').trim();
    
    // 去除可能的前缀说明（如"转换结果："）
    result = result.replace(/^(转换结果|结果|正向提示词)[：:]\s*/i, '').trim();
    
    return result || ruleBasedConvert(negativePrompt); // AI失败时降级到规则
  } catch (err) {
    console.warn('[NegativeToPositive] AI转换失败，降级到规则转换:', err.message);
    return ruleBasedConvert(negativePrompt);
  }
}

/**
 * 缓存清理
 */
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of conversionCache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      conversionCache.delete(key);
    }
  }
}

/**
 * 主转换函数：将反向提示词转为正向表达
 * 
 * @param {string} negativePrompt - 反向提示词
 * @param {Object} [options] - 可选参数
 * @param {string} [options.textModel] - 文本模型名（提供则使用AI转换，否则规则转换）
 * @param {string} [options.originalPrompt] - 原始正向提示词（提供上下文）
 * @returns {Promise<string>} 转换后的正向表达
 */
async function convertNegativeToPositive(negativePrompt, options = {}) {
  if (!negativePrompt || typeof negativePrompt !== 'string' || !negativePrompt.trim()) {
    return '';
  }

  const { textModel, originalPrompt } = options;
  const cacheKey = `${negativePrompt}||${textModel || 'rule'}`;

  // 检查缓存
  const cached = conversionCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    console.log('[NegativeToPositive] 命中缓存:', negativePrompt.substring(0, 30));
    return cached.result;
  }

  // 清理过期缓存
  if (conversionCache.size > CACHE_MAX_SIZE) {
    cleanExpiredCache();
  }

  let result;
  if (textModel) {
    // AI转换
    console.log('[NegativeToPositive] 使用AI转换，模型:', textModel);
    result = await aiBasedConvert(negativePrompt, textModel, originalPrompt);
  } else {
    // 规则转换
    console.log('[NegativeToPositive] 使用规则转换');
    result = ruleBasedConvert(negativePrompt);
  }

  console.log('[NegativeToPositive] 转换结果:', negativePrompt.substring(0, 30), '→', result.substring(0, 50));

  // 写入缓存
  conversionCache.set(cacheKey, { result, timestamp: Date.now() });

  return result;
}

/**
 * 将反向提示词合并到正向提示词中
 * 
 * @param {string} positivePrompt - 原始正向提示词
 * @param {string} negativePrompt - 反向提示词
 * @param {Object} [options] - 可选参数
 * @param {string} [options.textModel] - 文本模型名
 * @returns {Promise<string>} 合并后的正向提示词
 */
async function mergeNegativeIntoPositive(positivePrompt, negativePrompt, options = {}) {
  if (!negativePrompt || !negativePrompt.trim()) {
    return positivePrompt;
  }

  const convertedPositive = await convertNegativeToPositive(negativePrompt, {
    ...options,
    originalPrompt: positivePrompt
  });

  if (!convertedPositive) {
    return positivePrompt;
  }

  // 用逗号拼接：原始正向 + 转换后的正向
  const separator = positivePrompt.match(/[,，.。;；!！?？]$/) ? ' ' : '，';
  const merged = positivePrompt + separator + convertedPositive;
  
  console.log('[NegativeToPositive] 合并后提示词长度:', positivePrompt.length, '→', merged.length);
  
  return merged;
}

module.exports = {
  convertNegativeToPositive,
  mergeNegativeIntoPositive,
  ruleBasedConvert // 导出供测试
};
