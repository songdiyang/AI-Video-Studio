// 云专属能力的离线优雅降级（localCloudFallback）
//
// 桌面离线模式下，社区 / 市场 / 订阅 / 团队 / 协作 / 计费 / 反馈 / 内部邮件 / 扩展 / RAG 等
// 依赖 Node 后端与 MySQL/Redis/MinIO 的功能不可用。它们的入口大多已下线，但仍有零星调用
// （如 AIAssistantPanel 加载批注、RAG 检索）。为避免这些调用打到不存在的后端返回 501 或报错，
// 这里统一返回“空数据形状”，让消费方走既有的“无结果”分支即可。

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 常见列表/集合消费方兼容的空形状 */
const EMPTY_LIST = { success: true, items: [], data: [], count: 0, total: 0 };

/**
 * 匹配云专属路由并返回降级响应；未匹配返回 null（交给上游继续处理/透传）。
 */
export function routeCloudFallback(pathname: string): Response | null {
  // RAG：面板按 { success, context } 消费，返回空上下文即回退到原始剧本
  if (pathname.startsWith('/api/rag/')) {
    return json({ success: true, context: '', results: [], chunks: [] });
  }

  // 协作批注：面板按 { annotations: [] } 消费
  if (pathname.startsWith('/api/collaboration/')) {
    return json({ success: true, annotations: [], comments: [], items: [], data: [] });
  }

  // 其余云专属域：社区 / 市场 / 订阅 / 计费 / 反馈 / 内部邮件 / 扩展 / 管理 / 团队
  const CLOUD_PREFIXES = [
    '/api/community',
    '/api/marketplace',
    '/api/subscriptions',
    '/api/subscription',
    '/api/billing',
    '/api/feedback',
    '/api/internal-mail',
    '/api/internalMail',
    '/api/extensions',
    '/api/admin',
    '/api/teams',
    '/api/team',
  ];
  for (const p of CLOUD_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + '/')) {
      return json(EMPTY_LIST);
    }
  }

  return null;
}
