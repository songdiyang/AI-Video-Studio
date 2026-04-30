/**
 * 阶段1：从剧本拆解环境与建筑
 * 调用 AI 分析剧本中所有场景，输出环境列表 + 建筑列表，写入 DB
 *
 * input: { projectId, scriptId, textModel }
 * output: { environments: [...], buildings: [...] }
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute, queryOne } = require('../../../dbHelper');

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

任务：从剧本中识别出所有不同地点/时空的场景，每个场景需拆解为「环境」和「建筑」两组信息。

## 输出要求（严格，必须输出 JSON）

输出一个 JSON 对象，包含两个字段：
{
  "environments": [
    {
      "name": "场景名称（中文2~8字，如：蜜糖草地、林间小路）",
      "description": "一句话描述该环境的氛围/特征（中文）",
      "timeOfDay": "白昼|黄昏|夜晚|凌晨|清晨",
      "weather": "晴朗|阴天|雨天|雪天|雾天|多云",
      "lighting": "自然光|暖色调|冷色调|逆光|散射光|夜景灯光",
      "mood": "温馨|神秘|紧张|欢快|忧郁|浪漫|诡异"
    }
  ],
  "buildings": [
    {
      "name": "建筑名称（中文2~10字，如：欧式木屋、中式凉亭）",
      "description": "一句话描述外观/材质/尺寸（中文）",
      "interiorExterior": "exterior|interior|both",
      "structureType": "residential|commercial|natural|infrastructure|landmark|cultural",
      "positionHint": "前景|中景|远景|左侧|右侧|中央|背景"
    }
  ]
}

## 规则：
1. environments 数量应与剧本中的「地点数量」匹配，通常 2~6 个
2. buildings 应是该场景中出现的关键人造结构（建筑、桥梁、棚屋、门楼等），与 environments 一一或多对多关联
3. 输出 JSON 数组中的 buildings 需标注关联的环境名（用 positionHint 中的位置描述代替，不另建关联字段）
4. name 必须中文，description 必须中文
5. 直接输出 JSON，不要任何解释或 markdown 包裹

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

  const environments = Array.isArray(parsed.environments) ? parsed.environments : [];
  const buildings = Array.isArray(parsed.buildings) ? parsed.buildings : [];

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
