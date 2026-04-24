/**
 * 工作流步骤：保存分镜到数据库 + 提取场景/道具信息
 * 
 * 逻辑与前端调用的 saveFromWorkflow API 完全一致：
 *   1. DELETE 旧分镜（或追加模式下保留）
 *   2. INSERT 新分镜（prompt_template + variables_json）
 *   3. linkAllForScript 建立资源关联
 *   4. 从 scenes.location 汇总场景信息，直接保存到 scenes 表（无需 AI）
 *   5. 从 scenes.props 汇总道具信息，保存到 props 表并建立关联
 * 
 * 确保 scene_state_analysis 执行前分镜已在 DB 中
 * 
 * input:  { scenes, scriptId, projectId, userId, sceneNumber?, appendMode? }
 * output: { saved: number, scenesExtracted: number, propsExtracted: number }
 */

const { execute, queryOne, queryAll } = require('../../../dbHelper');

async function handleSaveStoryboards(inputParams, onProgress) {
  const { scenes, scriptId, projectId, userId, sceneNumber, appendMode } = inputParams;

  if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('缺少分镜数据（scenes 为空）');
  }
  if (!scriptId || !projectId) {
    throw new Error('缺少 scriptId 或 projectId');
  }

  console.log(`[SaveStoryboards] 保存 ${scenes.length} 个分镜到 DB, scriptId=${scriptId}, appendMode=${appendMode}, sceneNumber=${sceneNumber}`);
  if (onProgress) onProgress(10);

  // 计算分镜序号偏移（追加模式下需要）
  let idxOffset = 0;
  if (appendMode) {
    // 追加模式：获取当前最大 idx
    const maxIdxRow = await queryOne(
      'SELECT MAX(idx) as maxIdx FROM storyboards WHERE script_id = ?',
      [scriptId]
    );
    idxOffset = (maxIdxRow?.maxIdx ?? -1) + 1;
    console.log(`[SaveStoryboards] 追加模式，从 idx=${idxOffset} 开始`);
  } else {
    // 非追加模式：删除该剧本的旧分镜
    await execute('DELETE FROM storyboards WHERE script_id = ?', [scriptId]);
    console.log('[SaveStoryboards] 已删除旧分镜');
  }

  // 批量保存新分镜（单次网络往返替代 N 次）
  if (scenes.length > 0) {
    const batchValues = scenes.map((scene, i) => [
      projectId,
      scriptId,
      idxOffset + i,
      scene.description || '',
      '',
      JSON.stringify(scene.variables || scene)
    ]);
    await execute(
      `INSERT INTO storyboards (project_id, script_id, idx, description, prompt_template, variables_json) VALUES ?`,
      [batchValues]
    );
  }

  console.log('[SaveStoryboards] 批量保存了', scenes.length, '个分镜');
  if (onProgress) onProgress(40);

  // ============================================
  // 从 scenes.location 汇总场景信息，直接保存到 scenes 表
  // 必须在 linkAllForScript 之前执行，否则关联时找不到场景
  // ============================================
  let scenesExtracted = 0;
  if (userId) {
    const locationMap = new Map(); // location -> { descriptions, emotions }

    // 汇总每个 location 的信息
    for (const scene of scenes) {
      const loc = scene.location?.trim();
      if (!loc) continue;

      if (!locationMap.has(loc)) {
        locationMap.set(loc, {
          descriptions: [],
          emotions: new Set()
        });
      }
      const data = locationMap.get(loc);
      if (scene.description) data.descriptions.push(scene.description);
      if (scene.emotion) data.emotions.add(scene.emotion);
    }

    console.log('[SaveStoryboards] 从分镜汇总了', locationMap.size, '个场景');

    // 批量 upsert 场景到数据库（单次网络往返替代 2N 次）
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
        console.error('[SaveStoryboards] 批量保存场景失败:', dbError.message);
      }
    }
    console.log('[SaveStoryboards] 场景提取完成:', scenesExtracted);
  }

  if (onProgress) onProgress(60);

  // ============================================
  // 从 scenes.props 汇总道具信息，保存到 props 表
  // ============================================
  let propsExtracted = 0;
  const propNameToId = new Map(); // propName -> propId

  if (userId) {
    // 收集所有道具名称
    const allPropNames = new Set();
    for (const scene of scenes) {
      if (Array.isArray(scene.props)) {
        scene.props.forEach(p => {
          if (p && p.trim()) allPropNames.add(p.trim());
        });
      }
    }

    console.log('[SaveStoryboards] 从分镜汇总了', allPropNames.size, '个道具');

    // 批量查询已有道具 + 批量插入新道具
    if (allPropNames.size > 0) {
      const propNameArr = Array.from(allPropNames);
      try {
        // 一次性查询所有已存在的道具
        const existingProps = await queryAll(
          `SELECT id, name FROM props WHERE project_id = ? AND user_id = ? AND name IN (?)`,
          [projectId, userId, propNameArr]
        );
        for (const p of existingProps) {
          propNameToId.set(p.name, p.id);
        }

        // 筛选需要新增的道具
        const newProps = propNameArr.filter(n => !propNameToId.has(n));
        if (newProps.length > 0) {
          const propValues = newProps.map(n => [userId, projectId, n, `从分镜自动提取的道具：${n}`, '未分类']);
          const insertResult = await execute(
            `INSERT INTO props (user_id, project_id, name, description, category) VALUES ?`,
            [propValues]
          );
          // 获取批量插入的 id（MySQL 连续自增）
          const firstId = insertResult.insertId;
          newProps.forEach((n, i) => {
            propNameToId.set(n, firstId + i);
          });
          propsExtracted = newProps.length;
        }
      } catch (dbError) {
        console.error('[SaveStoryboards] 批量处理道具失败:', dbError.message);
      }
    }

    console.log('[SaveStoryboards] 道具提取完成:', propsExtracted, '个新道具');
  }

  // 建立分镜与角色/场景的强ID关联（与 saveFromWorkflow 一致）
  // 注意：必须在场景保存之后执行，否则关联时找不到场景
  try {
    const { linkAllForScript } = require('../../../resourceLinks');
    const linkResult = await linkAllForScript(scriptId, projectId);
    console.log('[SaveStoryboards] 资源关联结果:', linkResult);
  } catch (linkError) {
    // 关联失败不影响分镜保存结果
    console.error('[SaveStoryboards] 资源关联失败（不影响分镜）:', linkError.message);
  }

  if (onProgress) onProgress(90);

  // 建立分镜与道具的关联（优化：使用内存中的 scenes 数据，无需重新查询 DB）
  if (propNameToId.size > 0) {
    try {
      // 直接使用内存中的 scenes 数据（已经保存到 DB 且有对应的 idx 顺序）
      // 但需要获取 DB 中的 storyboard id，因为批量 INSERT 时 id 是自增的
      const storyboards = await queryAll(
        'SELECT id, idx FROM storyboards WHERE script_id = ? ORDER BY idx',
        [scriptId]
      );

      // 收集所有关联关系后批量插入
      const linkValues = [];
      for (let i = 0; i < storyboards.length && i < scenes.length; i++) {
        const sb = storyboards[i];
        const scene = scenes[i]; // scenes 按 idx 顺序，与 storyboards 对应
        const sceneProps = scene?.props || [];
        for (const propName of sceneProps) {
          const propId = propNameToId.get(propName?.trim());
          if (propId) {
            linkValues.push([sb.id, propId]);
          }
        }
      }
      if (linkValues.length > 0) {
        await execute(
          `INSERT IGNORE INTO storyboard_props (storyboard_id, prop_id) VALUES ?`,
          [linkValues]
        );
      }
      console.log('[SaveStoryboards] 分镜-道具关联完成');
    } catch (linkPropErr) {
      console.error('[SaveStoryboards] 分镜-道具关联失败:', linkPropErr.message);
    }
  }

  if (onProgress) onProgress(100);
  console.log(`[SaveStoryboards] 完成，已保存 ${scenes.length} 个分镜，${scenesExtracted} 个场景，${propsExtracted} 个新道具`);

  return { saved: scenes.length, scenesExtracted, propsExtracted };
}

module.exports = handleSaveStoryboards;
