/**
 * POST /api/characters/:id/generate-image-prompt
 *
 * 纯文本接口：根据角色信息 + 项目级视觉风格提示词，AI 生成或优化
 * 角色三视图（正面/侧面/背面）图像提示词。
 *
 * 入参：
 *   - textModel:     required，文本模型名
 *   - views:         'front' | 'side' | 'back' | 'all'，默认 'all'
 *   - basePromptFront:  可选，若存在代表"优化"模式
 *   - basePromptSide:   可选，同上
 *   - basePromptBack:   可选，同上
 *   - userNote:         可选，用户对优化方向的指引
 *   - stateId:          可选，为状态生成时传入
 *
 * 返回：
 *   { promptFront?, promptSide?, promptBack?, style, views }
 */

const { queryOne } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');
const { requireVisualStyle, getBodyProportion } = require('../../utils/getProjectStyle');
const { withAIBillingContext } = require('../../aiBillingContext');
const handleBaseTextModelCall = require('../../nosyntask/tasks/base/baseTextModelCall');
const { generateViewPrompt } = require('../../nosyntask/tasks/StoryBoard/characterViewsGeneration');

function cleanPrompt(raw) {
  if (!raw) return '';
  let prompt = (typeof raw === 'string' ? raw : (raw.content || raw.text || raw.message || '')).trim();
  if ((prompt.startsWith('"') && prompt.endsWith('"')) ||
      (prompt.startsWith("'") && prompt.endsWith("'"))) {
    prompt = prompt.slice(1, -1);
  }
  return prompt.replace(/\n+/g, ', ').replace(/,\s*,/g, ',').trim();
}

/**
 * 优化（refine）模式：基于现有提示词 + 用户建议 改写
 */
async function refineViewPrompt({
  view,
  character,
  style,
  basePrompt,
  userNote,
  textModel,
  frontPromptForConsistency,
  options
}) {
  const viewLabels = { front: '正面视图', side: '侧面视图', back: '背面视图' };
  const viewAngles = {
    front: 'front view, eye-level shot, facing directly at the camera',
    side: 'side view, profile shot, turned 90 degrees to the right',
    back: 'back view, rear shot, facing completely away from the camera'
  };

  const label = viewLabels[view] || '正面视图';
  const angle = viewAngles[view] || viewAngles.front;

  // 状态级外貌组合
  // ★ 白膜模式：不叠加任何状态量（服装/发型/配饰/年龄/手持道具），外貌回退到纯净 base_appearance
  const stateParts = [];
  if (!options.isBaseModel) {
    if (options.outfit) stateParts.push(`服装: ${options.outfit}`);
    if (options.hairstyle) stateParts.push(`发型: ${options.hairstyle}`);
    if (options.accessories) stateParts.push(`配饰: ${options.accessories}`);
    if (options.ageStage) stateParts.push(`年龄阶段: ${options.ageStage}`);
    if (options.heldProps) stateParts.push(`手持道具: ${options.heldProps}`);
  }
  const baseAppearance = options.isBaseModel
    ? (character.base_appearance || character.appearance || '')
    : (character.appearance || '');
  const composedAppearance = stateParts.length > 0
    ? `${baseAppearance}${baseAppearance ? '；' : ''}${stateParts.join('；')}`
    : baseAppearance;

  // 侧面/背面时追加一致性约束
  const consistencyBlock = view !== 'front' && frontPromptForConsistency
    ? `\n\n【正面图提示词（必须保持一致性）】\n${frontPromptForConsistency}\n请确保${label}中的发型、发色、服装款式、配饰、体型、肤色等与正面图完全一致。`
    : '';

  const userNoteLine = userNote && userNote.trim()
    ? `\n\n【用户优化建议】\n${userNote.trim()}\n请在保留原始角色核心特征的前提下，按照用户建议调整。`
    : '\n\n【优化方向】\n保留原有核心语义，微调关键词顺序/细节/画质描述，使提示词更精确、更利于图像模型理解。';

  const clothingRule = options.isBaseModel
    ? `4. 【白膜模式】角色必须是裸体基础形态，不能包含任何服装、装饰品或装备，只描述人体的基本结构和面部/头发特征`
    : '4. 必须包含角色的完整外貌特征（服装、发型、体型、配饰、肤色等），越详细越好';

  const fullPrompt = `你是一个专业的角色设计图提示词专家。你的任务是对"已有的${label}提示词"进行优化改写。

【输出要求】
1. 必须用英文输出，逗号分隔的关键词格式
2. 画面中只能有一个角色，绝对不能出现多个人物、多个角度
3. 包含：single character, solo, one person, simple clean background, full body, standing pose, even soft lighting
${clothingRule}
6. 绝对不要加入任何场景、背景元素、其他人物
7. 保持中性自然表情
8. 长度控制在 80-150 个单词

【角色信息】
角色名称：${character.name || '未命名角色'}
外貌特征：${composedAppearance || '无'}
角色描述：${character.description || '无'}
项目视觉风格：${style || '动漫风格'}
${options.bodyProportionInstruction ? `体型比例要求：${options.bodyProportionInstruction}` : ''}
视角要求：${angle}
${consistencyBlock}

【当前版本提示词】
${basePrompt}
${userNoteLine}

请直接输出优化后的英文提示词，不要包含任何解释。`;

  const response = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel,
    temperature: view !== 'front' ? 0.3 : 0.7
  });

  const prompt = cleanPrompt(response);
  if (!prompt) throw new Error('AI 响应为空，提示词优化失败');
  return prompt;
}

