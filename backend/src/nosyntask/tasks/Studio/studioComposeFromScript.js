/**
 * 阶段2：从剧本拼接影棚
 * 调用 AI 根据剧本场景描述 + 已有的 environments/buildings，组装为影棚并绑定关系
 *
 * input: { projectId, scriptId, textModel }
 * output: { studios: [...] }
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute, queryOne, queryAll } = require('../../../dbHelper');

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

async function handleStudioComposeFromScript(inputParams, onProgress) {
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

  // 查询已拆分的环境和建筑
  const environments = await queryAll(
    'SELECT * FROM environments WHERE user_id = ? AND project_id = ? ORDER BY sort_order ASC',
    [script.user_id, projectId]
  );
  const buildings = await queryAll(
    'SELECT * FROM buildings WHERE user_id = ? AND project_id = ? ORDER BY sort_order ASC',
    [script.user_id, projectId]
  );

  if (environments.length === 0) {
    throw new Error('请先执行「拆分环境与建筑」');
  }

  if (onProgress) onProgress(5);

  // ---------- 调用 AI 拼接 ----------
  const envSummary = environments.map((e, i) =>
    `${i + 1}. ${e.name}（${e.weather || ''}${e.time_of_day || ''}${e.lighting ? '，' + e.lighting : ''}，${e.mood || ''}）`
  ).join('\n');

  const bldSummary = buildings.map((b, i) =>
    `${i + 1}. ${b.name}（${b.description || ''}，${b.interior_exterior || ''}）`
  ).join('\n');

  const prompt = `你是一位漫剧美术总监，负责将「环境」和「建筑」组装为一个个「影棚」，每个影棚代表剧本中的一个完整地点场景。

剧本信息：
剧名：${script.title || '第' + script.episode_number + '集'}
集数：第${script.episode_number || 1}集
内容：
${content.substring(0, 6000)}

已有资源：
【环境】
${envSummary}

【建筑】
${bldSummary || '（暂无建筑）'}

任务：根据剧本场景描述，为每个环境匹配合适的建筑，组装成「影棚」。影棚是环境 + 建筑的组合单元。

## 输出要求（严格，必须输出 JSON）

输出一个 JSON 数组，每个元素代表一个影棚：
[
  {
    "studioName": "影棚名称（中文2~10字，如：蜜糖草地小屋、林间石桥）",
    "description": "一句话描述影棚的构成与氛围（中文）",
    "environmentId": 环境在列表中的序号（1-based）,
    "buildingIds": [对应的建筑在列表中的序号（1-based），可多个或空数组]
  }
]

## 规则：
1. 每个影棚必须关联一个 environment（必选）
2. buildingIds 为空数组表示仅有环境无建筑
3. 输出 JSON 数组，不要任何解释或 markdown 包裹
4. studioName 建议格式：「环境名+建筑名」或「环境名+位置」

直接输出 JSON 数组：`;

  const response = await handleBaseTextModelCall({
    prompt,
    textModel,
    temperature: 0.3,
    maxTokens: 8192
  }, (p) => onProgress && onProgress(5 + p * 0.8));

  const text = (response.content || '').trim();
  const parsed = tryParseJson(text);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('影棚组装失败：AI 返回无法解析为 JSON 数组');
  }

  if (onProgress) onProgress(88);

  const userId = script.user_id;
  const inserted = [];

  // 建立序号→ID 映射
  const envIdByIdx = new Map(environments.map((e, i) => [i + 1, e.id]));
  const bldIdByIdx = new Map(buildings.map((b, i) => [i + 1, b.id]));

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i] || {};
    const studioName = String(item.studioName || '').trim();
    if (!studioName) continue;

    const description = String(item.description || '').trim();
    const envIdx = Number(item.environmentId);
    const buildingIndices = Array.isArray(item.buildingIds) ? item.buildingIds : [];
    const environmentId = envIdByIdx.get(envIdx);

    if (!environmentId) continue;

    const r = await execute(
      `INSERT INTO studios (user_id, project_id, name, description, environment_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, projectId, studioName, description || null, environmentId, i]
    );
    const studioId = r.insertId;

    // 关联建筑
    for (const idx of buildingIndices) {
      const bldId = bldIdByIdx.get(Number(idx));
      if (bldId) {
        await execute(
          `INSERT INTO studio_building_links (studio_id, building_id, sort_order)
           VALUES (?, ?, 0)
           ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)`,
          [studioId, bldId]
        );
      }
    }

    inserted.push({ id: studioId, name: studioName, environmentId });
  }

  if (onProgress) onProgress(100);

  return {
    scriptId,
    studios: inserted,
    summary: `已组装 ${inserted.length} 个影棚`
  };
}

module.exports = handleStudioComposeFromScript;
