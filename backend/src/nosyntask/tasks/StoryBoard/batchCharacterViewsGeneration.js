/**
 * 批量角色三视图生成处理器
 * 
 * 在批量分镜工作流的角色提取步骤完成后执行。
 * 遍历所有提取到的角色，为每个角色生成正面、侧面、背面三视图参考图。
 * 
 * input: {
 *   characters: Array<{ id, name, appearance, personality, description }>,
 *   projectId: number,
 *   imageModel: string,
 *   textModel: string,
 *   aspectRatio: string
 * }
 * 
 * output: {
 *   count: number,
 *   completed: number,
 *   failed: number,
 *   skipped: number,
 *   results: Array<{ characterId, name, success, ... }>
 * }
 */

const handleCharacterViewsGeneration = require('./characterViewsGeneration');
const { queryAll } = require('../../../dbHelper');

/**
 * 批量角色三视图生成主处理函数
 */
async function handleBatchCharacterViewsGeneration(inputParams, onProgress) {
  const {
    characters,
    projectId,
    imageModel,
    textModel,
    aspectRatio
  } = inputParams;

  // 1. 验证参数
  if (!Array.isArray(characters) || characters.length === 0) {
    console.log('[BatchCharacterViews] 无角色需要生成三视图');
    return { count: 0, completed: 0, failed: 0, skipped: 0, results: [] };
  }
  if (!imageModel) {
    throw new Error('imageModel 参数是必需的');
  }
  if (!textModel) {
    throw new Error('textModel 参数是必需的');
  }

  console.log(`[BatchCharacterViews] 开始批量生成 ${characters.length} 个角色的三视图`);

  // 2. 查询数据库，找出已有完整三视图的角色（跳过）
  const charIds = characters.filter(c => c.id).map(c => c.id);
  const existingViewsMap = new Map();

  if (charIds.length > 0) {
    const existingViews = await queryAll(
      `SELECT id, front_view_url, side_view_url, back_view_url FROM characters WHERE id IN (?)`,
      [charIds]
    );
    for (const row of existingViews) {
      existingViewsMap.set(row.id, row);
    }
  }

  // 3. 串行处理每个角色
  const results = [];
  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];

    // 跳过没有 id 的角色
    if (!char.id) {
      console.log(`[BatchCharacterViews] 跳过无ID角色: ${char.name}`);
      skipped++;
      continue;
    }

    // 跳过已有完整三视图的角色
    const existing = existingViewsMap.get(char.id);
    if (existing && existing.front_view_url && existing.side_view_url && existing.back_view_url) {
      console.log(`[BatchCharacterViews] 跳过已有完整三视图的角色: ${char.name} (id=${char.id})`);
      skipped++;
      results.push({ characterId: char.id, name: char.name, success: true, skipped: true });
      continue;
    }

    try {
      console.log(`[BatchCharacterViews] 开始生成角色 ${i + 1}/${characters.length}: ${char.name}`);

      // 调用现有的单角色三视图生成处理器
      const result = await handleCharacterViewsGeneration({
        characterId: char.id,
        characterName: char.name,
        appearance: char.appearance || '',
        personality: char.personality || '',
        description: char.description || '',
        projectId,
        imageModel,
        textModel,
        aspectRatio: aspectRatio || '9:16'  // 使用传入的 aspectRatio，默认 9:16
        // 不再硬编码 width/height，让 handleImageGeneration 根据 aspectRatio 自动计算
      }, (stepProgress) => {
        // 映射单角色进度到整体进度
        const overallProgress = Math.round(((i + stepProgress / 100) / characters.length) * 100);
        if (onProgress) onProgress(overallProgress);
      });

      results.push({ characterId: char.id, name: char.name, success: true, ...result });
      completed++;
      console.log(`[BatchCharacterViews] 角色 ${char.name} 三视图生成完成`);
    } catch (err) {
      console.error(`[BatchCharacterViews] 角色 ${char.name} 三视图生成失败:`, err.message);
      results.push({ characterId: char.id, name: char.name, success: false, error: err.message });
      failed++;
      // 继续处理下一个角色，不中断
    }

    // 更新整体进度
    if (onProgress) {
      onProgress(Math.round(((i + 1) / characters.length) * 100));
    }
  }

  console.log(`[BatchCharacterViews] 批量完成: 总${characters.length}, 成功${completed}, 失败${failed}, 跳过${skipped}`);

  return {
    count: characters.length,
    completed,
    failed,
    skipped,
    results
  };
}

module.exports = handleBatchCharacterViewsGeneration;
