/**
 * 镜头语言参数管理
 * 提供分镜镜头参数的CRUD接口
 */

const { execute } = require('../../db');

// 镜头语言参数字段定义
const SHOT_LANGUAGE_FIELDS = [
  'shot_size',
  'camera_height',
  'camera_movement',
  'lens_type',
  'focal_length',
  'focal_length_mm',
  'camera_distance',
  'focus_point',
  'depth_of_field',
  'lighting_mood',
  'lighting_direction',
  'lighting_quality',
  'lighting_color',
  'lighting_intensity',
  'lighting_source',
  'composition_rule',
  'axis_position',
  'screen_direction',
  'shot_duration',
  'transition_type',
  'montage_type',
  'pov_character',
];

/**
 * 更新分镜的镜头语言参数
 * PATCH /api/scripts/storyboards/:storyboardId/shot-language
 */
async function updateShotLanguage(req, res) {
  try {
    const { storyboardId } = req.params;
    const updates = req.body;

    if (!storyboardId) {
      return res.status(400).json({ error: '缺少分镜ID' });
    }

    // 过滤有效的镜头语言字段
    const validUpdates = {};
    for (const field of SHOT_LANGUAGE_FIELDS) {
      if (updates[field] !== undefined) {
        validUpdates[field] = updates[field];
      }
    }

    if (Object.keys(validUpdates).length === 0) {
      return res.status(400).json({ error: '没有有效的更新字段' });
    }

    // 检查分镜是否存在
    const [storyboard] = await execute(
      'SELECT id, is_locked FROM storyboards WHERE id = ?',
      [storyboardId]
    );

    if (!storyboard) {
      return res.status(404).json({ error: '分镜不存在' });
    }

    if (storyboard.is_locked) {
      return res.status(403).json({ error: '分镜已锁定，无法修改' });
    }

    // 构建更新SQL
    const fields = Object.keys(validUpdates);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = [...Object.values(validUpdates), storyboardId];

    await execute(
      `UPDATE storyboards SET ${setClause} WHERE id = ?`,
      values
    );

    res.json({
      success: true,
      message: '镜头参数已更新',
      storyboardId: parseInt(storyboardId),
      updates: validUpdates,
    });
  } catch (error) {
    console.error('[updateShotLanguage] 错误:', error);
    res.status(500).json({ error: '更新镜头参数失败: ' + error.message });
  }
}

/**
 * 获取分镜的镜头语言参数
 * GET /api/scripts/storyboards/:storyboardId/shot-language
 */
async function getShotLanguage(req, res) {
  try {
    const { storyboardId } = req.params;

    if (!storyboardId) {
      return res.status(400).json({ error: '缺少分镜ID' });
    }

    const fields = SHOT_LANGUAGE_FIELDS.join(', ');
    const [storyboard] = await execute(
      `SELECT ${fields} FROM storyboards WHERE id = ?`,
      [storyboardId]
    );

    if (!storyboard) {
      return res.status(404).json({ error: '分镜不存在' });
    }

    res.json({
      success: true,
      storyboardId: parseInt(storyboardId),
      shotLanguage: storyboard,
    });
  } catch (error) {
    console.error('[getShotLanguage] 错误:', error);
    res.status(500).json({ error: '获取镜头参数失败: ' + error.message });
  }
}

/**
 * 批量更新分镜的镜头语言参数
 * POST /api/scripts/storyboards/batch-shot-language
 */
