const { queryOne } = require('../dbHelper');

const WORKFLOW_CONFLICT_RULES = {
  character_views_generation: {
    paramKey: 'characterId',
    workflowTypes: ['character_views_generation']
  },
  character_state_views_generation: {
    paramKey: 'stateId',
    workflowTypes: ['character_state_views_generation']
  },
  scene_image_generation: {
    paramKey: 'sceneId',
    workflowTypes: ['scene_image_generation']
  },
  storyboard_generation: {
    paramKey: 'scriptId',
    workflowTypes: ['storyboard_generation', 'batch_storyboard_generation', 'scene_storyboard_generation']
  },
  batch_storyboard_generation: {
    paramKey: 'scriptId',
    workflowTypes: ['storyboard_generation', 'batch_storyboard_generation', 'scene_storyboard_generation']
  },
  scene_storyboard_generation: {
    paramKey: 'scriptId',
    workflowTypes: ['storyboard_generation', 'batch_storyboard_generation', 'scene_storyboard_generation']
  },
  batch_frame_generation: {
    paramKey: 'scriptId',
    workflowTypes: ['batch_frame_generation', 'parallel_frame_generation']
  },
  parallel_frame_generation: {
    paramKey: 'scriptId',
    workflowTypes: ['batch_frame_generation', 'parallel_frame_generation']
  },
  batch_scene_video_generation: {
    paramKey: 'scriptId',
    workflowTypes: ['batch_scene_video_generation']
  },
  frame_generation: {
    paramKey: 'storyboardId',
    workflowTypes: ['frame_generation', 'single_frame_generation', 'camera_frame_generation']
  },
  single_frame_generation: {
    paramKey: 'storyboardId',
    workflowTypes: ['frame_generation', 'single_frame_generation', 'camera_frame_generation']
  },
  camera_frame_generation: {
    paramKey: 'storyboardId',
    workflowTypes: ['frame_generation', 'single_frame_generation', 'camera_frame_generation']
  },
  scene_video: {
    paramKey: 'storyboardId',
    workflowTypes: ['scene_video']
  },
  batch_prompt_optimization: {
    paramKey: 'scriptId',
    workflowTypes: ['batch_prompt_optimization']
  },
  single_prompt_optimization: {
    paramKey: 'storyboardId',
    workflowTypes: ['single_prompt_optimization']
  },
  script_split: {
    paramKey: 'projectId',
    workflowTypes: ['script_split', 'script_only']
  }
};

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
