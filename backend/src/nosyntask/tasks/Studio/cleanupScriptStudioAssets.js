/**
 * 清理某个剧本"独占"的影棚/环境/建筑资源（仅被该 script 的 storyboards 引用）。
 *
 * 使用场景：智能拆分"完全覆盖"模式（appendMode=false）。
 * 设计原则：
 *   - 只删本剧本独占的资源，绝不误伤其他剧本正在使用的环境/建筑/影棚；
 *   - 判定"独占"依据：是否被其他 script 的 storyboard_scenes / storyboards 间接引用；
 *   - 删除 studios 会触发 FK CASCADE：自动删除 studio_states / studio_building_links /
 *     storyboard_scenes(studio_id)，并把 scenes.studio_id / studios.environment_id 等引用关系解除；
 *   - 删除 environments 会触发 FK CASCADE：自动删除 environment_variants。
 *
 * 注意：不清理 scenes / characters / props / costumes —— 那些由各自的 conflictStrategy 管理。
 */

const { execute, queryAll } = require('../../../dbHelper');
const { INVALID_ENV_NAME_SET } = require('./environmentDescriptionSanitizer');

/**
 * 黑名单环境强制清理：删除本项目下所有 name 命中 INVALID_ENV_NAME_SET 的 environments。
 * 这些名字是历史 bug 或 AI 越界产出的脏数据（如"内"、"自然景观"），
 * 不论它们是否被 studio 引用、是否已回写 storyboard_scenes，都要清掉。
 * 唯一保护条件：environment 已生成过图（image_url / panorama_image_url / 有图变体），保留给用户。
 * 步骤：
 *   1) 先把 studios.environment_id 指向这些 env 的置空，解除 FK 约束；
 *   2) 删除 environment_variants（FK CASCADE 也会删，但显式一致）；
 *   3) 删除 environments。
 */
async function cleanupBlacklistedEnvNames(projectId, userId) {
  const names = Array.from(INVALID_ENV_NAME_SET);
  if (names.length === 0) return 0;
  try {
    const rows = await queryAll(
      `SELECT id FROM environments
       WHERE project_id = ? AND user_id = ? AND name IN (?)
             AND (image_url IS NULL OR image_url = '')
             AND (panorama_image_url IS NULL OR panorama_image_url = '')
             AND NOT EXISTS (
               SELECT 1 FROM environment_variants ev
               WHERE ev.environment_id = environments.id
                 AND (
                   (ev.image_url IS NOT NULL AND ev.image_url != '')
                   OR (ev.panorama_image_url IS NOT NULL AND ev.panorama_image_url != '')
                 )
             )`,
      [projectId, userId, names]
    );
    if (rows.length === 0) return 0;
    const envIds = rows.map(r => r.id);
    // 解除 studios 的 FK 引用
    await execute(
      `UPDATE studios SET environment_id = NULL WHERE environment_id IN (?)`,
      [envIds]
    );
    // 删除 environments（CASCADE environment_variants）
    const ret = await execute(
      `DELETE FROM environments WHERE id IN (?)`,
      [envIds]
    );
    const deleted = ret.affectedRows || envIds.length;
    console.log(`[cleanupScriptStudioAssets] 黑名单环境名强制清理: ${deleted} 条（${rows.length > 0 ? rows.map(r => r.id).join(',') : ''}）`);
    return deleted;
  } catch (err) {
    console.warn('[cleanupScriptStudioAssets] 黑名单环境清理失败（非致命）:', err.message);
    return 0;
  }
}

/**
 * 孤儿资产清理：删除本项目下"没有任何 storyboard_scenes 间接引用 且 没有图"的 studios，
 * 以及"没有任何 studio 引用 且 没有图"的 environments/buildings。
 * 这类资源是 studio_components_compose 历史 bug 留下的孤儿（如之前的"内"、"自然景观"对应 studio），
 * 保护策略：保留任何已经生成过图片（image_url / panorama_image_url）或有有图变体的资产。
 */