async function batchUpdateShotLanguage(req, res) {
  try {
    const { storyboardIds, updates } = req.body;

    if (!Array.isArray(storyboardIds) || storyboardIds.length === 0) {
      return res.status(400).json({ error: '请提供分镜ID列表' });
    }

    // 过滤有效的镜头语言字段
    const validUpdates = {};
    for (const field of SHOT_LANGUAGE_FIELDS) {
      if (updates[field] !== undefined) {
        validUpdates[field] = updates[field];
      }
    }

    if (Object.keys(validUpdates).length === 0) {
      return res.status(400).json({ error: '没有有效的更新字段' });
    }

    // 检查是否有被锁定的分镜
    const placeholders = storyboardIds.map(() => '?').join(',');
    const lockedStoryboards = await execute(
      `SELECT id FROM storyboards WHERE id IN (${placeholders}) AND is_locked = TRUE`,
      storyboardIds
    );

    if (lockedStoryboards.length > 0) {
      return res.status(403).json({
        error: '部分分镜已锁定，无法修改',
        lockedIds: lockedStoryboards.map(s => s.id),
      });
    }

    // 批量更新
    const setClause = Object.keys(validUpdates).map(f => `${f} = ?`).join(', ');
    const values = [...Object.values(validUpdates), ...storyboardIds];

    await execute(
      `UPDATE storyboards SET ${setClause} WHERE id IN (${placeholders})`,
      values
    );

    res.json({
      success: true,
      message: `已更新 ${storyboardIds.length} 个分镜的镜头参数`,
      count: storyboardIds.length,
      updates: validUpdates,
    });
  } catch (error) {
    console.error('[batchUpdateShotLanguage] 错误:', error);
    res.status(500).json({ error: '批量更新镜头参数失败: ' + error.message });
  }
}

/**
 * 检查轴线规则
 * POST /api/scripts/storyboards/check-axis
 */
async function checkAxisRule(req, res) {
  try {
    const { scriptId } = req.body;

    if (!scriptId) {
      return res.status(400).json({ error: '缺少剧本ID' });
    }

    // 获取该剧本下的所有分镜，按顺序
    const storyboards = await execute(
      `SELECT 
        id, idx, axis_position, screen_direction, 
        shot_size, camera_height, characters
      FROM storyboards 
      WHERE script_id = ? 
      ORDER BY idx ASC`,
      [scriptId]
    );

    const axisIssues = [];

    // 检查每对相邻分镜的轴线关系
    for (let i = 0; i < storyboards.length - 1; i++) {
      const current = storyboards[i];
      const next = storyboards[i + 1];

      // 检查越轴情况
      if (current.axis_position && next.axis_position) {
        // 如果当前在左侧，下一个在右侧，可能是越轴
        if (
          (current.axis_position === 'left' && next.axis_position === 'right') ||
          (current.axis_position === 'right' && next.axis_position === 'left')
        ) {
          // 检查是否有明确的越轴意图（如特写镜头）
          const isCloseUp = ['extreme_close_up', 'close_up'].includes(next.shot_size);
          
          if (!isCloseUp) {
            axisIssues.push({
              type: 'axis_violation',
              severity: 'warning',
              fromStoryboardId: current.id,
              toStoryboardId: next.id,
              fromIndex: current.idx,
              toIndex: next.idx,
              message: `分镜 ${current.idx + 1} 到 ${next.idx + 1} 可能存在越轴`,
              suggestion: '建议添加特写镜头过渡或使用明确的方向指示',
            });
          }
        }
      }

      // 检查视线匹配
      if (current.screen_direction && next.screen_direction) {
        const oppositeDirections = [
          ['left_to_right', 'right_to_left'],
          ['towards_camera', 'away_from_camera'],
        ];

        const isOpposite = oppositeDirections.some(
          pair => pair.includes(current.screen_direction) && pair.includes(next.screen_direction)
        );

        if (isOpposite && current.axis_position === next.axis_position) {
          axisIssues.push({
            type: 'direction_mismatch',
            severity: 'info',
            fromStoryboardId: current.id,
            toStoryboardId: next.id,
            fromIndex: current.idx,
            toIndex: next.idx,
            message: `分镜 ${current.idx + 1} 到 ${next.idx + 1} 运动方向相反`,
            suggestion: '确认是否为有意为之（如追逐戏）',
          });
        }
      }
    }

    res.json({
      success: true,
      scriptId,
      totalScenes: storyboards.length,
      issues: axisIssues,
      issueCount: axisIssues.length,
    });
  } catch (error) {
    console.error('[checkAxisRule] 错误:', error);
    res.status(500).json({ error: '检查轴线规则失败: ' + error.message });
  }
}

/**
 * 获取镜头语言选项配置
 * GET /api/scripts/storyboards/shot-language-options
 */
