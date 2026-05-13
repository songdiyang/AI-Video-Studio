/**
 * POST /api/scripts/analyze
 * 对已有剧本进行AI结构化分析
 */

const { queryOne } = require('../../dbHelper');
const { callAIModel } = require('../../aiModelService');
const { withAIBillingContext } = require('../../aiBillingContext');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');

const WRITABLE_ROLES = new Set(['owner', 'admin', 'editor']);

async function analyzeScript(req, res) {
  const { scriptId, content: directContent } = req.body || {};
  const userId = req.user.id;

  let content = directContent;
  let scriptTitle = '未命名剧本';
  let targetScriptId = scriptId;

  try {
    // 如果传了 scriptId，从数据库读取
    if (scriptId) {
      const script = await queryOne(
        'SELECT id, user_id, project_id, title, content FROM scripts WHERE id = ?',
        [scriptId]
      );
      if (!script) {
        return res.status(404).json({ message: '剧本不存在' });
      }

      // 鉴权
      if (script.user_id !== userId) {
        const role = script.project_id
          ? await getEffectiveProjectRole(userId, script.project_id)
          : null;
        if (!role || !WRITABLE_ROLES.has(role)) {
          return res.status(403).json({ message: '无权分析该剧本' });
        }
      }

      content = script.content;
      scriptTitle = script.title || '未命名剧本';
      targetScriptId = script.id;
    }

    // 剧本内容允许为空，为空时返回友好提示
    if (!content || !content.trim()) {
      return res.json({
        success: true,
        scriptId: targetScriptId,
        analysis: {
          overallScore: 0,
          dimensions: [
            { name: "核心立意与主题", score: 0, comment: "暂无剧本内容" },
            { name: "故事结构", score: 0, comment: "暂无剧本内容" },
            { name: "人物塑造", score: 0, comment: "暂无剧本内容" },
            { name: "情节与冲突", score: 0, comment: "暂无剧本内容" },
            { name: "台词文笔", score: 0, comment: "暂无剧本内容" },
            { name: "叙事视角与节奏", score: 0, comment: "暂无剧本内容" },
            { name: "商业与落地", score: 0, comment: "暂无剧本内容" },
            { name: "细节与逻辑", score: 0, comment: "暂无剧本内容" }
          ],
          strengths: [],
          weaknesses: ["暂无剧本内容，无法进行分析"],
          suggestions: ["请先添加剧本内容后再进行分析"],
          summary: "当前剧本暂无内容，添加内容后可进行AI深度分析。"
        },
        contentLength: 0,
        message: '剧本内容为空，无法分析'
      });
    }

    // 内容截断（避免prompt过长）
    const maxContentLength = 8000;
    const truncatedContent = content.length > maxContentLength
      ? content.slice(0, maxContentLength) + '\n\n...（内容已截断，仅分析前8000字）'
      : content;

    const analysis = await performAnalysis(truncatedContent, scriptTitle);

    res.json({
      success: true,
      scriptId: targetScriptId,
      analysis,
      contentLength: content.length,
      message: '分析完成'
    });
  } catch (error) {
    console.error('[Analyze Script]', error);
    res.status(500).json({ message: '分析失败：' + error.message });
  }
}

/**
 * 执行AI分析
 */
