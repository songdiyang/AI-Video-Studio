/**
 * 智能体动作目录：自动执行 / 需确认 / 人工触发的唯一口径。
 *
 * 之前同一份动作清单散落在四处（系统提示词、ChatMessage 的自动执行集、
 * helpers 的内联回执集、面板的手动动作集），新增或删除动作时必然漏改一处：
 * 典型症状是动作被隐藏了按钮却根本没人执行（静默丢失），或用户点一次按钮
 * 触发了两次创建。这里把「能不能自动跑」「跑了要不要确认」集中定义，
 * 面板、聊天气泡与提示词都从这里取。
 */

/** 不可逆动作：删除类，执行后无法从界面撤销，必须由用户显式确认 */
export const IRREVERSIBLE_ACTIONS: ReadonlySet<string> = new Set([
  'delete_scene',
  'delete_script',
  'delete_character',
  'delete_character_state',
  'delete_base_model',
  'delete_studio',
  'delete_prop',
  'delete_location',
]);

/**
 * 只能由用户手动触发的动作：
 * - dismiss / optimize_script / reanalyze_script 依赖当前界面上下文，智能体不该代按；
 * - optimize_prompt / upload_material 必须落在分镜卡片上操作，自动触发只会空转。
 */
export const MANUAL_ONLY_ACTIONS: ReadonlySet<string> = new Set([
  'dismiss',
  'optimize_script',
  'reanalyze_script',
  'optimize_prompt',
  'upload_material',
]);

/**
 * 智能体循环可自动执行的动作（不含 ask：提问由循环单独处理并暂停）。
 * 增删动作时先确认 useAIAssistantBridge / AIAssistantPanel 里确有实现，
 * 否则会回到「隐藏了按钮却没人执行」的老问题。
 */
export const AGENT_AUTO_ACTIONS: ReadonlySet<string> = new Set([
  // 分镜生成、只读核验与编辑
  'generate_frame',
  'generate_video',
  'auto_storyboard',
  'insert_scene',
  'update_scene',
  'update_scene_dialogues',
  'update_scene_characters_location',
  'update_scene_props',
  'move_scene',
  'reorder_scenes',
  'inspect_quality',
  'read_storyboards',
  'view_image',
  'query_media_info',
  'get_task_status',
  // 角色库
  'create_character',
  'update_character',
  'create_character_state',
  'update_character_state',
  'generate_base_model',
  // 场景库 / 道具库 / 分镜地点
  'create_studio',
  'update_studio',
  'generate_studio_nine_grid',
  'create_prop',
  'update_prop',
  'generate_prop_image',
  'create_location',
  'update_location',
  // 剧本
  'create_script',
  'update_script',
  'generate_script',
  'read_script',
  'bind_script',
  'switch_episode',
  'cast_writer',
  // 工程设置与临时覆盖
  'update_project',
  'get_project_settings',
  'update_project_settings',
  'set_temp_art_style',
  'clear_temp_art_style',
  'set_temp_writer',
  'clear_temp_writer',
  // 记忆
  'remember',
  'forget',
  'list_memories',
]);

/** 气泡里不显示操作按钮的动作：自动执行的 + ask（有专用提问卡片） */
export const NO_BUTTON_ACTIONS: ReadonlySet<string> = new Set([...AGENT_AUTO_ACTIONS, 'ask']);

/** 结构化回执需要落进对话的动作（toast 会消失，删除/更新必须留痕） */
export const INLINE_RESULT_ACTIONS: ReadonlySet<string> = new Set([
  'create_character', 'update_character', 'delete_character',
  'create_studio', 'update_studio', 'delete_studio',
  'create_location', 'update_location', 'delete_location',
  'delete_scene', 'delete_script',
  'update_scene', 'update_scene_dialogues',
  'update_scene_characters_location', 'update_scene_props',
]);

/** 该动作是否允许智能体循环直接执行（不可逆动作永远不允许） */
export function isAgentAutoExecutable(action: string): boolean {
  return AGENT_AUTO_ACTIONS.has(action) && !IRREVERSIBLE_ACTIONS.has(action);
}

/** 该动作执行前是否需要用户二次确认 */
export function requiresUserConfirm(action: string): boolean {
  return IRREVERSIBLE_ACTIONS.has(action);
}

export interface ActionConfirmCopy {
  title: string;
  message: string;
  confirmText: string;
}

/** 二次确认文案：把影响面写清楚，而不是笼统的「确定删除吗」；
 *  同时告知快照安全网——执行前自动备份，确认错了也能从快照还原。 */
export const ACTION_CONFIRM_COPY: Record<string, ActionConfirmCopy> = {
  delete_scene: {
    title: '删除分镜',
    message: '将删除该分镜及其已生成的首尾帧、视频引用，且无法撤销。执行前会自动备份工程快照，确认错了可在 设置 › 工程设置 › 快照与恢复 中还原。确定继续？',
    confirmText: '删除分镜',
  },
  delete_script: {
    title: '删除剧本',
    message: '将同时删除该剧本名下的全部分镜；若它是当前参考剧本，还会解绑当前集。此操作无法撤销，但执行前会自动备份工程快照，可在 设置 › 工程设置 › 快照与恢复 中还原。',
    confirmText: '删除剧本',
  },
  delete_character: {
    title: '删除角色',
    message: '将删除该角色及其全部状态图，已绑定该角色的分镜会失去角色引用。此操作无法撤销，但执行前会自动备份工程快照，可在 设置 › 工程设置 › 快照与恢复 中还原。',
    confirmText: '删除角色',
  },
  delete_character_state: {
    title: '删除角色状态',
    message: '删除白膜会让其派生状态失去参考；删除状态图会使引用该状态的镜头失去造型依据。此操作无法撤销，但执行前会自动备份工程快照，可在 设置 › 工程设置 › 快照与恢复 中还原。',
    confirmText: '删除状态',
  },
  delete_base_model: {
    title: '删除角色白膜',
    message: '白膜是角色派生状态的基础网格，删除后相关状态与镜头造型会失去参考。此操作无法撤销，但执行前会自动备份工程快照，可在 设置 › 工程设置 › 快照与恢复 中还原。',
    confirmText: '删除白膜',
  },
  delete_studio: {
    title: '删除场景库条目',
    message: '将删除该场景库条目及其封面/九宫图，引用它的分镜会缺少场景图。此操作无法撤销，但执行前会自动备份工程快照，可在 设置 › 工程设置 › 快照与恢复 中还原。',
    confirmText: '删除场景',
  },
  delete_prop: {
    title: '删除道具',
    message: '将删除该道具及其道具图，已绑定它的分镜会失去道具引用。此操作无法撤销，但执行前会自动备份工程快照，可在 设置 › 工程设置 › 快照与恢复 中还原。',
    confirmText: '删除道具',
  },
  delete_location: {
    title: '删除分镜地点',
    message: '已绑定该地点的分镜会失去地点信息。此操作无法撤销，但执行前会自动备份工程快照，可在 设置 › 工程设置 › 快照与恢复 中还原。',
    confirmText: '删除地点',
  },
};

/** 取确认文案；清单外的动作给保守兜底，避免直接放行 */
export function getActionConfirmCopy(action: string, label?: string): ActionConfirmCopy {
  return ACTION_CONFIRM_COPY[action] ?? {
    title: '确认执行不可逆操作',
    message: `「${label || action}」无法撤销。执行前会自动备份工程快照，可在 设置 › 工程设置 › 快照与恢复 中还原。确定继续？`,
    confirmText: '继续执行',
  };
}
