/**
 * 智能体循环编排器（plan → execute → observe）。
 *
 * 从 AIAssistantPanel/index.tsx 抽出的纯编排层：不碰 React/DOM/fetch，
 * 全部副作用经 AgentLoopPorts 注入（规划请求、动作执行、素材采集、图片内联、
 * 工程核验、步骤跟踪、UI 回调），因此可以在 node --test 里用假端口做编排级测试。
 *
 * 循环语义与原实现逐条对齐：
 *  - 人工动作/不可逆动作不进循环，拦下后挂回气泡按钮并回喂一次收敛说明；
 *  - 空承诺核验：执行指令却零动作时回喂工程真实状态，最多一次；
 *  - ask 生成澄清卡片并暂停循环；inspect_quality/view_image 内联真实画面；
 *  - auto_storyboard 执行前后回读工程文档核验落库/新增，不凭返回值宣称完成；
 *  - 图片全循环预算 6 张，base64 随观察消息回喂；
 *  - 每轮 checkpoint 经 onState 交出可序列化状态，供会话级落盘与重启续跑。
 */
import { ask as createAskCard, type AskCardData } from './agentAsk';
import { IRREVERSIBLE_ACTIONS, MANUAL_ONLY_ACTIONS } from './agentActionCatalog';
import { actionErrorText, actionSuccessText, isActionFailure } from './agentActionOutcome';
import { toErrorMessage } from '../utils/errorMessage';

export interface AgentImage { type: 'image'; url: string; name?: string }
export interface AgentHistoryItem { role: string; content: string; attachments?: AgentImage[] }
export interface AgentSuggestion { action: string; label?: string; params?: any }
export interface AgentPlanData { reply?: string; suggestions?: AgentSuggestion[]; success?: boolean; error?: string; message?: string }

/** 步骤跟踪器最小接口（createStepTracker 的返回值天然满足） */
export interface AgentTracker {
  start(title: string): unknown;
  touch(detail: string): void;
  complete(detail?: string): void;
  fail(detail?: string): void;
  finishAll(failed?: boolean): void;
}

export interface AgentLoopPorts {
  /** 规划请求：原 fetch('/api/ai-assistant/chat')；失败须 reject 或返回 success:false */
  plan(messages: AgentHistoryItem[], context: unknown): Promise<AgentPlanData>;
  /** 每轮请求前用工作台实时实体重建上下文（第 0 轮沿用发送瞬间快照） */
  refreshContext(): Promise<unknown>;
  /** 动作执行桥（handleAction），inlineResult:false 语义由注入方保证 */
  execute(action: string, params: any, onSubstep: (sub: string) => void): Promise<any>;
  /** 质检素材报告（提示词/生成情况/分辨率/大小 + 可内联画面） */
  inspectQuality(sceneId: number): Promise<{ text: string; images: Array<{ label: string; url: string }> }>;
  /** view_image 目标定位 */
  resolveImageTargets(params: any): Array<{ label: string; url: string }>;
  /** 图片转 data URL（mediaInfo.toVisionImageUrls） */
  toVisionImageUrls(urls: string[]): Promise<Array<{ dataUrl?: string | null; error?: string }>>;
  /** 空承诺核验：读工程真实状态 */
  verifyProjectState(): Promise<string>;
  /** 回读工程分镜（auto_storyboard 落库核验 + 台词归属统计） */
  fetchScenes(): Promise<Array<{ dialogues?: Array<{ character?: string }> }>>;
  isTaskRequest(text: string): boolean;
  tracker: AgentTracker;
  /** 每轮规划出动作后刷新对话栏进度文案 */
  onRoundPlan(round: number, count: number, summary: string): void;
  /** generate_script 启动：行为卡片接管，移除规划消息 */
  onScriptGenerationStart(): void;
  /** 循环状态 checkpoint（落盘续跑用）；不传则不落盘 */
  onState?(state: AgentLoopState): void;
}

/** 可序列化的循环状态：随会话落盘，重启后可续跑或如实告知中断点 */
export interface AgentLoopState {
  status: 'running' | 'done' | 'ask' | 'script' | 'interrupted';
  round: number;
  userText: string;
  history: AgentHistoryItem[];
  executedLog: string[];
  roundReply: string;
  manualNotified: boolean;
  intentVerified: boolean;
  imageBudgetLeft: number;
  pendingConfirm: AgentSuggestion[];
  updatedAt: number;
}

