/**
 * 画布节点编辑器类型定义
 * 导演空间节点模式的核心类型
 */

export type NodeType = 'image' | 'video' | 'character' | 'scene' | 'composite';

export interface CanvasNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  title: string;
  // 图片节点
  imageUrl?: string;
  frameType?: 'first' | 'last';
  // 视频节点
  videoUrl?: string;
  status?: 'pending' | 'generating' | 'completed' | 'failed';
  prompt?: string;
  // 关联的workflow job id（用于轮询生成状态）
  jobId?: string;
  // 角色/场景资源节点
  resourceId?: number;
  resourceType?: 'character' | 'scene' | 'prop';
  // 合成节点：由哪些节点拼接而成
  compositeFrom?: string[]; // 源节点ID列表
  compositePrompt?: string; // 合成提示词
  // 是否为主节点（用于导演模式显示）
  isMain?: boolean;
}

export interface NodeConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

export interface NodeCanvasState {
  nodes: CanvasNode[];
  connections: NodeConnection[];
  selectedNodeId: string | null;
}

export interface NodeCanvasProps {
  sceneId: number;
  projectId?: number;
  scriptId?: number;
  initialState?: NodeCanvasState;
  availableFrames?: { startFrame?: string; endFrame?: string };
  onSave?: (state: NodeCanvasState) => Promise<boolean> | boolean;
  // 当前分镜已绑定的角色和场景（用于初始化节点）
  sceneCharacters?: { character_id: number; name: string; image_url?: string; active_state_image_url?: string; base_front_view_url?: string }[];
  sceneLocation?: string;
  characterStates?: Record<number, { stateId: number; stateName: string; stateImage?: string; stateOutfit?: string }>;
  // 项目资源（从外部传入，避免组件内部管理）
  projectCharacters?: { id: number; name: string; image_url?: string; active_state_image_url?: string }[];
  projectScenes?: { id: number; name: string; image_url?: string }[];
  // 导演模式回调：设置主节点图片
  onSetMainFrame?: (frameType: 'first' | 'last', imageUrl: string) => void;
}

// 资源项类型（用于左侧资源面板）
export interface ResourceItem {
  id: number;
  name: string;
  imageUrl?: string;
  type: 'character' | 'scene';
}

// 节点尺寸常量
export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 220;  // 角色/场景卡面需要更大空间
export const NODE_HEADER_HEIGHT = 28;
