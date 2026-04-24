/**
 * POST /api/scenes/:id/generate-image-prompt
 *
 * 纯文本接口：根据场景信息 + 项目级视觉风格提示词，AI 生成或优化
 * 场景图片的 A 面（正打）/ B 面（反打）图像提示词。
 *
 * 入参：
 *   - textModel:   required，文本模型名
 *   - face:        'A' | 'B' | 'both'，默认 'both'
 *   - basePromptA: 可选，若存在代表"优化"模式（基于当前版本改进）
 *   - basePromptB: 可选，同上
 *   - userNote:    可选，用户对优化方向的指引
 *
 * 返回：
 *   { promptA?, promptB?, style, face }
 */

const { queryOne } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');
const { requireVisualStyle } = require('../../utils/getProjectStyle');
const { withAIBillingContext } = require('../../aiBillingContext');
const handleBaseTextModelCall = require('../../nosyntask/tasks/base/baseTextModelCall');
const sceneImageGen = require('../../nosyntask/tasks/StoryBoard/sceneImageGeneration');

const { generateScenePrompt, generateReverseScenePrompt } = sceneImageGen;

function cleanPrompt(raw) {
  if (!raw) return '';
  let prompt = (typeof raw === 'string' ? raw : (raw.content || raw.text || raw.message || '')).trim();
  if ((prompt.startsWith('"') && prompt.endsWith('"')) ||
      (prompt.startsWith("'") && prompt.endsWith("'"))) {
    prompt = prompt.slice(1, -1);
  }
  return prompt.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * 优化（refine）模式：基于现有提示词 + 用户建议 改写
 */
async function refinePrompt({
  face,
  scene,
  style,
  basePrompt,
  userNote,
  textModel,
  aFacePromptForB
}) {
  const faceLabel = face === 'B' ? 'B 面（反打 / 180° 反向视角）' : 'A 面（正打 / 主视角）';

  const reverseExtra = face === 'B' && aFacePromptForB
    ? `\n\n【A 面提示词（已生成，需保持反打轴线一致性）】\n${aFacePromptForB}\n`
    : '';

  const userNoteLine = userNote && userNote.trim()
    ? `\n\n【用户优化建议】\n${userNote.trim()}\n请在保留原始场景核心信息的前提下，按照用户建议调整。`
    : '\n\n【优化方向】\n保留原有核心语义，微调关键词顺序/细节/光影/画质描述，使提示词更精确、更利于图像模型理解，同时确保提示词质量提升。';

  const fullPrompt = `你是一个专业的图片生成提示词专家。你的任务是对"已有的${faceLabel}场景图片提示词"进行优化改写。

【输出要求】
1. 必须用英文输出
2. 使用逗号分隔的关键词格式
3. 包含：场景环境、光照效果、氛围、构图、画质描述
4. 除了排除人物的否定词外，尽量避免使用其他否定词（如 without 等）
5. 长度控制在 100-150 个单词
6. 【严格禁止】纯场景/环境图，画面中绝对不能出现任何人物、角色、人影、剪影、行人或任何人体部分
7. 在提示词开头加上 "empty scene, no people, no characters, no figures, uninhabited,"

【场景信息】
场景名称：${scene.name || '未命名'}
场景描述：${scene.description || '无'}
环境描述：${scene.environment || '无'}
光照描述：${scene.lighting || '无'}
氛围描述：${scene.mood || '无'}
项目视觉风格：${style || '写实风格'}
${reverseExtra}
【当前版本提示词】
${basePrompt}
${userNoteLine}

请直接输出优化后的英文提示词，不要包含任何解释或其他内容。`;

  const response = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel,
    temperature: 0.7
  });

  const prompt = cleanPrompt(response);
  if (!prompt) throw new Error('AI 响应为空，提示词优化失败');
  return prompt;
}

module.exports = (router) => {
  router.post('/:id/generate-image-prompt', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const sceneId = Number(req.params.id);

    try {
      const {
        textModel,
        face: rawFace = 'both',
        basePromptA,
        basePromptB,
        userNote
      } = req.body || {};

      if (!sceneId) {
        return res.status(400).json({ message: '缺少场景ID' });
      }

      if (!textModel || typeof textModel !== 'string') {
        return res.status(400).json({ message: '缺少文本模型 textModel 参数' });
      }

      const face = ['A', 'B', 'both'].includes(rawFace) ? rawFace : 'both';

      // 读场景 & 权限校验
      const scene = await queryOne('SELECT * FROM scenes WHERE id = ?', [sceneId]);
      if (!scene) {
        return res.status(404).json({ message: '场景不存在' });
      }
      if (scene.project_id) {
        const role = await getEffectiveProjectRole(userId, scene.project_id);
        if (!role || role === 'viewer') {
          return res.status(403).json({ message: '无权操作该场景' });
        }
      } else if (scene.user_id !== userId) {
        return res.status(403).json({ message: '无权操作该场景' });
      }

      if (!scene.name && !scene.description && !scene.environment) {
        return res.status(400).json({ message: '场景信息不足，至少需要场景名称、描述或环境描述之一' });
      }

      // 项目视觉风格（必填）
      const style = await requireVisualStyle(scene.project_id);

      // 在计费上下文中执行所有 AI 模型调用
      const result = await withAIBillingContext(
        {
          userId,
          projectId: scene.project_id || null,
          sourceType: 'route',
          operationKey: 'scene_image_prompt_generate',
          resourceRefs: { sceneId }
        },
        async () => {
          const inner = { style, face };

          // A 面
          if (face === 'A' || face === 'both') {
            if (basePromptA && basePromptA.trim()) {
              inner.promptA = await refinePrompt({
                face: 'A',
                scene,
                style,
                basePrompt: basePromptA.trim(),
                userNote,
                textModel
              });
            } else {
              inner.promptA = await generateScenePrompt(
                scene.name, scene.description, scene.environment,
                scene.lighting, scene.mood, style, textModel, null
              );
            }
          }

          // B 面
          if (face === 'B' || face === 'both') {
            // B 面需要一个 A 面作为轴线参考：优先使用用户刚生成/编辑的 A 面
            const aFaceForReverse = inner.promptA
              || basePromptA
              || scene.generation_prompt
              || '';

            if (basePromptB && basePromptB.trim()) {
              inner.promptB = await refinePrompt({
                face: 'B',
                scene,
                style,
                basePrompt: basePromptB.trim(),
                userNote,
                textModel,
                aFacePromptForB: aFaceForReverse
              });
            } else if (aFaceForReverse) {
              inner.promptB = await generateReverseScenePrompt(
                scene.name, scene.description, scene.environment,
                scene.lighting, scene.mood, style, textModel,
                aFaceForReverse, null
              );
            } else {
              // 兜底：没有 A 面参考时先生成 A 面再基于它生成 B 面
              const tempA = await generateScenePrompt(
                scene.name, scene.description, scene.environment,
                scene.lighting, scene.mood, style, textModel, null
              );
              inner.promptA = inner.promptA || tempA;
              inner.promptB = await generateReverseScenePrompt(
                scene.name, scene.description, scene.environment,
                scene.lighting, scene.mood, style, textModel,
                tempA, null
              );
            }
          }

          return inner;
        }
      );

      res.json({
        message: '提示词生成成功',
        sceneId,
        ...result
      });
    } catch (error) {
      console.error('[Generate Scene Image Prompt]', error);
      res.status(500).json({ message: error.message || '生成提示词失败' });
    }
  });
};
