/**
 * 前端首尾帧生成预检（UI 适配层）
 *
 * 判定口径不在这里：本地权威实现在 services/sceneReadiness.ts
 * （角色白膜三视图、影棚图、道具图、提示词、视频首帧）。
 * 这里只负责「先问端点，端点不可用时直接读同一份本地数据」，
 * 并把结果转成 UI 需要的 ready / blocking / warning 三态。
 *
 * 历史坑：本文件曾自带一套角色/影棚字段校验，且把未实现的
 * /api/storyboards/{id}/validate 兜底空响应当成「校验通过」，
 * 导致预检在桌面端形同虚设 —— 现在该端点已有本地实现，兜底路径也不再重复造轮子。
 */

import { checkStoryboardReadiness, readinessFixHints, type ReadinessAssetRef, type ReadinessIssue } from '../../../services/sceneReadiness';

export interface ValidationIssue {
  type: string;
  message: string;
  blocking: boolean; // true = 阻止生成，false = 警告但可继续
  /** 缺的是哪个资产（带库 ID 时给出），UI 据此一键跳到该资产去补图 */
  asset?: ReadinessAssetRef;
}

export interface ValidationResult {
  ready: boolean;
  issues: ValidationIssue[];
  blockingIssues: ValidationIssue[];
  warningIssues: ValidationIssue[];
  /** 怎么补（动作名提示）：拦住不说怎么办只会让用户去猜，智能体也接不上下一步 */
  fixHints?: string[];
}

function toResult(issues: ValidationIssue[], fixHints: string[] = []): ValidationResult {
  const blockingIssues = issues.filter((i) => i.blocking);
  return {
    ready: blockingIssues.length === 0,
    issues,
    blockingIssues,
    warningIssues: issues.filter((i) => !i.blocking),
    fixHints: blockingIssues.length ? fixHints : [],
  };
}

/** 归一化端点返回：缺省 blocking 时按阻断处理（宁可多问一次，不放行凭空生成） */
function normalizeIssues(raw: unknown): ValidationIssue[] {
  const list = Array.isArray(raw) ? (raw as ReadinessIssue[]) : [];
  return list
    .map((i) => {
      const id = Number(i?.asset?.id);
      const kind = i?.asset?.kind;
      return {
        type: String(i?.type || 'unknown'),
        message: String(i?.message || ''),
        blocking: i?.blocking !== false,
        // 只认已知类型 + 合法 ID：脏数据下宁可只显文案不给跳转，也不能开一个打不开的资产页
        asset:
          Number.isFinite(id) && id > 0 && (kind === 'character' || kind === 'studio' || kind === 'prop')
            ? { kind, id, name: String(i!.asset!.name || '') }
            : undefined,
      };
    })
    .filter((i) => i.message);
}

/**
 * 单镜头出图前预检。
 * storyboardId 是本地判定的必需入参（要读该镜头的角色/影棚/道具与提示词），
 * 缺失时只能放行，由执行层的硬门禁兜住 —— 那里绕不过去。
 */
export async function validateFrameReadiness(
  projectId: number,
  _characters: string[],
  location: string,
  _scriptId?: number,
  storyboardId?: number,
): Promise<ValidationResult> {
  if (!storyboardId) return toResult([]);

  // 1. 优先走本地路由的校验端点（与执行层同源）
  try {
    const res = await fetch(`/api/storyboards/${storyboardId}/validate?type=frame`);
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const issues = normalizeIssues(data?.issues);
      // 端点已实现：只要它给出了结论就采信，不再回退
      if (data && typeof data.ready === 'boolean') {
        return toResult(issues, (data.fixHints || []).map((h: unknown) => String(h)));
      }
    }
  } catch (e) {
    console.warn('[validateFrameReadiness] 校验端点不可用，改用本地数据判定:', e);
  }

  // 2. 端点不可用（异常/非本地环境）：直接读工程数据判定，口径完全一致
  const local = await checkStoryboardReadiness(projectId, storyboardId, 'frame').catch((e) => {
    console.warn('[validateFrameReadiness] 本地判定失败:', e);
    return null;
  });
  if (!local) {
    // 两条判定路径都失效时，退化到最基本的地点检查（历史行为）：
    // 不能因为读不到数据就认为「就绪」，但也没必要拦住其他缺项不报
    if (!location || location.trim() === '') {
      return toResult(
        [{ type: 'no_location', message: '该镜头未指定影棚：出图要求明确场景来源，不能凭空生成环境', blocking: true }],
        ['用 update_scene_characters_location 给该分镜指定地点'],
      );
    }
    return toResult([]);
  }
  return toResult(normalizeIssues(local.issues), readinessFixHints(local));
}

/** 将校验结果格式化为用户可读的消息 */
export function formatValidationMessage(result: ValidationResult): string {
  if (result.ready) return '';

  const lines: string[] = [];

  if (result.blockingIssues.length > 0) {
    lines.push('❌ 以下问题必须修复后才能生成：');
    result.blockingIssues.forEach((i) => lines.push(`  • ${i.message}`));
  }

  if (result.warningIssues.length > 0) {
    lines.push('⚠️ 以下问题可能影响生成效果：');
    result.warningIssues.forEach((i) => lines.push(`  • ${i.message}`));
  }

  if (result.fixHints && result.fixHints.length > 0) {
    lines.push('🛠 补齐方式：');
    result.fixHints.forEach((h) => lines.push(`  • ${h}`));
  }

  return lines.join('\n');
}
