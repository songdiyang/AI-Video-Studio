/**
 * 分镜内容校验工具
 *
 * 检测空镜头、重复镜头、叙事冗余和连贯性问题，
 * 并提供具体的修改建议。
 */

import type { StoryboardScene } from '../useSceneManager';

// ============ 类型定义 ============

export type ValidationIssueType =
  | 'empty_shot'            // 空镜头
  | 'weak_content'          // 弱内容镜头
  | 'duplicate_shot'        // 内容高度重复
  | 'composition_duplicate' // 构图重复
  | 'narrative_stagnation'  // 叙事停滞
  | 'character_discontinuity' // 角色断层
  | 'scene_jump'            // 场景跳转
  | 'continuity_error'      // 连续性错误
  | 'transition_missing'    // 转场缺失
  | 'duration_anomaly';     // 时长异常

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface StoryboardValidationIssue {
  type: ValidationIssueType;
  severity: ValidationSeverity;
  storyboardIds: number[];
  indices: number[];
  message: string;
  suggestion: string;
}

export interface StoryboardValidationResult {
  totalShots: number;
  issueCount: number;
  issues: StoryboardValidationIssue[];
  summary: {
    emptyShots: number;
    duplicateShots: number;
    continuityErrors: number;
    warnings: number;
  };
}

// ============ 辅助函数 ============

/** 检查字符串是否为空或仅含空白 */
function isEmptyOrWhitespace(s: string | undefined | null): boolean {
  return !s || s.trim().length === 0;
}

