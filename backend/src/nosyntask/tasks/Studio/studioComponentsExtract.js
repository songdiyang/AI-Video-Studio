/**
 * 阶段1：从剧本拆解环境与建筑
 * 调用 AI 分析剧本中所有场景，输出环境列表 + 建筑列表，写入 DB
 *
 * input: { projectId, scriptId, textModel }
 * output: { environments: [...], buildings: [...] }
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute, queryOne } = require('../../../dbHelper');
const {
  sanitizeEnvName: sharedSanitizeEnvName,
  sanitizeEnvDescription: sharedSanitizeEnvDescription,
  isInvalidEnvName,
} = require('./environmentDescriptionSanitizer');

function tryParseJson(text) {
  if (!text) return null;
  let s = text.trim();
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) s = fenceMatch[1].trim();
  const first = s.indexOf('[');
  const last = s.lastIndexOf(']');
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  try { return JSON.parse(s); } catch (_) { return null; }
}

// ============================================
// AI 返回数据清洗：去建筑、去角色、去重、合并
// 规则统一使用 environmentDescriptionSanitizer 共享模块
// ============================================

/** 从环境名中剔除建筑名和连接词（走共享模块） */
function sanitizeEnvName(name, buildingNames) {
  return sharedSanitizeEnvName(name, buildingNames);
}

/** 清洗环境描述：去建筑、去角色（走共享模块） */
function sanitizeEnvDescription(description, buildingNames) {
  return sharedSanitizeEnvDescription(description, buildingNames);
}

