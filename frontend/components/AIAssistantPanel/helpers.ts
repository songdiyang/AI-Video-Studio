// AIAssistantPanel 的类型定义与纯工具函数（自 index.tsx 拆出，保持行为不变）。
import type { ChatMessageData, ChatMessageStep } from './ChatMessage';
import { normalizeSceneDialogues } from '../../services/sceneDialogues';

/** 本地会话列表项（历史弹窗/标签栏数据源） */
export interface SessionLite {
  id: number;
  title: string;
  model_name: string | null;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
}

// ─── Types ──────────────────────────────────────────────────────────
export interface Attachment {
  type: 'image' | 'video' | 'file' | 'script';
  url: string;
  name?: string;
  /** 剧本附件的文本内容（AI 上下文用） */
  textContent?: string;
}

// ─── Helper Functions ───────────────────────────────────────────────
/**
 * 需要转 data URL 的图片附件：工程内的图片是 asset 协议 URL（仅本机能访问），
 * blob: 同理；而 file:// 前缀是已上传到厂商的文件句柄、data: 已是内联，保持原样。
 */
export function needsVisionHydrate(a: { type: string; url?: string }): boolean {
  return a.type === 'image' && !!a.url && !/^data:/i.test(a.url) && !/^file:\/\//i.test(a.url);
}

/** 将 blob URL 转换为 base64 data URL */
export async function blobUrlToBase64(blobUrl: string): Promise<string> {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to convert blob URL to base64:', error);
    return blobUrl; // 失败时返回原始 URL
  }
}

/** 检查 URL 是否为 blob URL */
export function isBlobUrl(url: string): boolean {
  return url.startsWith('blob:');
}

/** 注入给智能体的分镜清单项（与 AIAssistantSceneSummary / buildSystemPrompt 消费字段对齐） */
export type AISceneSummary = NonNullable<AIAssistantPanelProps['scenes']>[number] & {
  props?: string[];
  characters?: string[];
  location?: string;
  scope?: string;
  /** 画外音/旁白（无说话人），视频模型需要与台词分开表述 */
  voiceover?: string;
};

/** 变量槽里的名称数组（角色/道具可能存字符串或对象） */
export function toNameList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v: any) => String(typeof v === 'string' ? v : (v?.name ?? '')).trim())
    .filter(Boolean);
}

/**
 * 本地分镜文档条目（LocalScene 形状）→ 智能体用的分镜清单项。
 * 与 useSceneManager.mapStoryboardItems 取同一批字段，保证「工作台看到的」与「智能体看到的」一致。
 */
export function toAIScene(raw: any, position: number): AISceneSummary {
  const vars = (raw?.variables && typeof raw.variables === 'object') ? raw.variables : {};
  const cast = toNameList(vars.characters);
  // 台词走与拆分阶段同一套校验：旧工程里常有一行混多个「名字：」的脏数据，
  // 直接会给智能体造成「谁说了哪句」歧义，导致视频提示词里台词归属错人。
  const { lines } = normalizeSceneDialogues(
    { dialogues: Array.isArray(vars.dialogues) ? vars.dialogues : undefined, dialogue: vars.dialogue },
    cast,
  );
  return {
    id: Number(raw?.id),
    index: Number.isFinite(raw?.index) ? Number(raw.index) : position + 1,
    description: String(raw?.prompt_template || raw?.description || '').trim(),
    first_frame_url: raw?.first_frame_url || undefined,
    last_frame_url: raw?.last_frame_url || undefined,
    video_url: raw?.video_url || undefined,
    first_frame_prompt: raw?.first_frame_prompt || undefined,
    last_frame_prompt: raw?.last_frame_prompt || undefined,
    video_prompt: raw?.video_prompt || undefined,
    props: toNameList(vars.props),
    characters: cast,
    dialogues: lines.map((l) => ({ character: l.character, line: l.line })),
    voiceover: typeof vars.voiceover === 'string' && vars.voiceover.trim() ? vars.voiceover.trim() : undefined,
    location: typeof vars.location === 'string' ? vars.location : undefined,
    scope: typeof raw?._scope === 'string' ? raw._scope : undefined,
  };
}

