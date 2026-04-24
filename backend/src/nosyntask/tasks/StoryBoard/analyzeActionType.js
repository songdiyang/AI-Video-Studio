/**
 * 动作类型智能分析器
 * 根据分镜描述自动判断动作幅度类型，决定是否需要尾帧
 * 
 * 核心逻辑：
 * - 场景固定不变，只分析角色动作
 * - 大幅度/中幅度动作：不需要尾帧（自由运动模式）
 * - 小幅度动作：需要尾帧（强约束模式）
 * - 空镜头（无角色）：不需要尾帧
 */

/**
 * 分析分镜动作幅度
 * @param {string} description - 分镜描述
 * @param {Array} characters - 分镜中的角色列表
 * @returns {Object} 分析结果
 */
function analyzeActionAmplitude(description, characters = []) {
  if (!description) {
    return {
      actionLevel: 'static',
      strategy: 'singlePrompt',
      useEndFrame: false,
      hasCharacters: false,
      reason: '分镜描述为空，使用默认策略'
    };
  }

  const lowerDesc = description.toLowerCase();
  const hasCharacters = characters && characters.length > 0;

  // 空镜头检测（无角色）
  if (!hasCharacters) {
    return {
      actionLevel: 'empty_shot',
      strategy: 'singlePrompt',
      useEndFrame: false,
      hasCharacters: false,
      reason: '空镜头（无角色），使用统一视频提示词，不需要尾帧'
    };
  }

  // 大幅度动作关键词（角色有明显位移或剧烈运动）
  const largeMotionKeywords = [
    '跳跃', '跳起', '跃起', '飞跃', '弹跳',
    '奔跑', '冲刺', '飞奔', '狂奔',
    '翻滚', '后空翻', '前空翻',
    '击飞', '踢飞', '打飞', '抛出',
    '倒地', '摔倒', '坠落', '跌落',
    '飞扑', '扑倒', '擒拿', '过肩摔',
    '闪避', '翻滚躲避', '侧翻',
    '升空', '腾空', '飞天',
    '追逐', '追赶', '逃跑', '奔逃',
    '冲锋', '突击', '突进',
    '坠落', '跌落', '掉落'
  ];

  // 中幅度动作关键词（角色姿态变化，但位置基本不变）
  const mediumMotionKeywords = [
    '转身', '旋转', '转向',
    '拔剑', '拔刀', '抽剑', '出鞘',
    '举枪', '瞄准', '射击', '开枪',
    '挥手', '招手',
    '鞠躬', '弯腰', '俯身',
    '拥抱', '握手', '击掌',
    '推', '拉', '拽', '扯',
    '挥拳', '出拳', '挥剑', '砍', '劈',
    '走动', '行走', '迈步', '踱步',
    '站起', '坐下', '起身',
    '举起', '放下', '拿起', '放下',
    '拔出', '插入', '收回',
    '张开', '合拢', '展开',
    '挥舞', '摇摆', '晃动'
  ];

  // 小幅度动作关键词（表情、微小动作）
  const smallMotionKeywords = [
    '微笑', '皱眉', '点头', '摇头',
    '眨眼', '瞪眼', '眯眼',
    '说话', '对话', '交谈', '回答',
    '思考', '沉思', '犹豫',
    '叹气', '呼吸', '喘息',
    '看', '注视', '凝视', '打量',
    '点头同意', '摇头拒绝',
    '愣住', '呆住', '惊呆',
    '哭泣', '流泪', '落泪',
    '大笑', '苦笑', '冷笑',
    '咬唇', '抿嘴', '撇嘴',
    '挑眉', '瞪视', '凝视'
  ];

  // 计算匹配度
  let largeScore = 0;
  let mediumScore = 0;
  let smallScore = 0;

  largeMotionKeywords.forEach(keyword => {
    if (lowerDesc.includes(keyword)) largeScore++;
  });

  mediumMotionKeywords.forEach(keyword => {
    if (lowerDesc.includes(keyword)) mediumScore++;
  });

  smallMotionKeywords.forEach(keyword => {
    if (lowerDesc.includes(keyword)) smallScore++;
  });

  // 判断逻辑
  let actionLevel, strategy, useEndFrame, reason;

  if (largeScore > 0) {
    // 大幅度动作：不限制尾帧
    actionLevel = 'large';
    strategy = 'freeMotion';
    useEndFrame = false;
    reason = `检测到大幅度动作（${largeScore}个关键词），不限制尾帧，让模型自由发挥动作过程`;
  } else if (mediumScore > 0) {
    // 中幅度动作：也不限制尾帧
    actionLevel = 'medium';
    strategy = 'freeMotion';
    useEndFrame = false;
    reason = `检测到中幅度动作（${mediumScore}个关键词），不限制尾帧，让模型自由生成动作过渡`;
  } else if (smallScore > 0) {
    // 小幅度动作：需要尾帧精确控制
    actionLevel = 'small';
    strategy = 'strongConstraint';
    useEndFrame = true;
    reason = `检测到小幅度动作（${smallScore}个关键词），需要尾帧精确控制结束姿态`;
  } else {
    // 未明确识别：默认中等幅度，不限制尾帧
    actionLevel = 'medium';
    strategy = 'freeMotion';
    useEndFrame = false;
    reason = '未检测到明确动作类型，默认使用自由运动模式（不限制尾帧）';
  }

  return {
    actionLevel,      // 'empty_shot' | 'large' | 'medium' | 'small'
    strategy,         // 'singlePrompt' | 'freeMotion' | 'strongConstraint'
    useEndFrame,      // 是否使用尾帧
    hasCharacters,
    reason,
    scores: { large: largeScore, medium: mediumScore, small: smallScore }
  };
}

/**
 * 批量分析多个分镜的动作类型
 * @param {Array} storyboards - 分镜数组 [{ description, characters }, ...]
 * @returns {Array} 分析结果数组
 */
function batchAnalyzeActions(storyboards) {
  return storyboards.map(sb => ({
    storyboardId: sb.id,
    description: sb.description,
    characters: sb.characters || [],
    analysis: analyzeActionAmplitude(sb.description, sb.characters || [])
  }));
}

module.exports = { analyzeActionAmplitude, batchAnalyzeActions };
