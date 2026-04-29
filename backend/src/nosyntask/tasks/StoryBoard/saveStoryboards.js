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

  if (onProgress) onProgress(100);
  console.log(`[SaveStoryboards] 完成，已保存 ${scenes.length} 个分镜，${scenesExtracted} 个场景，${propsExtracted} 个新道具`);

  return { saved: scenes.length, scenesExtracted, propsExtracted };
}

module.exports = handleSaveStoryboards;
