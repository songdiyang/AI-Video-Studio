/**
 * AI 助手 - 角色图片视觉分析包装器
 *
 * 根据 characterId 自动获取角色的三视图和形象图，
 * 调用多模态视觉模型分析角色外貌特征。
 *
 * 输入:  { characterId, textModel }
 * 输出:  { visualDescription, characters, scene, composition, objects } | null
 */
const handleVisionFrameAnalysis = require('../StoryBoard/visionFrameAnalysis');
const { queryOne } = require('../../../dbHelper');

async function handleCharacterVisionAnalysis(params, onProgress) {
  const { characterId, textModel } = params;

  if (!characterId) throw new Error('缺少必要参数: characterId');

  const character = await queryOne(
    `SELECT c.name, c.description, c.front_view_url, c.side_view_url, c.back_view_url, c.image_url,
            cs.front_view_url AS state_front, cs.side_view_url AS state_side, cs.back_view_url AS state_back
     FROM characters c
     LEFT JOIN character_states cs ON cs.character_id = c.id AND cs.is_active = 1
     WHERE c.id = ?`,
    [characterId]
  );

  if (!character) throw new Error(`角色 ${characterId} 不存在`);

  // 收集所有可用图片（优先三视图，其次状态图，最后形象图）
  const imageUrls = [
    character.front_view_url,
    character.side_view_url,
    character.back_view_url,
    character.state_front,
    character.state_side,
    character.state_back,
    character.image_url
  ].filter(Boolean);

  if (imageUrls.length === 0) {
    return {
      visualDescription: `角色「${character.name || '未命名'}」尚未生成任何图片，无法进行视觉分析。请先生成角色三视图或形象图。`,
      characters: [],
      scene: {},
      composition: {},
      objects: []
    };
  }

  console.log(`[CharacterVisionAnalysis] 分析角色 ${characterId}: ${imageUrls.length} 张图片, 模型=${textModel || '默认'}`);

  return handleVisionFrameAnalysis({
    imageUrls,
    description: `角色名称：${character.name || '未命名'}。角色描述：${character.description || '无'}`,
    textModel
  }, onProgress);
}

module.exports = handleCharacterVisionAnalysis;