async function cleanupOrphanAssets(projectId, userId) {
  let studioOrphans = 0;
  let envOrphans = 0;
  let bldOrphans = 0;

  // 0) 先清孤儿 studios —— 没被任何 storyboard_scenes 直接或间接引用、且没图的 studios。
  //    这类 studios 是 compose 回写失败的历史残留，它们还把 environment_id 指着脏 env，
  //    会导致第 1 步的孤儿 environment 清理（LEFT JOIN studios s.id IS NULL）失效。
  try {
    const ret = await execute(
      `DELETE s FROM studios s
       LEFT JOIN storyboard_scenes ss_direct ON ss_direct.studio_id = s.id
       LEFT JOIN studio_states st ON st.studio_id = s.id
       LEFT JOIN storyboard_scenes ss_state ON ss_state.studio_state_id = st.id
       WHERE s.project_id = ? AND s.user_id = ?
             AND ss_direct.storyboard_id IS NULL
             AND ss_state.storyboard_id IS NULL`,
      [projectId, userId]
    );
    studioOrphans = ret.affectedRows || 0;
    if (studioOrphans > 0) {
      console.log(`[cleanupScriptStudioAssets] 孤儿 studios 清理: ${studioOrphans} 条`);
    }
  } catch (err) {
    console.warn('[cleanupScriptStudioAssets] 清理孤儿 studios 失败（非致命）:', err.message);
  }

  try {
    const ret = await execute(
      `DELETE e FROM environments e
       LEFT JOIN studios s ON s.environment_id = e.id
       WHERE e.project_id = ? AND e.user_id = ? AND s.id IS NULL
             AND (e.image_url IS NULL OR e.image_url = '')
             AND (e.panorama_image_url IS NULL OR e.panorama_image_url = '')
             AND NOT EXISTS (
               SELECT 1 FROM environment_variants ev
               WHERE ev.environment_id = e.id
                 AND (
                   (ev.image_url IS NOT NULL AND ev.image_url != '')
                   OR (ev.panorama_image_url IS NOT NULL AND ev.panorama_image_url != '')
                 )
             )`,
      [projectId, userId]
    );
    envOrphans = ret.affectedRows || 0;
  } catch (err) {
    console.warn('[cleanupScriptStudioAssets] 清理孤儿 environments 失败（非致命）:', err.message);
  }

  try {
    const ret = await execute(
      `DELETE b FROM buildings b
       LEFT JOIN studio_building_links sbl ON sbl.building_id = b.id
       WHERE b.project_id = ? AND b.user_id = ? AND sbl.id IS NULL
             AND (b.image_url IS NULL OR b.image_url = '')`,
      [projectId, userId]
    );
    bldOrphans = ret.affectedRows || 0;
  } catch (err) {
    console.warn('[cleanupScriptStudioAssets] 清理孤儿 buildings 失败（非致命）:', err.message);
  }

  return { envOrphans, bldOrphans };
}