async function performAnalysis(content, title) {
  const prompt = `你是一位资深剧本分析师。请对以下剧本进行深度结构化分析，从8个维度进行评分（0-100分）并给出点评。

## 分析维度

1. **核心立意与主题**
   - 主题深度：有没有内核？是单纯讲故事，还是有人性、社会、命运、成长的思考？
   - 立意三观：价值观是否正向、逻辑自洽，有没有价值观扭曲、强行洗白。
   - 稀缺性：主题是否老套俗套，有没有独特视角、反套路表达。
   - 情感落点：最后能不能落地到共鸣，不是空喊口号。

2. **故事结构**（最关键）
   - 叙事结构：三幕式 / 五幕式 / 环形叙事等是否规整，起承转合是否完整。
   - 节奏把控：铺垫、冲突、高潮、收尾疏密是否合理，有无拖沓、注水、强行拖集。
   - 逻辑闭环：剧情前后是否自洽，伏笔有没有回收，有没有逻辑漏洞、机械降神、强行巧合。
   - 主线 & 副线：主线是否清晰，副线是否服务主线，不抢戏、不游离。
   - 转折合理性：反转是否铺垫到位，不是为了反转而反转。

3. **人物塑造**
   - 人物弧光：主角 / 重要配角有没有成长、变化、蜕变，从头到尾一成不变是大忌。
   - 人设立体度：是否脸谱化（好人全好、坏人全坏），有无弱点、欲望、动机。
   - 行为动机：人物做每件事的动机是否合理，不被剧情牵着走。
   - 人物关系：人物之间的羁绊、冲突、情感张力是否自然可信。
   - 配角功能性：配角不是工具人，有自己的性格和存在意义。

4. **情节与冲突**
   - 冲突层级：内在冲突（内心挣扎）、人际冲突、社会冲突、宿命冲突是否多层次。
   - 情节密度：有没有无效情节、流水账、日常凑数戏。
   - 矛盾推进：冲突是否层层升级，不是原地打转。
   - 狗血程度：是否依赖误会、失忆、绝症、强行虐恋等俗套狗血套路。

5. **台词文笔**
   - 人物贴合度：每个人台词符合身份、性格、时代，一人一口味。
   - 台词质感：是否生活化不尴尬，有没有书面化、说教感、尬聊台词。
   - 潜台词：话中有话、留白、情绪克制，不是把心里话全说透。
   - 金句与表达：有无经典台词，语言有没有文学性或记忆点。

6. **叙事视角与节奏**
   - 视角选择：上帝视角 / 主角视角 / 多视角是否统一不乱跳。
   - 时空叙事：时间线、回忆、插叙、倒叙是否清晰不混乱。
   - 信息量分配：该藏的藏、该露的露，不剧透太快也不故弄玄虚。

7. **商业与落地**（影视 / 短剧必看）
   - 可拍性：场景是否太复杂、特效过多、难落地，是否省钱好拍摄。
   - 受众适配：题材、尺度、人设是否匹配目标观众。
   - 爽点 / 泪点 / 看点设计：有没有清晰的情绪钩子，每幕有无记忆点。
   - 改编适配：若是 IP 改编，是否忠于原著内核，魔改是否离谱。

8. **细节与逻辑**
   - 细节严谨：时代背景、职业常识、生活常识不翻车。
   - 伏笔埋线：前面铺垫，后面回收，结构精巧。
   - 无硬伤：没有常识错误、剧情 bug、人设崩塌。

## 输出格式

请严格返回以下JSON格式，不要包含其他文字：

{
  "overallScore": 85,
  "dimensions": [
    { "name": "核心立意与主题", "score": 88, "comment": "简要点评" },
    { "name": "故事结构", "score": 82, "comment": "简要点评" },
    { "name": "人物塑造", "score": 85, "comment": "简要点评" },
    { "name": "情节与冲突", "score": 79, "comment": "简要点评" },
    { "name": "台词文笔", "score": 76, "comment": "简要点评" },
    { "name": "叙事视角与节奏", "score": 80, "comment": "简要点评" },
    { "name": "商业与落地", "score": 72, "comment": "简要点评" },
    { "name": "细节与逻辑", "score": 83, "comment": "简要点评" }
  ],
  "strengths": ["优点1", "优点2"],
  "weaknesses": ["不足1", "不足2"],
  "suggestions": ["建议1", "建议2"],
  "summary": "总体评价（100字以内）"
}

## 剧本信息

标题：${title}
内容：
${content}`;

  // 获取第一个可用文本模型
  const textModel = await queryOne(
    "SELECT name FROM ai_model_configs WHERE category = 'TEXT' AND is_active = 1 ORDER BY id ASC LIMIT 1"
  );

  if (!textModel) {
    throw new Error('无可用文本模型');
  }

  const result = await withAIBillingContext(
    {
      userId: null, // 由调用方传入
      sourceType: 'route',
      operationKey: 'script_analyze',
      resourceRefs: {}
    },
    () => callAIModel(textModel.name, {
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
      temperature: 0.3
    })
  );

  const raw = result.content || result.text || '';

  // 提取JSON
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI返回格式异常');
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    console.error('[Analyze Script] JSON解析失败:', parseErr);
    // 尝试修复常见的JSON问题
    const cleaned = jsonMatch[0]
      .replace(/,\s*([}\]])/g, '$1') // 移除尾随逗号
      .replace(/\n/g, '\\n'); // 处理换行
    return JSON.parse(cleaned);
  }
}

module.exports = analyzeScript;
