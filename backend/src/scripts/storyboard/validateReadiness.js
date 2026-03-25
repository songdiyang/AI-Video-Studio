/**
 * 分镜生成预检接口
 * 
 * GET /api/storyboards/:storyboardId/validate?type=frame|video
 * 
 * type=frame: 检查生成首尾帧的前置条件（角色图 + 场景图完整性）
 * type=video: 检查生成视频的前置条件（首尾帧 + 提示词完整性）
 */

const { queryOne, queryAll } = require('../../dbHelper');
const { isNonCharacterEntity } = require('../../utils/characterFilter');

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

    for (const name of characterNames) {
      // 跳过非角色群体词（如"人群"、"路人"等泛称，不需要建立角色关联）
      if (isNonCharacterEntity(name)) {
        continue;
      }
      const char = linkedCharMap[name];
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
