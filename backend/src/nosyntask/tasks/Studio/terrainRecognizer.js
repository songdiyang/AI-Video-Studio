/**
 * 地貌类型识别器
 * 使用 AI 从环境描述中识别地貌类型（如草地、沙地、溪流等）
 */

// 支持识别的主要地貌类型
const TERRAIN_TYPES = [
  // 陆地地貌
  '草地',      // 草地、草坪、草甸
  '沙地',      // 沙地、沙滩、沙漠、沙丘
  '泥土',      // 泥土、土地、土壤
  '岩石',      // 岩石、岩壁、石滩、乱石
  '山丘',      // 山丘、丘陵、小山、坡地
  '雪原',      // 雪原、雪地、白雪覆盖
  '沼泽',      // 沼泽、湿地、泥泞
  '戈壁',      // 戈壁、荒漠、砾石
  
  // 水体地貌
  '溪流',      // 溪流、小河、河流、渠
  '湖泊',      // 湖泊、湖面、池塘、潭
  '海洋',      // 海洋、海面、大海、海滩
  '瀑布',      // 瀑布、跌水、水帘
  
  // 植被地貌
  '森林',      // 森林、密林、树林、树丛
  '花海',      // 花海、花田、花丛
  '花丛',      // 花丛、花簇、灌木丛
  
  // 其他自然景观
  '洞穴',      // 洞穴、岩洞、洞窟
  '云雾',      // 云雾、雾气、云海
  '天空',      // 天空、云朵、云层
];

// 识别提示词模板
const TERRAIN_RECOGNITION_PROMPT = `你是一个地貌识别专家。请分析以下环境描述，识别其中包含的地貌类型。

支持的地貌类型：
${TERRAIN_TYPES.join('、')}

环境描述：
{description}

请严格按照以下 JSON 格式输出，不要输出任何其他内容：
{
  "terrainTypes": ["地貌类型1", "地貌类型2", ...],
  "reasoning": "简要说明识别依据"
}

规则：
1. 只识别明确存在或明显暗示的地貌，不要过度推断
2. 如果没有识别到任何地貌，返回空的 terrainTypes 数组
3. 地貌类型必须使用上述列表中的标准名称
4. 如果描述中提到"穿过草地"，则识别"草地"；如果提到"河边"，则识别"溪流"
5. 最多返回5种地貌类型，优先选择最突出的地貌`;

/**
 * 从文本中识别地貌类型（基于关键词的简单识别，不调用 AI）
 * @param {string} text - 环境描述文本
 * @returns {string[]} 识别到的地貌类型数组
 */
function recognizeTerrainByKeyword(text) {
  if (!text) return [];
  
  const found = [];
  const lowerText = text.toLowerCase();
  
  // 地貌关键词映射（包含关系的关键词）
  const terrainKeywords = {
    '草地': ['草地', '草坪', '草甸', '绿草', '青草', '草', '草原'],
    '沙地': ['沙地', '沙滩', '沙漠', '沙丘', '沙子', '沙'],
    '泥土': ['泥土', '土地', '土壤', '泥地'],
    '岩石': ['岩石', '岩壁', '石滩', '石头', '碎石', '岩石', '石', '鹅卵石'],
    '山丘': ['山丘', '丘陵', '小山', '坡地', '山坡', '山'],
    '雪原': ['雪原', '雪地', '白雪', '积雪', '雪'],
    '沼泽': ['沼泽', '湿地', '泥泞', '洼地'],
    '戈壁': ['戈壁', '砾石', '荒漠'],
    '溪流': ['溪流', '小河', '河流', '渠', '河', '小溪', '水道'],
    '湖泊': ['湖泊', '湖面', '池塘', '潭', '湖'],
    '海洋': ['海洋', '海面', '大海', '海滩', '海'],
    '瀑布': ['瀑布', '跌水', '水帘'],
    '森林': ['森林', '密林', '树林', '树丛', '林木', '树'],
    '花海': ['花海', '花田', '花丛', '花簇', '灌木'],
    '洞穴': ['洞穴', '岩洞', '洞窟', '山洞'],
    '云雾': ['云雾', '雾气', '云海'],
    '天空': ['天空', '云朵', '云层'],
  };
  
  for (const [terrain, keywords] of Object.entries(terrainKeywords)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        if (!found.includes(terrain)) {
          found.push(terrain);
        }
        break;
      }
    }
  }
  
  return found;
}

/**
 * 使用 AI 模型识别地貌类型
 * @param {Object} options - 配置选项
 * @param {string} options.description - 环境描述
 * @param {Function} options.callTextModel - 文本模型调用函数
 * @returns {Promise<{terrainTypes: string[], reasoning: string}>}
 */
async function recognizeTerrainWithAI({ description, callTextModel }) {
  if (!description) {
    return { terrainTypes: [], reasoning: '描述为空' };
  }
  
  // 先用关键词快速识别
  const keywordResults = recognizeTerrainByKeyword(description);
  
  try {
    const prompt = TERRAIN_RECOGNITION_PROMPT.replace('{description}', description);
    
    const response = await callTextModel({
      prompt,
      temperature: 0.1,
      maxTokens: 500,
    });
    
    // 解析 AI 返回的 JSON
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      // 合并关键词识别和 AI 识别的结果，去重
      const combined = [...new Set([...keywordResults, ...(result.terrainTypes || [])])];
      return {
        terrainTypes: combined,
        reasoning: result.reasoning || '',
      };
    }
  } catch (err) {
    console.error('[TerrainRecognizer] AI 识别失败，回退到关键词识别:', err.message);
  }
  
  // AI 失败时返回关键词识别结果
  return {
    terrainTypes: keywordResults,
    reasoning: '基于关键词识别',
  };
}

module.exports = {
  TERRAIN_TYPES,
  recognizeTerrainByKeyword,
  recognizeTerrainWithAI,
  TERRAIN_RECOGNITION_PROMPT,
};
