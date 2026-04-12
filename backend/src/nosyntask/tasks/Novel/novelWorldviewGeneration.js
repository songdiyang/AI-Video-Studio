/**
 * 小说世界观生成任务处理器
 */

const { queryOne, execute } = require('../../../dbHelper');
const { callAIModel } = require('../../../aiModelService');

/**
 * 主处理函数
 * @param {Object} inputParams - 任务输入参数
 * @param {Function} onProgress - 进度回调
 */
async function handleNovelWorldviewGeneration(inputParams, onProgress) {
  const {
    projectId,
    projectName,
    projectDescription,
    genre,
    modelName
  } = inputParams;

  console.log(`[NovelWorldviewGen] 开始生成世界观: ${projectName}`);

  if (onProgress) onProgress(10);

  // 获取默认模型
  const textModel = modelName || await getDefaultTextModel();
  if (!textModel) {
    throw new Error('没有可用的文本模型');
  }

  // 构建提示词
  const prompt = buildWorldviewPrompt({
    projectName,
    projectDescription,
    genre
  });

  if (onProgress) onProgress(30);

  // 调用AI生成
  const result = await callAIModel(textModel, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    max_tokens: 4000
  });

  if (onProgress) onProgress(80);

  const worldView = extractContent(result);
  if (!worldView || worldView.trim().length < 100) {
    throw new Error('生成的世界观内容过短或为空');
  }

  // 保存到数据库
  const existing = await queryOne('SELECT id FROM novel_projects WHERE project_id = ?', [projectId]);
  if (existing) {
    await execute(
      'UPDATE novel_projects SET world_view = ?, updated_at = NOW() WHERE project_id = ?',
      [worldView, projectId]
    );
  } else {
    await execute(
      'INSERT INTO novel_projects (project_id, world_view) VALUES (?, ?)',
      [projectId, worldView]
    );
  }

  if (onProgress) onProgress(100);

  console.log('[NovelWorldviewGen] 世界观生成完成');

  return {
    projectId,
    worldView,
    length: worldView.length
  };
}

/**
 * 构建世界观生成提示词
 */
function buildWorldviewPrompt({ projectName, projectDescription, genre }) {
  let prompt = `你是一位专业的小说世界观设计师。请为以下小说设计一个详细的世界观。\n\n`;

  prompt += `小说名称：${projectName}\n`;
  
  if (projectDescription) {
    prompt += `小说描述：${projectDescription}\n`;
  }

  if (genre) {
    prompt += `小说类型：${genre}\n`;
  }

  prompt += `\n请从以下几个方面设计世界观：\n\n`;

  prompt += `1. **时代背景**
描述故事发生的时代（古代/现代/未来/架空等），以及这个时代的主要特征。\n\n`;

  prompt += `2. **地理环境**
描述故事发生的主要地域、气候特点、地形地貌等自然环境。\n\n`;

  prompt += `3. **社会结构**
描述社会的政治体制、社会阶层、权力结构、法律制度等。\n\n`;

  prompt += `4. **文化习俗**
描述这个世界的语言、宗教、节日、礼仪、传统等文化元素。\n\n`;

  prompt += `5. **特殊设定**
描述这个世界的魔法系统、科技水平、超自然现象、特殊规则等（如果有）。\n\n`;

  prompt += `6. **主要势力或组织**
描述这个世界中的重要势力、组织、门派、国家等。\n\n`;

  prompt += `7. **历史背景**
简要描述这个世界的历史发展脉络，以及影响当前局势的重大历史事件。\n\n`;

  prompt += `要求：
- 字数控制在800-1500字
- 内容要具体、有细节，避免空泛的描述
- 各个部分之间要有逻辑关联，形成统一的世界观
- 语言风格要符合小说的整体基调
- 使用Markdown格式，用##标记各个部分标题`;

  return prompt;
}

/**
 * 获取默认文本模型
 */
async function getDefaultTextModel() {
  const model = await queryOne(
    "SELECT name FROM ai_model_configs WHERE category = 'TEXT' AND is_active = 1 ORDER BY id ASC LIMIT 1"
  );
  return model?.name;
}

/**
 * 从AI响应中提取内容
 */
function extractContent(result) {
  if (typeof result === 'string') return result;
  if (result?.content) return result.content;
  if (result?.choices?.[0]?.message?.content) return result.choices[0].message.content;
  if (result?.text) return result.text;
  return '';
}

module.exports = handleNovelWorldviewGeneration;
