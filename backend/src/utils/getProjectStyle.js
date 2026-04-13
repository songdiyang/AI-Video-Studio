/**
 * 项目风格工具函数
 * 从 projects.settings_json 中读取视觉风格和叙事风格
 * 
 * settings_json 结构：
 * {
 *   "visualStyle": "日系动漫",              // 人类可读标签
 *   "visualStylePrompt": "动漫风格...",     // 中文提示词片段，注入所有图片/视频生成
 *   "storyStyle": "热血少年漫",             // 叙事风格（用于剧本生成）
 *   "storyConstraints": "不要魔法元素",      // 剧本约束
 *   "narrativePerspective": "third_person"  // 拍摄视角（first_person | third_person）
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
  '日本少女漫画': '日本少女漫画风格, 大而闪亮的星光瞳孔, 精致美少女特征, 柔粉淡紫色调, 花卉网点背景, 浪漫氛围, 飘逸秀发配缎带, 装饰性闪光特效, 柔和腹红, 梦幻柔焦光效',
  // 真人类预设
  '时尚摄影': '高端时尚大片, 精致灯光, 杂志封面品质, 人像摄影, 柔和散射光, 色彩协调',
  '纪实风格': '纪实摄影, 自然光线, 真实场景, 新闻纪录片美学, 抓拍感, 真实光影',
  '电影感剧情': '电影色调, 宽银幕构图, 戏剧性光影, 胶片颗粒感, 质感电影画面, cinematic lighting'
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

/**
 * 拍摄视角预设映射：视角代码 → { name, promptInstruction }
 * promptInstruction 用于注入 AI 提示词，指导叙事视角
 */
const NARRATIVE_PERSPECTIVE_PRESETS = {
  'first_person': {
    name: '第一人称',
    promptInstruction: `【叙事视角：第一人称】
- 以主角的主观视角叙事，使用“我”作为叙述者
- 画面描述应从主角的视线出发，展现主角所看到的世界
- 对白中主角使用第一人称（“我”）
- 内心独白和情感反应可以直接表达
- 镜头偏好：多用主观视角(POV)、过肩镜头，少用主角正面全身镜头`
  },
  'third_person': {
    name: '第三人称',
    promptInstruction: `【叙事视角：第三人称】
- 使用客观的上帝视角叙事，可以自由切换不同角色的视点
- 画面描述从观察者角度出发，可以展现多角色和全景
- 对白中角色使用第三人称称谓
- 镜头运用自由，包括远景、全景、多角度切换等`
  }
};

/**
 * 获取项目的拍摄视角设置
 * @param {number} projectId
 * @returns {Promise<{ perspectiveCode: string, perspectiveName: string, promptInstruction: string }>}
 */
async function getNarrativePerspective(projectId) {
  const defaultPerspective = { perspectiveCode: '', perspectiveName: '', promptInstruction: '' };
  if (!projectId) return defaultPerspective;
  try {
    const project = await queryOne('SELECT settings_json FROM projects WHERE id = ?', [projectId]);
    if (!project || !project.settings_json) return defaultPerspective;

    const settings = typeof project.settings_json === 'string'
      ? JSON.parse(project.settings_json)
      : project.settings_json;

    const code = settings.narrativePerspective || '';
    const preset = NARRATIVE_PERSPECTIVE_PRESETS[code];
    if (preset) {
      return { perspectiveCode: code, perspectiveName: preset.name, promptInstruction: preset.promptInstruction };
    }
    return defaultPerspective;
  } catch (e) {
    console.warn('[getProjectStyle] 读取拍摄视角失败:', e.message);
    return defaultPerspective;
  }
}

/**
 * 头身比例预设映射
 */