/** 对字符串做归一化，用于相似度比较 */
function normalizeText(s: string): string {
  return s
    .replace(/[\s\u3000，。、！？；：""''「」『』【】（）\-\—\–,.\!?\;:\"\'\(\)\[\]]/g, '')
    .toLowerCase();
}

/** 计算 Jaccard 相似度（基于字符 bigram） */
function jaccardSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const bigramsA = new Set<string>();
  const bigramsB = new Set<string>();

  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  const union = bigramsA.size + bigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** 判断角色数组是否实质相同（忽略顺序与泛称） */
function sameCharacterSet(a: string[], b: string[]): boolean {
  if (a.length === 0 && b.length === 0) return true;
  if (a.length !== b.length) return false;
  const setA = new Set(a.map(c => c.trim()).filter(Boolean));
  const setB = new Set(b.map(c => c.trim()).filter(Boolean));
  if (setA.size !== setB.size) return false;
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}

// ============ 1. 空镜头检测 ============

function detectEmptyShots(scenes: StoryboardScene[]): StoryboardValidationIssue[] {
  const issues: StoryboardValidationIssue[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const hasDescription = !isEmptyOrWhitespace(s.description);
    const hasDialogue = !isEmptyOrWhitespace(s.dialogue);
    const hasCharacters = s.characters && s.characters.length > 0;
    const hasLocation = !isEmptyOrWhitespace(s.location);
    const hasProps = s.props && s.props.length > 0;
    const hasEmotion = !isEmptyOrWhitespace(s.emotion);
    const hasAction = !!s.hasAction;

    // 完全空镜头：没有任何内容
    if (!hasDescription && !hasDialogue && !hasCharacters && !hasLocation && !hasProps) {
      issues.push({
        type: 'empty_shot',
        severity: 'error',
        storyboardIds: [s.id],
        indices: [i],
        message: `镜头 ${i + 1} 为空镜头：无描述、无角色、无场景、无对话`,
        suggestion: '请补充镜头描述，添加角色或场景信息，或删除该空镜头',
      });
      continue;
    }

    // 有描述但无实质内容元素
    if (hasDescription && !hasCharacters && !hasLocation && !hasDialogue && !hasProps) {
      issues.push({
        type: 'empty_shot',
        severity: 'warning',
        storyboardIds: [s.id],
        indices: [i],
        message: `镜头 ${i + 1} 缺少关键元素：有描述但无角色、场景、对话`,
        suggestion: '建议为该镜头关联角色和场景，或补充对话内容',
      });
      continue;
    }

    // 弱内容镜头：无对话、无动作、无情绪
    if (!hasDialogue && !hasAction && !hasEmotion && hasDescription) {
      issues.push({
        type: 'weak_content',
        severity: 'info',
        storyboardIds: [s.id],
        indices: [i],
        message: `镜头 ${i + 1} 内容较单薄：无对话、无动作、无情绪标注`,
        suggestion: '建议补充对话内容、标注情绪或标记动作，增强叙事表达力',
      });
    }
  }

  return issues;
}

// ============ 2. 重复镜头检测 ============

function detectDuplicateShots(scenes: StoryboardScene[]): StoryboardValidationIssue[] {
  const issues: StoryboardValidationIssue[] = [];
  const reported = new Set<string>(); // 避免同一对重复被报告多次

  for (let i = 0; i < scenes.length; i++) {
    for (let j = i + 1; j < scenes.length; j++) {
      const a = scenes[i];
      const b = scenes[j];
      const pairKey = `${a.id}-${b.id}`;
      if (reported.has(pairKey)) continue;

      const sameLocation = a.location && b.location && a.location.trim() === b.location.trim();
      const sameChars = sameCharacterSet(a.characters || [], b.characters || []);

      // 场景 + 角色完全相同 → 高度重复
      if (sameLocation && sameChars && a.characters.length > 0) {
        const normA = normalizeText(a.description);
        const normB = normalizeText(b.description);
        const similarity = jaccardSimilarity(normA, normB);

        if (similarity > 0.5) {
          reported.add(pairKey);
          issues.push({
            type: 'duplicate_shot',
            severity: similarity > 0.8 ? 'error' : 'warning',
            storyboardIds: [a.id, b.id],
            indices: [i, j],
            message: `镜头 ${i + 1} 和 ${j + 1} 高度重复：相同场景「${a.location}」、相同角色「${a.characters.join('、')}」，描述相似度 ${Math.round(similarity * 100)}%`,
            suggestion: similarity > 0.8
              ? '建议合并为单一镜头或删除冗余镜头'
              : '建议增加差异化描述，突出每个镜头的叙事重点',
          });
          continue;
        }
      }

      // 描述文本相似度 > 80% → 内容重复
      const normA = normalizeText(a.description);
      const normB = normalizeText(b.description);
      if (normA.length >= 4 && normB.length >= 4) {
        const similarity = jaccardSimilarity(normA, normB);
        if (similarity > 0.8 && !reported.has(pairKey)) {
          reported.add(pairKey);
          issues.push({
            type: 'duplicate_shot',
            severity: 'warning',
            storyboardIds: [a.id, b.id],
            indices: [i, j],
            message: `镜头 ${i + 1} 和 ${j + 1} 描述高度相似（${Math.round(similarity * 100)}%），可能存在内容重复`,
            suggestion: '建议修改其中一个镜头的描述，增加差异化内容，或删除冗余镜头',
          });
        }
      }

      // 构图重复：景别 + 机位 + 场景全相同
      if (sameLocation && a.shotLanguage && b.shotLanguage) {
        const sameShotSize = a.shotLanguage.shotSize && a.shotLanguage.shotSize === b.shotLanguage.shotSize;
        const sameCameraHeight = a.shotLanguage.cameraHeight && a.shotLanguage.cameraHeight === b.shotLanguage.cameraHeight;
        const sameMovement = a.shotLanguage.cameraMovement && a.shotLanguage.cameraMovement === b.shotLanguage.cameraMovement;

        if (sameShotSize && sameCameraHeight && sameMovement && !reported.has(pairKey)) {
          reported.add(pairKey);
          issues.push({
            type: 'composition_duplicate',
            severity: 'warning',
            storyboardIds: [a.id, b.id],
            indices: [i, j],
            message: `镜头 ${i + 1} 和 ${j + 1} 构图重复：同场景「${a.location}」下景别、机位高度、镜头运动完全一致`,
            suggestion: '建议调整其中一个镜头的景别或机位，创造视觉变化，避免观众审美疲劳',
          });
        }
      }
    }
  }

  return issues;
}

// ============ 3. 叙事功能验证 ============

function validateNarrativeFunction(scenes: StoryboardScene[]): StoryboardValidationIssue[] {
  const issues: StoryboardValidationIssue[] = [];

  // 3a. 连续3+镜头无对话、无动作、无情绪 → 叙事停滞
  let stagnationStart = -1;
  for (let i = 0; i <= scenes.length; i++) {
    const s = i < scenes.length ? scenes[i] : null;
    const isStagnant = s && isEmptyOrWhitespace(s.dialogue) && !s.hasAction && isEmptyOrWhitespace(s.emotion);

    if (isStagnant) {
      if (stagnationStart === -1) stagnationStart = i;
    } else {
      if (stagnationStart !== -1) {
        const streak = i - stagnationStart;
        if (streak >= 3) {
          const ids = scenes.slice(stagnationStart, i).map(sc => sc.id);
          const indices = [];
          for (let k = stagnationStart; k < i; k++) indices.push(k);
          issues.push({
            type: 'narrative_stagnation',
            severity: 'warning',
            storyboardIds: ids,
            indices,
            message: `镜头 ${stagnationStart + 1}-${i} 连续 ${streak} 个镜头无对话、无动作、无情绪标注，叙事可能停滞`,
            suggestion: '建议在连续镜头中增加对话、动作描述或情绪标注，推动叙事发展',
          });
        }
        stagnationStart = -1;
      }
    }
  }

  // 3b. 角色出现后突然消失无交代 → 角色断层
  const charLastSeen = new Map<string, number>(); // 角色名 → 最后出现的分镜序号
  const totalScenes = scenes.length;

  for (let i = 0; i < totalScenes; i++) {
    const s = scenes[i];
    if (!s.characters) continue;
    for (const char of s.characters) {
      charLastSeen.set(char, i);
    }
  }

  // 检查哪些角色在出现后又消失且之后不再出现
  for (const [char, lastIdx] of charLastSeen) {
    // 角色至少出场2次且在非结尾处消失
    const appearances: number[] = [];
    for (let i = 0; i < totalScenes; i++) {
      if (scenes[i].characters && scenes[i].characters.includes(char)) {
        appearances.push(i);
      }
    }

    // 角色出现至少2次，且在故事中间消失（最后出现位置距结尾超过20%且至少2个镜头）
    const disappearThreshold = Math.max(2, Math.floor(totalScenes * 0.2));
    if (appearances.length >= 2 && lastIdx < totalScenes - disappearThreshold) {
      // 角色有较长出场段后消失
      const firstAppear = appearances[0];
      const gapToEnd = totalScenes - 1 - lastIdx;
      if (gapToEnd >= disappearThreshold && lastIdx - firstAppear >= 1) {
        issues.push({
          type: 'character_discontinuity',
          severity: 'warning',
          storyboardIds: [scenes[lastIdx].id],
          indices: [lastIdx],
          message: `角色「${char}」在镜头 ${lastIdx + 1} 后消失，之后 ${gapToEnd} 个镜头未再出现`,
          suggestion: `建议为角色「${char}」增加离场交代镜头，或在后续镜头中说明其去向`,
        });
      }
    }
  }

  // 3c. 场景切换无 establishing shot → 场景跳转
  let prevLocation = '';
  for (let i = 0; i < totalScenes; i++) {
    const s = scenes[i];
    const currentLocation = (s.location || '').trim();

    if (currentLocation && prevLocation && currentLocation !== prevLocation) {
      // 场景发生了切换
      const prevScene = scenes[i - 1];
      // 前一个镜头也是非全景镜头 → 可能缺少 establishing shot
      const isPrevEstablishing = prevScene.shotType === '远景' ||
        prevScene.shotType === '大远景' ||
        prevScene.shotLanguage?.shotSize === 'long_shot' ||
        prevScene.shotLanguage?.shotSize === 'extreme_long_shot';

      if (!isPrevEstablishing) {
        issues.push({
          type: 'scene_jump',
          severity: 'info',
          storyboardIds: [s.id],
          indices: [i],
          message: `镜头 ${i}→${i + 1} 场景从「${prevLocation}」切换到「${currentLocation}」，缺少环境交代镜头`,
          suggestion: `建议在场景切换前增加一个「${currentLocation}」的全景/远景镜头作为 establishing shot`,
        });
      }
    }

    if (currentLocation) {
      prevLocation = currentLocation;
    }
  }

  return issues;
}

// ============ 4. 连贯性检查 ============

function validateContinuity(scenes: StoryboardScene[]): StoryboardValidationIssue[] {
  const issues: StoryboardValidationIssue[] = [];

  // 4a. 同场景内角色列表不一致 → 连续性错误
  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1];
    const curr = scenes[i];
    const prevLoc = (prev.location || '').trim();
    const currLoc = (curr.location || '').trim();

    if (prevLoc && currLoc && prevLoc === currLoc) {
      // 同一场景下，前一镜头有角色但当前镜头完全没有角色（可能遗漏）
      if (prev.characters && prev.characters.length > 0 &&
        curr.characters && curr.characters.length === 0 &&
        !isEmptyOrWhitespace(curr.description)) {
        // 检查描述中是否提到前一镜头的角色
        const prevCharNames = prev.characters.filter(c => c.trim().length >= 2);
        const descMentionsPrevChar = prevCharNames.some(c => curr.description.includes(c));

        if (descMentionsPrevChar) {
          issues.push({
            type: 'continuity_error',
            severity: 'error',
            storyboardIds: [curr.id],
            indices: [i],
            message: `镜头 ${i + 1} 与前一镜头同在场景「${currLoc}」中，描述提及了角色但角色列表为空`,
            suggestion: `建议将描述中提到的角色添加到角色列表，保持场景内角色连续性`,
          });
        }
      }
    }
  }

  // 4b. 场景跳转无转场标记 → 转场缺失
  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1];
    const curr = scenes[i];
    const prevLoc = (prev.location || '').trim();
    const currLoc = (curr.location || '').trim();

    if (prevLoc && currLoc && prevLoc !== currLoc) {
      const prevTransition = prev.shotLanguage?.transitionType;
      const currTransition = curr.shotLanguage?.transitionType;

      // 如果两个镜头都没有转场标记，提示可能需要转场
      if (!prevTransition && !currTransition) {
        // 避免与 scene_jump 重复报告，这里只标记转场缺失
        issues.push({
          type: 'transition_missing',
          severity: 'info',
          storyboardIds: [prev.id, curr.id],
          indices: [i - 1, i],
          message: `镜头 ${i}→${i + 1} 场景从「${prevLoc}」切换到「${currLoc}」，未设置转场效果`,
          suggestion: '建议为场景切换添加转场效果（如叠化、淡入淡出），使画面过渡更自然',
        });
      }
    }
  }

  // 4c. 时间线矛盾（时长为0或异常大）
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (s.duration <= 0) {
      issues.push({
        type: 'duration_anomaly',
        severity: 'error',
        storyboardIds: [s.id],
        indices: [i],
        message: `镜头 ${i + 1} 时长为 ${s.duration} 秒，时长不能为0或负数`,
        suggestion: '请设置合理的镜头时长（建议 2-10 秒）',
      });
    } else if (s.duration > 30) {
      issues.push({
        type: 'duration_anomaly',
        severity: 'warning',
        storyboardIds: [s.id],
        indices: [i],
        message: `镜头 ${i + 1} 时长为 ${s.duration} 秒，超出常规范围`,
        suggestion: '单个镜头时长一般不超过 30 秒，建议拆分为多个镜头',
      });
    }
  }

  return issues;
}

