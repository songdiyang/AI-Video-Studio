/**
 * 小说章节生成任务处理器
 * 多轮流水线处理：生成内容 -> 生成简述 -> 更新角色经历 -> 更新场景经历
 */

const { queryOne, queryAll, execute } = require('../../../dbHelper');
const { callAIModel } = require('../../../aiModelService');
const {
  buildChapterPrompt,
  buildSummaryPrompt,
  buildCharacterUpdatePrompt,
  buildSceneUpdatePrompt
} = require('./prompts/chapterGenerationPrompt');

/**
 * 主处理函数
 * @param {Object} inputParams - 任务输入参数
 * @param {Function} onProgress - 进度回调
 */
async function handleNovelChapterGeneration(inputParams, onProgress) {
  const {
    chapterId,
    projectId,
    chapterNumber,
    chapterTitle,
    generationType,
    modelName,
    worldView,
    plotSummary,
    characters,
    scenes,
    prevSummaries
  } = inputParams;

  console.log(`[NovelChapterGen] 开始生成第${chapterNumber}章: ${chapterTitle}`);

  // 报告初始进度
  if (onProgress) onProgress(5);

  // 获取默认模型
  const textModel = modelName || await getDefaultTextModel();
  if (!textModel) {
    throw new Error('没有可用的文本模型');
  }

  // 获取已有内容（如果是续写模式）
  let existingContent = '';
  if (generationType === 'continuation') {
    const chapter = await queryOne('SELECT content FROM novel_chapters WHERE id = ?', [chapterId]);
    existingContent = chapter?.content || '';
  }

  // ========== 第1轮：生成章节内容 ==========
  console.log('[NovelChapterGen] 第1轮：生成章节内容...');
  if (onProgress) onProgress(10);

  const chapterPrompt = buildChapterPrompt({
    worldView,
    plotSummary,
    characters,
    scenes,
    prevSummaries,
    chapterTitle,
    chapterNumber,
    existingContent
  });

  const chapterResult = await callAIModel(textModel, {
    messages: [{ role: 'user', content: chapterPrompt }],
    temperature: 0.8,
    max_tokens: 8000
  });

  const chapterContent = extractContent(chapterResult);
  if (!chapterContent || chapterContent.trim().length < 100) {
    throw new Error('生成的章节内容过短或为空');
  }

  console.log(`[NovelChapterGen] 章节内容生成完成，长度: ${chapterContent.length}字`);
  if (onProgress) onProgress(40);

  // ========== 第2轮：生成剧情简述 ==========
  console.log('[NovelChapterGen] 第2轮：生成剧情简述...');
  if (onProgress) onProgress(50);

  const summaryPrompt = buildSummaryPrompt(chapterContent, chapterTitle, chapterNumber);
  const summaryResult = await callAIModel(textModel, {
    messages: [{ role: 'user', content: summaryPrompt }],
    temperature: 0.7,
    max_tokens: 1000
  });

  const summary = extractContent(summaryResult);
  console.log(`[NovelChapterGen] 剧情简述生成完成，长度: ${summary?.length || 0}字`);
  if (onProgress) onProgress(60);

  // ========== 第3轮：更新角色经历（并行） ==========
  console.log('[NovelChapterGen] 第3轮：更新角色经历...');
  if (onProgress) onProgress(65);

  const characterUpdates = [];
  if (characters && characters.length > 0) {
    const characterPromises = characters.map(async (char, index) => {
      try {
        const charPrompt = buildCharacterUpdatePrompt(char, chapterContent, chapterTitle);
        const charResult = await callAIModel(textModel, {
          messages: [{ role: 'user', content: charPrompt }],
          temperature: 0.7,
          max_tokens: 500
        });

        const update = extractContent(charResult);
        if (update && !update.includes('未出场') && update.length > 10) {
          return {
            characterId: char.id,
            update: update.trim()
          };
        }
        return null;
      } catch (error) {
        console.warn(`[NovelChapterGen] 更新角色 ${char.name} 经历失败:`, error.message);
        return null;
      }
    });

    const results = await Promise.all(characterPromises);
    characterUpdates.push(...results.filter(r => r !== null));

    // 更新数据库
    for (const update of characterUpdates) {
      try {
        const current = await queryOne(
          'SELECT background_story FROM novel_characters WHERE id = ?',
          [update.characterId]
        );
        const newBackground = (current?.background_story || '') + '\n\n' + update.update;
        await execute(
          'UPDATE novel_characters SET background_story = ? WHERE id = ?',
          [newBackground.trim(), update.characterId]
        );
      } catch (error) {
        console.warn(`[NovelChapterGen] 保存角色 ${update.characterId} 经历失败:`, error.message);
      }
    }
  }

  console.log(`[NovelChapterGen] 角色经历更新完成，共${characterUpdates.length}个角色`);
  if (onProgress) onProgress(80);

  // ========== 第4轮：更新场景经历（并行） ==========
  console.log('[NovelChapterGen] 第4轮：更新场景经历...');
  if (onProgress) onProgress(85);

  const sceneUpdates = [];
  if (scenes && scenes.length > 0) {
    const scenePromises = scenes.map(async (scene) => {
      try {
        const scenePrompt = buildSceneUpdatePrompt(scene, chapterContent, chapterTitle);
        const sceneResult = await callAIModel(textModel, {
          messages: [{ role: 'user', content: scenePrompt }],
          temperature: 0.7,
          max_tokens: 500
        });

        const update = extractContent(sceneResult);
        if (update && !update.includes('未涉及') && update.length > 10) {
          return {
            sceneId: scene.id,
            update: update.trim()
          };
        }
        return null;
      } catch (error) {
        console.warn(`[NovelChapterGen] 更新场景 ${scene.name} 经历失败:`, error.message);
        return null;
      }
    });

    const results = await Promise.all(scenePromises);
    sceneUpdates.push(...results.filter(r => r !== null));

    // 更新数据库
    for (const update of sceneUpdates) {
      try {
        const current = await queryOne(
          'SELECT history FROM novel_scenes WHERE id = ?',
          [update.sceneId]
        );
        const newHistory = (current?.history || '') + '\n\n' + update.update;
        await execute(
          'UPDATE novel_scenes SET history = ? WHERE id = ?',
          [newHistory.trim(), update.sceneId]
        );
      } catch (error) {
        console.warn(`[NovelChapterGen] 保存场景 ${update.sceneId} 经历失败:`, error.message);
      }
    }
  }

  console.log(`[NovelChapterGen] 场景经历更新完成，共${sceneUpdates.length}个场景`);
  if (onProgress) onProgress(95);

  // ========== 保存结果 ==========
  console.log('[NovelChapterGen] 保存生成结果...');

  // 更新章节内容
  const finalContent = generationType === 'continuation' && existingContent
    ? existingContent + '\n\n' + chapterContent
    : chapterContent;

  const wordCount = finalContent.replace(/\s/g, '').length;

  await execute(
    `UPDATE novel_chapters SET 
      content = ?, 
      word_count = ?, 
      summary = ?, 
      is_ai_generated = 1,
      status = 'completed',
      updated_at = NOW()
     WHERE id = ?`,
    [finalContent, wordCount, summary, chapterId]
  );

  // 记录生成历史
  await execute(
    `INSERT INTO novel_chapter_generations 
     (chapter_id, project_id, generation_type, prompt_text, generated_content, summary_for_next, model_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [chapterId, projectId, generationType, chapterPrompt, chapterContent, summary, textModel]
  );

  if (onProgress) onProgress(100);

  console.log('[NovelChapterGen] 章节生成任务完成');

  return {
    chapterId,
    wordCount,
    summary,
    characterUpdates: characterUpdates.length,
    sceneUpdates: sceneUpdates.length
  };
}

/**
 * 获取默认文本模型
 */
async function getDefaultTextModel() {
  const model = await queryOne(
    "SELECT name FROM ai_model_configs WHERE category = 'TEXT' AND is_active = 1 ORDER BY id ASC LIMIT 1"
  );
  return model?.name;
}

/**
 * 从AI响应中提取内容
 */
function extractContent(result) {
  if (typeof result === 'string') return result;
  if (result?.content) return result.content;
  if (result?.choices?.[0]?.message?.content) return result.choices[0].message.content;
  if (result?.text) return result.text;
  return '';
}

module.exports = handleNovelChapterGeneration;
