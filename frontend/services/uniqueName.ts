// 同名条目处理（uniqueName）
// ──────────────────────────────────────────────────────────────
// 目的：把"同一个容器里出现两个一模一样名字"的消歧逻辑收在一处。
// 剧本标题、工程名称都走这里，避免各处各写一份"加 (2)"的规则互相漂移。
//
// 约定：
//  - 只在**同一作用域**内比较（同一工程的剧本列表 / 全部已注册工程），不跨工程；
//  - 比较口径为归一化后的全等（去首尾空白、折叠连续空白、拉丁字母转小写），
//    中文不受大小写影响；
//  - 只追加" (N)"后缀，从 2 开始；已带后缀的同名条目会被剥掉后缀重新编号，
//    避免出现「X (2) (2)」这类套娃。
//  - 覆盖式写入（编辑保存、润色覆盖原稿）绝不调用本模块 —— 那是改同一条记录，不是新增。

/** 归一化比较键：去首尾空白、折叠连续空白、拉丁字母小写 */
export function normalizeNameKey(text: unknown): string {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** 剥掉结尾的「 (N)」后缀，返回可用于重新编号的词干 */
function stripSuffix(text: string): string {
  return text.replace(/\s*\((\d+)\)\s*$/, '').trim();
}

/**
 * 在 `taken` 里已占用的名字之外，为 `base` 取一个不冲突的新名字。
 * 未冲突时原样返回（不改大小写、不加后缀）；冲突时返回 `base (2)`、`base (3)`……
 * 极端情况（999 个同名）退化到时间戳，保证一定唯一，不让写入失败。
 */
export function makeUniqueName(base: unknown, taken: Iterable<unknown>): string {
  const used = new Set<string>();
  for (const item of taken) {
    const key = normalizeNameKey(item);
    if (key) used.add(key);
  }
  const clean = String(base ?? '').trim();
  if (!clean) return clean;
  if (!used.has(normalizeNameKey(clean))) return clean;
  const stem = stripSuffix(clean) || clean;
  for (let n = 2; n <= 999; n += 1) {
    const candidate = `${stem} (${n})`;
    if (!used.has(normalizeNameKey(candidate))) return candidate;
  }
  return `${stem} (${Date.now()})`;
}

/**
 * 剧本标题消歧：与 makeUniqueName 同一口径，单列出来是为了让调用点读得出"这是标题"。
 * `others` 传同一工程内其余剧本的标题即可（不必排除自己，因为只在新增时调用）。
 */
export function makeUniqueScriptTitle(base: unknown, others: Iterable<unknown>): string {
  return makeUniqueName(base, others);
}

/** 是否与 `taken` 中的某一项同名（归一化全等） */
export function nameTaken(base: unknown, taken: Iterable<unknown>): boolean {
  const key = normalizeNameKey(base);
  if (!key) return false;
  for (const item of taken) {
    if (normalizeNameKey(item) === key) return true;
  }
  return false;
}

/**
 * 找出出现两次以上的名称（归一化后），返回其比较键集合。
 * 用于列表侧的可视化：导入的工程名由清单决定、不该被程序改写，
 * 所以那一类重名只能在界面上标出来源目录以示区分。
 */
export function duplicateNameKeys(names: Iterable<unknown>): Set<string> {
  const counts = new Map<string, number>();
  for (const item of names) {
    const key = normalizeNameKey(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const dup = new Set<string>();
  for (const [key, n] of counts) {
    if (n > 1) dup.add(key);
  }
  return dup;
}

/** 是否命中 `duplicateNameKeys` 得到的重名集合 */
export function isDuplicateName(base: unknown, dupKeys: Set<string>): boolean {
  return dupKeys.has(normalizeNameKey(base));
}

/** 取路径末段作为重名标注（Windows/Unix 分隔符都认；整串都是分隔符时返回空） */
export function pathLeaf(path: unknown): string {
  const text = String(path ?? '').trim();
  if (!text) return '';
  // 先把反斜杠统一成正斜杠再切分，避免正则字符类在构建工具里的转义歧义
  const parts = text.split('\\').join('/').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}