// ============ 5. 主入口 ============

/**
 * 对分镜内容进行全面校验
 *
 * @param scenes 分镜场景列表
 * @returns 校验结果，包含所有检测到的问题及汇总信息
 */
export function validateStoryboardContent(scenes: StoryboardScene[]): StoryboardValidationResult {
  if (!scenes || scenes.length === 0) {
    return {
      totalShots: 0,
      issueCount: 0,
      issues: [],
      summary: {
        emptyShots: 0,
        duplicateShots: 0,
        continuityErrors: 0,
        warnings: 0,
      },
    };
  }

  const allIssues: StoryboardValidationIssue[] = [
    ...detectEmptyShots(scenes),
    ...detectDuplicateShots(scenes),
    ...validateNarrativeFunction(scenes),
    ...validateContinuity(scenes),
  ];

  // 按 severity 排序：error > warning > info
  const severityOrder: Record<ValidationSeverity, number> = { error: 0, warning: 1, info: 2 };
  allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const emptyShots = allIssues.filter(i => i.type === 'empty_shot').length;
  const duplicateShots = allIssues.filter(i => i.type === 'duplicate_shot' || i.type === 'composition_duplicate').length;
  const continuityErrors = allIssues.filter(
    i => i.type === 'continuity_error' || i.type === 'duration_anomaly'
  ).length;
  const warnings = allIssues.filter(i => i.severity === 'warning').length;

  return {
    totalShots: scenes.length,
    issueCount: allIssues.length,
    issues: allIssues,
    summary: {
      emptyShots,
      duplicateShots,
      continuityErrors,
      warnings,
    },
  };
}

/**
 * 获取指定分镜ID的校验问题
 */
export function getIssuesForScene(
  result: StoryboardValidationResult,
  sceneId: number
): StoryboardValidationIssue[] {
  return result.issues.filter(i => i.storyboardIds.includes(sceneId));
}

/**
 * 获取最高严重程度
 */
export function getWorstSeverity(
  issues: StoryboardValidationIssue[]
): ValidationSeverity | null {
  if (issues.length === 0) return null;
  if (issues.some(i => i.severity === 'error')) return 'error';
  if (issues.some(i => i.severity === 'warning')) return 'warning';
  return 'info';
}
