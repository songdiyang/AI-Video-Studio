import { getAuthToken } from './auth';
// import type { SketchHistoryEntry } from '../views/SketchStudio/SketchModule/types/sketch'; // 草图功能已集成到魔术空间
interface SketchHistoryEntry {
  version: number;
  sketchUrl: string;
  sketchType: string;
  createdAt: string;
  prompt?: string;
}

// 分镜空间描述接口
export interface CharacterPosition {
  name: string;
  position: string;      // 如"前景左侧"
  depth?: string;        // foreground/midground/background
  facing?: string;       // 如"面向右方"
}

export interface SpatialDescription {
  characterPositions?: CharacterPosition[];
  cameraAngle?: string;          // 如"中景平拍"
  spatialRelationship?: string;  // 如"角色A在角色B的左后方"
  environmentDepth?: string;     // 如"三层纵深：前景桌椅-中景过道-远景窗户"
}

export interface StoryboardItem {
  id?: number;
  index: number;
  prompt_template: string;
  video_prompt?: string; // 旧版统一视频提示词（静态镜头使用）
  video_start_prompt?: string; // 视频首帧提示词（动作镜头前半段）
  video_end_prompt?: string; // 视频尾帧提示词（动作镜头后半段）
  variables: Record<string, unknown>;
  image_ref?: string | null;
  spatial_description?: SpatialDescription | null;
  created_at?: string;
}

