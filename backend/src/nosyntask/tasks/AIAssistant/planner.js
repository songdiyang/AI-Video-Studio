/**
 * AI 助手 - 规划任务（Planner）
 *
 * 输入：
 *   - message:         用户当前消息
 *   - conversation:    历史对话消息数组 [{ role, content }]
 *   - textModel:       支持 function calling 的文本模型
 *   - projectId / userId
 *
 * 输出 result_data:
 *   {
 *     reply_text: string | null,     // 最终回复（无工具调用时）
 *     tool_calls: Array<{ name, args }>,  // 本轮规划的工具调用
 *     raw_llm_response: object
 *   }
 *
 * 责任：
 *   1. 调用 LLM（带工具 schema）获取工具调用意图或直接回复
 *   2. 校验每个工具调用的参数
 *   3. 非法工具调用 → 转为 reply_text 让 observer 直接回复错误
 */

const { callAIModel } = require('../../../aiModelService');
const { getToolsSchema, validateToolCall } = require('../../../modules/ai-assistant/toolRegistry');
const { getProjectContext, formatContextForPrompt } = require('../../../modules/ai-assistant/projectContext');

const BASE_SYSTEM_PROMPT = `你是一个 AI 创作助手，可以调用工具帮用户完成漫画/短剧的创作任务（生成角色、生成场景、生成分镜、生成图片等）。

## 基础规则
1. 用户问题如果能直接回答（比如咨询、解释概念），就直接用自然语言回复，不要调用工具。
2. 用户请求具体的生成操作时，选择合适的工具并填写正确参数。一次可以并发调用多个工具（比如同时生成多个角色的三视图）。
3. 所有 ID（characterId、sceneId、scriptId 等）必须是数字，而且必须基于下方【项目上下文】提供的真实资源。不要编造 ID。
4. 如果缺少必要信息（比如用户说"生成所有角色的三视图"但没有明确是哪些角色），结合下方【角色清单】中的信息自行补全；如果完全无法确定，再用 reply 形式询问用户。
5. 语气友好自然，用中文回复。

## 可用工具清单
你可以调用以下工具帮用户完成创作任务：

【角色】
- generate_character_views: 生成角色白膜三视图
- generate_character_state_views: 生成角色特定状态三视图
- generate_costume_views: 生成服装设定图
- generate_character_concept_breakdown: 生成角色概念分解图

【场景/影棚】
- generate_scene_image: 生成场景图片
- extract_scene_elements: 从场景抽取元素清单
- generate_scene_element: 生成场景元素立绘
- generate_environment_image: 生成环境氛围图
- generate_building_image: 生成建筑结构图
- generate_studio_nine_grid: 生成影棚九宫组装图
- generate_variant_faces: 生成环境变体8方位图
- extract_studio_components: 从剧本拆分影棚组件
- compose_studio_from_script: 从剧本组装影棚
- analyze_character_image: 对角色三视图/形象图进行视觉分析（识别外貌特征）
- analyze_environment_image: 对环境氛围图进行视觉分析（识别场景特征）
- analyze_building_image: 对建筑结构图进行视觉分析（识别建筑风格）
- analyze_studio_image: 对影棚九宫图进行视觉分析（识别布局和组合）

【分镜】
- generate_storyboards: 智能拆分生成分镜文本
- generate_storyboards_batch: 批量分镜生成（按场景并行）
- generate_frames_batch: 批量生成首尾帧（串行，保持连贯性）
- generate_frames_parallel: 并发生成首尾帧（独立模式）
- generate_frame: 单个分镜生成首尾帧
- generate_single_frame: 单个分镜生成单帧
- generate_scene_video: 单个分镜生成视频
- generate_videos_batch: 批量生成分镜视频
- analyze_frame_image: 对指定分镜的首尾帧进行多模态视觉分析，识别角色外貌、场景环境、构图等（需分镜已有图片）

【提示词优化】
- optimize_storyboard_prompts: 批量优化分镜提示词
- optimize_image_prompts: 批量优化图片提示词
- optimize_video_prompts: 批量优化视频提示词
- optimize_single_storyboard_prompt: 优化单个分镜的提示词文本（自动读取当前提示词）
- optimize_single_image_prompt: 优化单个分镜的图片提示词（多模态增强版）
- optimize_single_video_prompt: 优化单个分镜的视频提示词

【道具】
- generate_prop_views: 生成道具设定图
- extract_script_props: 从剧本提取道具

【魔术空间】
- generate_camera_frame: 视角帧生成（旋转/缩放/扩图）
- generate_magic_paint: 涂改帧生成（颜色涂抹修改）
- generate_hd_repair: 高清修复帧

【剧本】
- generate_script: 生成新剧本
- split_script: 剧本拆集

【项目】
- create_project: 创建新项目。当用户说"帮我创建一个项目"、"我想做一部新动画"、"开始一个新故事"等意图时调用。参数：name(项目名称), description(项目描述), type(项目类型: comic/short_drama/animation/live_action/game)。创建成功后，后续操作可以基于返回的新 projectId 继续执行。

## 歧义消解规则（核心）
用户说的同一句话在不同项目阶段含义完全不同，你必须根据【项目阶段】和【资产统计】来理解用户意图：

| 用户说的话 | 项目还没有分镜文本时 | 已有分镜文本但没图片时 | 已有分镜图片时 |
|---|---|---|---|
| "生成分镜" | → 从剧本拆分分镜（generate_storyboards / generate_storyboards_batch）| → 生成分镜的首尾帧图片（generate_frames_batch）| → 询问用户：是重新生成图片，还是生成视频？ |
| "生成图片" | → 询问：生成什么图片？角色三视图？场景图？ | → 生成分镜的首尾帧图片 | → 同左 |
| "生成角色" | → 询问：是新建角色还是生成已有角色的三视图？ | → 同左 | → 同左 |
| "优化提示词" | → 提示用户先生成分镜 | → 优化分镜提示词（optimize_storyboard_prompts）| → 同左 |
| "生成影棚" | → 从剧本拆分环境与建筑（extract_studio_components）| → 组装影棚（compose_studio_from_script）| → 生成影棚九宫图（generate_studio_nine_grid）|

**当你不确定用户意图时，必须用自然语言回复询问用户，而不是猜测调用工具。**
列出你理解的 2-3 种可能操作，让用户选择。例如：
"您说的「生成分镜」，在当前项目状态下可能是指：\n1. 生成分镜的图片（首尾帧）\n2. 重新从剧本拆分分镜文本\n请问您想执行哪个操作？"`;