/** 从工程文档读取全部分镜（跨剧本/自由分镜 scope），不依赖分镜工作台是否挂载 */
export async function fetchProjectScenes(projectId: number): Promise<AISceneSummary[]> {
  try {
    const res = await fetch(`/api/storyboards/project/${projectId}`);
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    const list: any[] = Array.isArray(data?.scenes) ? data.scenes : [];
    return list.map((raw, i) => toAIScene(raw, i));
  } catch {
    return [];
  }
}

/** 把分镜清单渲染成给模型看的文本（含真实 ID 与素材落地标记） */
export function renderScenesForAgent(list: AISceneSummary[], max = 80): string {
  const lines = list.slice(0, max).map((s) => {
    const flags: string[] = [];
    if (s.first_frame_url) flags.push('首帧✓');
    if (s.last_frame_url) flags.push('尾帧✓');
    if (s.video_url) flags.push('视频✓');
    const meta: string[] = [];
    if (s.location) meta.push(`地点:${s.location}`);
    if (s.characters?.length) meta.push(`角色:${s.characters.join('、')}`);
    if (s.props?.length) meta.push(`道具:${s.props.join('、')}`);
    const desc = (s.description || '').replace(/\s+/g, ' ').slice(0, 60);
    // 逐句台词带说话人：智能体需要靠它把台词绑到对应角色的外貌特征上
    const speech: string[] = (s.dialogues || [])
      .map((d) => (d.character ? `${d.character}{${d.line}}` : `{${d.line}}`))
      .filter((t) => t.includes('{'));
    if (s.voiceover) speech.push(`画外音{${s.voiceover}}`);
    const tail = speech.length ? ` 台词：${speech.join('，')}` : '';
    return `- #${s.index}(ID:${s.id}) [${flags.length ? flags.join(' ') : '未出图'}]${meta.length ? ` ${meta.join(' ')}` : ''} ${desc}${tail}`;
  });
  const rest = list.length > max ? `\n[…仅列出前 ${max} 个，共 ${list.length} 个分镜…]` : '';
  return `${lines.join('\n')}${rest}`;
}

/**
 * 变更类动词：用户要求系统改变工程状态（而非只是提问/咨询）。
 * 用于判定“智能体声称要做事但本轮没触发任何 action”——这类空承诺必须做真实状态核验。
 */
export const TASK_VERB_PATTERN = /(拆分|拆解|分成|分为|生成|创建|新建|建一|建个|写入|保存|存进|更新|修改|改成|改为|改一下|优化|质检|检查|重跑|重新生成|出图|首帧|尾帧|首尾帧|绑定|删除|整理|批量|导入|导出|补齐|做一个|做一下|来一个|来一段|写一个|写个|写下|写入)/;

/** 用户这句话是不是“要执行”而不是“要信息” */
export function isTaskRequest(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  // 疑问句不是执行指令（“这个分镜怎么写更好？”）
  if (/[?？]\s*$/.test(t)) return false;
  if (/^(怎么|怎样|如何|为什么|为何|是什么|哪些|哪个|能否|能不能|可不可以|是否|有没有)/.test(t)) return false;
  return TASK_VERB_PATTERN.test(t);
}

/** 读取工程当前真实落地状态（分镜数/素材数/剧本数），作为“动作是否真的发生”的客观依据 */
export async function verifyProjectState(projectId: number | null): Promise<string> {
  if (!projectId) return '- 当前没有打开的工程，任何写操作都无法落地。';
  const scripts = await (async () => {
    try {
      const res = await fetch(`/api/scripts/project/${projectId}`);
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      return Array.isArray(data?.scripts) ? (data.scripts as any[]) : null;
    } catch {
      return null;
    }
  })();
  const sceneList = await fetchProjectScenes(projectId);
  const lines = [
    `- 分镜：${sceneList.length} 个${sceneList.length
      ? `（ID：${sceneList.slice(0, 12).map((s) => s.id).join('、')}${sceneList.length > 12 ? '…' : ''}）`
      : ''}`,
    `- 已出首帧：${sceneList.filter((s) => s.first_frame_url).length} 个；已出尾帧：${sceneList.filter((s) => s.last_frame_url).length} 个；已出视频：${sceneList.filter((s) => s.video_url).length} 个`,
  ];
  if (scripts) {
    lines.push(`- 剧本：${scripts.length} 个，其中 ${scripts.filter((s) => String(s?.content || '').trim()).length} 个有正文`);
  }
  return lines.join('\n');
}

