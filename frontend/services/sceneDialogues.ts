// 台词校验与角色指代（sceneDialogues）
//
// 纯函数模块，不依赖 Tauri 与文档读写，供以下消费方共用同一套「一行一个说话人」口径：
//  - localStoryboards：拆分剧本时校验并结构化台词，把「角色外貌 + 台词」写进 video_prompt；
//  - localWorkflow：视频生成前为缺失该段的提示词现场补齐；
//  - DialogEditor / AIAssistantPanel：UI 校验提示与注入给智能体的台词清单。
// 之所以集中一处：台词归属一旦在各处各写一份正则，就会出现「编辑器看到的」与
// 「视频模型听到的」不是同一套说话人，画面里开口的人就错了。

// 视频模型不认识「老李 / 顾北」这类剧本名字。官方提示词指南的要求是：
// 先用 2-3 个稳定静态特征把画面中的主体「定义为」某个标签，之后每次涉及该主体都沿用同一标签指代，
// 台词用 {} 包裹（音效 <>、音乐（）、字幕【】），且台词语言需统一。
// 因此拆分阶段必须把「哪句话是谁说的」结构化，并把说话人的外貌特征一并写进视频提示词；
// 否则多角色对话会被模型随机分配开口的人，台词与画面对不上。

/** 结构化台词行（与前端 useSceneManager 的 DialogueLine 字段对齐） */
export interface DialogueLineOut {
  character: string;
  line: string;
  order: number;
}

/** 单个镜头的台词校验统计 */
export interface DialogueCheck {
  lines: number;
  missing: number;
  unknown: string[];
  resplit: number;
}

/** 注入视频提示词的段落标记：重复拆分时据此替换旧段，不堆叠 */
export const DIALOGUE_CLAUSE_MARK = '【角色指代与台词】';

/**
 * 剧本里常见的说话人前缀：「老李：别拧了」/「老李:别拧了」/「老李（低声）：关门」。
 * 两个硬约束都是为了不把正文里的冒号误当成说话人：
 * ① 必须出现在句首或句读之后；② 名字不超 6 字（中文台词标签的真实长度），
 * 否则「菜单上写着价格：30 元」这种长串会退化成贪婪匹配、把一个假说话人拆出来。
 * 捕获组 2 = 名字，括号修饰（低声）/（OS）不属于名字，留在组外。
 */
const SPEAKER_PREFIX_RE = /(^|[\s。！？；，、”""])\s*([\u4e00-\u9fa5A-Za-z0-9·_]{1,6})(?:[（(][^）)\n]{0,12}[)）])?\s*[:：]/g;

/** 行首残留的说话人前缀（用于兜底清理，与 SPEAKER_PREFIX_RE 同口径） */
const SPEAKER_LEADING_RE = /^[\u4e00-\u9fa5A-Za-z0-9·_]{1,6}(?:[（(][^）)\n]{0,12}[)）])?\s*[:：]\s*/;

/** 去掉名字上的括号修饰：「老李（低声）」→「老李」 */
function stripSpeakerParenthetical(name: unknown): string {
  return String(name ?? '').replace(/[（(][^）)]*[)）]/g, '').trim();
}

/**
 * 把一段可能混入多个说话人的文本切成 {speaker, text}。
 * 关键在于成对对齐：一个标记之后的正文属于该标记的人，而不是下一个人。
 * 早先版本把「名字」和「正文」当成两个独立片段产出，导致整行台词都丢了说话人。
 */
function splitBySpeaker(text: string): { speaker: string; text: string }[] {
  const out: { speaker: string; text: string }[] = [];
  const re = new RegExp(SPEAKER_PREFIX_RE.source, 'g');
  let current: { speaker: string; text: string } | null = null;
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // m[1] 是句读本身（可能为空），归给上一位说话人，不然「走吧。」会被削成「走吧」
    const body = text.slice(consumed, m.index + m[1].length).trim();
    consumed = m.index + m[0].length;
    if (current) {
      current.text = body;
      out.push(current);
    } else if (body) {
      out.push({ speaker: '', text: body });
    }
    current = { speaker: m[2] || '', text: '' };
  }
  const tail = text.slice(consumed).trim();
  if (current) current.text = tail;
  else if (tail) out.push({ speaker: '', text: tail });
  if (current) out.push(current);
  return out;
}

/** 说话人 → 本镜头出场角色：先精确（忽略大小写与括号），再退化为包含匹配 */
export function matchSpeaker(speaker: string, cast: string[]): string {
  const s = stripSpeakerParenthetical(speaker);
  if (!s) return '';
  const lower = s.toLowerCase();
  const norm = cast.map((c) => stripSpeakerParenthetical(c));
  const exact = norm.findIndex((n) => n.toLowerCase() === lower);
  if (exact >= 0) return cast[exact];
  const fuzzy = norm.findIndex((n) => !!n && (n.toLowerCase().includes(lower) || lower.includes(n.toLowerCase())));
  if (fuzzy >= 0) return cast[fuzzy];
  // 匹配不到时保留原名，由调用方上报「说话人不在出场角色」
  return s;
}

