/**
 * 分镜生成预检接口
 * 
 * GET /api/storyboards/:storyboardId/validate?type=frame|video
 * 
 * type=frame: 检查生成首尾帧的前置条件（角色图 + 场景图完整性）
 * type=video: 检查生成视频的前置条件（首尾帧 + 提示词完整性）
 */

const { queryOne, queryAll } = require('../../dbHelper');
const { isNonCharacterEntity, MIN_CHARACTER_APPEARANCE } = require('../../utils/characterFilter');

/**
 * 模糊匹配角色名
 * 处理 JSON 解析可能导致的角色名差异（如多余空格、标点、后缀等）
 * @param {string} queryName - 分镜中的角色名
 * @param {Object[]} linkedChars - 关联的角色列表
 * @returns {Object|null} 匹配到的角色记录
 */
function fuzzyMatchCharacter(queryName, linkedChars) {
  if (!queryName || !linkedChars || linkedChars.length === 0) return null;
  const q = queryName.trim();
  // 1. 精确匹配
  const exact = linkedChars.find(c => c.name === q);
  if (exact) return exact;
  // 2. 忽略空格/标点匹配
  const normalize = (s) => s.replace(/[\s\u3000·・\-_—–，,。.、！!？?""''「」『』【】（）()《》〈〉]/g, '');
  const qNorm = normalize(q);
  const normMatch = linkedChars.find(c => normalize(c.name) === qNorm);
  if (normMatch) return normMatch;
  // 3. 包含匹配（角色名包含查询名 或 查询名包含角色名）
  const containsMatch = linkedChars.find(c => {
    const cNorm = normalize(c.name);
    return (cNorm.length >= 2 && qNorm.includes(cNorm)) || (qNorm.length >= 2 && cNorm.includes(qNorm));
  });
  if (containsMatch) return containsMatch;
  return null;
}

