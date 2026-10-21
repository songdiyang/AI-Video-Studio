// 工作流端点的离线路由（localWorkflowRouter）
//
// 把后端 /api/workflows 系列端点接到本地工作流引擎（localWorkflow），
// 字段形状严格对齐 hooks/useWorkflow.ts 的 WorkflowJob / WorkflowTask，
// 使 useTaskRunner、AIAssistantPanel 轮询、useSceneGeneration、NodeCanvas、DirectorSpace 零改动工作。
//
// 覆盖端点：
//   POST /api/workflows                      启动 → { jobId, tasks }
//   GET  /api/workflows/:jobId               查询 → WorkflowJob（不存在返回 404）
//   GET  /api/workflows                      列表 → { jobs }
//   GET  /api/workflows/active?projectId=    活跃任务 → { jobs }
//   POST /api/workflows/:jobId/cancel        取消 → { success }
//   POST /api/workflows/:jobId/resume        续跑 → { success }
//   POST /api/workflows/:jobId/consume       标记消费 → { success }
//   POST /api/workflows/batch-consume-failed 批量消费失败 → { consumed }

import {
  start,
  getJob,
  listJobs,
  cancel,
  resume,
  consume,
  consumeAllFailed,
} from './localWorkflow';
import {
  isAssetJobId,
  getAssetJob,
  listActiveAssetJobs,
  consumeAssetJob,
  assetJobToWorkflowJob,
} from './localAssetJobs';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 合成「分镜自动拆分」作业（前缀 sbg_）：localStoryboards 在返回前已同步把分镜写入工程文档，
 * 这里仅回放一个「已完成」的作业形状，驱动 useWorkflowRecovery 触发 onComplete → 增量刷新列表。
 * 直接命中而绕开 localWorkflow.getJob 的 Tauri/浏览器分叉（两种模式都可回放），无需真实入队。
 */
function peekStoryboardJob(jobId: string): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: jobId,
    user_id: 1,
    project_id: 0,
    workflow_type: 'storyboard_generation',
    workflowName: '自动分镜拆分',
    status: 'completed',
    current_step_index: 1,
    total_steps: 1,
    params: {},
    input_params: {},
    error_message: null,
    started_at: now,
    completed_at: now,
    created_at: now,
    tasks: [
      {
        id: `t_${jobId}`,
        job_id: jobId,
        step_index: 0,
        task_type: 'storyboard_generation',
        target_type: 'storyboard',
        target_id: null,
        model_name: null,
        input_params: {},
        status: 'completed',
        progress: 100,
        result_data: null,
        error_message: null,
        started_at: now,
        completed_at: now,
        displayName: '自动分镜拆分',
      },
    ],
  };
}

export async function routeWorkflows(url: URL, method: string, body: any): Promise<Response | null> {
  const pathname = url.pathname;
  const m = method.toUpperCase();
  let mt: RegExpMatchArray | null;

  // 列表 / 创建
  if (pathname === '/api/workflows') {
    if (m === 'POST') {
      const workflowType = body?.workflowType || body?.workflow_type || '';
      const projectId = Number(body?.projectId ?? body?.project_id ?? 0) || 0;
      const params = body?.params ?? {};
      if (!workflowType) return jsonResponse({ message: '缺少 workflowType' }, 400);
      const { jobId, tasks } = await start(workflowType, projectId, params);
      return jsonResponse({ jobId, tasks });
    }
    if (m === 'GET') {
      const projectId = url.searchParams.get('projectId');
      const workflowType = url.searchParams.get('workflowType') || undefined;
      const status = url.searchParams.get('status') || undefined;
      const jobs = await listJobs({
        projectId: projectId !== null ? Number(projectId) : undefined,
        workflowType,
        status,
      });
      // 并入资产生成作业（角色/场景/建筑/环境/服装/影棚 生成）
      const assetJobs = listActiveAssetJobs(projectId !== null ? Number(projectId) : undefined)
        .map(assetJobToWorkflowJob)
        .filter((j) => (!workflowType || j.workflow_type === workflowType) && (!status || j.status === status));
      return jsonResponse({ jobs: [...jobs, ...assetJobs] });
    }
  }

  // 活跃任务（须在 :jobId 之前匹配，避免 active 被当作 jobId）
  if (pathname === '/api/workflows/active' && m === 'GET') {
    const projectId = Number(url.searchParams.get('projectId') || 0);
    const jobs = await listJobs({ projectId: projectId || undefined, activeOnly: true });
    const assetJobs = listActiveAssetJobs(projectId || undefined)
      .filter((j) => j.status === 'running' || j.status === 'completed' || j.status === 'failed')
      .map(assetJobToWorkflowJob);
    return jsonResponse({ jobs: [...jobs, ...assetJobs] });
  }

  // 批量消费失败
  if (pathname === '/api/workflows/batch-consume-failed' && m === 'POST') {
    return jsonResponse({ consumed: await consumeAllFailed() });
  }

  // 单作业操作
  if ((mt = pathname.match(/^\/api\/workflows\/([\w-]+)(?:\/(cancel|resume|consume))?$/))) {
    const jobId = mt[1];
    const action = mt[2];
    // 资产生成作业（ag_ 前缀）：由 localAssetJobs 注册表回放
    if (isAssetJobId(jobId)) {
      const job = getAssetJob(jobId);
      if (!job) return jsonResponse({ message: '工作流不存在' }, 404);
      if (m === 'GET' && !action) return jsonResponse(assetJobToWorkflowJob(job));
      if (action === 'consume' && m === 'POST') return jsonResponse({ success: consumeAssetJob(jobId) });
      if (action === 'cancel' && m === 'POST') return jsonResponse({ success: false });
      if (action === 'resume' && m === 'POST') return jsonResponse({ success: false });
    }
    // 合成「分镜自动拆分」作业：直接回放完成态，不入本地工作流注册表
    if (jobId.startsWith('sbg_')) {
      if (m === 'GET' && !action) return jsonResponse(peekStoryboardJob(jobId));
      if (action === 'consume' && m === 'POST') return jsonResponse({ success: true });
      if (action === 'cancel' && m === 'POST') return jsonResponse({ success: false });
      if (action === 'resume' && m === 'POST') return jsonResponse({ success: false });
    }
    if (m === 'GET' && !action) {
      const job = await getJob(jobId);
      if (!job) return jsonResponse({ message: '工作流不存在' }, 404);
      return jsonResponse(job);
    }
    if (action === 'cancel' && m === 'POST') return jsonResponse({ success: await cancel(jobId) });
    if (action === 'resume' && m === 'POST') return jsonResponse({ success: await resume(jobId) });
    if (action === 'consume' && m === 'POST') return jsonResponse({ success: await consume(jobId) });
  }

  return null;
}
