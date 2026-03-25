/**
 * 批量分镜生成预检接口
 * 
 * POST /api/storyboards/batch-validate
 * 
 * Body: { sceneIds: number[], scriptId: number, type: 'frame' | 'video' }
 * 
 * Returns: { results: Array<{ sceneId: number, ready: boolean, blockingIssues: string[], warningIssues: string[] }> }
 * 
 * 优化：一次性查询所有相关数据，避免N次请求
 */

const { queryOne, queryAll } = require('../../dbHelper');
const { isNonCharacterEntity } = require('../../utils/characterFilter');

module.exports = async (req, res) => {
  try {
    const { sceneIds, scriptId, type } = req.body;
    const userId = req.user.id;

    // 参数校验
    if (!Array.isArray(sceneIds) || sceneIds.length === 0) {
      return res.status(400).json({ error: 'sceneIds 参数必须为非空数组' });
    }

    if (!scriptId) {
      return res.status(400).json({ error: 'scriptId 参数必填' });
    }

    if (!type || !['frame', 'video'].includes(type)) {
      return res.status(400).json({ error: 'type 参数必须为 frame 或 video' });
    }

    // Verify script ownership
    const script = await queryOne(
      'SELECT id FROM scripts WHERE id = ? AND user_id = ?',
      [scriptId, userId]
    );
    if (!script) {
      return res.status(404).json({ error: '剧本不存在或无权访问' });
    }

    // 1. 批量获取所有分镜数据
    const placeholders = sceneIds.map(() => '?').join(',');
    const storyboards = await queryAll(
      `SELECT * FROM storyboards WHERE id IN (${placeholders}) AND script_id = ?`,
      [...sceneIds, scriptId]
    );

    // 建立 id -> storyboard 映射
    const storyboardMap = {};
    storyboards.forEach(sb => { storyboardMap[sb.id] = sb; });

    // 2. 批量获取所有关联的角色数据
    const linkedChars = await queryAll(
      `SELECT sc.storyboard_id, c.name, c.description, c.appearance, c.personality, c.image_url
       FROM storyboard_characters sc
       JOIN characters c ON sc.character_id = c.id
       WHERE sc.storyboard_id IN (${placeholders})`,
      sceneIds
    );

    // 建立 storyboard_id -> [characters] 映射
    const charsByStoryboard = {};
    linkedChars.forEach(c => {
      if (!charsByStoryboard[c.storyboard_id]) {
        charsByStoryboard[c.storyboard_id] = [];
      }
      charsByStoryboard[c.storyboard_id].push(c);
    });

    // 3. 批量获取所有关联的场景数据
    const linkedScenes = await queryAll(
      `SELECT ss.storyboard_id, s.name, s.description, s.environment, s.lighting, s.mood, s.image_url
       FROM storyboard_scenes ss
       JOIN scenes s ON ss.scene_id = s.id
       WHERE ss.storyboard_id IN (${placeholders})`,
      sceneIds
    );

    // 建立 storyboard_id -> [scenes] 映射
    const scenesByStoryboard = {};
    linkedScenes.forEach(s => {
      if (!scenesByStoryboard[s.storyboard_id]) {
        scenesByStoryboard[s.storyboard_id] = [];
      }
      scenesByStoryboard[s.storyboard_id].push(s);
    });

    // 4. 对每个分镜进行校验
    const results = sceneIds.map(sceneId => {
      const storyboard = storyboardMap[sceneId];
      
      if (!storyboard) {
        return {
          sceneId,
          ready: false,
          blockingIssues: [`分镜 ${sceneId} 不存在`],
          warningIssues: []
        };
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

      const chars = charsByStoryboard[sceneId] || [];
      const scenes = scenesByStoryboard[sceneId] || [];

      if (type === 'frame') {
        return validateForFrame(sceneId, storyboard, variables, chars, scenes);
      } else {
        return validateForVideo(sceneId, storyboard, variables);
      }
    });

    return res.json({ results });
  } catch (error) {
    console.error('[BatchValidate] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * 校验生成首尾帧的前置条件
 */
function validateForFrame(sceneId, storyboard, variables, linkedChars, linkedScenes) {
  const blockingIssues = [];
  const warningIssues = [];
  
  const characterNames = variables.characters || [];
  const location = variables.location || '';

  // 建立角色名 -> 角色 映射
  const linkedCharMap = {};
  linkedChars.forEach(c => { linkedCharMap[c.name] = c; });

  // 1. 检查角色
  for (const name of characterNames) {
    // 跳过非角色群体词（如"人群"、"路人"等泛称，不需要建立角色关联）
    if (isNonCharacterEntity(name)) {
      continue;
    }
    const char = linkedCharMap[name];
    if (!char) {
      blockingIssues.push(`角色「${name}」未与该分镜建立关联，请先运行智能分镜生成`);
    } else {
      if (!char.image_url) {
        blockingIssues.push(`角色「${name}」缺少图片`);
      }
      if (!char.description || !char.description.trim()) {
        blockingIssues.push(`角色「${name}」缺少描述`);
      }
      if (!char.appearance || !char.appearance.trim()) {
        blockingIssues.push(`角色「${name}」缺少外貌`);
      }
    }
  }

  // 2. 检查场景
  if (location) {
    const linkedScene = linkedScenes.find(s => s.name === location);
    
    if (!linkedScene) {
      blockingIssues.push(`场景「${location}」未与该分镜建立关联，请先运行智能分镜生成`);
    } else {
      if (!linkedScene.image_url) {
        blockingIssues.push(`场景「${location}」缺少图片`);
      }
      if (!linkedScene.description || !linkedScene.description.trim()) {
        blockingIssues.push(`场景「${location}」缺少描述`);
      }
      if (!linkedScene.environment || !linkedScene.environment.trim()) {
        blockingIssues.push(`场景「${location}」缺少环境描述`);
      }
    }
  }

  // 3. 检查提示词
  if (!storyboard.prompt_template || storyboard.prompt_template.trim() === '') {
    blockingIssues.push('分镜缺少描述/提示词');
  }

  return {
    sceneId,
    ready: blockingIssues.length === 0,
    blockingIssues,
    warningIssues
  };
}

/**
 * 校验生成视频的前置条件
 */
function validateForVideo(sceneId, storyboard, variables) {
  const blockingIssues = [];
  const warningIssues = [];

  // 1. 检查首帧
  if (!storyboard.first_frame_url) {
    blockingIssues.push('缺少首帧图片，请先生成首尾帧');
  }

  // 2. 如果是动作镜头，检查尾帧
  const hasAction = variables.hasAction || false;
  if (hasAction && !storyboard.last_frame_url) {
    blockingIssues.push('动作镜头缺少尾帧图片，请先生成首尾帧');
  }

  // 3. 检查提示词
  if (!storyboard.prompt_template || storyboard.prompt_template.trim() === '') {
    blockingIssues.push('分镜缺少描述/提示词');
  }

  return {
    sceneId,
    ready: blockingIssues.length === 0,
    blockingIssues,
    warningIssues
  };
}