/**
 * 单轮（非 agent 循环）路径兜底：用户要求执行、模型只回了一段承诺却没给任何 action 时，
 * 在回复上标注客观事实，避免“我这就去拆分”看起来像已经干了。无法在此补回执行，所以不假装成功。
 */
export function annotateUnexecutedIntent(userText: string, reply: string, suggestions: any[]): string {
  if (suggestions.length > 0) return reply;
  if (!isTaskRequest(userText)) return reply;
  const body = reply.trim();
  return `${body ? `${body}\n\n` : ''}（系统核验：本轮没有触发任何工具动作，上述操作尚未执行。请重试并要求直接执行。）`;
}

export interface AIAssistantPanelProps {
  projectId: number | null;
  /** 项目名称，注入系统提示词供 AI 理解上下文 */
  projectName?: string | null;
  /** 项目描述，注入系统提示词 */
  projectDescription?: string | null;
  currentFrame?: {
    id: number;
    index?: number;
    first_frame_url?: string;
    last_frame_url?: string;
    video_url?: string;
    scene_description?: string;
    /** 提示词信息 */
    first_frame_prompt?: string;
    last_frame_prompt?: string;
    video_prompt?: string;
  } | null;
  /** 项目中所有分镜清单（AI 用来识别"第几个分镜"、质检降级、上下文推理） */
  scenes?: {
    id: number;
    index: number;
    description?: string;
    first_frame_url?: string;
    last_frame_url?: string;
    video_url?: string;
    first_frame_prompt?: string;
    last_frame_prompt?: string;
    video_prompt?: string;
    /** 一行一个说话人的台词（与 AIAssistantSceneSummary.dialogues 对齐） */
    dialogues?: { character: string; line: string }[];
  }[];
  /** 项目角色库清单（含外貌/当前造型，AI 可基于此推理 action 参数） */
  characters?: {
    id: number;
    name: string;
    description?: string;
    appearance?: string;
    base_appearance?: string;
    outfit_appearance?: string;
    active_state_name?: string;
    active_state_outfit?: string;
    states_count?: number;
    has_base_model_views?: boolean;
    image_url?: string;
  }[];
  /** 项目场景清单 */
  locations?: { id: number; name: string; description?: string }[];
  /** 项目场景库（资源面板中的 Studio，与环境/建筑关联） */
  studios?: {
    id: number;
    name: string;
    description?: string;
    environment_name?: string;
    building_names?: string[];
    cover_image_url?: string;
    scene_count?: number;
    element_count?: number;
    nine_grid_image_url?: string;
  }[];
  /** 项目道具库清单（资源面板「道具」页） */
  props?: { id: number; name: string; description?: string; category?: string; image_url?: string }[];
  /** 项目剧本清单（含内容） */
  scripts?: { id: number; episode_number: number; title?: string; content?: string }[];
  onClose: () => void;
  /**
   * 工作台动作桥接：第三参 onProgress 回报子步骤，返回值是动作的执行结果
   * （后台任务返回 { jobId }、离线分镜拆分返回 { sceneCount }），进度卡片依赖它挂载。
   */
  onAction?: (action: string, params: any, onProgress?: (label: string) => void) => unknown;
}

