/**
 * 工程生成参数（设置页 · 工程设置）
 * ──────────────────────────────────────────────────────────────
 * 当前工程的图片/视频分辨率与画面比例，持久化在工程目录
 * data/project_settings.json（localStore 文档），随 .jzp 归档携带。
 *
 * 消费链路：useStoryboardCore 读取后合并进 projectSettings，
 * 生成图片/视频时优先于模型默认值（'' 表示自动、跟随模型默认）。
 * 保存后派发 project-generation-settings-changed 事件，工作台实时生效。
 */

import { readProjectDoc, writeProjectDoc } from './localStore';

/** 工程生成参数：'' 或缺省表示自动（跟随模型默认） */
export interface ProjectGenerationSettings {
  imageAspectRatio?: string;
  imageResolution?: string;
  videoAspectRatio?: string;
  videoResolution?: string;
}

/** 工程生成参数变更事件名（detail: { projectId, settings }） */
export const PROJECT_SETTINGS_CHANGED = 'project-generation-settings-changed';

/** 读取工程生成参数；未打开/非本地工程返回空对象（各字段自动） */
export async function loadProjectGenerationSettings(
  projectId: number | null | undefined
): Promise<ProjectGenerationSettings> {
  if (!projectId) return {};
  const doc = await readProjectDoc<ProjectGenerationSettings>(projectId, 'projectSettings', {});
  return doc && typeof doc === 'object' ? doc : {};
}

/**
 * 保存工程生成参数（写内存缓存 + 防抖落盘），并广播变更事件
 * 供已打开的工作台实时应用。
 */
export async function saveProjectGenerationSettings(
  projectId: number,
  settings: ProjectGenerationSettings
): Promise<boolean> {
  const accepted = await writeProjectDoc(projectId, 'projectSettings', settings);
  window.dispatchEvent(
    new CustomEvent(PROJECT_SETTINGS_CHANGED, { detail: { projectId, settings } })
  );
  return accepted;
}
