/**
 * 批量分镜 - 保存步骤处理器
 * 
 * 收集所有场景步骤的结果，合并排序后批量保存到数据库。
 * 同时提取场景信息并建立资源关联。
 * 
 * input:  { scriptId, projectId, userId, clearExisting, parsedScenes }
 * output: { totalScenes, totalShots, totalDuration, characters, locations, scenesExtracted }
 */

const { queryOne, execute } = require('../../../dbHelper');

const DEFAULT_SHOT_DURATION = 2;

/**
 * 批量保存分镜处理器
 * 
 * 此 handler 由 WorkflowExecutor 调用，通过 buildInput 的 from 函数
 * 从 previousResults 中收集所有场景步骤的结果。
 */
async function handleBatchSaveStoryboards(inputParams, onProgress) {
  const {
    scriptId,
    projectId,
    userId,
    clearExisting = true,
    sceneResults // 由 buildInput 从 previousResults 中收集的场景结果数组
  } = inputParams;

  if (!scriptId || !projectId) {
    throw new Error('缺少 scriptId 或 projectId');
  }

  if (onProgress) onProgress(10);

  // 清理旧分镜
  if (clearExisting) {
    await execute('DELETE FROM storyboards WHERE script_id = ?', [scriptId]);
    console.log('[BatchSave] 已清理旧分镜');
  }

  if (onProgress) onProgress(20);

  // 按场景序号排序合并所有分镜
  const allCharacters = new Set();
  const allLocations = new Set();
  let totalTokens = 0;
  const allStoryboards = [];

  // sceneResults 是按步骤索引排列的数组，每个元素是该场景步骤的 result_data
  const sortedResults = (sceneResults || [])
    .filter(r => r && r.scenes)
    .sort((a, b) => (a.sceneNumber || 0) - (b.sceneNumber || 0));

  for (const result of sortedResults) {
    const globalStartIdx = allStoryboards.length;
    result.scenes.forEach((shot, shotIdx) => {
      shot.globalOrder = globalStartIdx + shotIdx + 1;
      allStoryboards.push(shot);
      if (Array.isArray(shot.characters)) {
        shot.characters.forEach(c => allCharacters.add(c));
      }
      if (shot.location) {
        allLocations.add(shot.location);
      }
    });
    totalTokens += result.tokens || 0;
  }

  console.log(`[BatchSave] 合并 ${sortedResults.length} 个场景, 共 ${allStoryboards.length} 个分镜`);
  if (onProgress) onProgress(40);

  // 批量保存所有分镜到数据库
  let idxOffset = 0;
  if (!clearExisting) {
    const maxIdxRow = await queryOne(
      'SELECT MAX(idx) as maxIdx FROM storyboards WHERE script_id = ?',
      [scriptId]
    );
    idxOffset = (maxIdxRow?.maxIdx ?? -1) + 1;
  }

  const batchValues = allStoryboards.map((shot, i) => [
    projectId,
    scriptId,
    idxOffset + i,
    shot.description || '',
    JSON.stringify(shot)
  ]);

  if (batchValues.length > 0) {
    await execute(
      `INSERT INTO storyboards (project_id, script_id, idx, prompt_template, variables_json) VALUES ?`,
      [batchValues]
    );
  }

  console.log(`[BatchSave] 已批量保存 ${allStoryboards.length} 个分镜到数据库`);
  if (onProgress) onProgress(70);

  // 提取场景信息并批量保存
  let scenesExtracted = 0;
  if (userId) {
    const locationMap = new Map();

    for (const shot of allStoryboards) {
      const loc = shot.location?.trim();
      if (!loc) continue;

      if (!locationMap.has(loc)) {
        locationMap.set(loc, {
          descriptions: [],
          emotions: new Set()
        });
      }
      const data = locationMap.get(loc);
      if (shot.description) data.descriptions.push(shot.description);
      if (shot.emotion) data.emotions.add(shot.emotion);
    }

    const sceneValues = [];
    for (const [locName, data] of locationMap.entries()) {
      const envDescription = data.descriptions[0] || '';
      const mood = Array.from(data.emotions).join(', ') || '';
      const environment = `${locName}场景`;
      const lighting = '自然光';
      sceneValues.push([userId, projectId, scriptId, locName, envDescription, mood, environment, lighting, 'auto_extracted']);
    }

    if (sceneValues.length > 0) {
      try {
        await execute(
          `INSERT INTO scenes (user_id, project_id, script_id, name, description, mood, environment, lighting, source)
           VALUES ?
           ON DUPLICATE KEY UPDATE
             description = COALESCE(NULLIF(description, ''), VALUES(description)),
             mood = COALESCE(NULLIF(mood, ''), VALUES(mood)),
             environment = COALESCE(NULLIF(environment, ''), VALUES(environment)),
             lighting = COALESCE(NULLIF(lighting, ''), VALUES(lighting)),
             script_id = VALUES(script_id),
             updated_at = CURRENT_TIMESTAMP`,
          [sceneValues]
        );
        scenesExtracted = sceneValues.length;
      } catch (dbError) {
        console.error('[BatchSave] 批量保存场景失败:', dbError.message);
      }
    }
  }

  if (onProgress) onProgress(85);

  // 建立资源关联
  try {
    const { linkAllForScript } = require('../../../resourceLinks');
    await linkAllForScript(scriptId, projectId);
    console.log('[BatchSave] 资源关联完成');
  } catch (linkError) {
    console.error('[BatchSave] 资源关联失败（不影响分镜）:', linkError.message);
  }

  if (onProgress) onProgress(100);

  // 计算总时长
  const totalDuration = allStoryboards.reduce((sum, s) => sum + (s.duration || DEFAULT_SHOT_DURATION), 0);
  const totalScenes = sortedResults.length;

  console.log(`[BatchSave] 全部完成: ${totalScenes}个场景, ${allStoryboards.length}个分镜, ${totalDuration}秒`);

  return {
    totalScenes,
    totalShots: allStoryboards.length,
    totalDuration,
    characters: Array.from(allCharacters),
    locations: Array.from(allLocations),
    scenesExtracted,
    tokens: totalTokens
  };
}

module.exports = handleBatchSaveStoryboards;
