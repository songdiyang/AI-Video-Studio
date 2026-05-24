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
const { isNonCharacterEntity, MIN_CHARACTER_APPEARANCE } = require('../../utils/characterFilter');
const { getOrCreateImplicitScript } = require('./implicitScriptHelper');

module.exports = async (req, res) => {
  try {
    const { sceneIds, scriptId, projectId, type } = req.body;
    const userId = req.user.id;

    // 参数校验
    if (!Array.isArray(sceneIds) || sceneIds.length === 0) {
      return res.status(400).json({ error: 'sceneIds 参数必须为非空数组' });
    }

    if (!scriptId && !projectId) {
      return res.status(400).json({ error: 'scriptId 或 projectId 参数必填' });
    }

    if (!type || !['frame', 'video'].includes(type)) {
      return res.status(400).json({ error: 'type 参数必须为 frame 或 video' });
    }

    let effectiveScriptId = scriptId;

    // Verify ownership
    if (scriptId) {
      const script = await queryOne(
        'SELECT id FROM scripts WHERE id = ? AND user_id = ?',
        [scriptId, userId]
      );
      if (!script) {
        return res.status(404).json({ error: '剧本不存在或无权访问' });
      }
    } else {
      const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');
      const role = await getEffectiveProjectRole(userId, projectId);
      if (!role) {
        return res.status(403).json({ error: '无权访问该项目' });
      }
      // 自由分镜模式：获取/创建隐式剧本
      const ep = Number.isFinite(Number(req.body.episodeNumber)) && Number(req.body.episodeNumber) >= 1
        ? Number(req.body.episodeNumber)
        : 1;
      effectiveScriptId = await getOrCreateImplicitScript(projectId, ep, userId);
    }

    // 1. 批量获取所有分镜数据
    const placeholders = sceneIds.map(() => '?').join(',');
    const storyboards = await queryAll(
      `SELECT * FROM storyboards WHERE id IN (${placeholders}) AND script_id = ?`,
      [...sceneIds, effectiveScriptId]
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

    // 3. 批量获取所有关联的影棚数据（替代旧的 scenes 查询）
    const linkedStudios = await queryAll(
      `SELECT ssc.storyboard_id, st.name, st.description, st.nine_grid_image_url,
              e.image_url AS env_front_url, e.image_back_url AS env_back_url, e.description AS env_description
       FROM storyboard_scenes ssc
       JOIN studios st ON ssc.studio_id = st.id
       LEFT JOIN environments e ON st.environment_id = e.id
       WHERE ssc.storyboard_id IN (${placeholders})`,
      sceneIds
    );

    // 建立 storyboard_id -> [studios] 映射
    const studiosByStoryboard = {};
    linkedStudios.forEach(s => {
      if (!studiosByStoryboard[s.storyboard_id]) {
        studiosByStoryboard[s.storyboard_id] = [];
      }
      studiosByStoryboard[s.storyboard_id].push(s);
    });

    // 4. 统计同一剧本中每个角色在所有分镜中的出现次数
    const charAppearanceMap = {};
    const allScriptStoryboards = await queryAll(
      `SELECT variables_json FROM storyboards WHERE script_id = ?`,
      [effectiveScriptId]
    );
    for (const sb of allScriptStoryboards) {
      let vars = {};
      try { vars = typeof sb.variables_json === 'string' ? JSON.parse(sb.variables_json) : (sb.variables_json || {}); } catch { vars = {}; }
      const chars = vars.characters || [];
      for (const c of chars) {
        charAppearanceMap[c] = (charAppearanceMap[c] || 0) + 1;
      }
    }

    // 5. 对每个分镜进行校验
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
      const studios = studiosByStoryboard[sceneId] || [];

      if (type === 'frame') {
        return validateForFrame(sceneId, storyboard, variables, chars, studios, charAppearanceMap);
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
function validateForFrame(sceneId, storyboard, variables, linkedChars, linkedStudios, charAppearanceMap) {
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
    // 跳过出场次数不足的临时角色（防止角色画面崩坏）
    if (charAppearanceMap && (charAppearanceMap[name] || 0) < MIN_CHARACTER_APPEARANCE) {
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

  // 2. 检查影棚
  if (location) {
    const linkedStudio = linkedStudios.find(s => s.name === location);
    
    if (!linkedStudio) {
      blockingIssues.push(`影棚「${location}」未与该分镜建立关联，请先运行智能分镜生成`);
    } else {
      const hasImage = !!linkedStudio.nine_grid_image_url;
      if (!hasImage) {
        blockingIssues.push(`影棚「${location}」缺少九宫组装图，请先到影棚中生成`);
      }
      if ((!linkedStudio.description || !linkedStudio.description.trim()) && (!linkedStudio.env_description || !linkedStudio.env_description.trim())) {
        blockingIssues.push(`影棚「${location}」缺少描述`);
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

  const hasAction = variables.hasAction || false;
  const hasFirstFrame = !!storyboard.first_frame_url;
  const hasLastFrame = !!storyboard.last_frame_url;
  const hasAnyFrame = hasFirstFrame || hasLastFrame;

  // 1. 至少需要一张帧图片（动作镜头允许纯提示词）
  if (hasAction) {
    if (!hasFirstFrame && !hasLastFrame) {
      warningIssues.push('动作镜头缺少帧图片，将使用纯提示词生成视频');
    } else {
      if (!hasFirstFrame) {
        warningIssues.push('缺少首帧图片，将使用尾帧作为参考图');
      }
      if (!hasLastFrame) {
        warningIssues.push('动作镜头缺少尾帧图片，视频结束画面由AI自由发挥');
      }
    }
  } else {
    if (!hasAnyFrame) {
      blockingIssues.push('缺少帧图片，请先生成至少一张首帧或尾帧');
    } else if (!hasFirstFrame) {
      warningIssues.push('缺少首帧图片，将使用尾帧作为参考图');
    }
  }

  // 2. 检查视频提示词
  if (!storyboard.video_prompt || storyboard.video_prompt.trim() === '') {
    blockingIssues.push('分镜缺少视频提示词，请在导演空间的"视频提示词"标签中编辑后再生成');
  }

  return {
    sceneId,
    ready: blockingIssues.length === 0,
    blockingIssues,
    warningIssues
  };
}
