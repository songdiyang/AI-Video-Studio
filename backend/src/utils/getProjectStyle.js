/**
 * 项目风格工具函数
 * 从 projects.settings_json 中读取视觉风格和叙事风格
 * 
 * settings_json 结构：
 * {
 *   "visualStyle": "日系动漫",              // 人类可读标签
 *   "visualStylePrompt": "动漫风格...",     // 中文提示词片段，注入所有图片/视频生成
 *   "storyStyle": "热血少年漫",             // 叙事风格（用于剧本生成）
 *   "storyConstraints": "不要魔法元素"      // 剧本约束
 * }
 */

const { queryOne } = require('../dbHelper');

// 预设视觉风格映射
const VISUAL_STYLE_PRESETS = {
  '日系动漫': '动漫风格, 赛璐珞上色, 鲜艳色彩, 干净线条, 漫画美学, 日式动画',
  '写实电影': '照片写实, 电影级打光, 胶片质感, 真实比例, 电影剧照, 自然色调',
  '3D渲染': '3D渲染, 皮克斯风格, 柔和光照, 次表面散射, 平滑着色, CG品质',
  '水彩绘本': '水彩插画, 柔和边缘, 粉彩色调, 绘本风格, 手绘纹理',
  '赛博朋克': '赛博朋克, 霓虹灯光, 暗黑氛围, 未来科幻, 高对比度, 科幻美学',
  '美漫风格': '美式漫画风格, 粗犷描边, 动感明暗, 超级英雄美学, 鲜明色彩',
  '像素风': '像素画风格, 复古游戏美学, 16位像素, 干净像素点, 怀旧风',
  '国风水墨': '中国水墨画风格, 传统笔触, 典雅, 留白极简, 东方美学',
  '天宫赐福': '中国仙侠奇幻风格, 古代天宫殿堂, 飘逸丝绸汉服, 金红色调点缀, 神圣光晕, 水墨云雾背景, 空灵光效, 精致发饰, 柔美面部特征, 天界氛围, 中国传统神话美学',
  '日本少女漫画': '日本少女漫画风格, 大而闪亮的星光瞳孔, 精致美少女特征, 柔粉淡紫色调, 花卉网点背景, 浪漫氛围, 飘逸秀发配缎带, 装饰性闪光特效, 柔和腮红, 梦幻柔焦光效',
  '乙女游戏': '乙女游戏CG插画风格, 浪漫视觉小说美学, 优雅美少年角色, 柔和渐变上色, 温暖黄昏光照, 闪光花瓣粒子特效, 精致维多利亚风服装设计, 情感丰富的眼部表现, 华丽室内背景, 柔和色彩和谐',
  '日乙游戏': '日式乙女游戏风格, 高品质动漫CG渲染, 精致美少年角色, 樱花与季节性元素, 温柔暖色调, 精细校服或传统服饰设计, 柔和环境光, 视觉小说构图, 细腻手绘线条, 含蓄情感表达',
  '龙族国漫': '现代中国动画风格, 动感电影级构图, 都市奇幻场景, 融合中国元素的现代角色设计, 鲜艳饱和色彩, 戏剧性动作光效, 流畅发丝与服装渲染, 大胆对比阴影, 史诗级大气透视, 高能量视觉冲击'
};

/**
 * 获取项目的视觉风格提示词
 * @param {number} projectId
 * @returns {Promise<string>} 视觉风格提示词片段（可能为空字符串）
 */
async function getVisualStylePrompt(projectId) {
  if (!projectId) return '';
  try {
    const project = await queryOne('SELECT settings_json FROM projects WHERE id = ?', [projectId]);
    if (!project || !project.settings_json) return '';

    const settings = typeof project.settings_json === 'string'
      ? JSON.parse(project.settings_json)
      : project.settings_json;

    // 优先使用自定义提示词，其次用预设映射
    if (settings.visualStylePrompt) {
      return settings.visualStylePrompt;
    }
    if (settings.visualStyle && VISUAL_STYLE_PRESETS[settings.visualStyle]) {
      return VISUAL_STYLE_PRESETS[settings.visualStyle];
    }
    if (settings.visualStyle) {
      // 用户填了标签但不在预设中，直接作为提示词使用
      return settings.visualStyle;
    }
    return '';
  } catch (e) {
    console.warn('[getProjectStyle] 读取视觉风格失败:', e.message);
    return '';
  }
}

/**
 * 获取项目的叙事风格和约束
 * @param {number} projectId
 * @returns {Promise<{ storyStyle: string, storyConstraints: string }>}
 */
async function getStoryStyle(projectId) {
  if (!projectId) return { storyStyle: '', storyConstraints: '' };
  try {
    const project = await queryOne('SELECT settings_json FROM projects WHERE id = ?', [projectId]);
    if (!project || !project.settings_json) return { storyStyle: '', storyConstraints: '' };

    const settings = typeof project.settings_json === 'string'
      ? JSON.parse(project.settings_json)
      : project.settings_json;

    return {
      storyStyle: settings.storyStyle || '',
      storyConstraints: settings.storyConstraints || ''
    };
  } catch (e) {
    console.warn('[getProjectStyle] 读取叙事风格失败:', e.message);
    return { storyStyle: '', storyConstraints: '' };
  }
}