module.exports = (router) => {
  router.post('/:id/generate-image-prompt', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const characterId = Number(req.params.id);

    try {
      const {
        textModel,
        views: rawViews = 'all',
        basePromptFront,
        basePromptSide,
        basePromptBack,
        userNote,
        stateId
      } = req.body || {};

      if (!characterId) {
        return res.status(400).json({ message: '缺少角色ID' });
      }

      if (!textModel || typeof textModel !== 'string') {
        return res.status(400).json({ message: '缺少文本模型 textModel 参数' });
      }

      // 解析需要生成哪些视图
      const validViews = ['front', 'side', 'back'];
      const targetViews = rawViews === 'all'
        ? validViews
        : String(rawViews).split(',').map(v => v.trim()).filter(v => validViews.includes(v));

      if (targetViews.length === 0) {
        return res.status(400).json({ message: 'views 参数无效，可选值: front, side, back, all' });
      }

      // 读角色 & 权限校验
      const character = await queryOne('SELECT * FROM characters WHERE id = ?', [characterId]);
      if (!character) {
        return res.status(404).json({ message: '角色不存在' });
      }
      if (character.project_id) {
        const role = await getEffectiveProjectRole(userId, character.project_id);
        if (!role || role === 'viewer') {
          return res.status(403).json({ message: '无权操作该角色' });
        }
      } else if (character.user_id !== userId) {
        return res.status(403).json({ message: '无权操作该角色' });
      }

      // 如果有 stateId，读取状态信息
      let stateData = null;
      if (stateId) {
        stateData = await queryOne('SELECT * FROM character_states WHERE id = ?', [stateId]);
      }

      // 项目视觉风格（必填）
      const style = await requireVisualStyle(character.project_id);

      // 头身比例
      const bodyProportion = character.project_id ? await getBodyProportion(character.project_id) : null;
      const bodyProportionInstruction = bodyProportion?.promptInstruction || '';

      // 构造选项
      const options = {
        isBaseModel: stateData ? Boolean(stateData.is_base_model) : false,
        gender: stateData?.gender || character.gender || 'unknown',
        outfit: stateData?.outfit || '',
        hairstyle: stateData?.hairstyle || '',
        accessories: stateData?.accessories || '',
        ageStage: stateData?.age_stage || '',
        bodyProportionInstruction,
        bodyElements: stateData?.body_elements || '',
        heldProps: stateData?.held_props || ''
      };

      // 在计费上下文中执行所有 AI 模型调用
      const result = await withAIBillingContext(
        {
          userId,
          projectId: character.project_id || null,
          sourceType: 'route',
          operationKey: 'character_image_prompt_generate',
          resourceRefs: { characterId, stateId: stateId || null }
        },
        async () => {
          const inner = { style, views: targetViews };
          let frontPromptForConsistency = basePromptFront || character.generation_prompt || '';

          // 正面视图
          if (targetViews.includes('front')) {
            if (basePromptFront && basePromptFront.trim()) {
              inner.promptFront = await refineViewPrompt({
                view: 'front',
                character,
                style,
                basePrompt: basePromptFront.trim(),
                userNote,
                textModel,
                options
              });
            } else {
              inner.promptFront = await generateViewPrompt(
                'front', character.name, character.appearance,
                character.description, style, textModel, options
              );
            }
            frontPromptForConsistency = inner.promptFront;
          }

          // 侧面视图
          if (targetViews.includes('side')) {
            if (basePromptSide && basePromptSide.trim()) {
              inner.promptSide = await refineViewPrompt({
                view: 'side',
                character,
                style,
                basePrompt: basePromptSide.trim(),
                userNote,
                textModel,
                frontPromptForConsistency,
                options
              });
            } else {
              inner.promptSide = await generateViewPrompt(
                'side', character.name, character.appearance,
                character.description, style, textModel, options
              );
            }
          }

          // 背面视图
          if (targetViews.includes('back')) {
            if (basePromptBack && basePromptBack.trim()) {
              inner.promptBack = await refineViewPrompt({
                view: 'back',
                character,
                style,
                basePrompt: basePromptBack.trim(),
                userNote,
                textModel,
                frontPromptForConsistency,
                options
              });
            } else {
              inner.promptBack = await generateViewPrompt(
                'back', character.name, character.appearance,
                character.description, style, textModel, options
              );
            }
          }

          return inner;
        }
      );

      res.json({
        message: '提示词生成成功',
        characterId,
        ...result
      });
    } catch (error) {
      console.error('[Generate Character Image Prompt]', error);
      res.status(500).json({ message: error.message || '生成提示词失败' });
    }
  });
};