/** 判断两个环境名称是否指向同一环境 */
function isSameEnvironment(nameA, nameB) {
  const a = String(nameA || '').replace(/[_\-]/g, '').trim();
  const b = String(nameB || '').replace(/[_\-]/g, '').trim();
  if (a === b) return true;
  // 包含关系：如 "蜜糖草地" 包含 "草地"
  if (a.length > 2 && b.length > 2 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

/** 判断两个建筑名称是否指向同一建筑 */
function isSameBuilding(nameA, nameB) {
  const a = String(nameA || '').replace(/[_\-]/g, '').trim();
  const b = String(nameB || '').replace(/[_\-]/g, '').trim();
  return a === b;
}

/** 主清洗函数：对 AI 返回的 environments + buildings 进行清洗、去重、合并 */
function sanitizeExtractedData(rawEnvironments, rawBuildings) {
  // 1. 先提取建筑名（用于清洗环境）
  const buildingNames = (rawBuildings || [])
    .map(b => String(b.name || '').trim())
    .filter(Boolean);

  // 2. 清洗每个环境
  const cleanedEnvs = (rawEnvironments || []).map(e => ({
    ...e,
    name: sanitizeEnvName(e.name, buildingNames),
    description: sanitizeEnvDescription(e.description, buildingNames),
  }));

  // 3. 环境去重合并（保留最完整的描述）
  const uniqueEnvs = [];
  for (const env of cleanedEnvs) {
    const existing = uniqueEnvs.find(e => isSameEnvironment(e.name, env.name));
    if (existing) {
      // 合并描述：取较长且不为空的那一个
      if (env.description && env.description.length > (existing.description || '').length) {
        existing.description = env.description;
      }
      // 合并属性：优先保留非空值
      if (!existing.timeOfDay && env.timeOfDay) existing.timeOfDay = env.timeOfDay;
      if (!existing.weather && env.weather) existing.weather = env.weather;
      if (!existing.lighting && env.lighting) existing.lighting = env.lighting;
      if (!existing.mood && env.mood) existing.mood = env.mood;
    } else {
      uniqueEnvs.push({ ...env });
    }
  }

  // 4. 建筑去重
  const uniqueBuildings = [];
  for (const b of (rawBuildings || [])) {
    if (!b.name) continue;
    const existing = uniqueBuildings.find(x => isSameBuilding(x.name, b.name));
    if (!existing) {
      uniqueBuildings.push({ ...b });
    }
  }

  // 5. 二次清洗：确保环境名中没有建筑名（因为建筑列表也可能有变化）
  const finalBuildingNames = uniqueBuildings.map(b => b.name);
  for (const env of uniqueEnvs) {
    env.name = sanitizeEnvName(env.name, finalBuildingNames);
    env.description = sanitizeEnvDescription(env.description, finalBuildingNames);
  }

  return { environments: uniqueEnvs, buildings: uniqueBuildings };
}

async function handleStudioComponentsExtract(inputParams, onProgress) {
  const { projectId, scriptId, textModel } = inputParams;

  if (!projectId) throw new Error('缺少 projectId');
  if (!scriptId) throw new Error('缺少 scriptId');
  if (!textModel) throw new Error('缺少 textModel');

  const script = await queryOne(
    'SELECT * FROM scripts WHERE id = ? AND user_id = (SELECT user_id FROM projects WHERE id = ?)',
    [scriptId, projectId]
  );
  if (!script) throw new Error('剧本不存在或无权访问');
  const content = (script.content || '').trim();
  if (!content) throw new Error('剧本内容为空');

  if (onProgress) onProgress(5);

  // ---------- 调用 AI 拆解 ----------
  const prompt = `你是一位漫剧美术总监，负责分析剧本中所有场景，拆解出「环境」和「建筑」两类组件，供后续 AI 拼接影棚。

剧本信息：
剧名：${script.title || '第' + script.episode_number + '集'}
集数：第${script.episode_number || 1}集
内容：
${content.substring(0, 6000)}

任务：从剧本中识别出所有不同地点/时空的场景，严格拆解为「环境」和「建筑」两组独立信息。

## 环境（Environment）定义
环境是**纯粹的自然场景基底**，只能描述自然景观与自然现象本身，**绝对禁止**包含以下任何内容：
- ❌ 任何人物/角色（如主角、小孩、少女、老人、他、她、"自己"等）
- ❌ 任何动物/拟人动物（如小熊、小兔、小猫、小鹿、小松鼠、鸟儿等，哪怕是背景中"飞过"、"奔跑"的也不行）
- ❌ 任何建筑、室内空间、人造结构（屋、房、桥、亭、塔、墙、门、窗、路、栏杆、桌椅等）
- ❌ 任何角色动作/活动（走、跑、看、站、坐、躺、跳、蹦、转身、低头、踩、触摸等）
- ❌ 任何人类视角表达（"看到"、"听见"、"眼前"、"前方"若与人物绑定也要避免）

**环境描述只能包含**：
- ✅ 自然地貌（草地、溪流、沙滩、山丘、雪原、湖泊、花海、森林、岩石、泥土等）
- ✅ 植物（树木、花朵、荷叶、草、藤蔓、枝叶等，但不得拟人化）
- ✅ 自然现象（风、光线、云、雨雪、雾气、阳光穿透等）
- ✅ 色彩、材质、空间感、氛围（暖色调、湿润、清冷、宁静等）

### 正反示例
- ✅ 正确的环境名：蜜糖草地、林间小溪、金色沙滩、雪原、山丘、湖泊、花海、枫树林
- ✅ 正确的环境描述：一条淡蓝色溪流蜿蜒穿过草地，水面漂浮着圆形荷叶，岸边长满彩色浆果，晨光透过枝叶洒落。
- ❌ 错误的环境名：蜜糖草地小屋、木屋前、卧室、石桥旁、宫殿广场
- ❌ 错误的环境描述：小熊沿着小路蹦蹦跳跳着往前走，低头看到自己的脚踩过鹅卵石（含角色"小熊"+动作"沿着/低头/踩过"）

## 建筑（Building）定义
建筑是场景中出现的**关键人造结构**，如：小屋、桥梁、棚屋、门楼、宫殿、亭台、石塔等。

## 输出要求（严格，必须输出 JSON）

输出一个 JSON 对象，包含两个字段：
{
  "environments": [
    {
      "name": "环境名称（中文2~8字，必须是纯粹自然场景，如：蜜糖草地、林间小路、溪边石滩）",
      "description": "一句话描述该自然环境的氛围/特征（中文，只能有自然景观/植物/光线/色彩/氛围，严禁出现人、动物、建筑、动作、人称代词）",
      "timeOfDay": "白昼|黄昏|夜晚|凌晨|清晨",
      "weather": "晴朗|阴天|雨天|雪天|雾天|多云",
      "lighting": "自然光|暖色调|冷色调|逆光|散射光|夜景灯光",
      "mood": "温馨|神秘|紧张|欢快|忧郁|浪漫|诡异"
    }
  ],
  "buildings": [
    {
      "name": "建筑名称（中文2~10字，如：欧式木屋、中式凉亭、石板小桥）",
      "description": "一句话描述外观/材质/尺寸（中文）",
      "interiorExterior": "exterior|interior|both",
      "structureType": "residential|commercial|natural|infrastructure|landmark|cultural",
      "positionHint": "前景|中景|远景|左侧|右侧|中央|背景"
    }
  ]
}

## 规则：
1. environments 数量应与剧本中的「自然地点数量」匹配，通常 2~6 个
2. **环境名称严禁包含建筑词**：如"屋、房、室、厅、楼、阁、桥、亭、塔"等必须归入 buildings
3. **环境描述严禁出现任何人或动物**：无论是主角、配角、背景群众、背景动物、鸟兽虫鱼都不允许出现在 environments[].description 中；它们的活动应在其他层处理，environments 只负责描绘无生命的自然基底
4. buildings 应是该场景中出现的关键人造结构，与 environments 一一或多对多关联
5. 输出 JSON 数组中的 buildings 需标注关联的环境名（用 positionHint 中的位置描述代替，不另建关联字段）
6. name 必须中文，description 必须中文
7. 直接输出 JSON，不要任何解释或 markdown 包裹

直接输出 JSON：`;

  const response = await handleBaseTextModelCall({
    prompt,
    textModel,
    temperature: 0.3,
    maxTokens: 8192
  }, (p) => onProgress && onProgress(5 + p * 0.8));

  const text = (response.content || '').trim();
  const parsed = tryParseJson(text);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('剧本拆解失败：AI 返回无法解析为 JSON 对象');
  }

  let environments = Array.isArray(parsed.environments) ? parsed.environments : [];
  let buildings = Array.isArray(parsed.buildings) ? parsed.buildings : [];

  // ---- 强制清洗：去建筑、去角色、去重、合并 ----
  const sanitized = sanitizeExtractedData(environments, buildings);
  environments = sanitized.environments;
  buildings = sanitized.buildings;

  if (environments.length === 0 && buildings.length === 0) {
    throw new Error('剧本拆解失败：未识别出任何环境或建筑');
  }

  if (onProgress) onProgress(88);

  const userId = script.user_id;
  const insertedEnvs = [];
  const insertedBlds = [];

  // ---------- 写入 environments ----------
  for (let i = 0; i < environments.length; i++) {
    const e = environments[i] || {};
    const name = String(e.name || '').trim();
    if (!name) continue;
    // 二次校验：命中黑名单（"内"、"外"、"自然景观" 等场景标记/泛化词）直接跳过
    if (isInvalidEnvName(name)) {
      console.warn(`[StudioComponentsExtract] 跳过无效环境名: "${name}"`);
      continue;
    }
    const desc = String(e.description || '').trim();
    const timeOfDay = String(e.timeOfDay || '').trim();
    const weather = String(e.weather || '').trim();
    const lighting = String(e.lighting || '').trim();
    const mood = String(e.mood || '').trim();

    const r = await execute(
      `INSERT INTO environments
         (user_id, project_id, name, description, time_of_day, weather, lighting, mood, generation_status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [userId, projectId, name, desc || null, timeOfDay || null, weather || null, lighting || null, mood || null, i]
    );
    insertedEnvs.push({ id: r.insertId, name });
  }

  // ---------- 写入 buildings ----------
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i] || {};
    const name = String(b.name || '').trim();
    if (!name) continue;
    const desc = String(b.description || '').trim();
    const interiorExterior = ['interior', 'exterior', 'both'].includes(b.interiorExterior)
      ? b.interiorExterior : 'exterior';
    const structureType = String(b.structureType || 'residential').trim();

    const r = await execute(
      `INSERT INTO buildings
         (user_id, project_id, name, description, interior_exterior, structure_type, generation_status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [userId, projectId, name, desc || null, interiorExterior, structureType, i]
    );
    insertedBlds.push({ id: r.insertId, name });
  }

  if (onProgress) onProgress(100);

  return {
    scriptId,
    environments: insertedEnvs,
    buildings: insertedBlds,
    summary: `已拆解 ${insertedEnvs.length} 个环境，${insertedBlds.length} 个建筑`
  };
}

module.exports = handleStudioComponentsExtract;
