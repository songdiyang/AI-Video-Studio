/**
 * 节点画布核心 Hook
 * 封装节点画布的状态管理和业务逻辑
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  CanvasNode,
  NodeConnection,
  NodeCanvasState,
  NodeCanvasProps,
  NODE_WIDTH,
} from '../types';
import { startWorkflow, getWorkflowStatus } from '../../../hooks/useWorkflow';
import { useToast } from '../../../contexts/ToastContext';

const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export interface UseNodeCanvasReturn {
  nodes: CanvasNode[];
  connections: NodeConnection[];
  selectedNodeId: string | null;
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  draggingNodeId: string | null;
  canvasOffset: { x: number; y: number };
  setCanvasOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  showResourcePanel: boolean;
  setShowResourcePanel: React.Dispatch<React.SetStateAction<boolean>>;
  showDetailPanel: boolean;
  setShowDetailPanel: React.Dispatch<React.SetStateAction<boolean>>;
  resourceTab: 'characters' | 'scenes';
  setResourceTab: React.Dispatch<React.SetStateAction<'characters' | 'scenes'>>;
  contextMenu: { x: number; y: number; nodeId: string } | null;
  setContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; nodeId: string } | null>>;
  isDirty: boolean;
  nodesRef: React.RefObject<CanvasNode[]>;
  connectionsRef: React.RefObject<NodeConnection[]>;
  canvasOffsetRef: React.RefObject<{ x: number; y: number }>;
  dragOffsetRef: React.RefObject<{ x: number; y: number }>;
  rAFRef: React.RefObject<number>;
  targetPosRef: React.RefObject<{ x: number; y: number }>;
  setDraggingNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsPanning: React.Dispatch<React.SetStateAction<boolean>>;
  setPanStart: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  addNode: (node: CanvasNode) => void;
  deleteNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => void;
  updateNode: (nodeId: string, updates: Partial<CanvasNode>) => void;
  addConnection: (connection: NodeConnection) => void;
  removeConnectionsByNode: (nodeId: string) => void;
  generateVideo: (nodeId: string, prompt: string, model?: string) => Promise<void>;
  markDirty: () => void;
}

export function useNodeCanvas(
  initialState: NodeCanvasState | undefined,
  sceneId: number,
  projectId: number | undefined,
): UseNodeCanvasReturn {
  const { showToast } = useToast();

  // 核心状态
  const [nodes, setNodes] = useState<CanvasNode[]>(initialState?.nodes || []);
  const [connections, setConnections] = useState<NodeConnection[]>(initialState?.connections || []);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialState?.selectedNodeId || null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // 面板状态
  const [showResourcePanel, setShowResourcePanel] = useState(true);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [resourceTab, setResourceTab] = useState<'characters' | 'scenes'>('characters');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  // 画布状态
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Refs for stable drag calculations
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const connectionsRef = useRef(connections);
  connectionsRef.current = connections;
  const canvasOffsetRef = useRef(canvasOffset);
  canvasOffsetRef.current = canvasOffset;
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const rAFRef = useRef<number>(0);
  const targetPosRef = useRef({ x: 0, y: 0 });

  // 选中节点时显示详情面板
  useEffect(() => {
    if (selectedNodeId) {
      setShowDetailPanel(true);
    }
  }, [selectedNodeId]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  const addNode = useCallback((node: CanvasNode) => {
    setNodes(prev => [...prev, node]);
    setSelectedNodeId(node.id);
    setIsDirty(true);
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    setContextMenu(null);
    setIsDirty(true);
  }, [selectedNodeId]);

  const duplicateNode = useCallback((nodeId: string) => {
    setNodes(prev => {
      const node = prev.find(n => n.id === nodeId);
      if (!node) return prev;
      const newNode: CanvasNode = {
        ...node,
        id: generateId(),
        x: node.x + 30,
        y: node.y + 30,
        title: `${node.title} 副本`,
        isMain: false,
        status: node.type === 'video' ? 'pending' : node.status,
        jobId: undefined,
      };
      return [...prev, newNode];
    });
    setContextMenu(null);
    setIsDirty(true);
  }, []);

  const updateNode = useCallback((nodeId: string, updates: Partial<CanvasNode>) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, ...updates } : n));
    setIsDirty(true);
  }, []);

  const addConnection = useCallback((connection: NodeConnection) => {
    setConnections(prev => [...prev, connection]);
    setIsDirty(true);
  }, []);

  const removeConnectionsByNode = useCallback((nodeId: string) => {
    setConnections(prev => prev.filter(c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId));
    setIsDirty(true);
  }, []);

  // 生成视频
  const generateVideo = useCallback(async (nodeId: string, prompt: string, model?: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node || !projectId) return;

    const conn = connectionsRef.current.find(c => c.toNodeId === nodeId);
    const sourceNode = conn ? nodesRef.current.find(n => n.id === conn.fromNodeId) : null;

    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, status: 'generating', prompt } : n
    ));

    try {
      const { jobId } = await startWorkflow('video_generation', projectId, {
        storyboardId: sceneId,
        prompt,
        imageUrl: sourceNode?.imageUrl,
        model: model || undefined,
      });

      setNodes(prev => prev.map(n =>
        n.id === nodeId ? { ...n, jobId } : n
      ));

      const poll = async () => {
        const job = await getWorkflowStatus(jobId);
        if (job.status === 'completed') {
          const result = job.tasks?.[job.tasks.length - 1]?.result_data;
          const videoUrl = result?.videoUrl || result?.url;
          setNodes(prev => prev.map(n =>
            n.id === nodeId ? { ...n, status: 'completed', videoUrl } : n
          ));
          setIsDirty(true);
          showToast('视频生成完成', 'success');
        } else if (job.status === 'failed') {
          setNodes(prev => prev.map(n =>
            n.id === nodeId ? { ...n, status: 'failed' } : n
          ));
          showToast('视频生成失败', 'error');
        } else {
          setTimeout(poll, 3000);
        }
      };
      poll();
    } catch (error: any) {
      showToast(error.message || '启动视频生成失败', 'error');
      setNodes(prev => prev.map(n =>
        n.id === nodeId ? { ...n, status: 'failed' } : n
      ));
    }
  }, [sceneId, projectId, showToast]);

  return {
    nodes,
    connections,
    selectedNodeId,
    setSelectedNodeId,
    draggingNodeId,
    canvasOffset,
    setCanvasOffset,
    showResourcePanel,
    setShowResourcePanel,
    showDetailPanel,
    setShowDetailPanel,
    resourceTab,
    setResourceTab,
    contextMenu,
    setContextMenu,
    isDirty,
    nodesRef,
    connectionsRef,
    canvasOffsetRef,
    dragOffsetRef,
    rAFRef,
    targetPosRef,
    setDraggingNodeId,
    setIsPanning,
    setPanStart,
    addNode,
    deleteNode,
    duplicateNode,
    updateNode,
    addConnection,
    removeConnectionsByNode,
    generateVideo,
    markDirty,
  };
}
