/**
 * 节点模式功能模块 (NodeModeFeature)
 *
 * 导演空间的节点模式封装，提供画布式节点编辑能力：
 * - 无限画布，支持拖拽节点
 * - 左侧资源面板：显示项目角色和场景，可拖拽到画布
 * - 节点类型：图片(首帧/尾帧)、角色、场景、合成、视频
 * - 节点详情面板：显示来源、提示词、资源映射
 * - 主节点标记：用于导演模式的图片/视频显示
 * - 连线：表示生成关系
 *
 * 使用方式：
 *   import { NodeModeFeature } from './features/NodeMode';
 *   <NodeModeFeature sceneId={...} ... />
 */

export { default as NodeModeFeature } from './components/NodeCanvas';
export type {
  NodeType,
  CanvasNode,
  NodeConnection,
  NodeCanvasState,
  NodeCanvasProps,
  ResourceItem,
} from './types';
export {
  NODE_WIDTH,
  NODE_HEIGHT,
  NODE_HEADER_HEIGHT,
} from './types';

// Hooks
export { useNodeCanvas, useNodeInitializer } from './hooks';
export type { UseNodeCanvasReturn } from './hooks';

// Utils
export { NODE_COLORS, getNodeColors } from './utils';
export type { NodeColorConfig } from './utils';
