/**
 * 工作流步骤：从分镜数据中提取环境与建筑并组装影棚
 * 
 * 逻辑：
 *   1. 从分镜 scenes 中按 location 聚合 environment/buildings/timeOfDay/weather 信息
 *   2. 创建 studios（如果不存在）+ studio_states
 *   3. 为每个 studio 创建 environment 记录（如果不存在）
 *   4. 为每个 studio 创建 building 记录（如果不存在）
 *   5. AI 生成 environment 和 building 的 generation_prompt
 *   6. 建立 studio_environment_links 和 studio_building_links 关联
 *   7. 回写 storyboard_scenes.studio_state_id
 *   8. 返回统计信息
 * 
 * input:  { scenes, projectId, scriptId, userId, textModel }
 * output: { studiosCreated, studioStatesCreated, environmentsCreated, buildingsCreated, envLinksCreated, buildingLinksCreated, promptsGenerated }
 */

const { execute, queryAll, queryOne } = require('../../../dbHelper');
const handleBaseTextModelCall = require('../base/baseTextModelCall');

// ============================================
// 提示词生成辅助函数
// ============================================

/**
 * 为环境生成英文图片提示词
 */
async function generateEnvironmentPrompt(locName, description, timeOfDay, weather, lighting, mood, textModel) {
  const prompt = `你是一个专业的图片生成提示词专家。请根据以下环境信息生成高质量的环境氛围图提示词（用于 AI 绘图工具）。

要求：
1. 提示词必须用英文输出
2. 使用逗号分隔的关键词格式
3. 包含：场景环境、光照效果、氛围、构图、画质描述
4. 长度控制在 80-120 个单词
5. 重点描述环境细节、光影效果、氛围营造
6. 严格禁止出现任何人物、角色、人影、剪影
7. 在提示词开头加上 "empty scene, no people, no characters, uninhabited,"

场景名称：${locName}
场景描述：${description || '无'}
时间段：${timeOfDay || '白天'}
天气：${weather || '晴天'}
光照：${lighting || '自然光'}
氛围：${mood || '无'}

请直接输出英文提示词，不要包含任何解释或其他内容。`;

  const response = await handleBaseTextModelCall({
    prompt,
    textModel,
    temperature: 0.7
  });

  return extractPromptFromResponse(response);
}

/**
 * 为建筑生成英文图片提示词
 */
async function generateBuildingPrompt(buildingName, description, interiorExterior, locName, textModel) {
  const ieLabel = interiorExterior === 'interior' ? '室内' : interiorExterior === 'both' ? '室内+室外' : '室外';
  const prompt = `你是一个专业的图片生成提示词专家。请根据以下建筑信息生成高质量的建筑图片提示词（用于 AI 绘图工具）。

要求：
1. 提示词必须用英文输出
2. 使用逗号分隔的关键词格式
3. 包含：建筑外观/结构、材质细节、光照、画质描述
4. 长度控制在 60-100 个单词
5. 重点描述建筑的形状、材质、风格特征
6. 严格禁止出现任何人物、角色、人影
7. 在提示词开头加上 "single isolated building, no people, no characters,"

建筑名称：${buildingName}
建筑描述：${description || '无'}
室内/室外：${ieLabel}
所属场景：${locName || '未知'}

请直接输出英文提示词，不要包含任何解释或其他内容。`;

  const response = await handleBaseTextModelCall({
    prompt,
    textModel,
    temperature: 0.7
  });

  return extractPromptFromResponse(response);
}

/**
 * 从 AI 响应中提取提示词文本
 */
function extractPromptFromResponse(response) {
  let text = '';
  if (typeof response === 'string') {
    text = response;
  } else if (response && response.content) {
    text = response.content;
  } else if (response && response.text) {
    text = response.text;
  } else if (response && response.message) {
    text = response.message;
  }

  if (!text) return null;

  // 清理
  text = text.trim();
  if ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  }
  text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  return text;
}

// ============================================
// 主 Handler
// ============================================

