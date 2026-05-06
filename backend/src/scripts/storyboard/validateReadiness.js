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

  // 2. 通过关联表检查影棚
  if (location) {
    const linkedStudio = await queryOne(
      `SELECT st.name, st.description, st.nine_grid_image_url,
              e.image_url AS env_front_url, e.image_back_url AS env_back_url, e.description AS env_description
       FROM storyboard_scenes ssc
       JOIN studios st ON ssc.studio_id = st.id
       LEFT JOIN environments e ON st.environment_id = e.id
       WHERE ssc.storyboard_id = ? AND st.name = ?`,
      [storyboardId, location]
    );

    if (!linkedStudio) {
      issues.push({
        type: 'scene_not_linked',
        message: `影棚「${location}」未与该分镜建立关联，请先运行智能分镜生成`,
        details: [location]
      });
    } else {
      const hasImage = !!linkedStudio.nine_grid_image_url;
      if (!hasImage) {
        issues.push({ type: 'scene_no_image', message: `影棚「${location}」缺少九宫组装图，请先到影棚中生成`, details: [location] });
      }
      if ((!linkedStudio.description || !linkedStudio.description.trim()) && (!linkedStudio.env_description || !linkedStudio.env_description.trim())) {
        issues.push({ type: 'scene_field_missing', message: `影棚「${location}」缺少描述`, details: [location] });
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
 * - 至少需要一张帧图片（首帧或尾帧均可）
 * - 提示词是否完整
 */
async function validateForVideo(res, storyboard, variables) {
  const issues = [];

  const hasFirstFrame = !!storyboard.first_frame_url;
  const hasLastFrame = !!storyboard.last_frame_url;
  const hasAnyFrame = hasFirstFrame || hasLastFrame;

  // 1. 至少需要一张帧图片
  if (!hasAnyFrame) {
    issues.push({
      type: 'no_frame',
      message: '缺少帧图片，请先生成至少一张首帧或尾帧'
    });
  }

  // 2. 检查提示词
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