// ─── Welcome message ────────────────────────────────────────────────
export const getWelcomeMessage = (hasProject: boolean): ChatMessageData => ({
  id: 'welcome',
  role: 'assistant',
  content: hasProject
    ? '你好！我是AI助手，可以帮你分析图片、视频和文档内容。你可以发送当前分镜帧让我进行分析，或者直接提问。'
    : '你好！我是AI助手，可以帮你从零开始创作。试试说"帮我创建一个关于仙侠爱情的项目"，我会为你创建项目并规划后续创作步骤。',
  timestamp: Date.now(),
});

// ─── Token 估算（用于按 token 预算裁剪对话上下文）─────────────────
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  for (const ch of text) {
    if (/[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u3000-\u303F\uFF00-\uFFEF]/.test(ch)) cjk++;
  }
  const other = text.length - cjk;
  return Math.ceil(cjk + other / 4);
}
export function estimateMessageTokens(m: { content?: string; attachments?: any[] }): number {
  let t = estimateTokens(m.content || '') + 4;
  if (m.attachments?.length) t += m.attachments.length * 512;
  return t;
}

// 上下文窗口候选（token 预算，0=不限）
export const CONTEXT_WINDOW_OPTIONS = [2048, 4096, 8192, 16384, 0];

// 标签栏最多同时打开的会话数
export const MAX_OPEN_TABS = 5;

// 资源库与分镜写入类动作：执行结果直接追加到对话中，替代全局成功 toast。
// 清单统一维护在 services/agentActionCatalog，这里只做对外再导出，避免两份副本漂移。
export { INLINE_RESULT_ACTIONS } from '../../services/agentActionCatalog';

/**
 * 步骤跟踪器：编码智能体风格的「边执行边刷新 + 完成后折叠」。
 * 维护内部步骤列表，每次变更把整份列表补丁到同一条助手消息上；
 * 消息渲染层在全部步骤结束后自动折叠为摘要。
 */
export function createStepTracker(
  sid: number | null,
  msgId: string,
  update: (targetSid: number | null, updater: (prev: ChatMessageData[]) => ChatMessageData[]) => void,
) {
  const steps: ChatMessageStep[] = [];
  let seq = 0;
  const patch = (content?: string, running?: boolean) => {
    const snapshot = steps.map((s) => ({ ...s }));
    update(sid, (prev) => prev.map((m) => (m.id === msgId ? {
      ...m,
      ...(content !== undefined ? { content } : {}),
      ...(running !== undefined ? { running } : {}),
      steps: snapshot,
    } : m)));
  };
  return {
    /** 把上一个进行中步骤标为完成，追加新步骤并开始计时 */
    start(title: string): number {
      const prevRunning = steps.find((s) => s.status === 'running');
      if (prevRunning) { prevRunning.status = 'completed'; prevRunning.endedAt = Date.now(); }
      steps.push({ id: `st-${++seq}`, title, status: 'running', startedAt: Date.now() });
      patch();
      return seq - 1;
    },
    /** 仅刷新当前进行中步骤的文案（detail / 标题） */
    touch(detail: string): void {
      const cur = [...steps].reverse().find((s) => s.status === 'running');
      if (cur) cur.detail = detail;
      patch();
    },
    /** 完成当前（或指定标题的进行中）步骤 */
    complete(detail?: string): void {
      const cur = [...steps].reverse().find((s) => s.status === 'running');
      if (cur) { cur.status = 'completed'; cur.endedAt = Date.now(); if (detail) cur.detail = detail; }
      patch();
    },
    /** 当前步骤失败（或按标题匹配），并停止 running 标志 */
    fail(detail?: string): void {
      const cur = [...steps].reverse().find((s) => s.status === 'running');
      if (cur) { cur.status = 'failed'; cur.endedAt = Date.now(); if (detail) cur.detail = detail; }
      patch(undefined, false);
    },
    /** 收尾：所有进行中步骤置为完成（或失败），折叠并停止转圈 */
    finishAll(failed = false): void {
      steps.forEach((s) => { if (s.status === 'running') { s.status = failed ? 'failed' : 'completed'; s.endedAt = Date.now(); } });
      patch(undefined, false);
    },
  };
}
