// 工程快照服务：不可逆操作前的「后悔药」
//
// Rust 侧把 data/ 全部 JSON 文档 + project.json 备份到 <工程>/snapshots/<id>/，
// 保留最近 SNAPSHOT_KEEP 份。media/ 素材从不被实体删除物理移除，
// 因此恢复 data/ 引用即可完整还原素材链接与结构化数据。
//
// 挂钩点：AI 助手 handleAction 的不可逆动作确认闸门（确认后、执行前）。
// 备份失败会抛错，调用方据此阻止执行——宁可不做，不做无备份的不可逆操作。

import { isTauri } from './localApi';
import { resolveLocalPath, invalidateProjectCache, flushAll } from './localStore';

export interface ProjectSnapshot {
  id: string;
  /** RFC3339 创建时间 */
  created_at: string;
  /** 人类可读说明（如「智能体：删除角色」） */
  label: string;
  /** 触发来源：agent / manual / restore */
  trigger: string;
}

/** 保留份数（与 Rust 默认一致） */
export const SNAPSHOT_KEEP = 10;

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke: inv } = await import('@tauri-apps/api/core');
  return inv<T>(cmd, args);
}

/**
 * 不可逆动作执行前自动打快照。
 * 非 Tauri / 非本地工程：无可备份对象，静默放行。
 * 备份失败：抛错，由调用方阻止动作执行。
 */
export async function snapshotBeforeDestructive(
  projectId: number | null | undefined,
  actionTitle: string,
): Promise<void> {
  if (!isTauri()) return;
  const path = await resolveLocalPath(projectId ?? null);
  if (!path) return;
  await invoke('create_project_snapshot', {
    projectPath: path,
    label: `智能体：${actionTitle}`,
    trigger: 'agent',
    keep: SNAPSHOT_KEEP,
  });
}

/** 列出工程快照（倒序）；非本地工程返回空表 */
export async function listProjectSnapshots(
  projectId: number | null | undefined,
): Promise<ProjectSnapshot[]> {
  if (!isTauri()) return [];
  const path = await resolveLocalPath(projectId ?? null);
  if (!path) return [];
  return invoke<ProjectSnapshot[]>('list_project_snapshots', { projectPath: path });
}

/** 手动备份（设置页「立即备份」） */
export async function createManualSnapshot(
  projectId: number | null | undefined,
  label = '手动备份',
): Promise<ProjectSnapshot> {
  const path = await resolveLocalPath(projectId ?? null);
  if (!path) throw new Error('当前工程不是本地工程，无法备份快照');
  return invoke<ProjectSnapshot>('create_project_snapshot', {
    projectPath: path,
    label,
    trigger: 'manual',
    keep: SNAPSHOT_KEEP,
  });
}

/**
 * 恢复快照：先落盘待写文档（保证恢复前备份拿到最新状态），
 * Rust 侧自动先备份当前态再整体替换 data/，最后失效前端缓存。
 * 调用方随后应重载窗口，让全部视图从恢复后的文档重建。
 */
export async function restoreProjectSnapshot(
  projectId: number | null | undefined,
  snapshotId: string,
): Promise<void> {
  const path = await resolveLocalPath(projectId ?? null);
  if (!path) throw new Error('当前工程不是本地工程，无法恢复快照');
  await flushAll();
  await invoke('restore_project_snapshot', { projectPath: path, snapshotId });
  invalidateProjectCache(path);
}

/** 删除指定快照 */
export async function deleteProjectSnapshot(
  projectId: number | null | undefined,
  snapshotId: string,
): Promise<void> {
  const path = await resolveLocalPath(projectId ?? null);
  if (!path) throw new Error('当前工程不是本地工程');
  await invoke('delete_project_snapshot', { projectPath: path, snapshotId });
}