module.exports = async (req, res) => {
  try {
    const { storyboardId } = req.params;
    const { type } = req.query; // 'frame' | 'video'

    if (!type || !['frame', 'video'].includes(type)) {
      return res.status(400).json({ error: 'type 参数必须为 frame 或 video' });
    }

    // 获取分镜数据
    const storyboard = await queryOne(
      'SELECT * FROM storyboards WHERE id = ?',
      [storyboardId]
    );

    if (!storyboard) {
      return res.status(404).json({ error: '分镜不存在' });
    }

    // 解析 variables
    let variables = {};
    try {
      variables = typeof storyboard.variables_json === 'string'
        ? JSON.parse(storyboard.variables_json)
        : (storyboard.variables_json || {});
    } catch (e) {
      variables = {};
    }

    if (type === 'frame') {
      return await validateForFrame(res, storyboard, variables);
    } else {
      return await validateForVideo(res, storyboard, variables);
    }
  } catch (error) {
    console.error('[Validate] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * 校验生成首尾帧的前置条件
 * - 该镜头涉及的角色是否都有图片
 * - 该镜头的场景是否有图片
 */
async function validateForFrame(res, storyboard, variables) {
  const issues = [];
  const storyboardId = storyboard.id;
  const characterNames = variables.characters || [];
  const location = variables.location || '';

  // 1. 通过关联表检查角色
  if (characterNames.length > 0) {
    const linkedChars = await queryAll(
      `SELECT c.name, c.description, c.appearance, c.personality, c.image_url
       FROM storyboard_characters sc
       JOIN characters c ON sc.character_id = c.id
       WHERE sc.storyboard_id = ?`,
      [storyboardId]
    );
    const linkedCharMap = {};
    linkedChars.forEach(c => { linkedCharMap[c.name] = c; });

    // 统计同一剧本中每个角色出现的分镜数，低于阈值的视为临时角色跳过
    const charAppearanceMap = {};
    const allStoryboards = await queryAll(
      `SELECT variables_json FROM storyboards WHERE script_id = ?`,
      [storyboard.script_id]
    );
    for (const sb of allStoryboards) {
      let vars = {};
      try { vars = typeof sb.variables_json === 'string' ? JSON.parse(sb.variables_json) : (sb.variables_json || {}); } catch { vars = {}; }
      const chars = vars.characters || [];
      for (const c of chars) {
        charAppearanceMap[c] = (charAppearanceMap[c] || 0) + 1;
      }
    }

    for (const name of characterNames) {
      // 跳过非角色群体词（如"人群"、"路人"、"其他少年少女"等泛称，不需要建立角色关联）
      if (isNonCharacterEntity(name)) {
        continue;
      }
      // 跳过出场次数不足的临时角色（防止角色画面崩坏）
      if ((charAppearanceMap[name] || 0) < MIN_CHARACTER_APPEARANCE) {
        continue;
      }
      // 使用模糊匹配查找角色（容忍名称差异）
      const char = fuzzyMatchCharacter(name, linkedChars);
      if (!char) {
        issues.push({
          type: 'character_not_linked',
          message: `角色「${name}」未与该分镜建立关联，请先运行智能分镜生成`,
          details: [name]
        });
      } else {
        if (!char.image_url) {
          issues.push({ type: 'character_no_image', message: `角色「${name}」缺少图片`, details: [name] });
        }
        if (!char.description || !char.description.trim()) {
          issues.push({ type: 'character_field_missing', message: `角色「${name}」缺少描述`, details: [name] });
        }
        if (!char.appearance || !char.appearance.trim()) {
          issues.push({ type: 'character_field_missing', message: `角色「${name}」缺少外貌`, details: [name] });
        }
      }
    }
  }

  // 2. 通过关联表检查场景
  if (location) {
    const linkedScenes = await queryAll(
      `SELECT s.name, s.description, s.environment, s.lighting, s.mood, s.image_url
       FROM storyboard_scenes ss
       JOIN scenes s ON ss.scene_id = s.id
       WHERE ss.storyboard_id = ?`,
      [storyboardId]
    );
    const linkedScene = linkedScenes.find(s => s.name === location);

    if (!linkedScene) {
      issues.push({
        type: 'scene_not_linked',
        message: `场景「${location}」未与该分镜建立关联，请先运行智能分镜生成`,
        details: [location]
      });
    } else {
      if (!linkedScene.image_url) {
        issues.push({ type: 'scene_no_image', message: `场景「${location}」缺少图片`, details: [location] });
      }
      if (!linkedScene.description || !linkedScene.description.trim()) {
        issues.push({ type: 'scene_field_missing', message: `场景「${location}」缺少描述`, details: [location] });
      }
      if (!linkedScene.environment || !linkedScene.environment.trim()) {
        issues.push({ type: 'scene_field_missing', message: `场景「${location}」缺少环境描述`, details: [location] });
      }
    }
  }

  // 3. 检查提示词
  if (!storyboard.prompt_template || storyboard.prompt_template.trim() === '') {
    issues.push({
      type: 'no_prompt',
      message: '分镜缺少描述/提示词'
    });
  }

  return res.json({
    ready: issues.length === 0,
    issues
  });
}

/**
 * 校验生成视频的前置条件
 * - 首帧是否存在
 * - 如果是动作镜头，尾帧是否存在
 * - 提示词是否完整
 */
async function validateForVideo(res, storyboard, variables) {
  const issues = [];

  // 1. 检查首帧
  if (!storyboard.first_frame_url) {
    issues.push({
      type: 'no_start_frame',
      message: '缺少首帧图片，请先生成首尾帧'
    });
  }

  // 2. 如果是动作镜头，检查尾帧
  const hasAction = variables.hasAction || false;
  if (hasAction && !storyboard.last_frame_url) {
    issues.push({
      type: 'no_end_frame',
      message: '动作镜头缺少尾帧图片，请先生成首尾帧'
    });
  }

  // 3. 检查提示词
  if (!storyboard.prompt_template || storyboard.prompt_template.trim() === '') {
    issues.push({
      type: 'no_prompt',
      message: '分镜缺少描述/提示词'
    });
  }

  return res.json({
    ready: issues.length === 0,
    issues
  });
}