const BODY_PROPORTION_PRESETS = {
  'h2_5': {
    name: '超Q',
    ratio: '2.5',
    promptInstruction: `【角色体型比例：超Q版 2.5头身】
- 角色身高为头部长度的2.5倍，极致Q版变形
- 头部巨大，占全身40%以上，眉眼占脸部大区域
- 身体极度简化，四肢非常短小圆润，手脚极度简化
- 整体像“大头娃娃”，最萌最可爱的表现形式`
  },
  'h3': {
    name: '萌系',
    ratio: '3',
    promptInstruction: `【角色体型比例：萌系 3头身】
- 角色身高为头部长度的3倍，Q版萌系体型
- 头部仍然很大，占全身约1/3，圆润可爱
- 身体小巧简化，四肢短小圆润但比超Q稍长
- 保持角色的萌趣感，适合表情丰富的角色`
  },
  'h4': {
    name: '少年/少女感',
    ratio: '4',
    promptInstruction: `【角色体型比例：少年/少女 4头身】
- 角色身高为头部长度的4倍，年少感角色体型
- 头部偏大，占全身1/4，大眼睛特征明显
- 身体纤细但有一定比例，四肢细长
- 体现年少的轻盈感，不能画成成人写实比例`
  },
  'h6': {
    name: '可爱',
    ratio: '6',
    promptInstruction: `【角色体型比例：可爱 6头身】
- 角色身高为头部长度的6倍，可爱型动漫比例
- 头部略大，脸部圆润，眼睛大而有神
- 身体小巧可爱，四肢均称纤细
- 整体比例介于萌系和日常之间，温柔可人`
  },
  'h6_5': {
    name: '日常',
    ratio: '6.5',
    promptInstruction: `【角色体型比例：日常 6.5头身】
- 角色身高为头部长度的6.5倍，日常动漫标准比例
- 头身比例自然协调，脸部精致
- 身体均称，四肢比例自然流畅
- 适合大多数日常生活场景的角色`
  },
  'h7': {
    name: '略修长',
    ratio: '7',
    promptInstruction: `【角色体型比例：略修长 7头身】
- 角色身高为头部长度的7倍，略修长的动漫比例
- 头身比例趋近理想化，身材纲细修长
- 四肢修长包括腰线、腿长等细节
- 展现角色的精致感和立体感`
  },
  'h7_5': {
    name: '修长',
    ratio: '7.5',
    promptInstruction: `【角色体型比例：修长 7.5头身】
- 角色身高为头部长度的7.5倍，修长体型
- 身材纰细修长，体现优雅的角色气质
- 四肢修长包括肩宽、腰线、腿长等符合理想化比例
- 面部精致，五官立体，整体显得高挑`
  },
  'h8': {
    name: '超模比例',
    ratio: '8',
    promptInstruction: `【角色体型比例：超模 8头身】
- 角色身高为头部长度的8倍，超模级理想体型
- 极致修长的身材，小头长腿，身体纰细而有力量感
- 肩宽、腰线、腿长比例极致理想化
- 面部棱角分明，五官精致，展现极强的形体美感`
  }
};

/**
 * 获取项目的头身比例设置
 * @param {number} projectId
 * @returns {Promise<{ code: string, name: string, ratio: string, promptInstruction: string }>}
 */
async function getBodyProportion(projectId) {
  const defaultResult = { code: '', name: '', ratio: '', promptInstruction: '' };
  if (!projectId) return defaultResult;
  try {
    const project = await queryOne('SELECT settings_json FROM projects WHERE id = ?', [projectId]);
    if (!project || !project.settings_json) return defaultResult;

    const settings = typeof project.settings_json === 'string'
      ? JSON.parse(project.settings_json)
      : project.settings_json;

    const code = settings.bodyProportionRatio || '';
    const preset = BODY_PROPORTION_PRESETS[code];
    if (preset) {
      return { code, name: preset.name, ratio: preset.ratio, promptInstruction: preset.promptInstruction };
    }
    return defaultResult;
  } catch (e) {
    console.warn('[getProjectStyle] 读取头身比例失败:', e.message);
    return defaultResult;
  }
}

module.exports = {
  getVisualStylePrompt,
  getStoryStyle,
  getProjectStyle,
  requireVisualStyle,
  requireStoryStyle,
  getOutputLanguage,
  getNarrativePerspective,
  getBodyProportion,
  VISUAL_STYLE_PRESETS,
  OUTPUT_LANGUAGE_PRESETS,
  NARRATIVE_PERSPECTIVE_PRESETS,
  BODY_PROPORTION_PRESETS
};