/**
 * 台词校验：把模型给的 dialogues / dialogue 统一成「一行一个说话人」。
 * 兼容三类退化：① 只给整段 dialogue；② 一行里塞多个「名字：」；③ speaker 与出场角色写法不一致。
 */
export function normalizeSceneDialogues(raw: any, cast: string[]): { lines: DialogueLineOut[]; check: DialogueCheck } {
  const incoming = Array.isArray(raw?.dialogues) ? raw.dialogues : [];
  const fragments: { speaker: string; text: string }[] = [];
  let resplit = 0;
  const absorb = (speaker: string, text: string) => {
    const parts = splitBySpeaker(text);
    if (parts.length > 1) resplit += parts.length - 1;
    // 行内标了说话人时以行内为准：一行只属于一个人，
    // 拿行首的 speaker 去覆盖所有拆出的片段会把后半句安到错的人头上。
    for (const p of parts) fragments.push({ speaker: p.speaker || speaker, text: p.text });
  };
  if (incoming.length) {
    for (const item of incoming) {
      if (typeof item === 'string') {
        absorb('', item);
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      absorb(
        stripSpeakerParenthetical(item.speaker ?? item.character ?? item.role ?? ''),
        String(item.line ?? item.text ?? item.content ?? ''),
      );
    }
  } else {
    absorb('', String(raw?.dialogue ?? ''));
  }

  const lines: DialogueLineOut[] = [];
  const unknown = new Set<string>();
  let missing = 0;
  for (const f of fragments) {
    // 去掉残留的说话人前缀，保证 line 只有台词本体（名字归 character）
    const line = String(f.text || '').replace(SPEAKER_LEADING_RE, '').trim();
    if (!line) continue;
    let character = matchSpeaker(f.speaker, cast);
    // 单角色镜头可安全归属；多角色镜头缺说话人就不能猜，否则台词会安到错的人脸上
    if (!character && cast.length === 1) character = cast[0];
    if (!character) missing++;
    else if (cast.length && !cast.includes(character)) unknown.add(character);
    lines.push({ character, line, order: lines.length });
  }
  return { lines, check: { lines: lines.length, missing, unknown: [...unknown], resplit } };
}

/** 出场角色的「定义主体」句：用外貌特征把画面中的人绑定到角色名 */
export function buildSubjectDefinition(cast: string[], appearance: Map<string, string>): string {
  const defs: string[] = [];
  for (const name of cast) {
    const feat = String(appearance.get(name.toLowerCase()) || '').replace(/\s+/g, ' ').trim();
    if (feat) defs.push(`将画面中${feat.slice(0, 60)}的角色定义为${name}`);
  }
  return defs.length ? `${defs.join('，')}。` : '';
}

/** 台词句：沿用角色标签指代，台词按 Seedance 规范用 {} 包裹 */
export function buildDialogueClause(lines: DialogueLineOut[], voiceover: string): string {
  const spoken = lines.map((l) => (l.character ? `${l.character}说道{${l.line}}` : `{${l.line}}`)).join('，');
  return [spoken, voiceover ? `画外音{${voiceover}}` : ''].filter(Boolean).join('，');
}

/**
 * 对单条拆分结果做台词校验，并把「角色外貌 + 台词」写进视频提示词。
 * 幂等：重复拆分时按 DIALOGUE_CLAUSE_MARK 替换旧段，不堆叠。
 */
export function enforceSceneDialogues(raw: any, appearance: Map<string, string>): DialogueCheck {
  const cast = (Array.isArray(raw?.characters) ? raw.characters : raw?.characters != null ? [raw.characters] : [])
    .map((c: any) => String(typeof c === 'string' ? c : (c?.name ?? '')).trim())
    .filter(Boolean);
  const { lines, check } = normalizeSceneDialogues(raw, cast);
  const voiceover = String(raw?.voiceover ?? '').trim();
  if (lines.length) {
    raw.dialogues = lines;
    // 保留扁平文本供旧字段消费方（列表摘要/导出），但不再拿它反推说话人
    raw.dialogue = lines.map((l) => (l.character ? `${l.character}：${l.line}` : l.line)).join(' ');
  }
  // 定义主体只为「消解谁在说话」服务：没有台词的镜头（静帧或纯旁白）不必塞这段，
  // 否则会往用户可见的 video_prompt 里注入一堆用不上的主体定义。
  const clause = [
    lines.length ? buildSubjectDefinition(cast, appearance) : '',
    lines.length || voiceover ? buildDialogueClause(lines, voiceover) : '',
  ]
    .filter(Boolean)
    .join('');
  const base = String(raw.video_prompt ?? raw.description ?? '').trim();
  const stripped = base.split(DIALOGUE_CLAUSE_MARK)[0].trim();
  if (clause) {
    raw.video_prompt = `${stripped}${stripped && !stripped.endsWith('。') ? '。' : ''}${DIALOGUE_CLAUSE_MARK}${clause}`;
  } else if (stripped !== base) {
    raw.video_prompt = stripped;
  }
  return check;
}