async function handlePlanner(params, onProgress) {
  const {
    message,
    conversation = [],
    textModel,
    projectId,
    userId
  } = params;

  if (!message) throw new Error('planner: 缺少 message');
  if (!textModel) throw new Error('planner: 缺少 textModel');

  if (onProgress) onProgress(5);

  // 查询项目完整状态，注入到 system prompt 让 LLM 理解项目阶段
  let contextText = '';
  try {
    const projectCtx = await getProjectContext(projectId);
    if (projectCtx) {
      contextText = formatContextForPrompt(projectCtx);
      console.log(`[AIAssistant.Planner] 项目上下文已加载: stage=${projectCtx.stage}, ` +
        `chars=${projectCtx.summary.character_count}, scenes=${projectCtx.summary.scene_count}, ` +
        `storyboards=${projectCtx.summary.storyboard_count}`);
    }
  } catch (e) {
    console.warn('[AIAssistant.Planner] 获取项目上下文失败，将使用无上下文模式:', e.message);
  }

  if (onProgress) onProgress(10);

  const systemPrompt = contextText
    ? BASE_SYSTEM_PROMPT + '\n\n' + contextText
    : BASE_SYSTEM_PROMPT;

  const tools = getToolsSchema({ projectId });

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversation,
    { role: 'user', content: message }
  ];

  console.log(`[AIAssistant.Planner] 规划开始: model=${textModel}, tools=${tools.length}`);
  if (onProgress) onProgress(30);

  // 调 LLM，传入 tools。aiModelService 会根据模型类型映射到对应厂商格式
  let response;
  try {
    response = await callAIModel(textModel, {
      messages,
      tools,
      tool_choice: 'auto',
      maxTokens: 2048,
      temperature: 0.7
    });
  } catch (e) {
    console.error('[AIAssistant.Planner] LLM 调用失败:', e.message);
    throw new Error(`规划阶段调用模型失败: ${e.message}`);
  }

  if (onProgress) onProgress(80);

  // 解析 LLM 响应：可能有 tool_calls 也可能只有 content
  const toolCallsRaw = response?.tool_calls || response?.toolCalls || [];
  const replyText = (response?.content || response?.text || '').trim();

  const toolCalls = [];
  const rejectedTools = [];

  for (const raw of toolCallsRaw) {
    const toolName = raw.function?.name || raw.name;
    const rawArgs = raw.function?.arguments || raw.arguments || raw.args;
    const validation = validateToolCall(toolName, rawArgs);
    if (validation.valid) {
      toolCalls.push({
        name: toolName,
        args: validation.args
      });
    } else {
      rejectedTools.push({ name: toolName, error: validation.error });
      console.warn(`[AIAssistant.Planner] 工具调用被拒: ${toolName}, 原因: ${validation.error}`);
    }
  }

  if (onProgress) onProgress(100);

  const result = {
    reply_text: toolCalls.length > 0 ? null : (replyText || '我没有理解您的需求，能再说一遍吗？'),
    tool_calls: toolCalls,
    rejected_tools: rejectedTools,
    raw_llm_response: {
      content: replyText,
      toolCallCount: toolCallsRaw.length
    }
  };

  console.log(`[AIAssistant.Planner] 规划完成: tool_calls=${toolCalls.length}, 直接回复=${!!result.reply_text}`);

  return result;
}

module.exports = handlePlanner;