async function cleanupScriptStudioAssets(scriptId, projectId, userId) {
  if (!scriptId || !projectId) {
    return { studiosDeleted: 0, environmentsDeleted: 0, buildingsDeleted: 0 };
  }

  // 兜底清理：无论主流程走到哪一步，都会在末尾调用 —— 确保黑名单名字（"内"、"自然景观"等）
  // 强制清理 + 孤儿资产清理，覆盖历史脏数据和 compose 回写失败的残留。
  const runFallbackCleanup = async () => {
    let blacklisted = 0;
    let envOrphans = 0;
    let bldOrphans = 0;
    try {
      blacklisted = await cleanupBlacklistedEnvNames(projectId, userId);
    } catch (err) {
      console.warn('[cleanupScriptStudioAssets] 黑名单清理失败（非致命）:', err.message);
    }
    try {
      const ret = await cleanupOrphanAssets(projectId, userId);
      envOrphans = ret.envOrphans || 0;
      bldOrphans = ret.bldOrphans || 0;
    } catch (err) {
      console.warn('[cleanupScriptStudioAssets] 孤儿清理失败（非致命）:', err.message);
    }
    return { blacklisted, envOrphans, bldOrphans };
  };

  // 1) 本 script 的 storyboards
  const sbRows = await queryAll(
    'SELECT id FROM storyboards WHERE script_id = ?',
    [scriptId]
  );
  const sbIds = sbRows.map(r => r.id);
  if (sbIds.length === 0) {
    // 无历史分镜时仍要跑兜底清理（黑名单 + 孤儿）
    const { blacklisted, envOrphans, bldOrphans } = await runFallbackCleanup();
    console.log(`[cleanupScriptStudioAssets] scriptId=${scriptId} 无历史分镜，兜底清理: blacklisted=${blacklisted}, envOrphans=${envOrphans}, bldOrphans=${bldOrphans}`);
    return { studiosDeleted: 0, environmentsDeleted: blacklisted + envOrphans, buildingsDeleted: bldOrphans };
  }

  // 2) 候选 studio_ids：本 script 的 storyboard_scenes 引用的 studio
  //    同时通过 studio_state_id 反查（兼容 studio_id 列未回写的情况）
  const candidateStudioSet = new Set();

  const directRows = await queryAll(
    `SELECT DISTINCT studio_id FROM storyboard_scenes
     WHERE storyboard_id IN (?) AND studio_id IS NOT NULL`,
    [sbIds]
  );
  directRows.forEach(r => r.studio_id && candidateStudioSet.add(r.studio_id));

  const stateRows = await queryAll(
    `SELECT DISTINCT ss.studio_id
     FROM storyboard_scenes sbs
     JOIN studio_states ss ON ss.id = sbs.studio_state_id
     WHERE sbs.storyboard_id IN (?)`,
    [sbIds]
  );
  stateRows.forEach(r => r.studio_id && candidateStudioSet.add(r.studio_id));

  // 也把"没有被分镜引用、但归属于本项目且 description 首句来自本 script 描述"的孤儿加入 —
  // 这类场景：compose 创建了 studio 但 storyboard_scenes 回写失败。
  // 判定过于激进会误伤，这里不纳入，仅以分镜引用为准。

  if (candidateStudioSet.size === 0) {
    // 没有直接/间接引用的 studio，也要跑兜底清理
    const { blacklisted, envOrphans, bldOrphans } = await runFallbackCleanup();
    console.log(`[cleanupScriptStudioAssets] scriptId=${scriptId} 无候选 studio，兜底清理: blacklisted=${blacklisted}, envOrphans=${envOrphans}, bldOrphans=${bldOrphans}`);
    return { studiosDeleted: 0, environmentsDeleted: blacklisted + envOrphans, buildingsDeleted: bldOrphans };
  }

  // 3) 排除"仍被其他 script 的 storyboards 引用"的 studio
  const candidateStudioIds = Array.from(candidateStudioSet);
  const stillUsedDirect = await queryAll(
    `SELECT DISTINCT studio_id FROM storyboard_scenes sbs
     JOIN storyboards sb ON sb.id = sbs.storyboard_id
     WHERE sbs.studio_id IN (?) AND sb.script_id != ?`,
    [candidateStudioIds, scriptId]
  );
  const stillUsedState = await queryAll(
    `SELECT DISTINCT ss.studio_id
     FROM storyboard_scenes sbs
     JOIN storyboards sb ON sb.id = sbs.storyboard_id
     JOIN studio_states ss ON ss.id = sbs.studio_state_id
     WHERE ss.studio_id IN (?) AND sb.script_id != ?`,
    [candidateStudioIds, scriptId]
  );
  const stillUsedSet = new Set();
  stillUsedDirect.forEach(r => stillUsedSet.add(r.studio_id));
  stillUsedState.forEach(r => stillUsedSet.add(r.studio_id));

  const exclusiveStudioIds = candidateStudioIds.filter(id => !stillUsedSet.has(id));
  if (exclusiveStudioIds.length === 0) {
    // 候选全部被其他 script 复用，没有独占 studio 可删；仍跑兜底清理
    const { blacklisted, envOrphans, bldOrphans } = await runFallbackCleanup();
    console.log(`[cleanupScriptStudioAssets] scriptId=${scriptId} 无独占 studio，兜底清理: blacklisted=${blacklisted}, envOrphans=${envOrphans}, bldOrphans=${bldOrphans}`);
    return { studiosDeleted: 0, environmentsDeleted: blacklisted + envOrphans, buildingsDeleted: bldOrphans };
  }

  // 4) 收集这些 studio 关联的 environment_id 和 building_id
  const studioRows = await queryAll(
    `SELECT id, environment_id FROM studios WHERE id IN (?) AND project_id = ?`,
    [exclusiveStudioIds, projectId]
  );
  const envCandidateSet = new Set();
  studioRows.forEach(r => {
    if (r.environment_id) envCandidateSet.add(r.environment_id);
  });

  const buildingLinkRows = await queryAll(
    `SELECT DISTINCT building_id FROM studio_building_links WHERE studio_id IN (?)`,
    [exclusiveStudioIds]
  );
  const buildingCandidateSet = new Set();
  buildingLinkRows.forEach(r => r.building_id && buildingCandidateSet.add(r.building_id));

  // 5) 删除 studios（CASCADE: studio_states / studio_building_links / scenes.studio_id SET NULL /
  //    storyboard_scenes.studio_id CASCADE / studios.environment_id 本身是 FK 不 CASCADE env）
  const delRet = await execute(
    `DELETE FROM studios WHERE id IN (?)`,
    [exclusiveStudioIds]
  );
  const studiosDeleted = delRet.affectedRows || exclusiveStudioIds.length;

  // 6) 清理 environments：候选中排除仍被其他 studio 引用的
  let environmentsDeleted = 0;
  if (envCandidateSet.size > 0) {
    const envIds = Array.from(envCandidateSet);
    const stillEnvRows = await queryAll(
      `SELECT DISTINCT environment_id FROM studios
       WHERE environment_id IN (?) AND environment_id IS NOT NULL`,
      [envIds]
    );
    const stillEnvSet = new Set(stillEnvRows.map(r => r.environment_id));
    const orphanEnvIds = envIds.filter(id => !stillEnvSet.has(id));
    if (orphanEnvIds.length > 0) {
      const ret = await execute(
        `DELETE FROM environments WHERE id IN (?) AND project_id = ?`,
        [orphanEnvIds, projectId]
      );
      environmentsDeleted = ret.affectedRows || orphanEnvIds.length;
    }
  }

  // 7) 清理 buildings：候选中排除仍被其他 studio 引用的
  let buildingsDeleted = 0;
  if (buildingCandidateSet.size > 0) {
    const bIds = Array.from(buildingCandidateSet);
    const stillBldRows = await queryAll(
      `SELECT DISTINCT building_id FROM studio_building_links WHERE building_id IN (?)`,
      [bIds]
    );
    const stillBldSet = new Set(stillBldRows.map(r => r.building_id));
    const orphanBldIds = bIds.filter(id => !stillBldSet.has(id));
    if (orphanBldIds.length > 0) {
      const ret = await execute(
        `DELETE FROM buildings WHERE id IN (?) AND project_id = ?`,
        [orphanBldIds, projectId]
      );
      buildingsDeleted = ret.affectedRows || orphanBldIds.length;
    }
  }

  // 8) 额外清理：黑名单环境名强制清理 + 孤儿 environments / buildings（兜底历史脏数据）
  try {
    const { blacklisted, envOrphans, bldOrphans } = await runFallbackCleanup();
    environmentsDeleted += (blacklisted + envOrphans);
    buildingsDeleted += bldOrphans;
  } catch (err) {
    console.warn('[cleanupScriptStudioAssets] 兜底清理失败（非致命）:', err.message);
  }

  console.log(`[cleanupScriptStudioAssets] scriptId=${scriptId} 清理: studios=${studiosDeleted}, environments=${environmentsDeleted}, buildings=${buildingsDeleted}`);

  return { studiosDeleted, environmentsDeleted, buildingsDeleted };
}

module.exports = cleanupScriptStudioAssets;

