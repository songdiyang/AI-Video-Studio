/**
 * 项目上下文查询模块
 *
 * 为 AI 助手 planner 提供当前项目的完整资产状态摘要，
 * 让 LLM 理解项目处于什么阶段，从而正确消解歧义指令。
 *
 * 返回结构：
 *   {
 *     project: { id, name, description, type, art_style },
 *     scripts:     [{ id, episode_number, title, status, scene_count }],
 *     characters:  [{ id, name, has_views, generation_status, active_state }],
 *     scenes:      [{ id, name, has_image, generation_status }],
 *     storyboards: [{ id, idx, has_description, has_first_frame, has_last_frame, has_video }],
 *     stage: 'empty' | 'has_script' | 'has_storyboard_text' | 'has_storyboard_images' | 'has_video'
 *   }
 */

const { queryAll, queryOne } = require('../../dbHelper');

async function getProjectContext(projectId) {
  if (!projectId) return null;

  // 并发查询所有资产
  const [project, scripts, characters, scenes, storyboards] = await Promise.all([
    // 项目基本信息
    queryOne(
      `SELECT id, name, description, type, 
              JSON_UNQUOTE(JSON_EXTRACT(settings_json, '$.artStyle')) as art_style
       FROM projects WHERE id = ?`,
      [projectId]
    ),
    // 剧本列表（含拆分的场景数）
    queryAll(
      `SELECT s.id, s.episode_number, s.title, s.status,
              (SELECT COUNT(*) FROM storyboards sb WHERE sb.script_id = s.id) as scene_count
       FROM scripts s WHERE s.project_id = ? ORDER BY s.episode_number`,
      [projectId]
    ),
    // 角色列表（含三视图状态和活跃状态）
    queryAll(
      `SELECT c.id, c.name, c.description,
              c.front_view_url, c.side_view_url, c.back_view_url,
              c.image_url, c.generation_status,
              (SELECT cs.name FROM character_states cs 
               WHERE cs.character_id = c.id AND cs.is_active = 1 LIMIT 1) as active_state_name,
              (SELECT cs.generation_status FROM character_states cs 
               WHERE cs.character_id = c.id AND cs.is_active = 1 LIMIT 1) as active_state_gen_status
       FROM characters c WHERE c.project_id = ? ORDER BY c.id`,
      [projectId]
    ),
    // 场景列表（环境/地点）
    queryAll(
      `SELECT id, name, description, image_url, sketch_url, generation_status
       FROM scenes WHERE project_id = ? ORDER BY id`,
      [projectId]
    ),
    // 分镜列表（含素材生成状态）
    queryAll(
      `SELECT id, idx, script_id, description, 
              first_frame_url, last_frame_url, video_url,
              first_frame_prompt, last_frame_prompt, video_prompt,
              status
       FROM storyboards WHERE project_id = ? ORDER BY idx`,
      [projectId]
    )
  ]);

  if (!project) return null;

  // 推算项目阶段
  const hasScript = scripts.some(s => s.status === 'completed');
  const hasStoryboardText = storyboards.length > 0 && storyboards.some(s => s.description);
  const hasStoryboardImages = storyboards.some(s => s.first_frame_url || s.last_frame_url);
  const hasVideo = storyboards.some(s => s.video_url);

  let stage = 'empty';
  if (hasVideo) stage = 'has_video';
  else if (hasStoryboardImages) stage = 'has_storyboard_images';
  else if (hasStoryboardText) stage = 'has_storyboard_text';
  else if (hasScript) stage = 'has_script';

  // 统计摘要
  const totalStoryboards = storyboards.length;
  const storyboardsWithImages = storyboards.filter(s => s.first_frame_url).length;
  const storyboardsWithVideo = storyboards.filter(s => s.video_url).length;
  const charsWithViews = characters.filter(c => c.front_view_url && c.side_view_url && c.back_view_url).length;
  const scenesWithImages = scenes.filter(s => s.image_url).length;

  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      type: project.type,
      art_style: project.art_style
    },
    scripts: scripts.map(s => ({
      id: s.id,
      episode_number: s.episode_number,
      title: s.title,
      status: s.status,
      scene_count: s.scene_count
    })),
    characters: characters.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description ? String(c.description).slice(0, 60) : null,
      has_views: !!(c.front_view_url && c.side_view_url && c.back_view_url),
      has_image: !!(c.image_url),
      generation_status: c.generation_status,
      active_state: c.active_state_name || null,
      active_state_gen_status: c.active_state_gen_status || null
    })),
    scenes: scenes.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description ? String(s.description).slice(0, 60) : null,
      has_image: !!(s.image_url),
      has_sketch: !!(s.sketch_url),
      generation_status: s.generation_status
    })),
    storyboards: storyboards.map(s => ({
      id: s.id,
      idx: s.idx,
      script_id: s.script_id,
      has_description: !!(s.description),
      has_first_frame: !!(s.first_frame_url),
      has_last_frame: !!(s.last_frame_url),
      has_video: !!(s.video_url),
      has_prompts: !!(s.first_frame_prompt || s.last_frame_prompt)
    })),
    stage,
    summary: {
      script_count: scripts.length,
      completed_scripts: scripts.filter(s => s.status === 'completed').length,
      character_count: characters.length,
      characters_with_views: charsWithViews,
      scene_count: scenes.length,
      scenes_with_images: scenesWithImages,
      storyboard_count: totalStoryboards,
      storyboards_with_images: storyboardsWithImages,
      storyboards_with_video: storyboardsWithVideo
    }
  };
}

