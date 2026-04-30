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
        if (appendMode) {
          // 追加模式：跳过同名场景，只插入新场景
          const existingSceneNames = await queryAll(
            `SELECT name FROM scenes WHERE project_id = ? AND user_id = ?`,
            [projectId, userId]
          );
          const existingNameSet = new Set(existingSceneNames.map(r => r.name));
          const newSceneValues = sceneValues.filter(v => !existingNameSet.has(v[3]));
          const skippedCount = sceneValues.length - newSceneValues.length;
          if (skippedCount > 0) {
            console.log(`[SaveStoryboards] 追加模式跳过 ${skippedCount} 个同名场景`);
          }
          if (newSceneValues.length > 0) {
            await execute(
              `INSERT INTO scenes (user_id, project_id, script_id, name, description, mood, environment, lighting, source)
               VALUES ?`,
              [newSceneValues]
            );
            scenesExtracted = newSceneValues.length;
          } else {
            scenesExtracted = 0;
          }
        } else {
          // 非追加模式：upsert（原有逻辑）
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
        }
      } catch (dbError) {
        console.error('[SaveStoryboards] 批量保存场景失败:', dbError.message);
      }
    }
    console.log('[SaveStoryboards] 场景提取完成:', scenesExtracted);
  }

  if (onProgress) onProgress(60);

  // ============================================
  // 从 scenes.props（场景级）+ scenes.characterStates[].heldProps（角色级手持道具）
  // 两条源头汇总，只将复用度高的（≥ 2 分镜 或 ≥ 2 角色持有）沉淀为独立道具资产
  // ============================================
  let propsExtracted = 0;
  const propNameToId = new Map(); // normalizedName -> propId
  const scenePropLinks = []; // { sceneIdx, propName }[] 所有发生过的道具关联候选（筛选后再入库）

  if (userId) {
    // 轻度归一化：去掉常见前缀修饰词
    const PREFIXES = ['手持的', '手里的', '手中的', '拿着的', '抱着的', '背着的', '戴着的', '握着的', '举着的', '带着的', '携着的', '捕着的'];
    const normalize = (raw) => {
      if (!raw) return '';
      let name = String(raw).trim();
      for (const pre of PREFIXES) {
        if (name.startsWith(pre)) { name = name.slice(pre.length); break; }
      }
      return name.trim();
    };
    const splitAndNormalize = (raw) => String(raw || '').split(/[,，、；;]/).map(s => normalize(s)).filter(Boolean);

    // 统计每个道具的复用度：出现分镜数 & 持有角色数
    const propStats = new Map(); // normalizedName -> { scenes: Set<sceneIdx>, characters: Set<characterName> }
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneNames = new Set();

      // 场景级道具
      if (Array.isArray(scene.props)) {
        for (const p of scene.props) {
          for (const n of splitAndNormalize(p)) {
            sceneNames.add(n);
            if (!propStats.has(n)) propStats.set(n, { scenes: new Set(), characters: new Set() });
            propStats.get(n).scenes.add(i);
          }
        }
      }

      // 角色级手持道具
      if (Array.isArray(scene.characterStates)) {
        for (const cs of scene.characterStates) {
          if (!cs?.heldProps) continue;
          for (const n of splitAndNormalize(cs.heldProps)) {
            sceneNames.add(n);
            if (!propStats.has(n)) propStats.set(n, { scenes: new Set(), characters: new Set() });
            propStats.get(n).scenes.add(i);
            if (cs.character) propStats.get(n).characters.add(String(cs.character).trim());
          }
        }
      }

      // 暂存本镜下的道具，后面根据筛选结果再建关联
      for (const n of sceneNames) {
        scenePropLinks.push({ sceneIdx: i, propName: n });
      }
    }

    // 筛选“复用性高”的道具：出现在 ≥ 2 个分镜 或 被 ≥ 2 个不同角色持有
    const reusableSet = new Set();
    for (const [name, stat] of propStats.entries()) {
      if (stat.scenes.size >= 2 || stat.characters.size >= 2) {
        reusableSet.add(name);
      }
    }
    console.log(`[SaveStoryboards] 道具统计: 候选 ${propStats.size} 个，沉淀 ${reusableSet.size} 个（复用性高）`);

    if (reusableSet.size > 0) {
      const propNameArr = Array.from(reusableSet);
      try {
        const existingProps = await queryAll(
          `SELECT id, name FROM props WHERE project_id = ? AND user_id = ? AND name IN (?)`,
          [projectId, userId, propNameArr]
        );
        for (const p of existingProps) {
          propNameToId.set(p.name, p.id);
        }

        const newProps = propNameArr.filter(n => !propNameToId.has(n));
        if (newProps.length > 0) {
          const propValues = newProps.map(n => {
            const stat = propStats.get(n);
            const note = `从分镜自动提取的道具：${n}（出现于 ${stat.scenes.size} 个分镜，${stat.characters.size} 位角色持有）`;
            return [userId, projectId, n, note, '未分类'];
          });
          const insertResult = await execute(
            `INSERT INTO props (user_id, project_id, name, description, category) VALUES ?`,
            [propValues]
          );
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

  // 建立分镜与道具的关联（场景级 props + 角色级 heldProps 合并后关联，仅限沉淀的复用道具）
  if (propNameToId.size > 0 && scenePropLinks.length > 0) {
    try {
      const storyboards = await queryAll(
        'SELECT id, idx FROM storyboards WHERE script_id = ? ORDER BY idx',
        [scriptId]
      );
      // idx -> storyboard.id（追加模式下 scene[i] 对应实际 idx = idxOffset + i）
      const idxToSbId = new Map();
      for (const sb of storyboards) idxToSbId.set(sb.idx, sb.id);

      const linkValues = [];
      for (const link of scenePropLinks) {
        const sbId = idxToSbId.get(idxOffset + link.sceneIdx);
        const propId = propNameToId.get(link.propName);
        if (sbId && propId) {
          linkValues.push([sbId, propId]);
        }
      }
      if (linkValues.length > 0) {
        await execute(
          `INSERT IGNORE INTO storyboard_props (storyboard_id, prop_id) VALUES ?`,
          [linkValues]
        );
      }
      console.log(`[SaveStoryboards] 分镜-道具关联完成，共 ${linkValues.length} 条`);
    } catch (linkPropErr) {
      console.error('[SaveStoryboards] 分镜-道具关联失败:', linkPropErr.message);
    }
  }

  // ============================================
  // T8 新增：聚合写 studios + studio_states + studio_prop_links
  //   - 每个 location → 一个 studio（本体）
  //   - 每个 (location, time_of_day, weather) 组合 → 一个 studio_state
  //   - 道具按 studio 聚合 → studio_prop_links
  //   - 回写 storyboards.idx 对应的 scene 的 studio_state_id（通过 storyboard_scenes 链接）
  // ============================================
  let studiosCreated = 0;
  let studioStatesCreated = 0;
  let studioPropLinkCount = 0;
  const locationToStudioId = new Map();     // locationName -> studio.id
  const studioStateKeyToId = new Map();     // `${studioId}|${timeOfDay}|${weather}` -> studio_state.id

  if (userId) {
    try {
      // 1) 汇总每个 location 的聚合信息
      const locAggregate = new Map(); // locName -> { descriptions, timeOfDay, weather, lighting, mood, sceneIdxs:Set, states:Map<key,{timeOfDay,weather,lighting,mood,sceneIdxs:Set,description}> }
      for (let i = 0; i < scenes.length; i++) {
        const sc = scenes[i];
        const loc = (sc.location || '').trim();
        if (!loc) continue;
        if (!locAggregate.has(loc)) {
          locAggregate.set(loc, {
            descriptions: [],
            sceneIdxs: new Set(),
            states: new Map()
          });
        }
        const agg = locAggregate.get(loc);
        agg.sceneIdxs.add(i);
        if (sc.description) agg.descriptions.push(sc.description);

        const timeOfDay = (sc.timeOfDay || sc.time_of_day || '').trim();
        const weather = (sc.weather || '').trim();
        const lighting = (sc.lighting || '').trim();
        const mood = (sc.emotion || sc.mood || '').trim();
        const stateKey = `${timeOfDay}|${weather}|${lighting}|${mood}`;
        if (!agg.states.has(stateKey)) {
          agg.states.set(stateKey, {
            timeOfDay, weather, lighting, mood,
            sceneIdxs: new Set(),
            description: sc.description || ''
          });
        }
        agg.states.get(stateKey).sceneIdxs.add(i);
      }

      // 2) upsert studios（本体）
      if (locAggregate.size > 0) {
        const existingStudios = await queryAll(
          'SELECT id, name FROM studios WHERE project_id = ? AND user_id = ?',
          [projectId, userId]
        );
        const existingStudioMap = new Map(existingStudios.map(s => [s.name, s.id]));

        const newStudioRows = [];
        for (const [locName, agg] of locAggregate.entries()) {
          if (existingStudioMap.has(locName)) {
            locationToStudioId.set(locName, existingStudioMap.get(locName));
          } else {
            newStudioRows.push([userId, projectId, locName, agg.descriptions[0] || '']);
          }
        }
        if (newStudioRows.length > 0) {
          const ret = await execute(
            `INSERT INTO studios (user_id, project_id, name, description) VALUES ?`,
            [newStudioRows]
          );
          const firstId = ret.insertId;
          newStudioRows.forEach((row, idx) => {
            locationToStudioId.set(row[2], firstId + idx);
          });
          studiosCreated = newStudioRows.length;
        }
        console.log(`[SaveStoryboards] studios 聚合：新增 ${studiosCreated} 个，共 ${locationToStudioId.size} 个`);
      }

      // 3) upsert studio_states（按 location x 时段/天气/光照/氛围）
      const newStateRows = [];
      const stateRowMeta = []; // 记录每行对应的 (studioId, key, sceneIdxs)
      for (const [locName, agg] of locAggregate.entries()) {
        const studioId = locationToStudioId.get(locName);
        if (!studioId) continue;
        for (const [key, st] of agg.states.entries()) {
          const stateName = [
            locName,
            st.timeOfDay || null,
            st.weather || null
          ].filter(Boolean).join('·') || locName;
          newStateRows.push([
            userId, projectId, studioId, stateName,
            st.description || null,
            st.timeOfDay || null,
            st.weather || null,
            st.lighting || null,
            st.mood || null
          ]);
          stateRowMeta.push({ studioId, key: `${studioId}|${key}`, sceneIdxs: st.sceneIdxs });
        }
      }

      if (newStateRows.length > 0) {
        // 简化：非追加模式下，新 script 运行时清掉本项目下的旧状态，再重建
        if (!appendMode) {
          await execute(
            `DELETE FROM studio_states WHERE user_id = ? AND project_id = ? AND studio_id IN (?)`,
            [userId, projectId, Array.from(locationToStudioId.values())]
          ).catch(() => {});
        }
        const ret = await execute(
          `INSERT INTO studio_states (user_id, project_id, studio_id, name, description, time_of_day, weather, lighting, mood) VALUES ?`,
          [newStateRows]
        );
        const firstId = ret.insertId;
        stateRowMeta.forEach((m, idx) => {
          studioStateKeyToId.set(m.key, firstId + idx);
        });
        studioStatesCreated = newStateRows.length;
        console.log(`[SaveStoryboards] studio_states 新增 ${studioStatesCreated} 条`);
      }

      // 4) studio_prop_links：沉淀的复用道具按 studio 聚合
      if (propNameToId.size > 0) {
        const studioPropSet = new Set(); // `${studioId}|${propId}`
        for (const link of scenePropLinks) {
          const sc = scenes[link.sceneIdx];
          const loc = (sc?.location || '').trim();
          const studioId = locationToStudioId.get(loc);
          const propId = propNameToId.get(link.propName);
          if (studioId && propId) studioPropSet.add(`${studioId}|${propId}`);
        }
        if (studioPropSet.size > 0) {
          const linkRows = Array.from(studioPropSet).map(k => {
            const [sid, pid] = k.split('|').map(Number);
            return [sid, pid];
          });
          await execute(
            `INSERT IGNORE INTO studio_prop_links (studio_id, prop_id) VALUES ?`,
            [linkRows]
          );
          studioPropLinkCount = linkRows.length;
          console.log(`[SaveStoryboards] studio_prop_links 写入 ${studioPropLinkCount} 条`);
        }
      }

      // 5) 回写 storyboard_scenes.studio_state_id
      //    需要：每个 storyboard idx → studio_state_id 映射
      if (studioStateKeyToId.size > 0) {
        const storyboardsRows = await queryAll(
          'SELECT id, idx FROM storyboards WHERE script_id = ? ORDER BY idx',
          [scriptId]
        );
        const idxToSbId2 = new Map();
        for (const sb of storyboardsRows) idxToSbId2.set(sb.idx, sb.id);

        // 每个 scene[i] → 对应 state_id
        const sceneToStateId = new Map(); // sceneIdx -> stateId
        for (let i = 0; i < scenes.length; i++) {
          const sc = scenes[i];
          const loc = (sc.location || '').trim();
          const studioId = locationToStudioId.get(loc);
          if (!studioId) continue;
          const timeOfDay = (sc.timeOfDay || sc.time_of_day || '').trim();
          const weather = (sc.weather || '').trim();
          const lighting = (sc.lighting || '').trim();
          const mood = (sc.emotion || sc.mood || '').trim();
          const key = `${studioId}|${timeOfDay}|${weather}|${lighting}|${mood}`;
          const stateId = studioStateKeyToId.get(key);
          if (stateId) sceneToStateId.set(i, stateId);
        }

        // 通过 storyboard_scenes 链接表反查 scene_id，然后 UPDATE studio_state_id
        // 旧 scene（scenes 表）通过 name=location 匹配
        const locToOldSceneId = new Map();
        const oldScenesRows = await queryAll(
          'SELECT id, name FROM scenes WHERE project_id = ? AND user_id = ?',
          [projectId, userId]
        );
        for (const row of oldScenesRows) locToOldSceneId.set(row.name, row.id);

        const updatePairs = []; // [storyboard_id, scene_id, studio_state_id]
        for (let i = 0; i < scenes.length; i++) {
          const sc = scenes[i];
          const loc = (sc.location || '').trim();
          const oldSceneId = locToOldSceneId.get(loc);
          const sbId = idxToSbId2.get(idxOffset + i);
          const stateId = sceneToStateId.get(i);
          if (oldSceneId && sbId && stateId) {
            updatePairs.push([sbId, oldSceneId, stateId]);
          }
        }
        if (updatePairs.length > 0) {
          // 先确保 storyboard_scenes 有记录（可能之前已由 linkAllForScript 建好），再 UPDATE
          for (const [sbId, sceneId, stateId] of updatePairs) {
            await execute(
              `INSERT INTO storyboard_scenes (storyboard_id, scene_id, studio_state_id)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE studio_state_id = VALUES(studio_state_id)`,
              [sbId, sceneId, stateId]
            );
          }
          console.log(`[SaveStoryboards] storyboard_scenes.studio_state_id 回写 ${updatePairs.length} 条`);
        }
      }
    } catch (aggErr) {
      console.error('[SaveStoryboards] studio/state/prop 聚合失败（不影响分镜保存）:', aggErr.message);
    }
  }

  if (onProgress) onProgress(100);
  console.log(`[SaveStoryboards] 完成，已保存 ${scenes.length} 个分镜，${scenesExtracted} 个场景，${propsExtracted} 个新道具，${studiosCreated} 个新场景(studio)，${studioStatesCreated} 个场景状态，${studioPropLinkCount} 条场景-道具关联`);

  return {
    saved: scenes.length,
    scenesExtracted,
    propsExtracted,
    studiosCreated,
    studioStatesCreated,
    studioPropLinkCount
  };
}

module.exports = handleSaveStoryboards;