export interface StoryboardTemplate {
  id: string;
  name: string;
  prompt_template: string;
  category: string;
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

export async function fetchStoryboardTemplates(): Promise<StoryboardTemplate[]> {
  const res = await fetch('/api/storyboards/templates', {
    headers: {
      ...authHeaders(),
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to load storyboard templates');
  }

  return (await res.json()) as StoryboardTemplate[];
}

export async function fetchStoryboards(scriptId: number): Promise<StoryboardItem[]> {
  const res = await fetch(`/api/storyboards/${scriptId}`, {
    headers: {
      ...authHeaders(),
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to load storyboards');
  }

  return (await res.json()) as StoryboardItem[];
}

/**
 * 获取项目下的"自由分镜"（不绑定剧本）
 * 与 fetchStoryboards 配对：剧集分镜走 scriptId，自由分镜走 projectId。
 */
export async function fetchStandaloneStoryboards(projectId: number): Promise<StoryboardItem[]> {
  const res = await fetch(`/api/storyboards/project/${projectId}/standalone`, {
    headers: {
      ...authHeaders(),
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to load standalone storyboards');
  }

  return (await res.json()) as StoryboardItem[];
}

export async function saveStoryboards(scriptId: number, items: StoryboardItem[]): Promise<void> {
  const res = await fetch(`/api/storyboards/${scriptId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ items }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to save storyboards');
  }
}

export interface BatchValidationResult {
  sceneId: number;
  ready: boolean;
  blockingIssues: string[];
  warningIssues: string[];
}

export async function batchValidateScenes(
  sceneIds: number[],
  scriptId: number | null,
  type: 'frame' | 'video',
  projectId?: number | null
): Promise<{ results: BatchValidationResult[] }> {
  const res = await fetch('/api/storyboards/batch-validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ sceneIds, scriptId: scriptId || undefined, projectId: projectId || undefined, type }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || data?.error || 'Failed to batch validate scenes');
  }

  return data as { results: BatchValidationResult[] };
}

/**
 * 更新分镜的空间描述
 */
export async function updateSpatialDescription(
  storyboardId: number,
  spatialDescription: SpatialDescription | null
): Promise<void> {
  const res = await fetch(`/api/storyboards/${storyboardId}/content`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ spatial_description: spatialDescription }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to update spatial description');
  }
}

// ============================================================
// 草图相关 API
// ============================================================

/**
 * 上传草图文件
 * @param storyboardId 分镜ID
 * @param file 草图文件
 * @param sketchType 草图类型（如 'canny', 'depth', 'pose' 等）
 * @returns 草图URL
 */
export async function uploadSketch(
  storyboardId: number,
  file: File,
  sketchType: string
): Promise<{ sketch_url: string }> {
  const formData = new FormData();
  formData.append('sketch', file);
  formData.append('sketch_type', sketchType);

  const res = await fetch(`/api/storyboards/${storyboardId}/sketch`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
    },
    body: formData,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to upload sketch');
  }

  return data as { sketch_url: string };
}

/**
 * 删除草图
 * @param storyboardId 分镜ID
 */
export async function deleteSketch(storyboardId: number): Promise<void> {
  const res = await fetch(`/api/storyboards/${storyboardId}/sketch`, {
    method: 'DELETE',
    headers: {
      ...authHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to delete sketch');
  }
}

/**
 * 更新草图设置（类型和控制强度）
 * @param storyboardId 分镜ID
 * @param settings 草图设置
 */
export async function updateSketchSettings(
  storyboardId: number,
  settings: { sketch_type?: string; control_strength?: number }
): Promise<void> {
  const res = await fetch(`/api/storyboards/${storyboardId}/sketch-settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(settings),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to update sketch settings');
  }
}

/**
 * 保存 Excalidraw 矢量数据
 * @param storyboardId 分镜ID
 * @param sketchData Excalidraw 矢量数据对象
 */
export async function saveSketchData(
  storyboardId: number,
  sketchData: object
): Promise<void> {
  const res = await fetch(`/api/storyboards/${storyboardId}/sketch-data`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ sketch_data: sketchData }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to save sketch data');
  }
}

/**
 * 基于草图生成帧
 * 调用工作流引擎启动 sketch_frame_generation 工作流
 * @param storyboardId 分镜ID
 * @param options 生成选项
 * @returns 工作流任务信息
 */
export async function generateFromSketch(
  storyboardId: number,
  options?: { 
    controlStrength?: number;
    sketchUrl?: string;
    sketchType?: string;
  }
): Promise<{ jobId: string; tasks: any[] }> {
  const res = await fetch('/api/workflows', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({
      workflowType: 'sketch_frame_generation',
      projectId: 0,
      params: {
        storyboardId,
        sketchUrl: options?.sketchUrl,
        sketchType: options?.sketchType,
        controlStrength: options?.controlStrength,
      },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to start sketch frame generation');
  }

  return data as { jobId: string; tasks: any[] };
}

// ============================================================
// 分镜锁定相关 API
// ============================================================

export interface LockResult {
  success: boolean;
  message: string;
  storyboardId?: number;
  locked_by?: string;
  locked_at?: string;
}

/**
 * 锁定分镜
 * @param storyboardId 分镜ID
 */
export async function lockStoryboard(storyboardId: number): Promise<LockResult> {
  const res = await fetch(`/api/storyboards/${storyboardId}/lock`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || data?.error || '锁定分镜失败');
  }

  return data as LockResult;
}

/**
 * 解锁分镜
 * @param storyboardId 分镜ID
 */
export async function unlockStoryboard(storyboardId: number): Promise<LockResult> {
  const res = await fetch(`/api/storyboards/${storyboardId}/unlock`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || data?.error || '解锁分镜失败');
  }

  return data as LockResult;
}

/**
 * 批量锁定分镜
 * @param storyboardIds 分镜ID数组
 */
export async function batchLockStoryboards(storyboardIds: number[]): Promise<{ success: boolean; message: string; count: number }> {
  const res = await fetch('/api/storyboards/batch-lock', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ storyboardIds }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || data?.error || '批量锁定失败');
  }

  return data as { success: boolean; message: string; count: number };
}

/**
 * 批量解锁分镜
 * @param storyboardIds 分镜ID数组
 */
export async function batchUnlockStoryboards(storyboardIds: number[]): Promise<{ success: boolean; message: string; count: number }> {
  const res = await fetch('/api/storyboards/batch-unlock', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ storyboardIds }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || data?.error || '批量解锁失败');
  }

  return data as { success: boolean; message: string; count: number };
}

// ============================================================
// 草图版本历史相关 API
// ============================================================

/**
 * 获取草图版本历史
 * @param storyboardId 分镜ID
 * @param params 分页参数
 */
export async function getSketchHistory(
  storyboardId: number,
  params?: { limit?: number; offset?: number }
): Promise<{ history: SketchHistoryEntry[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const queryString = searchParams.toString();
  const url = `/api/storyboards/${storyboardId}/sketch/history${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    headers: {
      ...authHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to get sketch history');
  }

  return data as { history: SketchHistoryEntry[]; total: number };
}

/**
 * 获取特定版本的草图
 * @param storyboardId 分镜ID
 * @param version 版本号
 */
export async function getSketchHistoryVersion(
  storyboardId: number,
  version: number
): Promise<SketchHistoryEntry> {
  const res = await fetch(`/api/storyboards/${storyboardId}/sketch/history/${version}`, {
    headers: {
      ...authHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to get sketch version');
  }

  return data as SketchHistoryEntry;
}

/**
 * 恢复到指定版本的草图
 * @param storyboardId 分镜ID
 * @param version 要恢复的版本号
 */
export async function restoreSketchVersion(
  storyboardId: number,
  version: number
): Promise<{
  success: boolean;
  message: string;
  version: number;
  sketchUrl: string | null;
  sketchType: string | null;
  controlStrength: number;
}> {
  const res = await fetch(`/api/storyboards/${storyboardId}/sketch/restore/${version}`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to restore sketch version');
  }

  return data;
}
