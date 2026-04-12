/**
 * 章节生成提示词模板
 */

/**
 * 构建章节内容生成提示词
 */
function buildChapterPrompt(params) {
  const { 
    worldView, 
    plotSummary, 
    characters, 
    scenes, 
    prevSummaries, 
    chapterTitle, 
    chapterNumber,
    existingContent = ''
  } = params;

  let prompt = `你是一位专业的小说作家。请为以下小说创作第${chapterNumber}章的内容。

`;

  // 世界观
  if (worldView) {
    prompt += `【世界观设定】
${worldView}

`;
  }

  // 剧情概要
  if (plotSummary) {
    prompt += `【剧情概要】
${plotSummary}

`;
  }

  // 人物设定
  if (characters && characters.length > 0) {
    prompt += `【人物设定】
${characters.map(c => {
      let charInfo = `${c.name}`;
      if (c.gender && c.gender !== 'unknown') charInfo += ` (${c.gender === 'male' ? '男' : c.gender === 'female' ? '女' : '其他'})`;
      if (c.age) charInfo += ` ${c.age}岁`;
      if (c.roleType) {
        const roleMap = { protagonist: '主角', supporting: '配角', antagonist: '反派', minor: '龙套' };
        charInfo += ` [${roleMap[c.roleType] || c.roleType}]`;
      }
      charInfo += '\n';
      if (c.personality) charInfo += `  性格：${c.personality}\n`;
      if (c.appearance) charInfo += `  外貌：${c.appearance}\n`;
      if (c.background) charInfo += `  背景：${c.background}\n`;
      return charInfo;
    }).join('\n')}

`;
  }

  // 场景设定
  if (scenes && scenes.length > 0) {
    prompt += `【场景设定】
${scenes.map(s => {
      let sceneInfo = `${s.name}`;
      if (s.location) sceneInfo += ` - ${s.location}`;
      sceneInfo += '\n';
      if (s.description) sceneInfo += `  描述：${s.description}\n`;
      if (s.history) sceneInfo += `  历史：${s.history}\n`;
      return sceneInfo;
    }).join('\n')}

`;
  }

  // 前情提要
  if (prevSummaries && prevSummaries.length > 0) {
    prompt += `【前情提要】
${prevSummaries.map((s, idx) => {
      const total = prevSummaries.length;
      const order = total - idx;
      return `${order === 1 ? '上一章' : `前${order}章`}（第${s.chapterNumber}章 ${s.title}）：${s.summary}`;
    }).join('\n')}

`;
  }

  // 本章要求
  prompt += `【本章要求】
章节标题：${chapterTitle}
章节序号：第${chapterNumber}章
`;

  if (existingContent && existingContent.trim()) {
    prompt += `
【已有内容】（请在此基础上续写）
${existingContent}

请继续创作本章后续内容，保持与已有内容的连贯性。`;
  } else {
    prompt += `
请创作本章的完整内容，要求：
1. 字数要求：3000-5000字
2. 内容要求：情节连贯，人物性格一致，符合世界观设定
3. 写作风格：文学性强，描写细腻，对话自然
4. 结构要求：包含场景描写、人物互动、情节推进
5. 注意：只返回章节正文内容，不要包含章节标题`;
  }

  return prompt;
}

/**
 * 构建剧情简述生成提示词
 */
function buildSummaryPrompt(chapterContent, chapterTitle, chapterNumber) {
  return `请为以下小说章节生成一段剧情简述，用于帮助理解本章内容和衔接下一章。

章节：第${chapterNumber}章 ${chapterTitle}

章节内容：
${chapterContent.substring(0, 3000)}${chapterContent.length > 3000 ? '...' : ''}

请生成一段200-400字的剧情简述，包含：
1. 本章主要情节
2. 关键人物行动
3. 重要转折点
4. 为下一章埋下的伏笔或悬念

请以第三人称概述方式输出。`;
}

/**
 * 构建角色经历更新提示词
 */
function buildCharacterUpdatePrompt(character, chapterContent, chapterTitle) {
  return `基于以下小说章节内容，更新角色"${character.name}"的经历记录。

角色当前信息：
- 姓名：${character.name}
- 当前经历：${character.background || '无'}

本章内容（第${chapterTitle}章）：
${chapterContent.substring(0, 2000)}${chapterContent.length > 2000 ? '...' : ''}

请分析本章中该角色的：
1. 重要行动和决策
2. 遭遇的事件
3. 性格发展或变化
4. 与其他角色的关系变化

请输出一段简洁的经历补充（100-200字），将被追加到角色经历中。如果本章没有该角色出场，请回复"本章未出场"。`;
}

/**
 * 构建场景经历更新提示词
 */
function buildSceneUpdatePrompt(scene, chapterContent, chapterTitle) {
  return `基于以下小说章节内容，更新场景"${scene.name}"的经历记录。

场景当前信息：
- 名称：${scene.name}
- 位置：${scene.location || '未指定'}
- 当前历史：${scene.history || '无'}

本章内容（第${chapterTitle}章）：
${chapterContent.substring(0, 2000)}${chapterContent.length > 2000 ? '...' : ''}

请分析本章中该场景：
1. 发生的重要事件
2. 场景状态的变化
3. 在该场景中出场的角色及其行为
4. 场景对剧情发展的意义

请输出一段简洁的经历补充（100-200字），将被追加到场景历史中。如果本章没有涉及该场景，请回复"本章未涉及"。`;
}

module.exports = {
  buildChapterPrompt,
  buildSummaryPrompt,
  buildCharacterUpdatePrompt,
  buildSceneUpdatePrompt
};
