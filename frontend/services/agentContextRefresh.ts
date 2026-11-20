// 智能体多轮上下文刷新（纯函数，无副作用，可单测）
//
// 背景：agent 循环（plan→execute→observe）最多 5 轮，但 contextPayload 是「发送瞬间」
// 的闭包快照。循环内执行 create/update/delete 后，工程真实数据已变，工作台也会把最新
// 实体推回面板 props，可闭包里的旧清单不会自己更新——模型照着过期清单重复创建、或误判
// 「角色/分镜不存在」。这里把「每轮请求前重建实体上下文」抽成纯函数，守住两条不变量：
//   1) 工程级设置/记忆/写手/美术风格沿用发送瞬间的 base（这些不随动作变化，无需重查）；
//   2) 只替换会被动作改写的实体清单、剧本（按预算截断）与长任务，scenes 由调用方按权威源解析。

/** 剧本内容截断：超出预算保留前缀并标注原长，供上下文构建与多轮刷新共用，避免两处口径漂移。 */
export function truncateScriptContent(
  content: string | undefined | null,
  maxChars: number
): string | undefined {
  if (!content) return undefined;
  return content.length > maxChars
    ? content.slice(0, maxChars) + `\n[…剧本已截断，原长 ${content.length} 字符…]`
    : content;
}

/** 工作台实时推回的实体快照（形状与发送瞬间一致，均为 summary）。 */
export interface LiveEntitySnapshot {
  characters?: any[];
  locations?: any[];
  studios?: any[];
  props?: any[];
  scripts?: any[];
}

/** 调用方按权威源解析后的字段：scenes 优先工作台实时态，空则回退工程文档；长任务取最新注册表。 */
export interface ResolvedContextFields {
  scenes: any[];
  longTasks: any[];
  maxScriptChars: number;
}

/**
 * 重建某一轮请求的上下文：保留 base 的工程级设置，仅替换实体清单/剧本/长任务。
 * live 中缺省的实体沿用 base（工作台尚未推回时不致清空）；scripts 一律按最新清单截断重建，
 * 因为循环内改过剧本后，发送瞬间的 RAG 片段已过期，全量截断清单比旧片段更可靠。
 */
export function refreshAgentContext(
  base: Record<string, any>,
  live: LiveEntitySnapshot,
  resolved: ResolvedContextFields
): Record<string, any> {
  return {
    ...base,
    characters: live.characters ?? base.characters,
    locations: live.locations ?? base.locations,
    studios: live.studios ?? base.studios,
    props: live.props ?? base.props,
    scripts: (live.scripts ?? []).map((s) => ({
      ...s,
      content: truncateScriptContent(s?.content, resolved.maxScriptChars),
    })),
    scenes: resolved.scenes,
    longTasks: resolved.longTasks,
  };
}