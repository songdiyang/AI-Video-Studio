/**
 * 项目风格工具函数
 * 从 projects.settings_json 中读取视觉风格和叙事风格
 * 
 * settings_json 结构：
 * {
 *   "visualStyle": "日系动漫",              // 人类可读标签
 *   "visualStylePrompt": "anime style...",  // 英文提示词片段，注入所有图片/视频生成
 *   "storyStyle": "热血少年漫",             // 叙事风格（用于剧本生成）
 *   "storyConstraints": "不要魔法元素"      // 剧本约束
 * }
 */

const { queryOne } = require('../dbHelper');

// 预设视觉风格映射
const VISUAL_STYLE_PRESETS = {
  '日系动漫': 'anime style, cel shading, vibrant colors, clean lines, manga aesthetic, Japanese animation',
  '写实电影': 'photorealistic, cinematic lighting, film grain, realistic proportions, movie still, natural colors',
  '3D渲染': '3D render, Pixar style, soft lighting, subsurface scattering, smooth shading, CGI quality',
  '水彩绘本': 'watercolor illustration, soft edges, pastel colors, storybook style, hand-painted texture',
  '赛博朋克': 'cyberpunk, neon lights, dark atmosphere, futuristic, high contrast, sci-fi aesthetic',
  '美漫风格': 'American comic style, bold outlines, dynamic shading, superhero aesthetic, vivid colors',
  '像素风': 'pixel art style, retro game aesthetic, 16-bit, clean pixels, nostalgic',
  '国风水墨': 'Chinese ink painting style, traditional brush strokes, elegant, minimalist, oriental aesthetic',
  '天宫赐福': 'Chinese xianxia fantasy style, ancient celestial palace, flowing silk hanfu robes, golden and crimson accents, divine aura glow, ink-wash cloud backgrounds, ethereal lighting, ornate hair accessories, delicate facial features, heavenly atmosphere, traditional Chinese mythology aesthetic',
  '日本少女漫画': 'Japanese shoujo manga style, large sparkling eyes with star highlights, delicate bishoujo features, soft pastel pink and lavender palette, floral screen tone backgrounds, romantic atmosphere, flowing hair with ribbon accessories, decorative sparkle effects, gentle blush cheeks, dreamy soft-focus lighting',
  '乙女游戏': 'otome game CG illustration style, romantic visual novel aesthetic, elegant bishounen characters, soft gradient shading, warm golden hour lighting, sparkle and petal particle effects, detailed Victorian-inspired costume design, emotional expressive eyes, luxurious interior backgrounds, gentle color harmony',
  '日乙游戏': 'Japanese otome game style, high-quality anime CG rendering, bishounen characters with refined features, cherry blossom and seasonal motifs, gentle warm color palette, detailed school uniform or traditional costume design, soft ambient lighting, visual novel composition, delicate hand-drawn line art, subtle emotional expressions',
  '龙族国漫': 'modern Chinese donghua animation style, dynamic cinematic composition, urban fantasy setting, detailed contemporary character design with Chinese elements, vibrant saturated colors, dramatic action lighting, sleek hair and costume rendering, bold contrast shadows, epic atmospheric perspective, high-energy visual impact'
};

/**
 * 获取项目的视觉风格提示词
 * @param {number} projectId
 * @returns {Promise<string>} 英文视觉风格提示词片段（可能为空字符串）
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
 * @returns {Promise<string>} 英文视觉风格提示词
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

module.exports = {
  getVisualStylePrompt,
  getStoryStyle,
  getProjectStyle,
  requireVisualStyle,
  requireStoryStyle,
  VISUAL_STYLE_PRESETS
};
