/**
 * 批量角色状态设定图生成处理器（工作流引擎管理版）
 *
 * 在智能拆分工作流的角色提取步骤完成后执行。
 * 为每个角色的白膜状态、默认服装状态和时间状态生成设定图。
 *
 * 与旧版区别：
 *   - 旧版：角色级别生成（写入 characters 表），由 setImmediate 异步触发
 *   - 新版：状态级别生成（写入 character_states 表），由工作流引擎正式调度
 *
 * input: {
 *   charactersNeedingViews: Array<{ id, name, appearance, baseAppearance, outfitAppearance, personality, description }>,
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
 *   results: Array<{ characterId, name, stateType, success, ... }>
 * }
 */

const handleCharacterViewsGeneration = require('./characterViewsGeneration');
const { queryOne, queryAll } = require('../../../dbHelper');

/**
 * 批量角色状态设定图生成主处理函数
 */
async function handleBatchCharacterViewsGeneration(inputParams, onProgress) {
  const {
    charactersNeedingViews,
    projectId,
    imageModel,
    textModel,
    aspectRatio
  } = inputParams;

  // 1. 验证参数
  if (!Array.isArray(charactersNeedingViews) || charactersNeedingViews.length === 0) {
    console.log('[BatchCharacterViews] 无角色需要生成设定图');
    return { count: 0, completed: 0, failed: 0, skipped: 0, results: [] };
  }
  if (!imageModel) {
    console.log('[BatchCharacterViews] 未提供 imageModel，跳过设定图生成');
    return { count: 0, completed: 0, failed: 0, skipped: 0, results: [], reason: 'no_imageModel' };
  }
  if (!textModel) {
    throw new Error('textModel 参数是必需的');
  }

  console.log(`[BatchCharacterViews] 开始批量生成 ${charactersNeedingViews.length} 个角色的状态设定图`);

  // 2. 先收集所有角色需要处理的状态
  const stateTasks = [];
  for (const char of charactersNeedingViews) {
    if (!char.id) continue;
    const states = await queryAll(
      `SELECT id, name, is_base_model, gender, image_url, outfit, held_props, age_stage, appearance, state_category
       FROM character_states WHERE character_id = ? ORDER BY is_base_model DESC, id ASC`,
      [char.id]
    );
    for (const state of states) {
      stateTasks.push({ char, state });
    }
  }

  // 3. 串行处理每个状态
  const results = [];
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  const totalTasks = stateTasks.length;

  for (let i = 0; i < stateTasks.length; i++) {
    const { char, state } = stateTasks[i];
    const hasSheet = state.image_url && state.image_url.trim() !== '';

    if (hasSheet) {
      console.log(`[BatchCharacterViews] 角色 ${char.name} 的「${state.name}」设定图已存在，跳过`);
      skipped++;
      if (onProgress) onProgress(Math.round(((i + 1) / totalTasks) * 100));
      continue;
    }

    // 确定状态类型和生成参数
    const isBaseModel = state.is_base_model === 1;
    const isTimeState = state.state_category === 'time';
    const stateType = isBaseModel ? 'base_model' : (isTimeState ? 'time' : 'costume');

    console.log(`[BatchCharacterViews] [${i + 1}/${totalTasks}] 生成角色 ${char.name} 的「${state.name}」设定图...`);

    try {
      const genParams = {
        characterId: char.id,
        characterName: char.name,
        projectId,
        imageModel,
        textModel,
        isBaseModel,
        gender: state.gender || 'unknown',
        stateId: state.id
      };

      if (isBaseModel) {
        // 白膜状态：使用 baseAppearance，不叠加服装
        genParams.appearance = char.baseAppearance || char.appearance || '';
        genParams.description = char.description || '';
        genParams.personality = char.personality || '';
      } else if (isTimeState) {
        // 时间状态：使用状态自身的 appearance（已包含年龄/体型变化）
        genParams.appearance = state.appearance || char.baseAppearance || char.appearance || '';
        genParams.description = `角色在${state.age_stage || '不同阶段'}时的体貌状态`;
        genParams.personality = char.personality || '';
        genParams.ageStage = state.age_stage || '';
      } else {
        // 服装状态：使用完整 appearance + outfit
        genParams.appearance = char.appearance || '';
        genParams.description = char.description || '';
        genParams.personality = char.personality || '';
        genParams.outfit = state.outfit || char.outfitAppearance || '';
        // held_props 是 JSON 字段，从数据库读取后需要解析为字符串
        try {
          const parsed = state.held_props ? JSON.parse(state.held_props) : '';
          genParams.heldProps = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
        } catch (e) {
          genParams.heldProps = state.held_props ? String(state.held_props) : '';
        }
      }

      const result = await handleCharacterViewsGeneration(genParams, null);
      results.push({ characterId: char.id, name: char.name, stateType, stateName: state.name, success: true, ...result });
      completed++;
      console.log(`[BatchCharacterViews] ✅ 角色 ${char.name} 的「${state.name}」设定图生成完成`);
    } catch (err) {
      console.error(`[BatchCharacterViews] ❌ 角色 ${char.name} 的「${state.name}」设定图生成失败:`, err.message);
      results.push({ characterId: char.id, name: char.name, stateType, stateName: state.name, success: false, error: err.message });
      failed++;
    }

    if (onProgress) onProgress(Math.round(((i + 1) / totalTasks) * 100));
  }

  console.log(`[BatchCharacterViews] 批量完成: 总任务${totalTasks}, 成功${completed}, 失败${failed}, 跳过${skipped}`);

  return {
    count: totalTasks,
    completed,
    failed,
    skipped,
    results
  };
}

module.exports = handleBatchCharacterViewsGeneration;