async function handleStudioComponentsCompose(inputParams, onProgress) {
  const { scenes, projectId, scriptId, userId, textModel } = inputParams;

  if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('缺少分镜数据（scenes 为空）');
  }
  if (!projectId || !userId) {
    throw new Error('缺少 projectId 或 userId');
  }

  console.log(`[StudioComponentsCompose] 开始处理 ${scenes.length} 个分镜，projectId=${projectId}`);
  if (onProgress) onProgress(5);

  // ============================================
  // 1. 按 location 聚合环境和建筑信息
  // ============================================
  const locationAgg = new Map();
  
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const loc = (sc.location || '').trim();
    if (!loc) continue;

    if (!locationAgg.has(loc)) {
      locationAgg.set(loc, {
        environments: new Set(),
        buildings: new Set(),
        timeOfDay: sc.timeOfDay || sc.time_of_day || '',
        weather: sc.weather || '',
        lighting: sc.lighting || '',
        mood: sc.emotion || sc.mood || '',
        descriptions: [],
        sceneIndices: []
      });
    }
    
    const agg = locationAgg.get(loc);
    
    if (sc.environment) agg.environments.add(sc.environment.trim());
    
    if (Array.isArray(sc.buildings)) {
      sc.buildings.forEach(b => {
        if (b && b.trim()) agg.buildings.add(b.trim());
      });
    }
    
    if (sc.description) agg.descriptions.push(sc.description);
    
    if (!agg.timeOfDay && (sc.timeOfDay || sc.time_of_day)) {
      agg.timeOfDay = (sc.timeOfDay || sc.time_of_day).trim();
    }
    if (!agg.weather && sc.weather) {
      agg.weather = sc.weather.trim();
    }

    if (sc.globalOrder !== undefined) {
      agg.sceneIndices.push(sc.globalOrder);
    } else if (sc.order !== undefined) {
      agg.sceneIndices.push(sc.order);
    }
  }

  console.log(`[StudioComponentsCompose] 聚合完成，共 ${locationAgg.size} 个location`);
  if (onProgress) onProgress(10);

  // ============================================
  // 2. 创建 studios + studio_states
  // ============================================
  let studiosCreated = 0;
  let studioStatesCreated = 0;
  const locationToStudioId = new Map();

  const existingStudios = await queryAll(
    'SELECT id, name FROM studios WHERE project_id = ? AND user_id = ?',
    [projectId, userId]
  );
  const studioMap = new Map(existingStudios.map(s => [s.name, s.id]));

  const newStudioRows = [];
  for (const [locName, agg] of locationAgg.entries()) {
    if (studioMap.has(locName)) {
      locationToStudioId.set(locName, studioMap.get(locName));
    } else if (!locationToStudioId.has(locName)) {
      newStudioRows.push([userId, projectId, locName, agg.descriptions[0] || '']);
      locationToStudioId.set(locName, null);
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
    console.log(`[StudioComponentsCompose] 创建 ${studiosCreated} 个 studios`);
  }

  if (onProgress) onProgress(18);

  // 2.1 创建 studio_states
  const studioStateKeyToId = new Map();
  const newStateRows = [];
  const stateRowMeta = [];

  for (const [locName, agg] of locationAgg.entries()) {
    const studioId = locationToStudioId.get(locName);
    if (!studioId) continue;

    const timeOfDay = agg.timeOfDay || '白天';
    const weather = agg.weather || '晴天';
    const stateKey = `${studioId}|${timeOfDay}|${weather}`;

    if (!studioStateKeyToId.has(stateKey)) {
      const stateName = `${timeOfDay}_${weather}`;
      newStateRows.push([
        userId, projectId, studioId, stateName, agg.descriptions[0] || '',
        timeOfDay, weather, agg.lighting || '', agg.mood || ''
      ]);
      stateRowMeta.push({ key: stateKey, studioId, locName, timeOfDay, weather });
      studioStateKeyToId.set(stateKey, null);
    }
  }

  if (newStateRows.length > 0) {
    const ret = await execute(
      `INSERT INTO studio_states (user_id, project_id, studio_id, name, description, time_of_day, weather, lighting, mood) VALUES ?`,
      [newStateRows]
    );
    const firstId = ret.insertId;
    stateRowMeta.forEach((m, idx) => {
      studioStateKeyToId.set(m.key, firstId + idx);
    });
    studioStatesCreated = newStateRows.length;
    console.log(`[StudioComponentsCompose] 创建 ${studioStatesCreated} 个 studio_states`);
  }

  if (onProgress) onProgress(25);

  // ============================================
  // 3. 查询已有的 environments、buildings
  // ============================================
  const existingEnvironments = await queryAll(
    'SELECT id, name, project_id FROM environments WHERE project_id = ? AND user_id = ?',
    [projectId, userId]
  );
  const envMap = new Map(existingEnvironments.map(e => [`${e.project_id}|${e.name}`, e.id]));

  const existingBuildings = await queryAll(
    'SELECT id, name, project_id FROM buildings WHERE project_id = ? AND user_id = ?',
    [projectId, userId]
  );
  const buildingMap = new Map(existingBuildings.map(b => [`${b.project_id}|${b.name}`, b.id]));

  if (onProgress) onProgress(28);

  // ============================================
  // 4. 创建 environments 和 buildings（先不填 generation_prompt）
  // ============================================
  let environmentsCreated = 0;
  let buildingsCreated = 0;
  const envNameToId = new Map();
  const buildingNameToId = new Map();

  // 4.1 创建 environments
  const newEnvRows = [];
  const newEnvMeta = []; // 记录 location 聚合信息，用于后续生成 prompt
  for (const [locName, agg] of locationAgg.entries()) {
    const envName = `${locName}_环境`;
    const envKey = `${projectId}|${envName}`;
    
    if (envMap.has(envKey)) {
      envNameToId.set(envName, envMap.get(envKey));
    } else if (!envNameToId.has(envName)) {
      const description = agg.descriptions[0] || '';
      newEnvRows.push([
        userId, projectId, envName, description,
        agg.timeOfDay || null,
        agg.weather || null,
        agg.lighting || null,
        agg.mood || null,
        null, // image_url
        null, // generation_prompt — 稍后 AI 生成
        'pending', // generation_status
        0 // sort_order
      ]);
      newEnvMeta.push({ locName, agg, envName });
      envNameToId.set(envName, null);
    }
  }

  if (newEnvRows.length > 0) {
    const ret = await execute(
      `INSERT INTO environments (user_id, project_id, name, description, time_of_day, weather, lighting, mood, image_url, generation_prompt, generation_status, sort_order) VALUES ?`,
      [newEnvRows]
    );
    const firstId = ret.insertId;
    newEnvRows.forEach((row, idx) => {
      envNameToId.set(row[2], firstId + idx);
      newEnvMeta[idx].envId = firstId + idx;
    });
    environmentsCreated = newEnvRows.length;
    console.log(`[StudioComponentsCompose] 创建 ${environmentsCreated} 个 environments`);
  }

  if (onProgress) onProgress(35);

  // 4.2 创建 buildings
  const newBuildingRows = [];
  const newBuildingMeta = [];
  for (const [locName, agg] of locationAgg.entries()) {
    for (const buildingName of agg.buildings) {
      const buildingKey = `${projectId}|${buildingName}`;
      
      if (buildingMap.has(buildingKey)) {
        buildingNameToId.set(buildingName, buildingMap.get(buildingKey));
      } else if (!buildingNameToId.has(buildingName)) {
        newBuildingRows.push([
          userId, projectId, buildingName,
          `${locName}场景中的建筑`,
          'exterior',
          null, // structure_type
          null, // image_url
          null, // generation_prompt — 稍后 AI 生成
          'pending',
          0
        ]);
        newBuildingMeta.push({ buildingName, locName, description: `${locName}场景中的建筑` });
        buildingNameToId.set(buildingName, null);
      }
    }
  }

  if (newBuildingRows.length > 0) {
    const ret = await execute(
      `INSERT INTO buildings (user_id, project_id, name, description, interior_exterior, structure_type, image_url, generation_prompt, generation_status, sort_order) VALUES ?`,
      [newBuildingRows]
    );
    const firstId = ret.insertId;
    newBuildingRows.forEach((row, idx) => {
      buildingNameToId.set(row[2], firstId + idx);
      newBuildingMeta[idx].buildingId = firstId + idx;
    });
    buildingsCreated = newBuildingRows.length;
    console.log(`[StudioComponentsCompose] 创建 ${buildingsCreated} 个 buildings`);
  }

  if (onProgress) onProgress(45);

  // ============================================
  // 5. AI 生成 environment 和 building 的 generation_prompt
  // ============================================
  let promptsGenerated = 0;

  if (textModel && (newEnvMeta.length > 0 || newBuildingMeta.length > 0)) {
    // 5.1 为 environments 生成提示词
    for (let i = 0; i < newEnvMeta.length; i++) {
      const meta = newEnvMeta[i];
      if (!meta.envId) continue;
      try {
        const generatedPrompt = await generateEnvironmentPrompt(
          meta.locName,
          meta.agg.descriptions[0] || '',
          meta.agg.timeOfDay,
          meta.agg.weather,
          meta.agg.lighting,
          meta.agg.mood,
          textModel
        );
        if (generatedPrompt) {
          await execute(
            'UPDATE environments SET generation_prompt = ? WHERE id = ?',
            [generatedPrompt, meta.envId]
          );
          promptsGenerated++;
          console.log(`[StudioComponentsCompose] 环境 ${meta.envName} 提示词生成完成`);
        }
      } catch (err) {
        console.error(`[StudioComponentsCompose] 环境 ${meta.envName} 提示词生成失败（非致命）:`, err.message);
      }
    }

    // 5.2 为 buildings 生成提示词
    for (let i = 0; i < newBuildingMeta.length; i++) {
      const meta = newBuildingMeta[i];
      if (!meta.buildingId) continue;
      try {
        const generatedPrompt = await generateBuildingPrompt(
          meta.buildingName,
          meta.description,
          'exterior',
          meta.locName,
          textModel
        );
        if (generatedPrompt) {
          await execute(
            'UPDATE buildings SET generation_prompt = ? WHERE id = ?',
            [generatedPrompt, meta.buildingId]
          );
          promptsGenerated++;
          console.log(`[StudioComponentsCompose] 建筑 ${meta.buildingName} 提示词生成完成`);
        }
      } catch (err) {
        console.error(`[StudioComponentsCompose] 建筑 ${meta.buildingName} 提示词生成失败（非致命）:`, err.message);
      }
    }

    console.log(`[StudioComponentsCompose] 提示词生成完成，共 ${promptsGenerated} 条`);
  } else if (!textModel) {
    console.log('[StudioComponentsCompose] 无 textModel，跳过提示词生成');
  }

  if (onProgress) onProgress(70);

  // ============================================
  // 6. 建立关联关系
  // ============================================
  let studioEnvLinksCreated = 0;
  let studioBuildingLinksCreated = 0;

  // 6.1 studio_environment_links
  const studioEnvLinkRows = [];
  for (const [locName, agg] of locationAgg.entries()) {
    const studioId = locationToStudioId.get(locName);
    if (!studioId) {
      console.warn(`[StudioComponentsCompose] 未找到studio: ${locName}，跳过关联`);
      continue;
    }

    const fullEnvName = `${locName}_环境`;
    const envId = envNameToId.get(fullEnvName);
    if (envId) {
      studioEnvLinkRows.push([studioId, envId]);
    }
  }

  if (studioEnvLinkRows.length > 0) {
    await execute(
      `INSERT IGNORE INTO studio_environment_links (studio_id, environment_id) VALUES ?`,
      [studioEnvLinkRows]
    );
    studioEnvLinksCreated = studioEnvLinkRows.length;
    console.log(`[StudioComponentsCompose] 创建 ${studioEnvLinksCreated} 条 studio_environment_links`);
  }

  if (onProgress) onProgress(80);

  // 6.2 studio_building_links
  const studioBuildingLinkRows = [];
  for (const [locName, agg] of locationAgg.entries()) {
    const studioId = locationToStudioId.get(locName);
    if (!studioId) continue;

    for (const buildingName of agg.buildings) {
      const buildingId = buildingNameToId.get(buildingName);
      if (buildingId) {
        studioBuildingLinkRows.push([studioId, buildingId]);
      }
    }
  }

  if (studioBuildingLinkRows.length > 0) {
    await execute(
      `INSERT IGNORE INTO studio_building_links (studio_id, building_id) VALUES ?`,
      [studioBuildingLinkRows]
    );
    studioBuildingLinksCreated = studioBuildingLinkRows.length;
    console.log(`[StudioComponentsCompose] 创建 ${studioBuildingLinksCreated} 条 studio_building_links`);
  }

  if (onProgress) onProgress(90);

  // ============================================
  // 7. 回写 storyboard_scenes.studio_state_id
  // ============================================
  if (scriptId) {
    try {
      const locToStateId = new Map();
      for (const [locName, agg] of locationAgg.entries()) {
        const studioId = locationToStudioId.get(locName);
        if (!studioId) continue;
        const timeOfDay = agg.timeOfDay || '白天';
        const weather = agg.weather || '晴天';
        const stateKey = `${studioId}|${timeOfDay}|${weather}`;
        const stateId = studioStateKeyToId.get(stateKey);
        if (stateId) {
          locToStateId.set(locName, stateId);
        }
      }

      const storyboardScenes = await queryAll(
        `SELECT ss.storyboard_id, ss.scene_id, s.name as scene_name
         FROM storyboard_scenes ss
         JOIN scenes s ON s.id = ss.scene_id
         JOIN storyboards sb ON sb.id = ss.storyboard_id
         WHERE sb.script_id = ?`,
        [scriptId]
      );

      let updatedCount = 0;
      for (const row of storyboardScenes) {
        const stateId = locToStateId.get(row.scene_name);
        if (stateId) {
          await execute(
            `UPDATE storyboard_scenes SET studio_state_id = ? WHERE storyboard_id = ? AND scene_id = ?`,
            [stateId, row.storyboard_id, row.scene_id]
          );
          updatedCount++;
        }
      }
      console.log(`[StudioComponentsCompose] storyboard_scenes.studio_state_id 回写 ${updatedCount} 条`);
    } catch (updateErr) {
      console.error('[StudioComponentsCompose] studio_state_id 回写失败（非致命）:', updateErr.message);
    }
  }

  if (onProgress) onProgress(100);

  console.log(`[StudioComponentsCompose] 完成 - studios: ${studiosCreated}, states: ${studioStatesCreated}, environments: ${environmentsCreated}, buildings: ${buildingsCreated}, prompts: ${promptsGenerated}, env_links: ${studioEnvLinksCreated}, building_links: ${studioBuildingLinksCreated}`);

  return {
    studiosCreated,
    studioStatesCreated,
    environmentsCreated,
    buildingsCreated,
    promptsGenerated,
    studioEnvLinksCreated,
    studioBuildingLinksCreated
  };
}

module.exports = handleStudioComponentsCompose;
