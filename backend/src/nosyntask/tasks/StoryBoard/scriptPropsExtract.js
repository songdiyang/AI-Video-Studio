/**
 * 从剧本提取道具
 * 调用 AI 分析剧本中所有道具，在 props 表中创建条目，并自动启动设定图生成
 *
 * input: { projectId, scriptId, textModel, imageModel }
 * output: { props: [{ id, name }] }
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

async function handleScriptPropsExtract(inputParams, onProgress) {
  const { projectId, scriptId, textModel, imageModel } = inputParams;

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

  // 获取项目的默认图片模型（如果前端未传）
  let effectiveImageModel = imageModel;
  if (!effectiveImageModel) {
    const project = await queryOne('SELECT default_image_model FROM projects WHERE id = ?', [projectId]);
    effectiveImageModel = project?.default_image_model || '';
  }

  if (onProgress) onProgress(5);

  // ---------- 调用 AI 提取道具 ----------
  const prompt = `你是一位漫剧美术总监，负责分析剧本中出现的所有道具（物品）。

剧本信息：
剧名：${script.title || '第' + script.episode_number + '集'}
集数：第${script.episode_number || 1}集
内容：
${content.substring(0, 8000)}

任务：从剧本中识别出所有出现的道具（物品），包括但不限于武器、工具、饰品、容器、魔法物品、日常用品、食物等。

## 输出要求（严格，必须输出 JSON 数组）

输出一个 JSON 数组，每个元素为一个道具对象：
[
  {
    "name": "道具名称（中文2~8字，如：魔杖、宝剑、水晶杯）",
    "description": "一句话描述该道具的外观/材质/特征（中文，30字以内）",
    "propType": "held|permanent|interactive",
    "category": "分类标签，如：武器、魔法道具、日常用品、饰品、食物"
  }
]

## 规则：
1. 只提取「具体可见的物品」，不要提取抽象概念或情感
2. 如果同一类道具在多个场景出现，只提取一次
3. propType 判定（三种类型）：
   - held：角色手持/抱着/背着/随身携带的道具，与角色动作强绑定（如角色拿着的胡萝卜、手中的花束、背上的书包）
   - permanent：场景中长期存在的固定道具，不随角色移动（如花瓣床、窗帘、水池、桌椅、路灯）
   - interactive：角色临时与之交互的道具，可拿起也可放下（如杯子、书本、钥匙、信件、食物）
4. 判定技巧：
   - 如果角色「一直拿着/背着」→ held
   - 如果是「场景布景/家具/装饰」→ permanent
   - 如果角色「拿起来用一下又放下/临时使用」→ interactive
5. name 必须中文，description 必须中文
6. 直接输出 JSON 数组，不要任何解释或 markdown 包裹

直接输出 JSON：`;

  const response = await handleBaseTextModelCall({
    prompt,
    textModel,
    temperature: 0.3,
    maxTokens: 8192
  }, (p) => onProgress && onProgress(5 + p * 0.7));

  const text = (response.content || '').trim();
  const parsed = tryParseJson(text);

  if (!parsed || !Array.isArray(parsed)) {
    throw new Error('道具提取失败：AI 返回无法解析为 JSON 数组');
  }

  const props = parsed.filter(p => p && typeof p.name === 'string' && p.name.trim());
  if (props.length === 0) {
    throw new Error('道具提取失败：未识别出任何道具');
  }

  if (onProgress) onProgress(80);

  const userId = script.user_id;
  const insertedProps = [];
  const generationJobs = [];

  // 查询该项目已存在的道具名称（避免重复创建）
  const existingProps = await queryAll(
    'SELECT name FROM props WHERE project_id = ?',
    [projectId]
  );
  const existingNames = new Set(existingProps.map(p => p.name.trim()));

  // ---------- 写入 props 表 ----------
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    const name = String(p.name || '').trim();
    if (!name) continue;
    if (existingNames.has(name)) {
      console.log('[ScriptPropsExtract] 跳过已存在道具:', name);
      continue;
    }

    const desc = String(p.description || '').trim();
    const propType = (p.propType === 'permanent' || p.propType === 'interactive' || p.propType === 'held')
      ? p.propType : 'interactive';
    const category = String(p.category || '其他').trim();

    try {
      const r = await execute(
        `INSERT INTO props
           (user_id, project_id, name, description, category, prop_type, generation_status, tags)
         VALUES (?, ?, ?, ?, ?, ?, 'idle', ?)`,
        [userId, projectId, name, desc || null, category, propType, JSON.stringify([category])]
      );
      const propId = r.insertId;
      insertedProps.push({ id: propId, name });
      existingNames.add(name);
    } catch (err) {
      console.warn('[ScriptPropsExtract] 创建道具失败:', name, err.message);
    }
  }

  if (onProgress) onProgress(90);

  // ---------- 将道具名称关联到对应分镜的 variables_json.props ----------
  const allExtractedNames = props.map(p => String(p.name || '').trim()).filter(Boolean);
  if (allExtractedNames.length > 0) {
    try {
      const storyboards = await queryAll(
        'SELECT id, prompt_template, description, variables_json FROM storyboards WHERE script_id = ?',
        [scriptId]
      );
      let linkedCount = 0;
      for (const sb of storyboards) {
        // 用分镜的描述文本匹配道具名称
        const text = (sb.prompt_template || '') + ' ' + (sb.description || '');
        let vars = {};
        try { vars = JSON.parse(sb.variables_json || '{}'); } catch { /* ignore */ }
        const existingProps = Array.isArray(vars.props) ? vars.props : [];
        const existingSet = new Set(existingProps);

        const matched = allExtractedNames.filter(name => text.includes(name) && !existingSet.has(name));
        if (matched.length > 0) {
          vars.props = [...existingProps, ...matched];
          await execute(
            'UPDATE storyboards SET variables_json = ? WHERE id = ?',
            [JSON.stringify(vars), sb.id]
          );
          linkedCount += matched.length;
          console.log('[ScriptPropsExtract] 分镜 #%s 关联道具: %s', sb.id, matched.join(', '));
        }
      }
      console.log('[ScriptPropsExtract] 共关联 %d 条道具到分镜', linkedCount);
    } catch (linkErr) {
      console.warn('[ScriptPropsExtract] 关联道具到分镜失败（非致命）:', linkErr.message);
    }
  }

  // ---------- 自动启动设定图生成 ----------
  if (effectiveImageModel && insertedProps.length > 0) {
    const { generationStartService } = require('../../../modules/generation');
    for (const prop of insertedProps) {
      try {
        const result = await generationStartService.start({
          operationKey: 'prop_views_generate',
          rawInput: {
            propId: prop.id,
            imageModel: effectiveImageModel,
            textModel
          },
          actor: { userId }
        });
        generationJobs.push({ propId: prop.id, jobId: result.jobId });
        console.log('[ScriptPropsExtract] 道具设定图生成已启动 propId=%s jobId=%s', prop.id, result.jobId);
      } catch (genErr) {
        console.warn('[ScriptPropsExtract] 启动设定图生成失败 propId=%s:', prop.id, genErr.message);
      }
    }
  }

  if (onProgress) onProgress(100);

  return {
    scriptId,
    props: insertedProps,
    generationJobs,
    skippedCount: props.length - insertedProps.length,
    summary: `已提取 ${insertedProps.length} 个新道具${generationJobs.length > 0 ? '，已启动 ' + generationJobs.length + ' 个设定图生成任务' : ''}`
  };
}

module.exports = handleScriptPropsExtract;