/**
 * 获取项目的完整风格配置
 * @param {number} projectId
 * @returns {Promise<{ visualStyle: string, visualStylePrompt: string, storyStyle: string, storyConstraints: string }>}
 */
async function getProjectStyle(projectId) {
  if (!projectId) return { visualStyle: '', visualStylePrompt: '', storyStyle: '', storyConstraints: '' };
  try {
    const project = await queryOne('SELECT settings_json FROM projects WHERE id = ?', [projectId]);
    if (!project || !project.settings_json) {
      return { visualStyle: '', visualStylePrompt: '', storyStyle: '', storyConstraints: '' };
    }

    const settings = typeof project.settings_json === 'string'
      ? JSON.parse(project.settings_json)
      : project.settings_json;

    let visualStylePrompt = settings.visualStylePrompt || '';
    if (!visualStylePrompt && settings.visualStyle) {
      visualStylePrompt = VISUAL_STYLE_PRESETS[settings.visualStyle] || settings.visualStyle;
    }

    return {
      visualStyle: settings.visualStyle || '',
      visualStylePrompt,
      storyStyle: settings.storyStyle || '',
      storyConstraints: settings.storyConstraints || ''
    };
  } catch (e) {
    console.warn('[getProjectStyle] 读取项目风格失败:', e.message);
    return { visualStyle: '', visualStylePrompt: '', storyStyle: '', storyConstraints: '' };
  }
}

/**
 * 【严格模式】获取项目视觉风格，未设置则抛出错误
 * @param {number} projectId
 * @returns {Promise<string>} 视觉风格提示词
 * @throws {Error} 项目未设置视觉风格时抛出
 */
async function requireVisualStyle(projectId) {
  if (!projectId) {
    throw new Error('缺少 projectId，无法获取项目视觉风格。请确保在项目中操作。');
  }
  const prompt = await getVisualStylePrompt(projectId);
  if (!prompt) {
    throw new Error('该项目尚未设置视觉风格。请先在「工程设置」中选择视觉风格（如日系动漫、写实电影等），再执行生成任务。');
  }
  return prompt;
}

/**
 * 【严格模式】获取项目叙事风格，未设置则抛出错误
 * @param {number} projectId
 * @returns {Promise<{ storyStyle: string, storyConstraints: string }>}
 * @throws {Error} 项目未设置叙事风格时抛出
 */
async function requireStoryStyle(projectId) {
  if (!projectId) {
    throw new Error('缺少 projectId，无法获取项目叙事风格。请确保在项目中操作。');
  }
  const result = await getStoryStyle(projectId);
  if (!result.storyStyle) {
    throw new Error('该项目尚未设置叙事风格。请先在「工程设置」中填写叙事风格（如热血少年漫、悬疑推理等），再生成剧本。');
  }
  return result;
}

/**
 * 输出语言预设映射：语言代码 → { name, promptInstruction }
 * promptInstruction 用于注入 AI 提示词，指示输出语言
 */
const OUTPUT_LANGUAGE_PRESETS = {
  'en': { name: 'English', promptInstruction: 'Output ONLY in English. No Chinese characters, no pinyin, no mixed-language content.' },
  'zh': { name: '中文', promptInstruction: 'Output ONLY in Chinese (中文). All descriptions, actions, scenes must be written in Chinese. No English words except proper nouns.' },
  'ja': { name: '日本語', promptInstruction: 'Output ONLY in Japanese (日本語). All descriptions must be in Japanese. No Chinese or English mixing.' },
  'ko': { name: '한국어', promptInstruction: 'Output ONLY in Korean (한국어). All descriptions must be in Korean. No other languages.' },
  'fr': { name: 'Français', promptInstruction: 'Output ONLY in French (Français). All descriptions must be in French.' },
  'es': { name: 'Español', promptInstruction: 'Output ONLY in Spanish (Español). All descriptions must be in Spanish.' },
  'de': { name: 'Deutsch', promptInstruction: 'Output ONLY in German (Deutsch). All descriptions must be in German.' },
};

/**
 * 获取项目的输出语言设置
 * @param {number} projectId
 * @returns {Promise<{ languageCode: string, languageName: string, promptInstruction: string }>}
 */
async function getOutputLanguage(projectId) {
  const defaultLang = { languageCode: 'en', languageName: 'English', promptInstruction: OUTPUT_LANGUAGE_PRESETS['en'].promptInstruction };
  if (!projectId) return defaultLang;
  try {
    const project = await queryOne('SELECT settings_json FROM projects WHERE id = ?', [projectId]);
    if (!project || !project.settings_json) return defaultLang;

    const settings = typeof project.settings_json === 'string'
      ? JSON.parse(project.settings_json)
      : project.settings_json;

    const langCode = settings.outputLanguage || 'en';
    const preset = OUTPUT_LANGUAGE_PRESETS[langCode];
    if (preset) {
      return { languageCode: langCode, languageName: preset.name, promptInstruction: preset.promptInstruction };
    }
    return defaultLang;
  } catch (e) {
    console.warn('[getProjectStyle] 读取输出语言失败:', e.message);
    return defaultLang;
  }
}

module.exports = {
  getVisualStylePrompt,
  getStoryStyle,
  getProjectStyle,
  requireVisualStyle,
  requireStoryStyle,
  getOutputLanguage,
  VISUAL_STYLE_PRESETS,
  OUTPUT_LANGUAGE_PRESETS
};
