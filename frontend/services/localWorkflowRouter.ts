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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
      const { jobId, tasks } = start(workflowType, projectId, params);
      return jsonResponse({ jobId, tasks });
    }
    if (m === 'GET') {
      const projectId = url.searchParams.get('projectId');
      const workflowType = url.searchParams.get('workflowType') || undefined;
      const status = url.searchParams.get('status') || undefined;
      const jobs = listJobs({
        projectId: projectId !== null ? Number(projectId) : undefined,
        workflowType,
        status,
      });
      return jsonResponse({ jobs });
    }
  }

  // 活跃任务（须在 :jobId 之前匹配，避免 active 被当作 jobId）
  if (pathname === '/api/workflows/active' && m === 'GET') {
    const projectId = Number(url.searchParams.get('projectId') || 0);
    const jobs = listJobs({ projectId: projectId || undefined, activeOnly: true });
    return jsonResponse({ jobs });
  }

  // 批量消费失败
  if (pathname === '/api/workflows/batch-consume-failed' && m === 'POST') {
    return jsonResponse({ consumed: consumeAllFailed() });
  }

  // 单作业操作
  if ((mt = pathname.match(/^\/api\/workflows\/([\w-]+)(?:\/(cancel|resume|consume))?$/))) {
    const jobId = mt[1];
    const action = mt[2];
    if (m === 'GET' && !action) {
      const job = getJob(jobId);
      if (!job) return jsonResponse({ message: '工作流不存在' }, 404);
      return jsonResponse(job);
    }
    if (action === 'cancel' && m === 'POST') return jsonResponse({ success: cancel(jobId) });
    if (action === 'resume' && m === 'POST') return jsonResponse({ success: resume(jobId) });
    if (action === 'consume' && m === 'POST') return jsonResponse({ success: consume(jobId) });
  }

  return null;
}
