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
const { isInvalidEnvName } = require('./environmentDescriptionSanitizer');

// ============================================
// 环境数据清洗辅助函数
// ============================================

/** 常见建筑关键词，用于从环境名/描述中剔除 */
const BUILDING_KEYWORDS = ['屋', '房', '室', '厅', '楼', '阁', '桥', '亭', '塔', '殿', '榭', '廊', '庙', '堡', '窑', '棚', '舍', '坞', '巢'];

/** 常见角色动作模式，用于过滤环境描述中的角色活动 */
const ROLE_ACTION_PATTERNS = [
  /[^，。]*(?:沿着|站在|坐在|躺在|走在|跑向|看向|望着|跳着|蹦着|转身|回头|抬头|低头|蹲下|趴下|伸手|指着|抱着|拉着|推着|背着)[^，。]*[，。]?/g,
  /[^，。]*(?:小熊|小兔|小猫|小狗|小狐狸|小刺猬|小鹿|小松鼠|小猴子|小熊猫)[^，。]*[，。]?/g,
];

/** 清洗环境描述：去建筑、去角色 */
function sanitizeEnvDescription(description, buildingNames) {
  let result = String(description || '').trim();
  // 去掉包含建筑名的片段
  for (const bName of buildingNames || []) {
    if (!bName) continue;
    const escaped = bName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`[^，。]*${escaped}[^，。]*[，。]?`, 'g'), '');
  }
  // 去掉通用建筑关键词相关片段
  for (const kw of BUILDING_KEYWORDS) {
    result = result.replace(new RegExp(`[^，。]*${kw}[^，。]*[，。]?`, 'g'), '');
  }
  // 去掉角色动作描述
  for (const pattern of ROLE_ACTION_PATTERNS) {
    result = result.replace(pattern, '');
  }
  // 清理残留标点
  result = result.replace(/[，。]{2,}/g, '，').replace(/^[，。]+|[，。]+$/g, '').trim();
  return result;
}

/** 清洗环境名：去建筑、去连接词、去后缀 */
function sanitizeEnvName(name, buildingNames) {
  let result = String(name || '').trim();
  // 去掉 "_环境" / "环境" 后缀
  result = result.replace(/[_\-]?环境$/g, '').trim();
  // 去掉已知建筑名（全局替换）
  for (const bName of buildingNames || []) {
    if (bName && result.includes(bName)) {
      result = result.replace(new RegExp(bName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').trim();
    }
  }
  // 去掉通用建筑关键词（全局替换）
  for (const kw of BUILDING_KEYWORDS) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), '').trim();
  }
  // 清理连接词残留
  result = result.replace(/^[前後后旁侧边上边下边里外边]+/g, '').replace(/[前後后旁侧边上边下边里外边]+$/g, '').trim();
  // 清理可能产生的孤立单字（如"小木"中的"木"）
  result = result.replace(/^[木石砖瓦铁钢]+/g, '').replace(/[木石砖瓦铁钢]+$/g, '').trim();
  // 清理空字符
  result = result.replace(/[_\-]+/g, '').replace(/\s+/g, '').trim();
  return result || '自然场景';
}

// ============================================
// 提示词生成辅助函数
// ============================================

/**
 * 为环境生成英文图片提示词
 */
async function generateEnvironmentPrompt(locName, description, timeOfDay, weather, lighting, mood, textModel) {
  const prompt = `你是一个专业的图片生成提示词专家。请根据以下环境信息生成高质量的自然环境氛围图提示词（用于 AI 绘图工具）。

要求：
1. 提示词必须用英文输出
2. 使用逗号分隔的关键词格式
3. 包含：自然场景环境、光照效果、氛围、构图、画质描述
4. 长度控制在 80-120 个单词
5. 重点描述自然环境细节、光影效果、氛围营造（草地、溪流、沙地、花海、山丘、湖泊等）
6. **严格禁止出现任何建筑、房屋、桥梁、亭台、人造结构、人物、角色、人影、剪影**
7. 在提示词开头加上 "natural landscape, empty scene, no buildings, no architecture, no people, no characters, uninhabited,"

环境名称：${locName}
环境描述：${description || '无'}
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

  if (onProgress) onProgress(25);

  // 注意：studio_states 的创建与 storyboard_scenes.studio_state_id 的回写
  // 已由 save_storyboards 步骤（按 time|weather|lighting|mood 4 维 key）完成，
  // 此处不再重复插入，避免同一 studio 下出现两套状态记录。

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
  const skippedInvalidEnvs = [];
  for (const [locName, agg] of locationAgg.entries()) {
    // 环境名优先使用分镜中标注的纯粹环境名，其次尝试从 location 中剔除建筑名
    let envName = Array.from(agg.environments)[0] || locName;
    // 使用统一清洗函数：去建筑名、去连接词、去后缀
    envName = sanitizeEnvName(envName, agg.buildings);
    if (!envName) envName = sanitizeEnvName(locName, agg.buildings) || '';

    // 二次校验：命中黑名单（"内"、"外"、"自然景观" 等）或过短的直接跳过，不污染资产库
    if (isInvalidEnvName(envName)) {
      console.warn(`[StudioComponentsCompose] 跳过无效环境名: location="${locName}" envName="${envName}"`);
      skippedInvalidEnvs.push({ locName, envName });
      continue;
    }

    const envKey = `${projectId}|${envName}`;
    
    if (envMap.has(envKey)) {
      envNameToId.set(envName, envMap.get(envKey));
    } else if (!envNameToId.has(envName)) {
      // 环境描述使用统一清洗函数：去建筑、去角色
      const rawDesc = agg.descriptions[0] || '';
      let description = sanitizeEnvDescription(rawDesc, agg.buildings);
      if (!description) {
        // 兜底：用时间+天气+氛围生成简洁环境描述
        description = `${agg.timeOfDay || '白天'}，${agg.weather || '晴朗'}，${agg.mood || '宁静'}的自然场景`;
      }
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
  //    - studios.environment_id：1:1 直接回写（不存在 studio_environment_links 表）
  //    - studio_building_links：1:N 多对多
  // ============================================
  let studioEnvLinksCreated = 0;
  let studioBuildingLinksCreated = 0;

  // 6.1 回写 studios.environment_id（环境名取值与第4步一致：已 sanitize）
  for (const [locName, agg] of locationAgg.entries()) {
    const studioId = locationToStudioId.get(locName);
    if (!studioId) {
      console.warn(`[StudioComponentsCompose] 未找到studio: ${locName}，跳过关联`);
      continue;
    }

    let envName = Array.from(agg.environments)[0] || locName;
    envName = sanitizeEnvName(envName, agg.buildings);
    if (!envName) envName = sanitizeEnvName(locName, agg.buildings) || '自然场景';

    const envId = envNameToId.get(envName);
    if (envId) {
      try {
        await execute(
          `UPDATE studios SET environment_id = ? WHERE id = ? AND (environment_id IS NULL OR environment_id != ?)`,
          [envId, studioId, envId]
        );
        studioEnvLinksCreated++;
      } catch (err) {
        console.warn(`[StudioComponentsCompose] 回写 studio.environment_id 失败: studioId=${studioId}, envId=${envId}`, err.message);
      }
    }
  }
  console.log(`[StudioComponentsCompose] studios.environment_id 回写 ${studioEnvLinksCreated} 条`);

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
  // 7. storyboard_scenes.studio_state_id 的回写由 save_storyboards 负责，此处不再处理
  // ============================================

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