async function getShotLanguageOptions(req, res) {
  const options = {
    shotSize: [
      { value: 'extreme_close_up', label: '大特写', description: '强调眼神、表情细节', icon: '👁️' },
      { value: 'close_up', label: '特写', description: '面部表情、情绪传达', icon: '😊' },
      { value: 'medium_close_up', label: '中近景', description: '胸部以上，兼顾表情和姿态', icon: '👤' },
      { value: 'medium_shot', label: '中景', description: '腰部以上，适合对话', icon: '🧍' },
      { value: 'medium_long_shot', label: '中全景', description: '膝盖以上，展示肢体语言', icon: '🚶' },
      { value: 'long_shot', label: '全景', description: '完整人物与环境关系', icon: '🏞️' },
      { value: 'extreme_long_shot', label: '大远景', description: '强调环境、氛围', icon: '🌄' },
    ],
    cameraHeight: [
      { value: 'eye_level', label: '平视', description: '客观、自然', icon: '➡️' },
      { value: 'low_angle', label: '仰拍', description: '威严、压迫感', icon: '⬆️' },
      { value: 'high_angle', label: '俯拍', description: '弱势、审视', icon: '⬇️' },
      { value: 'bird_eye', label: '鸟瞰', description: '全局、上帝视角', icon: '🦅' },
      { value: 'worm_eye', label: '虫视', description: '夸张、压迫', icon: '🐛' },
      { value: 'pov', label: '主观视角', description: '第一人称，代入感强', icon: '👁️' },
      { value: 'dutch_angle', label: '荷兰角', description: '倾斜镜头，不安定感', icon: '↗️' },
      { value: 'over_shoulder', label: '过肩镜头', description: '从角色肩后拍摄，对话常用', icon: '👤' },
    ],
    cameraMovement: [
      { value: 'static', label: '固定', description: '稳定、客观', icon: '📷' },
      { value: 'push', label: '推', description: '强调、进入', icon: '🔍' },
      { value: 'pull', label: '拉', description: '展开、远离', icon: '🔭' },
      { value: 'pan', label: '摇', description: '水平扫视', icon: '↔️' },
      { value: 'tilt', label: '升降', description: '垂直扫视', icon: '↕️' },
      { value: 'track', label: '移', description: '平行移动', icon: '🚂' },
      { value: 'dolly', label: '跟', description: '跟随主体', icon: '🏃' },
      { value: 'zoom', label: '变焦', description: '焦距变化', icon: '🔎' },
      { value: 'orbit', label: '环绕', description: '360°围绕主体旋转', icon: '🔄' },
      { value: 'dolly_zoom', label: '希区柯克变焦', description: '推拉+反向变焦，眩晕效果', icon: '🌀' },
      { value: 'crane', label: '升降臂', description: '垂直升降，改变视角高度', icon: '🏗️' },
      { value: 'handheld', label: '手持', description: '轻微抖动，真实感', icon: '✋' },
      { value: 'steadicam', label: '稳定器', description: '流畅移动，电影感', icon: '🎥' },
      { value: 'whip_pan', label: '甩镜', description: '快速摇摄，转场常用', icon: '💨' },
    ],
    lensType: [
      { value: 'wide', label: '广角', description: '视野广、变形大', icon: '📐' },
      { value: 'standard', label: '标准', description: '接近人眼', icon: '👁️' },
      { value: 'telephoto', label: '长焦', description: '压缩空间', icon: '🔭' },
      { value: 'macro', label: '微距', description: '细节特写', icon: '🌸' },
      { value: 'fisheye', label: '鱼眼', description: '极端变形', icon: '🐟' },
    ],
    focalLength: [
      { value: 'ultra_wide', label: '超广角', description: '14-24mm，夸张透视，宏大场景', icon: '🏔️' },
      { value: 'wide', label: '广角', description: '24-35mm，环境交代，空间感强', icon: '📐' },
      { value: 'standard', label: '标准', description: '35-50mm，接近人眼视角，自然真实', icon: '👁️' },
      { value: 'portrait', label: '人像', description: '85-135mm，压缩背景，虚化优美', icon: '👤' },
      { value: 'telephoto', label: '长焦', description: '200mm+，压缩空间感，孤立主体', icon: '🔭' },
      { value: 'macro', label: '微距', description: '超近距离拍摄，细节放大', icon: '🌸' },
    ],
    cameraDistance: [
      { value: 'extreme_close', label: '极近', description: '极近距离，微距或大特写', icon: '🔍' },
      { value: 'close', label: '近距', description: '近距离，特写或近景', icon: '👤' },
      { value: 'medium', label: '中距', description: '中等距离，中景', icon: '🧍' },
      { value: 'far', label: '远距', description: '较远距离，全景', icon: '🏞️' },
      { value: 'extreme_far', label: '极远', description: '极远距离，远景或大远景', icon: '🌄' },
    ],
    depthOfField: [
      { value: 'shallow', label: '浅景深', description: '背景虚化、突出主体', icon: '✨' },
      { value: 'medium', label: '中等', description: '适度层次', icon: '⭕' },
      { value: 'deep', label: '深景深', description: '全景清晰', icon: '📍' },
    ],
    lightingMood: [
      { value: 'high_key', label: '高调', description: '明亮、轻快', icon: '☀️' },
      { value: 'low_key', label: '低调', description: '阴暗、神秘', icon: '🌑' },
      { value: 'chiaroscuro', label: '明暗对比', description: '戏剧性、油画感', icon: '🎨' },
      { value: 'silhouette', label: '剪影', description: '轮廓、神秘', icon: '👤' },
      { value: 'backlit', label: '逆光', description: '轮廓光、神圣感', icon: '✨' },
    ],
    lightingDirection: [
      { value: 'front', label: '正面光', description: '光源从摄像机方向照射，减少阴影', icon: '💡' },
      { value: 'side', label: '侧面光', description: '光源从侧面照射，强调轮廓和立体感', icon: '🌗' },
      { value: 'back', label: '背光/逆光', description: '光源从主体背后照射，形成剪影或光晕', icon: '🌅' },
      { value: 'top', label: '顶光', description: '光源从上方照射，产生强烈阴影', icon: '⬇️' },
      { value: 'bottom', label: '底光', description: '光源从下方照射，营造恐怖或超自然感', icon: '⬆️' },
      { value: 'rim', label: '轮廓光', description: '从侧后方照射，勾勒主体边缘', icon: '⭕' },
      { value: 'three_point', label: '三点布光', description: '主光、辅光、轮廓光的经典组合', icon: '🎭' },
      { value: 'natural', label: '自然光', description: '模拟自然环境光照，柔和真实', icon: '🌿' },
    ],
    lightingQuality: [
      { value: 'hard', label: '硬光', description: '明确的阴影边缘，戏剧性强', icon: '☀️' },
      { value: 'soft', label: '软光', description: '柔和的阴影过渡，温和舒适', icon: '☁️' },
      { value: 'diffused', label: '散射光', description: '均匀分布，无明显方向性', icon: '🌫️' },
      { value: 'specular', label: '镜面反射光', description: '高光点明显，有光泽感', icon: '✨' },
      { value: 'ambient', label: '环境光', description: '整体基础照明，无明确方向', icon: '💡' },
      { value: 'dappled', label: '斑驳光', description: '透过树叶等产生的不均匀光斑', icon: '🌳' },
    ],
    lightingColor: [
      { value: 'warm', label: '暖色调', description: '橙黄色系，温馨舒适感 (3000K-4000K)', icon: '🔥' },
      { value: 'cool', label: '冷色调', description: '蓝色系，冷峻科技感 (6500K-10000K)', icon: '❄️' },
      { value: 'neutral', label: '中性色温', description: '自然白光，真实还原 (5000K-5500K)', icon: '☀️' },
      { value: 'golden_hour', label: '黄金时段', description: '日出日落时的金色光线', icon: '🌅' },
      { value: 'blue_hour', label: '蓝调时刻', description: '黎明或黄昏后的蓝色调', icon: '🌆' },
      { value: 'moonlight', label: '月光', description: '清冷的银蓝色调', icon: '🌙' },
      { value: 'neon', label: '霓虹', description: '多彩人工光源，赛博朋克风格', icon: '🎪' },
      { value: 'mixed', label: '混合色温', description: '冷暖光源混合，形成对比', icon: '🌈' },
    ],
    lightingIntensity: [
      { value: 'high_key', label: '高调', description: '整体明亮，阴影少，轻快乐观', icon: '☀️' },
      { value: 'low_key', label: '低调', description: '大面积阴影，戏剧性强，神秘紧张', icon: '🌑' },
      { value: 'high_contrast', label: '高对比', description: '明暗对比强烈，视觉冲击力强', icon: '⚡' },
      { value: 'low_contrast', label: '低对比', description: '明暗过渡柔和，朦胧梦幻', icon: '🌫️' },
      { value: 'silhouette', label: '剪影', description: '主体完全逆光，仅见轮廓', icon: '👤' },
    ],
    lightingSource: [
      { value: 'natural_daylight', label: '自然日光', description: '晴天直射阳光', icon: '☀️' },
      { value: 'overcast', label: '阴天散射', description: '云层散射的柔和自然光', icon: '☁️' },
      { value: 'golden_hour', label: '黄金时段', description: '日出日落时的温暖光线', icon: '🌅' },
      { value: 'blue_hour', label: '蓝调时刻', description: '黎明或黄昏后的蓝色光线', icon: '🌆' },
      { value: 'moonlight', label: '月光', description: '夜晚月光照明', icon: '🌙' },
      { value: 'led', label: 'LED灯', description: 'LED面板灯，现代常用', icon: '💡' },
      { value: 'spotlight', label: '聚光灯', description: '定向强光，突出主体', icon: '🔦' },
      { value: 'softbox', label: '柔光箱', description: '大面积柔和均匀光照', icon: '📦' },
      { value: 'practical', label: '实用光源', description: '台灯、蜡烛、火把等场景内光源', icon: '🕯️' },
      { value: 'mixed', label: '混合光源', description: '自然光+人工光组合', icon: '🌈' },
    ],
    compositionRule: [
      { value: 'rule_of_thirds', label: '三分法', description: '经典构图', icon: '➕' },
      { value: 'center', label: '中心构图', description: '对称、稳定', icon: '⭕' },
      { value: 'symmetry', label: '对称', description: '平衡、正式', icon: '⚖️' },
      { value: 'leading_lines', label: '引导线', description: '视线引导', icon: '〰️' },
      { value: 'frame_in_frame', label: '框中框', description: '层次感', icon: '🖼️' },
    ],
    axisPosition: [
      { value: 'left', label: '左侧', description: '180度轴线左侧', icon: '⬅️' },
      { value: 'right', label: '右侧', description: '180度轴线右侧', icon: '➡️' },
      { value: 'on_axis', label: '轴线上', description: '中性位置', icon: '⬆️' },
    ],
    screenDirection: [
      { value: 'left_to_right', label: '左→右', description: '正向运动', icon: '➡️' },
      { value: 'right_to_left', label: '右→左', description: '反向运动', icon: '⬅️' },
      { value: 'towards_camera', label: '朝向镜头', description: '逼近', icon: '📷' },
      { value: 'away_from_camera', label: '远离镜头', description: '远离', icon: '🏃' },
    ],
    transitionType: [
      { value: 'cut', label: '硬切', description: '直接切换', icon: '✂️' },
      { value: 'fade', label: '淡入淡出', description: '柔和过渡', icon: '☁️' },
      { value: 'dissolve', label: '叠化', description: '时间流逝', icon: '⏳' },
      { value: 'wipe', label: '划像', description: '场景转换', icon: '➡️' },
      { value: 'match_cut', label: '匹配剪辑', description: '图形匹配', icon: '🎯' },
    ],
    montageType: [
      { value: 'narrative', label: '叙事蒙太奇', description: '连续镜头按时间顺序讲述故事', icon: '📚' },
      { value: 'expressive', label: '表现蒙太奇', description: '通过镜头对比表达情感', icon: '🎨' },
      { value: 'cross_cutting', label: '交叉蒙太奇', description: '多场景交替并行叙事', icon: '🔀' },
      { value: 'metaphorical', label: '隐喻蒙太奇', description: '镜头组合产生象征意义', icon: '🔮' },
      { value: 'accumulative', label: '积累蒙太奇', description: '重复类似镜头强化主题', icon: '📦' },
    ],
  };

  res.json({
    success: true,
    options,
  });
}

/**
 * 注册路由
 */
function registerRoutes(router) {
  router.get('/shot-language-options', getShotLanguageOptions);
  router.get('/:storyboardId/shot-language', getShotLanguage);
  router.patch('/:storyboardId/shot-language', updateShotLanguage);
  router.post('/batch-shot-language', batchUpdateShotLanguage);
  router.post('/check-axis', checkAxisRule);
}

module.exports = registerRoutes;
