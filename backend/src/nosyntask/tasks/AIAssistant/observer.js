/**
 * AI 助手 - 观察与汇总任务（Observer）
 *
 * 输入：
 *   - reply_text: string | null   planner 直接回复（无工具调用时）
 *   - invocations: Array          executor 返回的子 workflow 执行结果
 *   - tool_calls: Array           planner 的原始工具调用（用于生成更友好的汇总）
 *   - textModel: string           用于生成汇总回复的模型
 *   - message:    string          用户原始消息（供二次生成上下文）
 *
 * 输出 result_data:
 *   {
 *     final_reply: string,    // 给用户看的最终回复
 *     summary: {
 *       total, succeeded, failed, tool_details[]
 *     }
 *   }
 *
 * MVP 策略：
 *   - 无工具调用 → 直接返回 planner 的 reply_text
 *   - 有工具调用 → 基于 invocations 生成结构化汇总（不再二次调 LLM，节省成本）
 *   - 失败 tool 会明确提示错误
 */

const TOOL_DISPLAY_NAMES = {
  // 角色
  generate_character_views: '生成角色三视图',
  generate_character_state_views: '生成角色状态三视图',
  generate_costume_views: '生成服装设定图',
  generate_character_concept_breakdown: '生成角色概念分解图',
  // 场景/影棚
  generate_scene_image: '生成场景图片',
  extract_scene_elements: '抽取场景元素',
  generate_scene_element: '生成场景元素图',
  generate_environment_image: '生成环境氛围图',
  generate_building_image: '生成建筑结构图',
  generate_studio_nine_grid: '生成影棚九宫图',
  generate_variant_faces: '生成环境变体8方位图',
  extract_studio_components: '拆分影棚组件',
  compose_studio_from_script: '组装影棚',
  analyze_character_image: '角色图片视觉分析',
  analyze_environment_image: '环境图片视觉分析',
  analyze_building_image: '建筑图片视觉分析',
  analyze_studio_image: '影棚图片视觉分析',
  // 分镜
  generate_storyboards: '智能拆分生成分镜',
  generate_storyboards_batch: '批量生成分镜',
  generate_frames_batch: '批量生成首尾帧',
  generate_frames_parallel: '并发生成首尾帧',
  generate_frame: '生成单分镜首尾帧',
  generate_single_frame: '生成单分镜单帧',
  generate_scene_video: '生成分镜视频',
  generate_videos_batch: '批量生成分镜视频',
  analyze_frame_image: '分镜图片视觉分析',
  // 提示词优化
  optimize_storyboard_prompts: '优化分镜提示词',
  optimize_image_prompts: '优化图片提示词',
  optimize_video_prompts: '优化视频提示词',
  optimize_single_storyboard_prompt: '优化单个分镜提示词',
  optimize_single_image_prompt: '优化单个分镜图片提示词',
  optimize_single_video_prompt: '优化单个分镜视频提示词',
  // 道具
  generate_prop_views: '生成道具设定图',
  extract_script_props: '提取剧本道具',
  // 魔术空间
  generate_camera_frame: '视角帧生成',
  generate_magic_paint: '涂改帧生成',
  generate_hd_repair: '高清修复帧',
  // 剧本
  generate_script: '生成剧本',
  split_script: '剧本拆集',
  // 项目
  create_project: '创建项目'
};

function getToolDisplayName(toolName) {
  return TOOL_DISPLAY_NAMES[toolName] || toolName;
}

async function handleObserver(params, onProgress) {
  const {
    reply_text: replyText,
    invocations = [],
    tool_calls: toolCalls = [],
    rejected_tools: rejectedTools = []
  } = params;

  if (onProgress) onProgress(30);

  // 情况一：无工具调用，直接回传 planner 的自然语言回复
  if (!invocations.length && replyText) {
    let finalReply = replyText;
    if (rejectedTools && rejectedTools.length > 0) {
      finalReply += '\n\n（注：本轮 AI 选择了 ' + rejectedTools.length + ' 个无效工具，已自动忽略）';
    }
    if (onProgress) onProgress(100);
    return {
      final_reply: finalReply,
      summary: {
        total: 0,
        succeeded: 0,
        failed: 0,
        tool_details: []
      }
    };
  }

  // 情况二：有工具调用，基于结果生成结构化汇总
  const total = invocations.length;
  const succeeded = invocations.filter(i => i.status === 'completed').length;
  const failed = invocations.filter(i => i.status === 'failed' || i.status === 'cancelled' || i.status === 'unknown').length;

  const lines = [];
  if (succeeded === total && total > 0) {
    lines.push(`好哒！已为你完成 ${total} 项任务：`);
  } else if (succeeded > 0 && failed > 0) {
    lines.push(`已完成 ${succeeded}/${total} 项任务，其中 ${failed} 项失败：`);
  } else if (failed === total) {
    lines.push(`抱歉，${total} 项任务全部执行失败：`);
  } else {
    lines.push(`已执行 ${total} 项任务：`);
  }

  const toolDetails = [];
  for (const inv of invocations) {
    const name = getToolDisplayName(inv.toolName);
    const emoji = inv.status === 'completed' ? '✅' : (inv.status === 'failed' ? '❌' : '⚠️');
    const argSummary = Object.entries(inv.args || {})
      .filter(([k]) => /Id$/.test(k))
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    const suffix = argSummary ? ` (${argSummary})` : '';
    const errorSuffix = inv.error ? ` — ${inv.error}` : '';
    lines.push(`${emoji} ${name}${suffix}${errorSuffix}`);
    toolDetails.push({
      tool: inv.toolName,
      status: inv.status,
      childJobId: inv.childJobId,
      args: inv.args,
      error: inv.error || null
    });
  }

  if (rejectedTools && rejectedTools.length > 0) {
    lines.push('');
    lines.push(`⚠️ 另有 ${rejectedTools.length} 个工具调用参数不合法已被忽略`);
  }

  if (onProgress) onProgress(100);

  return {
    final_reply: lines.join('\n'),
    summary: {
      total,
      succeeded,
      failed,
      tool_details: toolDetails
    }
  };
}

module.exports = handleObserver;
