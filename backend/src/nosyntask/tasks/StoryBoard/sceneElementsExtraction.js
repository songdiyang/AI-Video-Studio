/**
 * 场景元素抽取任务
 * 从场景描述中抽取元素清单（建筑/场景），写入 scene_elements 并与场景关联
 *
 * input: {
 *   sceneId, sceneName, description, environment, lighting, mood, textModel
 * }
 *
 * output: { sceneId, elements: [{id, name, category, description, positionHint}] }
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute, queryOne, queryAll } = require('../../../dbHelper');

function tryParseJson(text) {
  if (!text) return null;
  let s = text.trim();
  // 去 markdown 代码块
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) s = fenceMatch[1].trim();
  // 截取第一个 [ 到最后一个 ]
  const first = s.indexOf('[');
  const last = s.lastIndexOf(']');
  if (first >= 0 && last > first) {
    s = s.slice(first, last + 1);
  }
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

async function handleSceneElementsExtraction(inputParams, onProgress) {
  const {
    sceneId,
    sceneName,
    description,
    environment,
    lighting,
    mood,
    textModel
  } = inputParams;

  if (!sceneId) throw new Error('缺少必要参数：sceneId');
  if (!textModel) throw new Error('textModel 参数是必需的');

  // 读取场景归属，供写入 scene_elements
  const scene = await queryOne(
    'SELECT id, user_id, project_id FROM scenes WHERE id = ?',
    [sceneId]
  );
  if (!scene) throw new Error('场景不存在');

  if (onProgress) onProgress(10);

  const prompt = `你是一位漫剧美术总监，负责把一个「场景」拆解为可独立建模的元素清单，供 AI 分别绘制后再拼接成全景。

场景信息：
名称：${sceneName || '未命名'}
描述：${description || '无'}
环境：${environment || '无'}
光照：${lighting || '无'}
氛围：${mood || '无'}

任务：列出 3~8 个构成该场景的关键元素。每个元素必须能独立成图（不依赖其他元素），并共同拼出完整场景。

输出要求（严格）：
1. 仅输出 JSON 数组，不要任何解释、markdown 包裹
2. 数组元素形如：
   {"name":"木屋","category":"building","description":"简洁中文外观/材质/尺寸描述","positionHint":"前景右侧"}
3. category 必须是以下之一：
   - "building"：有明显人造结构的建筑、桥梁、栅栏、门、牌坊、棚屋等
   - "scenery"：自然景物、水体、植被、道路、石块、地面装饰等
4. name 用中文 2~6 字
5. description 用中文一句话描述该元素风格/材质/尺寸
6. positionHint 用中文描述相对画面位置（如 "前景左侧"、"中景中央"、"远景山脚"）
7. 避免重复、不要输出角色/人物/动物

直接输出 JSON 数组：`;

  const response = await handleBaseTextModelCall({
    prompt,
    textModel,
    temperature: 0.3
  }, (p) => onProgress && onProgress(10 + p * 0.7));

  const content = (response.content || '').trim();
  const parsed = tryParseJson(content);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('元素抽取失败：AI 返回无法解析为 JSON 数组');
  }

  if (onProgress) onProgress(85);

  // 去重同名元素（同 project + name 复用）
  const inserted = [];
  for (let i = 0; i < parsed.length; i++) {
    const raw = parsed[i] || {};
    const name = String(raw.name || '').trim();
    if (!name) continue;
    const category = raw.category === 'building' ? 'building' : 'scenery';
    const desc = String(raw.description || '').trim();
    const positionHint = String(raw.positionHint || '').trim();

    // 同项目同名元素复用
    let existing = await queryOne(
      'SELECT * FROM scene_elements WHERE user_id = ? AND project_id = ? AND name = ? LIMIT 1',
      [scene.user_id, scene.project_id, name]
    );

    let elementId;
    if (existing) {
      elementId = existing.id;
      // 若旧元素没描述，则补齐
      if (!existing.description && desc) {
        await execute(
          'UPDATE scene_elements SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [desc, elementId]
        );
      }
    } else {
      const result = await execute(
        `INSERT INTO scene_elements
           (user_id, project_id, category, name, description, generation_status, sort_order)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
        [scene.user_id, scene.project_id, category, name, desc, i]
      );
      elementId = result.insertId;
    }

    // 建立与场景的关联（已存在则更新 position_hint）
    const link = await queryOne(
      'SELECT id FROM scene_element_links WHERE scene_id = ? AND element_id = ?',
      [sceneId, elementId]
    );
    if (link) {
      await execute(
        'UPDATE scene_element_links SET position_hint = ?, sort_order = ? WHERE id = ?',
        [positionHint, i, link.id]
      );
    } else {
      await execute(
        `INSERT INTO scene_element_links (scene_id, element_id, position_hint, sort_order)
         VALUES (?, ?, ?, ?)`,
        [sceneId, elementId, positionHint, i]
      );
    }

    inserted.push({ id: elementId, name, category, description: desc, positionHint });
  }

  if (onProgress) onProgress(100);

  return {
    sceneId,
    elements: inserted
  };
}

module.exports = handleSceneElementsExtraction;