/**
 * 将项目上下文转为 LLM 可读的文本摘要
 */
function formatContextForPrompt(ctx) {
  if (!ctx) return '';

  const lines = [];

  // 项目概览
  lines.push(`\n【当前项目】${ctx.project.name}${ctx.project.description ? '：' + ctx.project.description : ''}`);
  if (ctx.project.art_style) lines.push(`画风：${ctx.project.art_style}`);

  // 项目阶段
  const stageLabels = {
    'empty': '空项目（无剧本、无分镜）',
    'has_script': '已有剧本，但尚未拆分/生成分镜',
    'has_storyboard_text': '已拆分分镜文本，但尚未生成分镜图片',
    'has_storyboard_images': '已生成部分分镜图片，但尚未生成视频',
    'has_video': '已有部分视频生成'
  };
  lines.push(`\n【项目阶段】${stageLabels[ctx.stage] || ctx.stage}`);

  // 资产统计
  const s = ctx.summary;
  lines.push(`\n【资产统计】`);
  lines.push(`- 剧本：${s.script_count} 个（已完成 ${s.completed_scripts} 个）`);
  lines.push(`- 角色：${s.character_count} 个（已生成三视图 ${s.characters_with_views} 个）`);
  lines.push(`- 场景：${s.scene_count} 个（已生成场景图 ${s.scenes_with_images} 个）`);
  lines.push(`- 分镜：${s.storyboard_count} 个（已生成图片 ${s.storyboards_with_images} 个，已生成视频 ${s.storyboards_with_video} 个）`);

  // 角色清单
  if (ctx.characters.length > 0) {
    const charList = ctx.characters.map(c => {
      const flags = [];
      if (c.has_views) flags.push('三视图✓');
      if (c.has_image) flags.push('形象图✓');
      if (c.active_state) flags.push(`当前状态:${c.active_state}`);
      const status = flags.length > 0 ? `[${flags.join(' ')}]` : '[未生成]';
      return `  ${c.name}(ID:${c.id}) ${status}${c.description ? ' - ' + c.description : ''}`;
    }).join('\n');
    lines.push(`\n【角色清单】\n${charList}`);
  }

  // 场景清单
  if (ctx.scenes.length > 0) {
    const sceneList = ctx.scenes.map(sc => {
      const flags = [];
      if (sc.has_image) flags.push('场景图✓');
      if (sc.has_sketch) flags.push('草图✓');
      const status = flags.length > 0 ? `[${flags.join(' ')}]` : '[未生成]';
      return `  ${sc.name}(ID:${sc.id}) ${status}${sc.description ? ' - ' + sc.description : ''}`;
    }).join('\n');
    lines.push(`\n【场景(地点)清单】\n${sceneList}`);
  }

  // 剧本清单
  if (ctx.scripts.length > 0) {
    const scriptList = ctx.scripts.map(sc => {
      return `  第${sc.episode_number}集《${sc.title || '未命名'}》(ID:${sc.id}) [${sc.status}] 已拆${sc.scene_count}个分镜`;
    }).join('\n');
    lines.push(`\n【剧本清单】\n${scriptList}`);
  }

  // 分镜清单（只给前20个的摘要，避免过长）
  if (ctx.storyboards.length > 0) {
    const showCount = Math.min(ctx.storyboards.length, 20);
    const sbList = ctx.storyboards.slice(0, showCount).map(sb => {
      const flags = [];
      if (sb.has_description) flags.push('描述✓');
      if (sb.has_prompts) flags.push('提示词✓');
      if (sb.has_first_frame) flags.push('首帧✓');
      if (sb.has_last_frame) flags.push('尾帧✓');
      if (sb.has_video) flags.push('视频✓');
      const status = flags.length > 0 ? `[${flags.join(' ')}]` : '[空]';
      return `  第${sb.idx + 1}个(ID:${sb.id}) ${status}`;
    }).join('\n');
    lines.push(`\n【分镜状态（前${showCount}个）】\n${sbList}`);
    if (ctx.storyboards.length > showCount) {
      lines.push(`  ...还有 ${ctx.storyboards.length - showCount} 个分镜`);
    }
  }

  return lines.join('\n');
}

module.exports = { getProjectContext, formatContextForPrompt };
