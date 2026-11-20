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
export async function fetchStoryboards(scriptId: number): Promise<StoryboardItem[]> {
  const res = await fetch(`/api/storyboards/${scriptId}`);

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to load storyboards');
  }

  return (await res.json()) as StoryboardItem[];
}
export async function saveStoryboards(scriptId: number, items: StoryboardItem[]): Promise<void> {
  const res = await fetch(`/api/storyboards/${scriptId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
    },
    body: JSON.stringify({ spatial_description: spatialDescription }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to update spatial description');
  }
}
// ============================================================
// 首尾帧草图管理 API
// ============================================================

export interface SketchFrameInfo {
  sketch_data: any;
  version: number;
  updated_at: string | null;
}

export interface SketchFramesResponse {
  first: SketchFrameInfo | null;
  last: SketchFrameInfo | null;
}

/**
 * 获取分镜首尾帧草图信息
 */
export async function getSketchFrames(storyboardId: number): Promise<SketchFramesResponse> {
  const res = await fetch(`/api/storyboards/${storyboardId}/sketch-frames`);

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to get sketch frames');
  }

  return data as SketchFramesResponse;
}

/**
 * 保存首帧草图数据
 */
export async function saveFirstSketchData(
  storyboardId: number,
  sketchData: object
): Promise<{ version: number }> {
  const res = await fetch(`/api/storyboards/${storyboardId}/first-sketch-data`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sketch_data: sketchData }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to save first sketch data');
  }

  return data as { version: number };
}

/**
 * 保存尾帧草图数据
 */
export async function saveLastSketchData(
  storyboardId: number,
  sketchData: object
): Promise<{ version: number }> {
  const res = await fetch(`/api/storyboards/${storyboardId}/last-sketch-data`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sketch_data: sketchData }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to save last sketch data');
  }

  return data as { version: number };
}

/**
 * 删除草图
 */
export async function deleteSketchFrame(
  storyboardId: number,
  frameType: 'first' | 'last'
): Promise<void> {
  const res = await fetch(`/api/storyboards/${storyboardId}/${frameType}-sketch`, {
    method: 'DELETE',
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to delete sketch frame');
  }
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
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || data?.error || '解锁分镜失败');
  }

  return data as LockResult;
}