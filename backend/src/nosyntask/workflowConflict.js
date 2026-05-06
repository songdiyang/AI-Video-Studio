const { queryOne } = require('../dbHelper');

/**
 * 冲突规则分组定义（声明式）
 *
 * 同组中的 workflowTypes 共享同一个 paramKey 和冲突域。
 * 例如：所有分镜生成类工作流（storyboard/batch/scene）都按 scriptId 冲突检测。
 *
 * 新增冲突规则只需在此数组追加一项，编译期自动展开为 WORKFLOW_CONFLICT_RULES。
 */
const CONFLICT_GROUPS = [
  // ---- 角色/场景/道具资产 ----
  { paramKey: 'characterId',  members: ['character_views_generation'] },
  { paramKey: 'stateId',      members: ['character_state_views_generation'] },
  { paramKey: 'sceneId',      members: ['scene_image_generation', 'scene_elements_extraction'] },
  { paramKey: 'elementId',    members: ['scene_element_generation'] },

  // ---- 分镜生成（同一 script 同时只能有一个分镜类工作流运行） ----
  { paramKey: 'scriptId',     members: ['storyboard_generation', 'batch_storyboard_generation', 'scene_storyboard_generation'] },

  // ---- 帧生成 ----
  { paramKey: 'scriptId',     members: ['batch_frame_generation', 'parallel_frame_generation'] },
  { paramKey: 'storyboardId', members: ['frame_generation', 'single_frame_generation', 'camera_frame_generation'] },

  // ---- 视频生成 ----
  { paramKey: 'scriptId',     members: ['batch_scene_video_generation'] },
  { paramKey: 'storyboardId', members: ['scene_video'] },

  // ---- 提示词优化（按类型隔离） ----
  { paramKey: 'scriptId',     members: ['batch_prompt_optimization'] },
  { paramKey: 'storyboardId', members: ['single_prompt_optimization'] },
  { paramKey: 'storyboardId', members: ['single_image_prompt_optimization'] },
  { paramKey: 'storyboardId', members: ['single_video_prompt_optimization'] },
  { paramKey: 'scriptId',     members: ['batch_image_prompt_optimization'] },
  { paramKey: 'scriptId',     members: ['batch_video_prompt_optimization'] },

  // ---- 剧本生成 ----
  { paramKey: 'projectId',    members: ['script_split', 'script_only'] },
];

// ========================================================
// 编译：展开 CONFLICT_GROUPS 为扁平查找表 WORKFLOW_CONFLICT_RULES
// ========================================================
const WORKFLOW_CONFLICT_RULES = {};
for (const group of CONFLICT_GROUPS) {
  for (const member of group.members) {
    if (WORKFLOW_CONFLICT_RULES[member]) {
      // 同一 workflowType 出现在多个 groups 中（不预期），合并冲突域
      const existing = WORKFLOW_CONFLICT_RULES[member];
      const merged = [...new Set([...existing.workflowTypes, ...group.members])];
      WORKFLOW_CONFLICT_RULES[member] = { paramKey: group.paramKey, workflowTypes: merged };
    } else {
      WORKFLOW_CONFLICT_RULES[member] = {
        paramKey: group.paramKey,
        workflowTypes: [...group.members]
      };
    }
  }
}

function getWorkflowConflictRule(workflowType) {
  return WORKFLOW_CONFLICT_RULES[workflowType] || null;
}

async function findWorkflowConflict({ userId, workflowType, params = {} }) {
  const rule = getWorkflowConflictRule(workflowType);
  if (!rule) {
    return null;
  }

  const conflictValue = params?.[rule.paramKey];
  if (conflictValue === undefined || conflictValue === null || conflictValue === '') {
    return null;
  }

  const placeholders = rule.workflowTypes.map(() => '?').join(', ');
  const legacyPath = `$.${rule.paramKey}`;
  const normalizedPath = `$.scope.${rule.paramKey}`;
  const job = await queryOne(
    `SELECT id, workflow_type
     FROM workflow_jobs
     WHERE user_id = ?
       AND workflow_type IN (${placeholders})
       AND status IN ('pending', 'running')
       AND (
         JSON_UNQUOTE(JSON_EXTRACT(input_params, ?)) = ?
         OR JSON_UNQUOTE(JSON_EXTRACT(input_params, ?)) = ?
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, ...rule.workflowTypes, legacyPath, String(conflictValue), normalizedPath, String(conflictValue)]
  );

  if (!job) {
    return null;
  }

  return {
    jobId: job.id,
    workflowType: job.workflow_type,
    conflictKey: {
      key: rule.paramKey,
      value: conflictValue
    }
  };
}

function sendWorkflowConflict(res, workflowType, conflict) {
  return res.status(409).json({
    message: '已有相同资源的生成任务正在运行',
    jobId: conflict.jobId,
    workflowType: conflict.workflowType || workflowType,
    conflictKey: conflict.conflictKey
  });
}

module.exports = {
  findWorkflowConflict,
  sendWorkflowConflict,
  getWorkflowConflictRule
};