export interface AgentLoopInput {
  userText: string;
  initialHistory: AgentHistoryItem[];
  initialContext: unknown;
  /** 无工程时跳过分镜回读核验（与原 projectId 判空语义一致） */
  hasProject: boolean;
  currentFrameId?: number | null;
  maxRounds?: number;
  /** 续跑：从落盘状态恢复 history/round/标志位 */
  resume?: AgentLoopState | null;
}

export interface AgentLoopResult {
  finalContent: string;
  askCard: AskCardData | null;
  pendingConfirm: AgentSuggestion[];
  scriptGenerationHandled: boolean;
  scriptGenerationFailed: boolean;
  state: AgentLoopState;
}

const AGENT_BLOCKED_ACTIONS = new Set([...MANUAL_ONLY_ACTIONS, ...IRREVERSIBLE_ACTIONS]);
const TASK_ACTIONS = new Set(['auto_storyboard', 'generate_frame', 'generate_video']);
const DEFAULT_MAX_ROUNDS = 5;
const IMAGE_BUDGET = 6;

export async function runAgentLoop(input: AgentLoopInput, ports: AgentLoopPorts): Promise<AgentLoopResult> {
  const MAX_ROUNDS = input.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const resume = input.resume ?? null;

  const pendingConfirm: AgentSuggestion[] = resume ? [...resume.pendingConfirm] : [];
  const pendingKeys = new Set<string>(pendingConfirm.map((s) => `${s.action}:${JSON.stringify(s.params ?? {})}`));
  const queueConfirm = (s: AgentSuggestion) => {
    const key = `${s.action}:${JSON.stringify(s.params ?? {})}`;
    if (pendingKeys.has(key)) return;
    pendingKeys.add(key);
    pendingConfirm.push({ action: s.action, label: s.label || s.action, params: s.params });
  };

  const history: AgentHistoryItem[] = resume
    ? resume.history.map((m) => ({ ...m }))
    : input.initialHistory.map((m) => ({ ...m }));
  const executedLog: string[] = resume ? [...resume.executedLog] : [];
  let roundReply = resume?.roundReply ?? '';
  let askCard: AskCardData | null = null;
  let manualNotified = resume?.manualNotified ?? false;
  // 空承诺核验标志：最多回喂一次，避免模型反复“只说不做”时循环卡死
  let intentVerified = resume?.intentVerified ?? false;
  let scriptGenerationHandled = false;
  let scriptGenerationFailed = false;
  const startRound = resume ? resume.round : 0;
  const userText = resume?.userText ?? input.userText;

  /** 本轮待回喂的实测图片（已转 data URL）；随观察消息一起交给模型 */
  let roundImages: AgentImage[] = [];
  // 全循环图片预算：base64 会留在 history 里逐轮重发，不限量会把请求撑爆
  const imageBudget = { left: resume?.imageBudgetLeft ?? IMAGE_BUDGET };
  /** 把定位到的图片转 data URL 收入本轮，返回实际内联数与读取失败说明 */
  const collectRoundImages = async (items: Array<{ label: string; url: string }>, cap = 4): Promise<{ inlined: number; failedNote: string }> => {
    const allowed = Math.min(cap, imageBudget.left);
    const picked = items.slice(0, allowed);
    const skipped = items.length - picked.length;
    if (picked.length === 0) {
      return { inlined: 0, failedNote: skipped > 0 ? `- 另有 ${skipped} 张图片因单次对话图片额度已用尽而未发送` : '' };
    }
    const converted = await ports.toVisionImageUrls(picked.map((it) => it.url));
    const failed: string[] = [];
    let inlined = 0;
    converted.forEach((r, i) => {
      if (r.dataUrl) {
        roundImages.push({ type: 'image', url: r.dataUrl, name: picked[i].label });
        inlined += 1;
      } else {
        failed.push(`- ${picked[i].label}：图片读取失败（${r.error || '未知原因'}）`);
      }
    });
    imageBudget.left -= inlined;
    if (skipped > 0) failed.push(`- 另有 ${skipped} 张图片因单次对话图片额度已用尽而未发送`);
    return { inlined, failedNote: failed.join('\n') };
  };

  const snapshotState = (status: AgentLoopState['status'], round: number): AgentLoopState => ({
    status,
    round,
    userText,
    history: history.map((m) => ({ ...m })),
    executedLog: [...executedLog],
    roundReply,
    manualNotified,
    intentVerified,
    imageBudgetLeft: imageBudget.left,
    pendingConfirm: pendingConfirm.map((s) => ({ ...s })),
    updatedAt: Date.now(),
  });
  const emitState = (status: AgentLoopState['status'], round: number) => {
    ports.onState?.(snapshotState(status, round));
  };

  let liveContext: unknown = input.initialContext;
  let finalStatus: AgentLoopState['status'] = 'done';

  for (let round = startRound; round < MAX_ROUNDS; round++) {
    // 续跑首轮也要刷新：落盘时的上下文早已过期
    if (round > 0 || resume) liveContext = await ports.refreshContext();
    emitState('running', round);
    const planData = await ports.plan(history, liveContext);
    if (planData.success === false) {
      throw new Error(planData.error || planData.message || '规划请求失败');
    }

    roundReply = planData.reply || '';
    const rawSuggestions: AgentSuggestion[] = Array.isArray(planData.suggestions) ? planData.suggestions : [];
    const actions = rawSuggestions.filter((s) => s && s.action && !AGENT_BLOCKED_ACTIONS.has(s.action));
    const skippedManual = rawSuggestions.filter((s) => s && s.action && MANUAL_ONLY_ACTIONS.has(s.action));
    const skippedIrreversible = rawSuggestions.filter((s) => s && s.action && IRREVERSIBLE_ACTIONS.has(s.action));
    skippedIrreversible.forEach(queueConfirm);
    history.push({ role: 'assistant', content: planData.reply || '' });
    ports.tracker.complete(`第 ${round + 1} 轮规划返回`);

    // 无自动动作 → agent 收敛，结束循环。
    // 但若模型请求了人工动作，正文会停在「我打算去做…」的承诺上、看完没反馈；
    // 改为回喂一次说明让模型基于已有信息收敛出最终回复，不静默丢弃。
    if (actions.length === 0) {
      // 被拦下的动作不能静默丢弃：人工动作要用户去界面点，不可逆动作要用户
      // 在气泡按钮里确认。回喂一次说明后收敛，不再让模型重复发同一批动作。
      const blockedNotes: string[] = [];
      if (skippedManual.length > 0) {
        blockedNotes.push(`${skippedManual.map((s) => s.label || s.action).join('、')} 需要用户在界面上手动触发，本次已跳过`);
      }
      if (skippedIrreversible.length > 0) {
        blockedNotes.push(`${skippedIrreversible.map((s) => s.label || s.action).join('、')} 属于不可逆操作，系统不会代为执行；已在对话底部保留执行按钮，用户点击并确认后才会执行`);
      }
      if (blockedNotes.length > 0 && !manualNotified && round < MAX_ROUNDS - 1) {
        manualNotified = true;
        history.push({
          role: 'user',
          content: `【执行结果】\n${blockedNotes.join('；')}。请不要再重复输出这些 action，也不要附带 SUGGESTIONS，直接基于已有信息给出面向用户的最终回复。`,
        });
        ports.tracker.complete('待用户确认的动作已保留按钮，已回喂收敛');
        continue;
      }
      // 软件自己检查一遍：用户下的是执行指令，模型却未附带任何 action，那么什么也不会发生。
      // 不靠措辞猜，直接读工程真实状态回喂，迫使模型要么补上动作、要么据实说明未执行。
      if (!intentVerified && !executedLog.length && ports.isTaskRequest(userText) && round < MAX_ROUNDS - 1) {
        intentVerified = true;
        const stateText = await ports.verifyProjectState();
        history.push({
          role: 'user',
          content:
            `【系统核验】你上一轮回复没有附带任何 action，系统没有执行任何操作，用户要求的「${userText.slice(0, 60)}」仍在等待。\n` +
            `工程当前真实状态：\n${stateText}\n` +
            '请二选一：① 确实需要执行→本轮必须在回复末尾输出 [SUGGESTIONS] 并给出清单内的 action（如 auto_storyboard / generate_script / create_character），否则不会有任何效果；' +
            '② 因缺少前置条件无法执行→直接如实告知用户缺什么、下一步怎么做，不得使用「我这就去…/我会…」这类承诺措辞。',
        });
        ports.tracker.complete('核验：本轮未触发任何动作，已回喂工程真实状态');
        continue;
      }
      break;
    }

    ports.onRoundPlan(round, actions.length, actions.map((a) => a.label || a.action).join('、'));

    // 执行动作，收集观察结果
    const observations: string[] = [];
    roundImages = []; // 本轮内联的图片，随观察消息一起回喂
    let askedUser = false;
    for (const a of actions) {
      const label = a.label || a.action;
      // ask：生成澄清卡片并暂停整个 agent 循环；选项或自定义回答会作为下一条用户消息回传。
      if (a.action === 'ask') {
        const fallbackQuestion = String(a.label || '').trim()
          || '能告诉我你想要一个什么样的故事吗？（题材 / 风格 / 主角 / 篇幅）';
        askCard = createAskCard(a.params, fallbackQuestion);
        roundReply = askCard.question;
        observations.push(`已向用户提问，等待其回答后再继续：${askCard.question}`);
        askedUser = true;
        break;
      }
      // 质检：循环内自动采集分镜素材（提示词/生成情况/分辨率/大小）+ 内联真实画面回喂，下一轮模型据实给出评级反馈
      if (a.action === 'inspect_quality') {
        ports.tracker.start('质检：采集分镜素材与画面中…');
        try {
          const sid = Number(a.params?.sceneId) || Number(input.currentFrameId) || 0;
          const report = await ports.inspectQuality(sid);
          const ok = !report.text.startsWith('质检失败');
          if (ok) {
            const got = await collectRoundImages(report.images, 4);
            observations.push(got.failedNote ? `${report.text}\n${got.failedNote}` : report.text);
            ports.tracker.complete(`素材已采集${got.inlined ? `，已内联 ${got.inlined} 张画面` : ''}，待模型给出评级反馈`);
          } else ports.tracker.fail('未找到对应分镜');
          executedLog.push(`${ok ? '✓' : '✗'} ${label}`);
          if (!ok) observations.push(report.text);
        } catch (e) {
          ports.tracker.fail(toErrorMessage(e) || '素材采集失败');
          executedLog.push(`✗ ${label}`);
          observations.push(`质检素材采集失败：${toErrorMessage(e) || e}。请如实告知用户并给出后续建议。`);
        }
        continue;
      }
      // 看图：把项目内的图片内联为 data URL 随观察回喂，模型下一轮才真正“看到”画面
      if (a.action === 'view_image') {
        ports.tracker.start('查看画面：定位图片中…');
        try {
          const targets = ports.resolveImageTargets(a.params || {});
          if (targets.length === 0) {
            ports.tracker.fail('未找到匹配的图片');
            executedLog.push(`✗ ${label}`);
            observations.push(`view_image 没找到匹配的图片（params：${JSON.stringify(a.params || {})}）。可改用 sceneId 或更准确的 keyword 重试，或如实告知用户该资产暂无图片。`);
          } else {
            const got = await collectRoundImages(targets, 4);
            executedLog.push(`✓ ${label}`);
            if (got.inlined > 0) {
              ports.tracker.complete(`已内联 ${got.inlined} 张图片，待模型观看反馈`);
              observations.push(
                `已取出 ${got.inlined} 张图片（${targets.slice(0, 4).map((t) => t.label).join('、')}）附在本条消息中。` +
                `这些图已经是你亲眼看到的画面，请在后续回复正文里基于实际内容作答（构图/色彩/人物与场景一致性/与分镜要求的偏差），不得臆测图中没有的东西；${got.failedNote ? `部分图片读取失败：\n${got.failedNote}` : ''}`,
              );
            } else {
              ports.tracker.fail('图片读取失败');
              observations.push(`view_image 找到 ${targets.length} 张图片但都无法读取：\n${got.failedNote}。请如实告知用户并建议重新生成该画面或检查工程 media/ 目录。`);
            }
          }
        } catch (e) {
          ports.tracker.fail(toErrorMessage(e) || '图片读取失败');
          executedLog.push(`✗ ${label}`);
          observations.push(`查看图片失败：${toErrorMessage(e) || e}。请告知用户并改用文字素材作答。`);
        }
        continue;
      }
      try {
        // 执行前把进度刷到对话栏：长任务（如分镜拆分同步等待模型返回）期间显示「正在执行」
        ports.tracker.start(`执行：${label}`);
        // 分镜拆分：执行前先读工程文档里的真实数量，执行后用它对比，不凭返回值宣称完成
        const sceneCountBefore = a.action === 'auto_storyboard' && input.hasProject
          ? (await ports.fetchScenes()).length
          : null;
        if (a.action === 'generate_script') {
          scriptGenerationHandled = true;
          // 行为卡片接管后移除 Agent 规划消息，避免对话区同时出现两套进度反馈。
          ports.onScriptGenerationStart();
        }
        const result: any = await ports.execute(a.action, a.params || {}, (sub) => ports.tracker.touch(sub));
        // handleAction 已把桥接异常转为结构化失败结果：步骤据实标记失败，避免误报「已执行」
        const failed = isActionFailure(result);
        if (a.action === 'generate_script' && failed) scriptGenerationFailed = true;
        if (failed) ports.tracker.fail(actionErrorText(result) || '任务启动失败');
        // 资源库/分镜动作的成功回执：字符串或结构化 summary 都直接展示在步骤详情中
        else ports.tracker.complete(actionSuccessText(result) || undefined);
        const logIndex = executedLog.length;
        executedLog.push(failed ? `✗ ${label}` : `✓ ${label}`);
        const isTask = TASK_ACTIONS.has(a.action);
        if (failed) {
          // 动作明确失败：回喂真实失败原因（handleAction 已跳过挂卡片）
          observations.push(`执行「${label}」失败：${actionErrorText(result) || '任务启动失败'}`);
        } else if (isTask && result && result.jobId) {
          // 后台任务已提交：进度卡片由 handleAction 挂载并实时更新，此处据实回报
          observations.push(
            `已在后台启动「${label}」（工作流 #${result.jobId}），进度将实时显示在对话中并在完成后自动更新。请告知用户任务已开始、可在对话卡片查看进度，不要虚构具体的分镜/图片/视频数量。`,
          );
        } else if (isTask && result && result.sceneCount != null) {
          // 离线分镜拆分同步完成：不直接相信返回的 sceneCount，回读工程文档核验是否真的落库
          const after = input.hasProject ? await ports.fetchScenes() : [];
          const claimed = Number(result.sceneCount);
          if (after.length === 0) {
            ports.tracker.fail('核验：工程文档里没有任何分镜，拆分未落库');
            executedLog[logIndex] = `✗ ${label}（核验未落库）`;
            observations.push(
              `【系统核验】「${label}」返回写入 ${claimed} 个分镜，但重新读取工程文档发现仍是 0 个——拆分并没有真正落库。` +
              '请如实告知用户拆分未成功及可能原因，不要宣称已完成；可先 read_script 确认剧本正文，再重试 auto_storyboard。',
            );
          } else if (sceneCountBefore != null && after.length <= sceneCountBefore) {
            ports.tracker.fail(`核验：分镜数未增加（仍为 ${after.length} 个）`);
            executedLog[logIndex] = `✗ ${label}（核验未新增）`;
            observations.push(
              `【系统核验】「${label}」声称写入 ${claimed} 个，但工程内分镜从 ${sceneCountBefore} 个到 ${after.length} 个并未增加——本次拆分没有产生新分镜。` +
              '请据实告知用户，不要报成功。',
            );
          } else {
            // 台词校验结论一并回喂：否则智能体不知道哪些句子还没说话人，只能盲猜归属
            const unresolved = after.reduce(
              (n, s) => n + (s.dialogues || []).filter((d) => !String(d?.character || '').trim()).length,
              0,
            );
            observations.push(
              `「${label}」已完成并经系统核验：工程内现有 ${after.length} 个分镜${sceneCountBefore != null ? `（执行前 ${sceneCountBefore} 个）` : ''}，返回声称写入 ${claimed} 个。` +
              (typeof result.dialogueNote === 'string' && result.dialogueNote ? ` ${result.dialogueNote}。` : '') +
              (unresolved > 0
                ? ` 其中 ${unresolved} 句台词尚未识别出说话人，需用户确认或你用 ask 追问后再接上，不得猜归属。`
                : '') +
              '请如实告知用户分镜数量（以核验值为准）；后续需要 sceneId 时用 read_storyboards 取真实清单。',
            );
          }
        } else if (typeof result === 'string' && result.trim()) {
          // 动作返回了实质内容（如 read_script 的剧本正文）：直接回喂给模型作为观察结果。
          observations.push(result);
        } else if (actionSuccessText(result)) {
          // 结构化成功回执（删除/更新类动作）：summary 已是面向模型与用户的一行结论，
          // 比整包 JSON 更好读；模型若需细节会自己调用只读动作复核。
          observations.push(actionSuccessText(result));
        } else if (result && typeof result === 'object') {
          // 结构化结果（如新建角色/场景返回的 ID）回喂给模型，便于串联后续动作。
          try {
            const detail = JSON.stringify(result);
            observations.push(`已执行「${label}」：${detail.length > 800 ? detail.slice(0, 800) + '…' : detail}`);
          } catch {
            observations.push(`已执行「${label}」`);
          }
        } else if (isTask) {
          // 任务动作没给凭证：不能只留一句「无法确认」就结束（用户看到「执行完成」却没有回执，
          // 还得模型自己再发一轮 read_storyboards 才能确认）。系统直接回读工程真实状态兜底。
          const after = a.action === 'auto_storyboard' && input.hasProject
            ? await ports.fetchScenes().catch(() => [])
            : null;
          if (after && after.length > 0) {
            observations.push(
              `「${label}」未返回执行凭证，但系统回读工程文档确认现有 ${after.length} 个分镜` +
              `${sceneCountBefore != null ? `（执行前 ${sceneCountBefore} 个）` : ''}。` +
              '请以该核验值为准直接回复用户，不要再调用 read_storyboards 复核。',
            );
          } else if (after) {
            ports.tracker.fail('核验：动作未返回凭证且工程内没有分镜');
            executedLog[logIndex] = `✗ ${label}（未落库）`;
            observations.push(
              `【系统核验】「${label}」未返回凭证，且工程文档里仍然是 0 个分镜——拆分未落库。` +
              '请如实告知用户未成功及原因，不得宣称已完成。',
            );
          } else {
            observations.push(
              `「${label}」没有返回任何执行凭证（无任务 ID、无返回内容），系统无法确认它是否真的触发。` +
              '请用只读动作（read_storyboards / read_script / get_task_status）复核后再据实回复，不得宣称已完成。',
            );
          }
        } else {
          // 无 jobId、无返回内容、也无结构化凭证：不能断言“已执行”，否则模型会把没发生的事告诉用户
          observations.push(
            `「${label}」没有返回任何执行凭证（无任务 ID、无返回内容），系统无法确认它是否真的触发。` +
            '请用只读动作（read_storyboards / read_script / get_task_status）复核后再据实回复，不得宣称已完成。',
          );
        }
      } catch (e) {
        ports.tracker.fail(toErrorMessage(e) || String(e));
        executedLog.push(`✗ ${label}`);
        observations.push(`执行「${label}」失败：${toErrorMessage(e) || e}`);
      }
    }

    // 剧本失败已在行为卡片内收敛，不再让模型把错误详情改写成普通聊天消息。
    if (scriptGenerationFailed) { finalStatus = 'script'; break; }

    // 已向用户提问 → 结束本轮循环，把提问作为最终回复交还用户输入。
    if (askedUser) { finalStatus = 'ask'; break; }

    // 回喂执行结果作为新一轮用户侧上下文（本轮内联的真实画面随消息一起交给模型）
    const obsText = `【执行结果】\n${observations.join('\n')}\n\n请根据以上执行结果继续规划后续步骤；若任务已全部完成，请给出最终总结且不再附带 SUGGESTIONS。`;
    history.push(roundImages.length > 0 ? { role: 'user', content: obsText, attachments: roundImages } : { role: 'user', content: obsText });
    roundImages = [];

    ports.tracker.start(`汇总执行结果，回喂模型继续规划（第 ${round + 2} 轮）`);
  }

  // 收尾：所有步骤折叠为摘要，正文换回最终回复（保留折叠步骤区供回看）
  ports.tracker.finishAll(scriptGenerationFailed);
  const finalContent = (roundReply
    || (executedLog.length ? `已处理以下任务：\n${executedLog.map((e, i) => `${i + 1}. ${e}`).join('\n')}` : '(无回复)'))
    // 回喂核验后模型仍只承诺不动作（也未向用户提问）：把事实标注给用户，不把承诺当成结果
    + (intentVerified && executedLog.length === 0 && !askCard && pendingConfirm.length === 0
      ? '\n\n（系统核验：本轮没有触发任何工具动作，上述操作尚未执行。）'
      : '')
    // 删除类动作被智能体循环拦下：必须显式告诉用户去哪儿确认，否则「已删除」就成了空话
    + (pendingConfirm.length
      ? '\n\n（删除类操作不会自动执行，请在下方按钮中确认。）'
      : '');
  const state = snapshotState(finalStatus, MAX_ROUNDS);
  ports.onState?.(state);
  return {
    finalContent,
    askCard,
    pendingConfirm,
    scriptGenerationHandled,
    scriptGenerationFailed,
    state,
  };
}