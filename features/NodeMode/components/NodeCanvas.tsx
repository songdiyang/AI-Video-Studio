/**
 * 画布节点编辑器
 * 导演空间节点模式的核心组件
 * 
 * 功能：
 * 1. 无限画布，支持拖拽节点
 * 2. 左侧资源面板：显示项目角色和场景，可拖拽到画布
 * 3. 节点类型：图片(首帧/尾帧)、角色、场景、合成、视频
 * 4. 节点详情面板：显示来源、提示词、资源映射
 * 5. 主节点标记：用于导演模式的图片/视频显示
 * 6. 连线：表示生成关系
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Camera, Play, X, Copy, Trash2, Loader2, Plus, GripVertical,
  User, MapPin, Layers, Star, Wand2, ChevronLeft, ChevronRight,
  Image as ImageIcon, Film, Sparkles, Box, TreePine, Building2, Shirt,
  FileText, Type, Zap, Images, PenLine, Scissors, Delete
} from 'lucide-react';
import {
  CanvasNode, NodeConnection, NodeCanvasState, NodeCanvasProps,
  NODE_WIDTH, NODE_HEIGHT, ResourceItem
} from '../types';
import { useNodeCanvas } from '../hooks/useNodeCanvas';
import { useToast } from '../../../contexts/ToastContext';
import { startWorkflow, getWorkflowStatus } from '../../../hooks/useWorkflow';

// 生成唯一ID
const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// 初始化画布节点：从分镜数据创建角色、场景、图片节点
function useNodeInitializer(
  sceneId: number,
  sceneLocation: string | undefined,
  sceneCharacters: NodeCanvasProps['sceneCharacters'],
  characterStates: NodeCanvasProps['characterStates'],
  availableFrames: NodeCanvasProps['availableFrames'],
  setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>,
  setConnections: React.Dispatch<React.SetStateAction<NodeConnection[]>>,
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>,
) {
  useEffect(() => {
    // 注意：此 effect 仅在组件挂载时运行一次
    // 通过空依赖数组确保不会覆盖用户已编辑的节点

    const initialNodes: CanvasNode[] = [];
    const initialConnections: NodeConnection[] = [];
    let x = 100;
    const y = 100;

    // 1. 场景节点（影棚）
    if (sceneLocation) {
      const sceneNodeId = generateId();
      initialNodes.push({
        id: sceneNodeId,
        type: 'scene',
        x,
        y,
        title: sceneLocation,
        isMain: false,
      });
      x += NODE_WIDTH + 80;
    }

    // 2. 角色节点（按分镜绑定的角色）- 显示角色状态集合体
    const characterNodeIds: string[] = [];
    sceneCharacters?.forEach((char) => {
      const charNodeId = generateId();
      const state = characterStates?.[char.character_id];
      const isBaseModel = state?.stateName?.includes('白膜') || state?.stateName === 'base_model';
      initialNodes.push({
        id: charNodeId,
        type: 'character',
        x,
        y,
        title: state?.stateName ? `${char.name} (${state.stateName})` : char.name,
        resourceId: char.character_id,
        resourceType: 'character',
        imageUrl: state?.stateImage || char.active_state_image_url || char.image_url,
        isMain: false,
        characterStateInfo: state ? {
          stateId: state.stateId,
          stateName: state.stateName,
          stateImage: state.stateImage,
          stateOutfit: state.stateOutfit,
          isBaseModel,
        } : undefined,
      });
      characterNodeIds.push(charNodeId);
      x += NODE_WIDTH + 80;
    });

    // 3. 图片节点（首帧/尾帧）
    const imageNodeIds: string[] = [];
    if (availableFrames?.startFrame) {
      const imgNodeId = generateId();
      initialNodes.push({
        id: imgNodeId,
        type: 'image',
        x,
        y,
        title: '首帧',
        imageUrl: availableFrames.startFrame,
        frameType: 'first',
        isMain: true,
      });
      imageNodeIds.push(imgNodeId);
      x += NODE_WIDTH + 80;
    }
    if (availableFrames?.endFrame) {
      const imgNodeId = generateId();
      initialNodes.push({
        id: imgNodeId,
        type: 'image',
        x,
        y,
        title: '尾帧',
        imageUrl: availableFrames.endFrame,
        frameType: 'last',
        isMain: true,
      });
      imageNodeIds.push(imgNodeId);
      x += NODE_WIDTH + 80;
    }

    // 4. 视频节点（占位，表示生成目标）
    if (imageNodeIds.length > 0) {
      const videoNodeId = generateId();
      initialNodes.push({
        id: videoNodeId,
        type: 'video',
        x,
        y,
        title: '分镜视频',
        status: 'pending',
        isMain: false,
      });
      // 图片节点 -> 视频节点
      imageNodeIds.forEach((imgId) => {
        initialConnections.push({
          id: generateId(),
          fromNodeId: imgId,
          toNodeId: videoNodeId,
        });
      });
    }

    if (initialNodes.length > 0) {
      setNodes(initialNodes);
      setConnections(initialConnections);
      setIsDirty(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// 节点颜色配置
const NODE_COLORS: Record<string, { bg: string; border: string; header: string; accent: string; icon: React.ReactNode }> = {
  image: {
    bg: 'bg-white',
    border: 'border-blue-600',
    header: 'bg-blue-900/40',
    accent: 'text-blue-600',
    icon: <ImageIcon size={12} />,
  },
  video: {
    bg: 'bg-white',
    border: 'border-rose-600',
    header: 'bg-rose-900/40',
    accent: 'text-rose-600',
    icon: <Film size={12} />,
  },
  character: {
    bg: 'bg-white',
    border: 'border-amber-600',
    header: 'bg-amber-900/40',
    accent: 'text-amber-700',
    icon: <User size={12} />,
  },
  scene: {
    bg: 'bg-white',
    border: 'border-emerald-600',
    header: 'bg-emerald-900/40',
    accent: 'text-emerald-700',
    icon: <MapPin size={12} />,
  },
  composite: {
    bg: 'bg-white',
    border: 'border-purple-600',
    header: 'bg-purple-900/40',
    accent: 'text-purple-600',
    icon: <Layers size={12} />,
  },
  prop: {
    bg: 'bg-white',
    border: 'border-blue-600',
    header: 'bg-blue-900/40',
    accent: 'text-blue-600',
    icon: <Box size={12} />,
  },
  environment: {
    bg: 'bg-white',
    border: 'border-teal-600',
    header: 'bg-teal-900/40',
    accent: 'text-teal-600',
    icon: <TreePine size={12} />,
  },
  building: {
    bg: 'bg-white',
    border: 'border-orange-600',
    header: 'bg-orange-900/40',
    accent: 'text-orange-600',
    icon: <Building2 size={12} />,
  },
  costume: {
    bg: 'bg-white',
    border: 'border-pink-600',
    header: 'bg-pink-900/40',
    accent: 'text-pink-600',
    icon: <Shirt size={12} />,
  },
};

const NodeCanvas: React.FC<NodeCanvasProps> = ({
  sceneId,
  projectId,
  scriptId,
  initialState,
  availableFrames,
  onSave,
  sceneCharacters = [],
  sceneLocation,
  characterStates,
  projectCharacters = [],
  projectScenes = [],
  projectProps = [],
  projectEnvironments = [],
  projectBuildings = [],
  projectCostumes = [],
  onSetMainFrame,
}) => {
  const { showToast } = useToast();
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // 画布状态
  const [nodes, setNodes] = useState<CanvasNode[]>(initialState?.nodes || []);
  const [connections, setConnections] = useState<NodeConnection[]>(initialState?.connections || []);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialState?.selectedNodeId || null);

  // 拖拽状态（UI 相关保持 state）
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isDraggingResource, setIsDraggingResource] = useState(false);
  const [draggedResource, setDraggedResource] = useState<ResourceItem | null>(null);

  // 面板状态
  const [showResourcePanel, setShowResourcePanel] = useState(true);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [resourceTab, setResourceTab] = useState<'characters' | 'scenes' | 'props' | 'environments' | 'buildings' | 'costumes'>('characters');

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);

  // 画布缩放/偏移
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // 连线拖拽状态
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectingToPos, setConnectingToPos] = useState<{ x: number; y: number } | null>(null);
  const connectingFromRef = useRef<string | null>(null);
  const connectingToPosRef = useRef<{ x: number; y: number } | null>(null);

  // 框选创建节点状态（长按画布拖动）
  const [lassoState, setLassoState] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
    longPressTriggered: boolean;
  } | null>(null);
  const lassoStateRef = useRef(lassoState);
  lassoStateRef.current = lassoState;
  const lassoTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const lassoStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // 节点生成菜单状态（当多个节点连接到一个空节点时显示）
  const [generationMenu, setGenerationMenu] = useState<{
    x: number;
    y: number;
    targetNodeId: string;
    sourceNodeIds: string[];
  } | null>(null);

  // Refs：稳定拖拽计算，避免每次 drag 帧重建 effect 和回调
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const connectionsRef = useRef(connections);
  connectionsRef.current = connections;
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const canvasOffsetRef = useRef(canvasOffset);
  canvasOffsetRef.current = canvasOffset;
  const rAFRef = useRef<number>(0);
  const targetPosRef = useRef({ x: 0, y: 0 });

  // 脏标记
  const [isDirty, setIsDirty] = useState(false);

  // 自动保存防抖
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  // 初始化画布节点
  useNodeInitializer(
    sceneId,
    sceneLocation,
    sceneCharacters,
    characterStates,
    availableFrames,
    setNodes,
    setConnections,
    setIsDirty
  );

  // 监听角色删除事件，从画布中移除对应角色节点
  useEffect(() => {
    const handleCharacterDeleted = (e: CustomEvent<{ characterId: number; characterName: string }>) => {
      const { characterId, characterName } = e.detail;
      setNodes(prev => {
        const toRemove = prev.filter(n =>
          n.type === 'character' && (n.resourceId === characterId || n.title === characterName || n.title?.startsWith(characterName + ' ('))
        );
        if (toRemove.length === 0) return prev;
        const removeIds = new Set(toRemove.map(n => n.id));
        // 同时移除相关连线
        setConnections(prevConn => prevConn.filter(c => !removeIds.has(c.fromNodeId) && !removeIds.has(c.toNodeId)));
        if (selectedNodeId && removeIds.has(selectedNodeId)) setSelectedNodeId(null);
        setIsDirty(true);
        return prev.filter(n => !removeIds.has(n.id));
      });
    };
    window.addEventListener('resource:characterDeleted', handleCharacterDeleted as EventListener);
    return () => window.removeEventListener('resource:characterDeleted', handleCharacterDeleted as EventListener);
  }, []);

  // 自动保存（仅 isDirty 触发，通过 ref 读取最新数据，不再被拖拽帧触发）
  useEffect(() => {
    if (!isDirty || !onSave) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const success = await onSave({
        nodes: nodesRef.current,
        connections: connectionsRef.current,
        selectedNodeId,
      });
      if (success) setIsDirty(false);
    }, 2000);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [isDirty, onSave, selectedNodeId]);

  // 选中节点时显示详情面板（使用 ref 避免拖拽过程中详情面板反复渲染）
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;
  useEffect(() => {
    if (selectedNodeId && !draggingNodeId) {
      setShowDetailPanel(true);
    }
  }, [selectedNodeId, draggingNodeId]);

  // 删除节点
  const deleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    setContextMenu(null);
    setIsDirty(true);
  }, [selectedNodeId]);

  // 监听 Delete 键删除选中节点
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // 避免在输入框中触发删除
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        if (selectedNodeIdRef.current) {
          deleteNode(selectedNodeIdRef.current);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteNode]);

  // 拖拽节点开始（通过 ref 读取最新 nodes，回调完全稳定不重建）
  const handleMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffsetRef.current = {
      x: e.clientX - rect.left - node.x,
      y: e.clientY - rect.top - node.y,
    };
    setDraggingNodeId(nodeId);
    setSelectedNodeId(nodeId);
  }, []);

  // 画布拖拽（平移）
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (connectingFromRef.current) {
      // 正在连线时点击空白处取消连线
      setConnectingFrom(null);
      setConnectingToPos(null);
      connectingFromRef.current = null;
      connectingToPosRef.current = null;
      return;
    }
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      // 中键或 Shift+左键 平移画布
      setIsPanning(true);
      setPanStart({ x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y });
      e.preventDefault();
    } else if (e.button === 0 && (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-grid'))) {
      // 左键点击空白处：启动长按检测（框选创建节点）
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const canvasX = e.clientX - rect.left - canvasOffset.x;
      const canvasY = e.clientY - rect.top - canvasOffset.y;
      lassoStartPosRef.current = { x: canvasX, y: canvasY };
      // 设置长按定时器（400ms 后触发框选模式）
      if (lassoTimerRef.current) clearTimeout(lassoTimerRef.current);
      lassoTimerRef.current = setTimeout(() => {
        const startPos = lassoStartPosRef.current;
        if (!startPos) return;
        setLassoState({
          startX: startPos.x,
          startY: startPos.y,
          currentX: startPos.x,
          currentY: startPos.y,
          active: true,
          longPressTriggered: true,
        });
      }, 400);
    }
  }, [canvasOffset]);

  // 画布右键菜单（空白处）
  const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-grid')) {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: null });
    }
  }, [canvasOffset]);

  // 开始从节点连线
  const startConnection = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    connectingFromRef.current = nodeId;
    setConnectingFrom(nodeId);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const pos = { x: e.clientX - rect.left - canvasOffset.x, y: e.clientY - rect.top - canvasOffset.y };
      connectingToPosRef.current = pos;
      setConnectingToPos(pos);
    }
  }, [canvasOffset]);

  // 分析连线组合，判断可以执行什么生成操作
  const analyzeConnectionCombo = useCallback((targetNodeId: string) => {
    const incoming = connectionsRef.current.filter(c => c.toNodeId === targetNodeId);
    const sourceNodes = incoming.map(c => nodesRef.current.find(n => n.id === c.fromNodeId)).filter(Boolean) as CanvasNode[];
    const targetNode = nodesRef.current.find(n => n.id === targetNodeId);
    if (!targetNode) return null;

    const hasImage = sourceNodes.some(n => n.type === 'image' || n.type === 'composite');
    const hasText = sourceNodes.some(n => n.type === 'text');
    const hasCharacter = sourceNodes.some(n => n.type === 'character');
    const hasScene = sourceNodes.some(n => n.type === 'scene');
    const imageCount = sourceNodes.filter(n => n.type === 'image' || n.type === 'composite').length;

    return {
      sourceNodes,
      hasImage,
      hasText,
      hasCharacter,
      hasScene,
      imageCount,
      targetNode,
    };
  }, []);

  // 显示节点生成菜单
  const showGenerationMenu = useCallback((targetNodeId: string, x: number, y: number) => {
    const analysis = analyzeConnectionCombo(targetNodeId);
    if (!analysis) return;
    const { sourceNodes, hasImage, hasText, imageCount } = analysis;

    if (sourceNodes.length === 0) return;

    // 如果目标节点是空图片节点，且有连线，显示生成菜单
    const targetNode = nodesRef.current.find(n => n.id === targetNodeId);
    if (!targetNode) return;

    // 计算菜单位置（在目标节点右侧）
    const menuX = targetNode.x + NODE_WIDTH + 20;
    const menuY = targetNode.y + NODE_HEIGHT / 2;

    setGenerationMenu({
      x: menuX,
      y: menuY,
      targetNodeId,
      sourceNodeIds: sourceNodes.map(n => n.id),
    });
  }, [analyzeConnectionCombo]);

  // 完成连线到目标节点
  const endConnection = useCallback((e: React.MouseEvent, toNodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const fromId = connectingFromRef.current;
    if (!fromId || fromId === toNodeId) {
      setConnectingFrom(null);
      setConnectingToPos(null);
      connectingFromRef.current = null;
      connectingToPosRef.current = null;
      return;
    }
    // 检查是否已存在相同连线
    const exists = connectionsRef.current.some(
      c => c.fromNodeId === fromId && c.toNodeId === toNodeId
    );
    if (exists) {
      showToast('连线已存在', 'warning');
      setConnectingFrom(null);
      setConnectingToPos(null);
      connectingFromRef.current = null;
      connectingToPosRef.current = null;
      return;
    }

    const newConn: NodeConnection = {
      id: generateId(),
      fromNodeId: fromId,
      toNodeId: toNodeId,
    };
    setConnections(prev => [...prev, newConn]);
    setIsDirty(true);
    showToast('已建立连线', 'success');

    // 检查是否需要显示生成菜单
    const targetNode = nodesRef.current.find(n => n.id === toNodeId);
    const fromNode = nodesRef.current.find(n => n.id === fromId);
    if (targetNode && fromNode) {
      // 延迟检查，等 state 更新后
      setTimeout(() => {
        const analysis = analyzeConnectionCombo(toNodeId);
        if (analysis && analysis.sourceNodes.length >= 1) {
          // 如果目标节点是图片节点且没有实际图片，或者是空节点，显示生成菜单
          const isEmptyImage = targetNode.type === 'image' && !targetNode.imageUrl;
          const isTextNode = targetNode.type === 'text';
          if (isEmptyImage || isTextNode || targetNode.type === 'composite') {
            showGenerationMenu(toNodeId, 0, 0);
          }
        }
      }, 100);
    }

    setConnectingFrom(null);
    setConnectingToPos(null);
    connectingFromRef.current = null;
    connectingToPosRef.current = null;
  }, [showToast, analyzeConnectionCombo, showGenerationMenu]);

  // 鼠标移动（拖拽节点、平移画布、拖拽连线、或框选创建）—— rAF 节流 + ref 替代 state，避免每帧重建 effect
  useEffect(() => {
    if (!draggingNodeId && !isPanning && !connectingFrom && !lassoState?.active) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (draggingNodeId) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const newX = e.clientX - rect.left - dragOffsetRef.current.x - canvasOffsetRef.current.x;
        const newY = e.clientY - rect.top - dragOffsetRef.current.y - canvasOffsetRef.current.y;
        targetPosRef.current = { x: Math.max(0, newX), y: Math.max(0, newY) };
        if (!rAFRef.current) {
          rAFRef.current = requestAnimationFrame(() => {
            rAFRef.current = 0;
            setNodes(prev => prev.map(n =>
              n.id === draggingNodeId ? { ...n, x: targetPosRef.current.x, y: targetPosRef.current.y } : n
            ));
          });
        }
      } else if (isPanning) {
        if (!rAFRef.current) {
          rAFRef.current = requestAnimationFrame(() => {
            rAFRef.current = 0;
            setCanvasOffset({
              x: e.clientX - panStart.x,
              y: e.clientY - panStart.y,
            });
          });
        }
      } else if (connectingFrom) {
        // 拖拽连线时更新终点位置
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const pos = {
            x: e.clientX - rect.left - canvasOffsetRef.current.x,
            y: e.clientY - rect.top - canvasOffsetRef.current.y,
          };
          connectingToPosRef.current = pos;
          if (!rAFRef.current) {
            rAFRef.current = requestAnimationFrame(() => {
              rAFRef.current = 0;
              setConnectingToPos({ ...connectingToPosRef.current! });
            });
          }
        }
      } else if (lassoState?.active) {
        // 框选时更新框的大小
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const pos = {
            x: e.clientX - rect.left - canvasOffsetRef.current.x,
            y: e.clientY - rect.top - canvasOffsetRef.current.y,
          };
          if (!rAFRef.current) {
            rAFRef.current = requestAnimationFrame(() => {
              rAFRef.current = 0;
              setLassoState(prev => prev ? { ...prev, currentX: pos.x, currentY: pos.y } : null);
            });
          }
        }
      }
    };

    const handleMouseUp = () => {
      if (rAFRef.current) {
        cancelAnimationFrame(rAFRef.current);
        rAFRef.current = 0;
      }
      if (draggingNodeId) {
        setIsDirty(true); // 仅拖拽结束时标记脏，触发自动保存
      }
      setDraggingNodeId(null);
      setIsPanning(false);
      // 处理框选结束
      if (lassoStateRef.current?.active) {
        handleLassoEnd();
      }
      // 清除长按定时器
      if (lassoTimerRef.current) {
        clearTimeout(lassoTimerRef.current);
        lassoTimerRef.current = null;
      }
      lassoStartPosRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (rAFRef.current) {
        cancelAnimationFrame(rAFRef.current);
        rAFRef.current = 0;
      }
    };
  }, [draggingNodeId, isPanning, panStart, connectingFrom, lassoState?.active]);

  // 框选结束处理：根据框选区域创建对应资源节点
  const handleLassoEnd = useCallback(() => {
    const lasso = lassoStateRef.current;
    if (!lasso || !lasso.active) return;

    const minX = Math.min(lasso.startX, lasso.currentX);
    const minY = Math.min(lasso.startY, lasso.currentY);
    const maxX = Math.max(lasso.startX, lasso.currentX);
    const maxY = Math.max(lasso.startY, lasso.currentY);
    const width = maxX - minX;
    const height = maxY - minY;

    // 清除框选状态
    setLassoState(null);
    lassoStateRef.current = null;

    // 如果框太小（小于 30x30），视为普通点击，取消选中
    if (width < 30 || height < 30) {
      setSelectedNodeId(null);
      setContextMenu(null);
      return;
    }

    // 计算框选中心点
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // 根据框的大小和方向决定创建什么类型的节点
    // 小框：创建文本节点；大框：创建图片节点
    const isLargeBox = width > 120 && height > 120;

    if (isLargeBox) {
      // 大框：创建图片节点（带首帧/尾帧）
      const newNode: CanvasNode = {
        id: generateId(),
        type: 'image',
        x: minX,
        y: minY,
        title: '图片节点',
        imageUrl: availableFrames?.startFrame || availableFrames?.endFrame,
      };
      setNodes(prev => [...prev, newNode]);
      setSelectedNodeId(newNode.id);
      setIsDirty(true);
      showToast('已创建图片节点', 'success');
    } else {
      // 小框：创建文本节点
      const newNode: CanvasNode = {
        id: generateId(),
        type: 'text',
        x: minX,
        y: minY,
        title: '文本节点',
        content: '',
      };
      setNodes(prev => [...prev, newNode]);
      setSelectedNodeId(newNode.id);
      setIsDirty(true);
      showToast('已创建文本节点', 'success');
    }
  }, [availableFrames, showToast]);

  // 右键菜单
  const handleContextMenu = useCallback((e: React.MouseEvent, nodeId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: nodeId || null });
    if (nodeId) setSelectedNodeId(nodeId);
  }, []);

  // 复制节点
  const duplicateNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const newNode: CanvasNode = {
      ...node,
      id: generateId(),
      x: node.x + 30,
      y: node.y + 30,
      title: `${node.title} 副本`,
      isMain: false, // 副本不是主节点
      status: node.type === 'video' ? 'pending' : node.status,
      jobId: undefined,
    };
    setNodes(prev => [...prev, newNode]);
    setContextMenu(null);
    setIsDirty(true);
  }, [nodes]);

  // 设置主节点
  const setMainNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !node.imageUrl) return;

    // 取消其他同类型主节点
    setNodes(prev => prev.map(n => {
      if (n.id === nodeId) return { ...n, isMain: true };
      // 同 frameType 的其他节点取消主节点标记
      if (node.frameType && n.frameType === node.frameType && n.isMain) {
        return { ...n, isMain: false };
      }
      return n;
    }));

    // 回调通知导演模式
    if (onSetMainFrame && node.frameType) {
      onSetMainFrame(node.frameType, node.imageUrl);
    }

    setContextMenu(null);
    setIsDirty(true);
    showToast('已设为主节点', 'success');
  }, [nodes, onSetMainFrame, showToast]);

  // 添加资源节点到画布
  const addResourceNode = useCallback((resource: ResourceItem, x?: number, y?: number) => {
    const newNode: CanvasNode = {
      id: generateId(),
      type: resource.type,
      x: x ?? 100 + Math.random() * 200,
      y: y ?? 100 + Math.random() * 200,
      title: resource.name,
      imageUrl: resource.imageUrl,
      resourceId: resource.id,
      resourceType: resource.type,
      // 携带角色状态集合体信息
      characterStateInfo: resource.characterStateInfo,
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    setIsDirty(true);
    const typeLabel =
      resource.type === 'character' ? '角色' :
      resource.type === 'scene' ? '场景' :
      resource.type === 'prop' ? '道具' :
      resource.type === 'environment' ? '环境' :
      resource.type === 'building' ? '建筑' : '服装';
    showToast(`已添加${typeLabel}节点`, 'success');
  }, [showToast]);

  // 处理资源拖拽到画布
  const handleResourceDragStart = (e: React.DragEvent, resource: ResourceItem) => {
    e.dataTransfer.setData('application/json', JSON.stringify(resource));
    e.dataTransfer.effectAllowed = 'copy';
    setIsDraggingResource(true);
    setDraggedResource(resource);
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingResource(false);
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;
    try {
      const resource: ResourceItem = JSON.parse(data);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left - canvasOffset.x - NODE_WIDTH / 2;
      const y = e.clientY - rect.top - canvasOffset.y - 28;
      addResourceNode(resource, Math.max(0, x), Math.max(0, y));
    } catch {
      // ignore
    }
    setDraggedResource(null);
  };

  // 创建合成节点（拼接多张图片）
  const createCompositeNode = useCallback((sourceNodeIds: string[]) => {
    const sourceNodes = nodes.filter(n => sourceNodeIds.includes(n.id));
    if (sourceNodes.length < 2) {
      showToast('至少需要选择2个节点进行拼接', 'warning');
      return;
    }

    const avgX = sourceNodes.reduce((sum, n) => sum + n.x, 0) / sourceNodes.length;
    const avgY = sourceNodes.reduce((sum, n) => sum + n.y, 0) / sourceNodes.length;

    const newNode: CanvasNode = {
      id: generateId(),
      type: 'composite',
      x: avgX + NODE_WIDTH + 50,
      y: avgY,
      title: '合成图',
      compositeFrom: sourceNodeIds,
      compositePrompt: '',
      status: 'pending',
    };

    // 建立连线
    const newConnections: NodeConnection[] = sourceNodeIds.map(fromId => ({
      id: generateId(),
      fromNodeId: fromId,
      toNodeId: newNode.id,
    }));

    setNodes(prev => [...prev, newNode]);
    setConnections(prev => [...prev, ...newConnections]);
    setSelectedNodeId(newNode.id);
    setIsDirty(true);
    showToast('已创建合成节点，请配置生成参数', 'info');
  }, [nodes, showToast]);

  // 从图片节点创建视频节点
  const createVideoNode = useCallback((sourceNodeId: string) => {
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    if (!sourceNode || (sourceNode.type !== 'image' && sourceNode.type !== 'composite')) return;

    const newNode: CanvasNode = {
      id: generateId(),
      type: 'video',
      x: sourceNode.x + NODE_WIDTH + 80,
      y: sourceNode.y,
      title: '视频节点',
      status: 'pending',
      prompt: '',
    };

    setNodes(prev => [...prev, newNode]);
    setConnections(prev => [...prev, {
      id: generateId(),
      fromNodeId: sourceNodeId,
      toNodeId: newNode.id,
    }]);
    setSelectedNodeId(newNode.id);
    setIsDirty(true);
    showToast('已创建视频节点，请配置生成参数', 'info');
  }, [nodes, showToast]);

  // 生成视频
  const generateVideo = useCallback(async (nodeId: string, prompt: string, model?: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !projectId) return;

    const conn = connections.find(c => c.toNodeId === nodeId);
    const sourceNode = conn ? nodes.find(n => n.id === conn.fromNodeId) : null;

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
  }, [nodes, connections, projectId, sceneId, showToast]);

  // 计算连线路径（通过 ref 读取最新 nodes，回调稳定不重建）
  const getConnectionPath = useCallback((conn: NodeConnection): string => {
    const currentNodes = nodesRef.current;
    const fromNode = currentNodes.find(n => n.id === conn.fromNodeId);
    const toNode = currentNodes.find(n => n.id === conn.toNodeId);
    if (!fromNode || !toNode) return '';
    const fromX = fromNode.x + NODE_WIDTH;
    const fromY = fromNode.y + NODE_HEIGHT / 2;
    const toX = toNode.x;
    const toY = toNode.y + NODE_HEIGHT / 2;
    const midX = (fromX + toX) / 2;
    return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
  }, []);

  // 获取选中节点的详情信息（渲染已由 rAF 节流，无需额外 useMemo）
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  // 获取节点的来源节点
  const getNodeSources = useCallback((node: CanvasNode) => {
    const incomingConnections = connections.filter(c => c.toNodeId === node.id);
    return incomingConnections.map(conn => {
      const sourceNode = nodes.find(n => n.id === conn.fromNodeId);
      return sourceNode;
    }).filter(Boolean) as CanvasNode[];
  }, [connections, nodes]);
  
  // 获取节点的下游节点
  const getNodeOutputs = useCallback((node: CanvasNode) => {
    const outgoingConnections = connections.filter(c => c.fromNodeId === node.id);
    return outgoingConnections.map(conn => {
      const targetNode = nodes.find(n => n.id === conn.toNodeId);
      return targetNode;
    }).filter(Boolean) as CanvasNode[];
  }, [connections, nodes]);

  // 渲染节点
  const renderNode = useCallback((node: CanvasNode) => {
    const colors = NODE_COLORS[node.type] || NODE_COLORS.image;
    const isSelected = selectedNodeId === node.id;
    const isGenerating = node.status === 'generating';
    const isMainNode = node.isMain;

    const isConnectingSource = connectingFrom === node.id;
    const isConnectingTarget = connectingFrom !== null && connectingFrom !== node.id;

    return (
      <div
        key={node.id}
        className={`absolute rounded-lg border-2 overflow-hidden shadow-lg ${colors.bg} ${colors.border} ${isSelected ? 'ring-2 ring-blue-400 shadow-blue-500/40' : ''} ${isMainNode ? 'ring-2 ring-yellow-400/70' : ''} ${isConnectingSource ? 'ring-2 ring-green-400' : ''} ${isConnectingTarget ? 'hover:ring-2 hover:ring-blue-300' : ''}`}
        style={{
          left: node.x,
          top: node.y,
          width: NODE_WIDTH,
          minHeight: NODE_HEIGHT,
          cursor: draggingNodeId === node.id ? 'grabbing' : connectingFrom ? (isConnectingTarget ? 'crosshair' : 'default') : 'grab',
          zIndex: isSelected || isConnectingSource ? 10 : 1,
          transform: isSelected ? 'scale(1.02)' : undefined,
          transition: draggingNodeId ? 'none' : 'transform 0.15s ease-out',
        }}
        onMouseDown={(e) => {
          if (connectingFrom && isConnectingTarget) {
            endConnection(e, node.id);
          } else {
            handleMouseDown(e, node.id);
          }
        }}
        onContextMenu={(e) => handleContextMenu(e, node.id)}
      >
        {/* 节点头部 */}
        <div className={`flex items-center justify-between px-2 py-1.5 ${colors.header} select-none`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={colors.accent}>{colors.icon}</span>
            <span className="text-[10px] font-medium text-gray-700 truncate">{node.title}</span>
            {isMainNode && (
              <Star size={10} className="text-yellow-700 fill-yellow-500 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* 删除按钮 */}
            <button
              className="p-0.5 rounded hover:bg-red-100 transition-colors text-gray-400 hover:text-red-500"
              title="删除节点 (Delete)"
              onClick={(e) => {
                e.stopPropagation();
                deleteNode(node.id);
              }}
            >
              <Trash2 size={10} />
            </button>
            {/* 连线按钮：点击开始拖拽连线 */}
            <button
              className={`p-0.5 rounded hover:bg-white/50 transition-colors ${isConnectingSource ? 'text-green-600' : 'text-gray-400 hover:text-blue-500'}`}
              title="拖拽连线到其他节点"
              onMouseDown={(e) => startConnection(e, node.id)}
            >
              <Plus size={10} className={isConnectingSource ? 'rotate-45' : ''} />
            </button>
            <GripVertical size={12} className="text-gray-400 shrink-0" />
          </div>
        </div>

        {/* 节点内容 */}
        <div className="p-2">
          {/* 角色节点卡面展示：显示角色状态集合体（白膜+服装+状态） */}
          {node.type === 'character' && (
            <div className="relative rounded overflow-hidden bg-gray-100" style={{ height: 140 }}>
              {node.imageUrl ? (
                <>
                  <img
                    src={node.imageUrl}
                    alt={node.title}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                  {/* 状态标签层 */}
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/70 via-black/40 to-transparent">
                    {/* 角色名称 */}
                    <span className="text-[10px] text-white font-semibold truncate block">
                      {node.title}
                    </span>
                    {/* 状态/服装/白膜标签 */}
                    {node.characterStateInfo && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {/* 状态名称标签 */}
                        {node.characterStateInfo.stateName && (
                          <span className="px-1 py-0.5 rounded text-[8px] bg-pink-500/80 text-white font-medium">
                            {node.characterStateInfo.stateName}
                          </span>
                        )}
                        {/* 服装标签 */}
                        {node.characterStateInfo.costumeName && (
                          <span className="px-1 py-0.5 rounded text-[8px] bg-purple-500/80 text-white font-medium">
                            {node.characterStateInfo.costumeName}
                          </span>
                        )}
                        {/* 白膜基础标签 */}
                        {node.characterStateInfo.hasBaseModelViews && (
                          <span className="px-1 py-0.5 rounded text-[8px] bg-amber-500/80 text-white font-medium">
                            有白膜
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-1">
                  <User size={32} />
                  <span className="text-[10px]">暂无图片</span>
                </div>
              )}
              {isMainNode && (
                <span className="absolute top-1 left-1 px-1 py-0.5 rounded text-[9px] bg-yellow-500/60 text-white flex items-center gap-0.5">
                  <Star size={8} className="fill-white" /> 主节点
                </span>
              )}
            </div>
          )}

          {/* 场景节点卡面展示 */}
          {node.type === 'scene' && (
            <div className="relative rounded overflow-hidden bg-gray-100" style={{ height: 140 }}>
              {node.imageUrl ? (
                <>
                  <img
                    src={node.imageUrl}
                    alt={node.title}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/60 to-transparent">
                    <span className="text-[10px] text-white font-medium truncate block">
                      {node.title}
                    </span>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-1">
                  <MapPin size={32} />
                  <span className="text-[10px]">暂无图片</span>
                </div>
              )}
            </div>
          )}

          {/* 道具/环境/建筑/服装节点卡面展示 */}
          {(node.type === 'prop' || node.type === 'environment' || node.type === 'building' || node.type === 'costume') && (
            <div className="relative rounded overflow-hidden bg-gray-100" style={{ height: 140 }}>
              {node.imageUrl ? (
                <>
                  <img
                    src={node.imageUrl}
                    alt={node.title}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/60 to-transparent">
                    <span className="text-[10px] text-white font-medium truncate block">
                      {node.title}
                    </span>
                    <span className="text-[8px] text-white/70">
                      {node.type === 'prop' ? '道具' :
                       node.type === 'environment' ? '环境' :
                       node.type === 'building' ? '建筑' : '服装'}
                    </span>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-1">
                  {node.type === 'prop' ? <Box size={32} /> :
                   node.type === 'environment' ? <TreePine size={32} /> :
                   node.type === 'building' ? <Building2 size={32} /> :
                   <Shirt size={32} />}
                  <span className="text-[10px]">暂无图片</span>
                </div>
              )}
            </div>
          )}

          {/* 图片节点展示 */}
          {node.type === 'image' && node.imageUrl && (
            <div className="relative rounded overflow-hidden bg-gray-100">
              <img
                src={node.imageUrl}
                alt={node.title}
                className="w-full h-32 object-cover"
                draggable={false}
              />
              {node.frameType && (
                <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded text-[9px] bg-black/60 text-white">
                  {node.frameType === 'first' ? '首帧' : '尾帧'}
                </span>
              )}
              {isMainNode && (
                <span className="absolute top-1 left-1 px-1 py-0.5 rounded text-[9px] bg-yellow-500/60 text-white flex items-center gap-0.5">
                  <Star size={8} className="fill-white" /> 主节点
                </span>
              )}
            </div>
          )}

          {/* 空图片节点：显示下一步操作提示 */}
          {node.type === 'image' && !node.imageUrl && (
            <div className="relative rounded bg-gray-50 min-h-[120px] flex flex-col p-3">
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
                <ImageIcon size={32} />
                <span className="text-[10px]">空图片节点</span>
              </div>
              {/* 下一步操作提示 */}
              <div className="mt-2 space-y-1">
                <div className="text-[9px] text-gray-400 mb-1">尝试：</div>
                <button
                  className="w-full py-1 rounded text-[9px] bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-1.5 px-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    // 获取连线的源节点
                    const incoming = connections.filter(c => c.toNodeId === node.id);
                    const sourceIds = incoming.map(c => c.fromNodeId);
                    if (sourceIds.length > 0) {
                      // 有连线：显示生成菜单
                      showGenerationMenu(node.id, 0, 0);
                    } else {
                      // 无连线：提示先连线
                      showToast('请先连接源节点（图片或文本）', 'warning');
                    }
                  }}
                >
                  <Zap size={10} /> 图生图
                </button>
                <button
                  className="w-full py-1 rounded text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 px-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    const incoming = connections.filter(c => c.toNodeId === node.id);
                    if (incoming.length === 0) {
                      showToast('请先连接源节点', 'warning');
                      return;
                    }
                    // 图片高清：模拟提升分辨率
                    setNodes(prev => prev.map(n =>
                      n.id === node.id ? { ...n, title: '高清图片', status: 'generating' } : n
                    ));
                    showToast('图片高清处理中...', 'info');
                    setTimeout(() => {
                      setNodes(prev => prev.map(n =>
                        n.id === node.id ? { ...n, status: 'completed' } : n
                      ));
                      showToast('高清处理完成', 'success');
                    }, 2000);
                  }}
                >
                  <Images size={10} /> 图片高清
                </button>
              </div>
            </div>
          )}

          {/* 合成节点有图片时的展示 */}
          {node.type === 'composite' && node.imageUrl && (
            <div className="relative rounded overflow-hidden bg-gray-100">
              <img
                src={node.imageUrl}
                alt={node.title}
                className="w-full h-32 object-cover"
                draggable={false}
              />
              <span className="absolute top-1 right-1 px-1 py-0.5 rounded text-[9px] bg-purple-500/60 text-white">
                合成
              </span>
              {isMainNode && (
                <span className="absolute top-1 left-1 px-1 py-0.5 rounded text-[9px] bg-yellow-500/60 text-white flex items-center gap-0.5">
                  <Star size={8} className="fill-white" /> 主节点
                </span>
              )}
            </div>
          )}

          {/* 合成节点无图片时的占位 */}
          {node.type === 'composite' && !node.imageUrl && (
            <div className="h-20 rounded bg-gray-100 flex flex-col items-center justify-center text-gray-400 gap-1">
              <Layers size={24} />
              <span className="text-[9px]">待生成</span>
            </div>
          )}

          {/* 文本节点 */}
          {node.type === 'text' && (
            <div className="relative rounded overflow-hidden bg-gray-50 min-h-[80px] flex flex-col p-2">
              {node.content ? (
                <div className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap line-clamp-6">
                  {node.content}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-1 min-h-[60px]">
                  <FileText size={24} />
                  <span className="text-[9px]">点击编辑文本</span>
                </div>
              )}
            </div>
          )}

          {/* 视频节点 */}
          {node.type === 'video' && (
            <div className="relative rounded overflow-hidden bg-gray-100 min-h-[80px] flex items-center justify-center">
              {node.videoUrl ? (
                <video
                  src={node.videoUrl}
                  className="w-full h-20 object-cover"
                  controls
                  preload="metadata"
                />
              ) : isGenerating ? (
                <div className="flex flex-col items-center gap-1 text-gray-500">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-[9px]">生成中...</span>
                </div>
              ) : node.status === 'failed' ? (
                <div className="flex flex-col items-center gap-1 text-red-500">
                  <X size={20} />
                  <span className="text-[9px]">生成失败</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 text-gray-400">
                  <Film size={20} />
                  <span className="text-[9px]">待生成</span>
                </div>
              )}
            </div>
          )}

          {/* 合成节点来源缩略显示 */}
          {node.type === 'composite' && node.compositeFrom && node.compositeFrom.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
              {node.compositeFrom.map(fromId => {
                const fromNode = nodes.find(n => n.id === fromId);
                return (
                  <div key={fromId} className="flex items-center gap-0.5">
                    {fromNode?.imageUrl ? (
                      <img src={fromNode.imageUrl} alt="" className="w-5 h-5 rounded object-cover" />
                    ) : (
                      <div className="w-5 h-5 rounded bg-gray-100" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="mt-2 space-y-1">
            {/* 图片/合成节点：生成视频 */}
            {(node.type === 'image' || node.type === 'composite') && (
              <button
                className="w-full py-1 rounded text-[10px] bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-600/30 transition-colors flex items-center justify-center gap-1"
                onClick={(e) => { e.stopPropagation(); createVideoNode(node.id); }}
              >
                <Film size={10} /> 生成视频
              </button>
            )}

            {/* 视频节点：配置生成 */}
            {node.type === 'video' && node.status === 'pending' && (
              <button
                className="w-full py-1 rounded text-[10px] bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-600/30 transition-colors flex items-center justify-center gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  const prompt = window.prompt('请输入视频生成提示词：', node.prompt || '');
                  if (prompt) generateVideo(node.id, prompt);
                }}
              >
                <Sparkles size={10} /> 配置生成
              </button>
            )}

            {/* 合成节点：生成合成图 */}
            {node.type === 'composite' && node.status === 'pending' && (
              <button
                className="w-full py-1 rounded text-[10px] bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-600/30 transition-colors flex items-center justify-center gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  const prompt = window.prompt('请输入图片合成提示词：', node.compositePrompt || '');
                  if (prompt) {
                    setNodes(prev => prev.map(n =>
                      n.id === node.id ? { ...n, compositePrompt: prompt, status: 'generating' } : n
                    ));
                    showToast('合成任务已启动（模拟）', 'info');
                    // TODO: 调用实际的图片合成API
                    setTimeout(() => {
                      setNodes(prev => prev.map(n =>
                        n.id === node.id ? { ...n, status: 'completed', imageUrl: node.imageUrl } : n
                      ));
                    }, 2000);
                  }
                }}
              >
                <Wand2 size={10} /> 生成合成图
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }, [selectedNodeId, draggingNodeId, connectingFrom, handleMouseDown, handleContextMenu, startConnection, endConnection, deleteNode, duplicateNode, setMainNode, createVideoNode, nodes, connections, showToast, showGenerationMenu]);

  // 资源列表：角色显示为状态集合体 + 场景/道具/环境/建筑/服装
  const resources: ResourceItem[] = useMemo(() => {
    switch (resourceTab) {
      case 'scenes':
        return projectScenes.map(s => ({
          id: s.id,
          name: s.name,
          imageUrl: s.image_url,
          type: 'scene' as const,
        }));
      case 'props':
        return projectProps.map(p => ({
          id: p.id,
          name: p.name,
          imageUrl: p.image_url,
          type: 'prop' as const,
        }));
      case 'environments':
        return projectEnvironments.map(e => ({
          id: e.id,
          name: e.name,
          imageUrl: e.image_url,
          type: 'environment' as const,
        }));
      case 'buildings':
        return projectBuildings.map(b => ({
          id: b.id,
          name: b.name,
          imageUrl: b.image_url,
          type: 'building' as const,
        }));
      case 'costumes':
        return projectCostumes.map(c => ({
          id: c.id,
          name: c.name,
          imageUrl: c.image_url,
          type: 'costume' as const,
        }));
      default:
        // 角色标签：每个角色只显示为一个集合体资源项（使用激活状态）
        const characterResources: ResourceItem[] = [];
        for (const character of projectCharacters) {
          const states = character.states || [];
          const activeState = states.find(s => s.is_active) || states[0];
          const stateImage = activeState
            ? (activeState.image_url || activeState.front_view_url)
            : null;

          characterResources.push({
            id: character.id,
            name: character.name,
            imageUrl: stateImage || character.active_state_image_url || character.image_url,
            type: 'character' as const,
            characterStateInfo: {
              stateId: activeState?.id || 0,
              stateName: activeState?.name || character.active_state_name || '默认',
              stateImage: stateImage || character.active_state_image_url || character.image_url,
              stateOutfit: activeState?.outfit || character.active_state_outfit,
              isBaseModel: false,
              costumeId: activeState?.costume_id,
              costumeName: activeState?.costume_name,
              baseAppearance: activeState?.appearance || character.base_appearance,
              outfitAppearance: character.outfit_appearance,
              hasBaseModelViews: character.has_base_model_views,
            },
          });
        }
        return characterResources;
    }
  }, [projectCharacters, projectScenes, projectProps, projectEnvironments, projectBuildings, projectCostumes, resourceTab]);

  return (
    <div className="relative w-full h-full flex overflow-hidden bg-white">
      {/* 左侧资源面板 */}
      <div
        className={`flex-shrink-0 bg-gray-50 border-r border-gray-200 transition-all duration-200 overflow-hidden flex flex-col ${showResourcePanel ? 'w-52' : 'w-0'}`}
      >
        <div className="p-3 border-b border-gray-200">
          <h3 className="text-xs font-semibold text-gray-700 mb-2">资源库</h3>
          <div className="grid grid-cols-3 gap-1">
            <button
              className={`py-1 rounded text-[10px] font-medium transition-colors ${resourceTab === 'characters' ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:text-gray-700'}`}
              onClick={() => setResourceTab('characters')}
            >
              角色 ({projectCharacters.length})
            </button>
            <button
              className={`py-1 rounded text-[10px] font-medium transition-colors ${resourceTab === 'scenes' ? 'bg-emerald-100 text-emerald-700' : 'text-gray-400 hover:text-gray-700'}`}
              onClick={() => setResourceTab('scenes')}
            >
              场景 ({projectScenes.length})
            </button>
            <button
              className={`py-1 rounded text-[10px] font-medium transition-colors ${resourceTab === 'props' ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-700'}`}
              onClick={() => setResourceTab('props')}
            >
              道具 ({projectProps.length})
            </button>
            <button
              className={`py-1 rounded text-[10px] font-medium transition-colors ${resourceTab === 'environments' ? 'bg-teal-100 text-teal-700' : 'text-gray-400 hover:text-gray-700'}`}
              onClick={() => setResourceTab('environments')}
            >
              环境 ({projectEnvironments.length})
            </button>
            <button
              className={`py-1 rounded text-[10px] font-medium transition-colors ${resourceTab === 'buildings' ? 'bg-orange-100 text-orange-700' : 'text-gray-400 hover:text-gray-700'}`}
              onClick={() => setResourceTab('buildings')}
            >
              建筑 ({projectBuildings.length})
            </button>
            <button
              className={`py-1 rounded text-[10px] font-medium transition-colors ${resourceTab === 'costumes' ? 'bg-pink-100 text-pink-700' : 'text-gray-400 hover:text-gray-700'}`}
              onClick={() => setResourceTab('costumes')}
            >
              服装 ({projectCostumes.length})
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {resources.length === 0 && (
            <div className="text-center text-gray-400 text-[10px] py-4">
              暂无{
                resourceTab === 'characters' ? '角色' :
                resourceTab === 'scenes' ? '场景' :
                resourceTab === 'props' ? '道具' :
                resourceTab === 'environments' ? '环境' :
                resourceTab === 'buildings' ? '建筑' : '服装'
              }资源
            </div>
          )}
          {resources.map(resource => (
            <div
              key={`${resource.type}-${resource.id}`}
              className="group flex items-center gap-2 p-2 rounded-lg bg-white hover:bg-white cursor-grab active:cursor-grabbing transition-colors"
              draggable
              onDragStart={(e) => handleResourceDragStart(e, resource)}
              onClick={() => {
                // 点击直接添加到画布中心
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                  const x = (rect.width / 2) - canvasOffset.x - NODE_WIDTH / 2;
                  const y = (rect.height / 2) - canvasOffset.y - NODE_HEIGHT / 2;
                  addResourceNode(resource, x, y);
                }
              }}
            >
              {resource.imageUrl ? (
                <img src={resource.imageUrl} alt={resource.name} className="w-10 h-10 rounded object-cover bg-gray-100" />
              ) : (
                <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400">
                  {resource.type === 'character' ? <User size={16} /> :
                   resource.type === 'scene' ? <MapPin size={16} /> :
                   resource.type === 'prop' ? <Box size={16} /> :
                   resource.type === 'environment' ? <TreePine size={16} /> :
                   resource.type === 'building' ? <Building2 size={16} /> :
                   <Shirt size={16} />}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-gray-700 truncate">{resource.name}</div>
                <div className="text-[9px] text-gray-400">
                  {resource.type === 'character'
                    ? (resource.characterStateInfo?.stateName || '角色')
                    : resource.type === 'scene' ? '场景'
                    : resource.type === 'prop' ? '道具'
                    : resource.type === 'environment' ? '环境'
                    : resource.type === 'building' ? '建筑'
                    : '服装'}
                </div>
              </div>
              <Plus size={12} className="text-gray-500 group-hover:text-gray-500" />
            </div>
          ))}
        </div>
      </div>

      {/* 画布区域 */}
      <div className="flex-1 relative overflow-hidden" ref={canvasContainerRef}>
        {/* 切换资源面板按钮 */}
        <button
          className="absolute top-3 left-3 z-20 p-1.5 rounded-lg bg-white/80 border border-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
          onClick={() => setShowResourcePanel(!showResourcePanel)}
        >
          {showResourcePanel ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* 画布 */}
        <div
          ref={canvasRef}
          className="absolute inset-0 overflow-hidden"
          style={{
            transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)`,
          }}
          onMouseDown={handleCanvasMouseDown}
          onContextMenu={handleCanvasContextMenu}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
        >
          {/* 网格背景 - 相反颜色的小点点 */}
          <div
            className="absolute inset-0 canvas-grid"
            style={{
              width: 4000,
              height: 3000,
              backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.15) 1px, transparent 1px)`,
              backgroundSize: '20px 20px',
            }}
          />

          {/* 框选创建节点的视觉反馈 */}
          {lassoState?.active && (
            <div
              className="absolute border-2 border-dashed border-blue-400 bg-blue-50/30 pointer-events-none z-30"
              style={{
                left: Math.min(lassoState.startX, lassoState.currentX),
                top: Math.min(lassoState.startY, lassoState.currentY),
                width: Math.abs(lassoState.currentX - lassoState.startX),
                height: Math.abs(lassoState.currentY - lassoState.startY),
              }}
            >
              <div className="absolute -top-5 left-0 text-[10px] text-blue-500 font-medium whitespace-nowrap bg-white/80 px-1 rounded">
                {Math.abs(lassoState.currentX - lassoState.startX) > 120 && Math.abs(lassoState.currentY - lassoState.startY) > 120
                  ? '释放创建图片节点'
                  : '释放创建文本节点'}
              </div>
            </div>
          )}

          {/* SVG 连线层 */}
          <svg className="absolute top-0 left-0" style={{ width: 4000, height: 3000, pointerEvents: connectingFrom ? 'auto' : 'none' }}>
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#3b82f6" opacity="0.5" />
              </marker>
            </defs>
            {connections.map(conn => (
              <path
                key={conn.id}
                d={getConnectionPath(conn)}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={2}
                opacity={0.5}
                markerEnd="url(#arrowhead)"
              />
            ))}
            {/* 正在拖拽的临时连线 */}
            {connectingFrom && connectingToPos && (() => {
              const fromNode = nodes.find(n => n.id === connectingFrom);
              if (!fromNode) return null;
              const fromX = fromNode.x + NODE_WIDTH;
              const fromY = fromNode.y + NODE_HEIGHT / 2;
              const toX = connectingToPos.x;
              const toY = connectingToPos.y;
              const midX = (fromX + toX) / 2;
              return (
                <path
                  d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  opacity={0.7}
                  strokeDasharray="5,5"
                />
              );
            })()}
          </svg>

          {/* 节点层 */}
          {nodes.map(renderNode)}
        </div>

        {/* 画布工具栏 */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
          <button
            className="px-3 py-1.5 rounded-lg bg-white/80 border border-gray-200 text-xs text-gray-700 hover:bg-gray-100/80 flex items-center gap-1.5"
            onClick={() => {
              // 添加空白图片节点
              const newNode: CanvasNode = {
                id: generateId(),
                type: 'image',
                x: 100 - canvasOffset.x,
                y: 100 - canvasOffset.y,
                title: '图片节点',
                imageUrl: availableFrames?.startFrame || availableFrames?.endFrame,
              };
              setNodes(prev => [...prev, newNode]);
              setIsDirty(true);
            }}
          >
            <ImageIcon size={12} /> 添加图片
          </button>
          <button
            className="px-3 py-1.5 rounded-lg bg-white/80 border border-gray-200 text-xs text-gray-700 hover:bg-gray-100/80 flex items-center gap-1.5"
            onClick={() => {
              // 添加文本节点
              const newNode: CanvasNode = {
                id: generateId(),
                type: 'text',
                x: 100 - canvasOffset.x,
                y: 100 - canvasOffset.y,
                title: '文本节点',
                content: '',
              };
              setNodes(prev => [...prev, newNode]);
              setSelectedNodeId(newNode.id);
              setIsDirty(true);
            }}
          >
            <Type size={12} /> 添加文本
          </button>
          <button
            className="px-3 py-1.5 rounded-lg bg-white/80 border border-gray-200 text-xs text-gray-700 hover:bg-gray-100/80 flex items-center gap-1.5"
            onClick={() => {
              // 创建合成节点：需要选择多个节点
              const selectedNodes = nodes.filter(n => {
                // 简化：使用当前选中的节点和它的连接
                return n.type === 'image' || n.type === 'character' || n.type === 'scene';
              });
              if (selectedNodes.length >= 2) {
                createCompositeNode(selectedNodes.slice(0, 4).map(n => n.id));
              } else {
                showToast('请先添加至少2个图片节点', 'warning');
              }
            }}
          >
            <Layers size={12} /> 拼接合成
          </button>
          <button
            className="px-3 py-1.5 rounded-lg bg-white/80 border border-gray-200 text-xs text-gray-700 hover:bg-gray-100/80 flex items-center gap-1.5"
            onClick={() => setCanvasOffset({ x: 0, y: 0 })}
          >
            <Camera size={12} /> 重置视图
          </button>
        </div>

        {/* 节点计数 */}
        <div className="absolute top-3 right-3 text-[10px] text-gray-400 z-20">
          {nodes.length} 节点 · {connections.length} 连线
        </div>

        {/* 节点生成菜单（当多个节点连接到一个空节点时显示） */}
        {generationMenu && (() => {
          const targetNode = nodes.find(n => n.id === generationMenu.targetNodeId);
          if (!targetNode) return null;
          const sourceNodes = generationMenu.sourceNodeIds
            .map(id => nodes.find(n => n.id === id))
            .filter(Boolean) as CanvasNode[];
          const hasImage = sourceNodes.some(n => n.type === 'image' || n.type === 'composite');
          const hasText = sourceNodes.some(n => n.type === 'text');
          const hasCharacter = sourceNodes.some(n => n.type === 'character');
          const hasScene = sourceNodes.some(n => n.type === 'scene');
          const imageCount = sourceNodes.filter(n => n.type === 'image' || n.type === 'composite').length;

          // 根据连线组合决定可用的生成选项
          const options: { label: string; icon: React.ReactNode; type: 'image' | 'video' | 'text' | 'composite'; disabled?: boolean }[] = [];

          if (hasImage && hasText) {
            // 图片 + 文本 = 图生图（带提示词）
            options.push({ label: '图生图', icon: <Zap size={14} />, type: 'image' });
            options.push({ label: '视频生成', icon: <Film size={14} />, type: 'video' });
          } else if (imageCount >= 2) {
            // 多张图片 = 图片拼接 / 视频
            options.push({ label: '图片拼接', icon: <Images size={14} />, type: 'composite' });
            options.push({ label: '视频生成', icon: <Film size={14} />, type: 'video' });
          } else if (hasImage) {
            // 单张图片 = 图生图 / 视频
            options.push({ label: '图生图', icon: <Zap size={14} />, type: 'image' });
            options.push({ label: '视频生成', icon: <Film size={14} />, type: 'video' });
          } else if (hasText && (hasCharacter || hasScene)) {
            // 文本 + 角色/场景 = 文生图
            options.push({ label: '文生图', icon: <PenLine size={14} />, type: 'image' });
          } else if (hasText) {
            // 纯文本 = 文生图 / 文生视频
            options.push({ label: '文生图', icon: <PenLine size={14} />, type: 'image' });
            options.push({ label: '文生视频', icon: <Film size={14} />, type: 'video' });
          }

          if (options.length === 0) return null;

          return (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setGenerationMenu(null)} />
              <div
                className="absolute z-50 bg-white border border-gray-200 rounded-xl shadow-2xl py-2 min-w-[180px]"
                style={{
                  left: generationMenu.x + canvasOffset.x,
                  top: generationMenu.y + canvasOffset.y,
                }}
              >
                <div className="px-3 py-1.5 text-[10px] text-gray-400 border-b border-gray-100 mb-1">
                  引用 {sourceNodes.length} 个节点生成
                </div>
                {options.map((opt) => (
                  <button
                    key={opt.type}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 transition-colors ${
                      opt.disabled
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                    }`}
                    disabled={opt.disabled}
                    onClick={() => {
                      if (opt.disabled) return;
                      // 执行生成操作
                      const sourceIds = generationMenu.sourceNodeIds;
                      if (opt.type === 'image') {
                        // 图生图或文生图：更新目标节点为图片节点
                        const prompt = sourceNodes.find(n => n.type === 'text')?.content || '';
                        setNodes(prev => prev.map(n =>
                          n.id === generationMenu.targetNodeId
                            ? { ...n, type: 'image', title: prompt ? '图生图' : '图片节点', status: 'pending', prompt }
                            : n
                        ));
                        showToast('已启动图生图生成', 'info');
                      } else if (opt.type === 'video') {
                        // 创建视频节点
                        const newVideoNode: CanvasNode = {
                          id: generateId(),
                          type: 'video',
                          x: targetNode.x + NODE_WIDTH + 80,
                          y: targetNode.y,
                          title: '视频节点',
                          status: 'pending',
                          prompt: sourceNodes.find(n => n.type === 'text')?.content || '',
                        };
                        setNodes(prev => [...prev, newVideoNode]);
                        setConnections(prev => [
                          ...prev,
                          { id: generateId(), fromNodeId: generationMenu.targetNodeId, toNodeId: newVideoNode.id },
                        ]);
                        setSelectedNodeId(newVideoNode.id);
                        showToast('已创建视频节点', 'success');
                      } else if (opt.type === 'composite') {
                        // 图片拼接
                        createCompositeNode(sourceIds);
                      }
                      setGenerationMenu(null);
                      setIsDirty(true);
                    }}
                  >
                    <span className="text-gray-400">{opt.icon}</span>
                    <span className="font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </>
          );
        })()}
      </div>

      {/* 右侧详情面板 */}
      <div
        className={`flex-shrink-0 bg-gray-50 border-l border-gray-200 transition-all duration-200 overflow-hidden flex flex-col ${showDetailPanel && selectedNode ? 'w-60' : 'w-0'}`}
      >
        {selectedNode && (
          <div className="flex flex-col h-full">
            <div className="p-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-700">节点详情</h3>
              <button
                className="text-gray-400 hover:text-gray-700"
                onClick={() => setShowDetailPanel(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* 节点预览 */}
              {selectedNode.imageUrl && (
                <div className="rounded-lg overflow-hidden bg-white">
                  <img src={selectedNode.imageUrl} alt={selectedNode.title} className="w-full h-32 object-cover" />
                </div>
              )}
              {selectedNode.videoUrl && (
                <div className="rounded-lg overflow-hidden bg-white">
                  <video src={selectedNode.videoUrl} className="w-full h-32 object-cover" controls />
                </div>
              )}

              {/* 基本信息 */}
              <div>
                <label className="text-[10px] text-gray-400 uppercase">类型</label>
                <div className="text-xs text-gray-700 mt-0.5">
                  {selectedNode.type === 'image' && '图片'}
                  {selectedNode.type === 'video' && '视频'}
                  {selectedNode.type === 'character' && '角色'}
                  {selectedNode.type === 'scene' && '场景'}
                  {selectedNode.type === 'composite' && '合成'}
                  {selectedNode.type === 'prop' && '道具'}
                  {selectedNode.type === 'environment' && '环境'}
                  {selectedNode.type === 'building' && '建筑'}
                  {selectedNode.type === 'costume' && '服装'}
                  {selectedNode.type === 'text' && '文本'}
                </div>
              </div>

              {/* 主节点标记 */}
              {selectedNode.type !== 'video' && (
                <div>
                  <label className="text-[10px] text-gray-400 uppercase">主节点</label>
                  <button
                    className={`mt-1 w-full py-1.5 rounded text-[10px] font-medium transition-colors flex items-center justify-center gap-1 ${
                      selectedNode.isMain
                        ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                        : 'bg-white text-gray-500 border border-slate-700 hover:bg-gray-100'
                    }`}
                    onClick={() => setMainNode(selectedNode.id)}
                  >
                    <Star size={10} className={selectedNode.isMain ? 'fill-yellow-500' : ''} />
                    {selectedNode.isMain ? '已设为主节点' : '设为主节点'}
                  </button>
                  <p className="text-[9px] text-gray-400 mt-1">
                    主节点将用于导演模式的图片/视频显示
                  </p>
                </div>
              )}

              {/* 资源映射 */}
              {(selectedNode.resourceId || selectedNode.resourceType) && (
                <div>
                  <label className="text-[10px] text-gray-400 uppercase">资源映射</label>
                  <div className="mt-1 p-2 rounded bg-white text-xs text-gray-700">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">ID:</span>
                      <span>{selectedNode.resourceId}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">类型:</span>
                      <span>{selectedNode.resourceType === 'character' ? '角色' : '场景'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 来源信息 */}
              {getNodeSources(selectedNode).length > 0 && (
                <div>
                  <label className="text-[10px] text-gray-400 uppercase">来源节点</label>
                  <div className="mt-1 space-y-1">
                    {getNodeSources(selectedNode).map(source => (
                      <div
                        key={source.id}
                        className="flex items-center gap-2 p-1.5 rounded bg-white cursor-pointer hover:bg-white"
                        onClick={() => setSelectedNodeId(source.id)}
                      >
                        {source.imageUrl ? (
                          <img src={source.imageUrl} alt="" className="w-6 h-6 rounded object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded bg-gray-100" />
                        )}
                        <span className="text-[10px] text-gray-700">{source.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 下游节点 */}
              {getNodeOutputs(selectedNode).length > 0 && (
                <div>
                  <label className="text-[10px] text-gray-400 uppercase">生成目标</label>
                  <div className="mt-1 space-y-1">
                    {getNodeOutputs(selectedNode).map(target => (
                      <div
                        key={target.id}
                        className="flex items-center gap-2 p-1.5 rounded bg-white cursor-pointer hover:bg-white"
                        onClick={() => setSelectedNodeId(target.id)}
                      >
                        {target.imageUrl ? (
                          <img src={target.imageUrl} alt="" className="w-6 h-6 rounded object-cover" />
                        ) : target.videoUrl ? (
                          <video src={target.videoUrl} className="w-6 h-6 rounded object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded bg-gray-100" />
                        )}
                        <span className="text-[10px] text-gray-700">{target.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 文本内容编辑 */}
              {selectedNode.type === 'text' && (
                <div>
                  <label className="text-[10px] text-gray-400 uppercase">文本内容</label>
                  <textarea
                    className="mt-1 w-full p-2 rounded bg-white text-[11px] text-gray-700 leading-relaxed border border-gray-200 focus:border-blue-400 focus:outline-none resize-none"
                    rows={6}
                    placeholder="输入文本内容，如光影描述、外貌描述等..."
                    value={selectedNode.content || ''}
                    onChange={(e) => {
                      setNodes(prev => prev.map(n =>
                        n.id === selectedNode.id ? { ...n, content: e.target.value } : n
                      ));
                      setIsDirty(true);
                    }}
                  />
                </div>
              )}

              {/* 提示词 */}
              {selectedNode.prompt && (
                <div>
                  <label className="text-[10px] text-gray-400 uppercase">提示词</label>
                  <div className="mt-1 p-2 rounded bg-white text-[10px] text-gray-700 leading-relaxed">
                    {selectedNode.prompt}
                  </div>
                </div>
              )}

              {/* 合成提示词 */}
              {selectedNode.compositePrompt && (
                <div>
                  <label className="text-[10px] text-gray-400 uppercase">合成提示词</label>
                  <div className="mt-1 p-2 rounded bg-white text-[10px] text-gray-700 leading-relaxed">
                    {selectedNode.compositePrompt}
                  </div>
                </div>
              )}

              {/* 状态 */}
              {selectedNode.status && (
                <div>
                  <label className="text-[10px] text-gray-400 uppercase">状态</label>
                  <div className={`mt-1 text-[10px] ${
                    selectedNode.status === 'completed' ? 'text-emerald-700' :
                    selectedNode.status === 'generating' ? 'text-blue-600' :
                    selectedNode.status === 'failed' ? 'text-red-500' :
                    'text-gray-500'
                  }`}>
                    {selectedNode.status === 'pending' && '待生成'}
                    {selectedNode.status === 'generating' && '生成中...'}
                    {selectedNode.status === 'completed' && '已完成'}
                    {selectedNode.status === 'failed' && '生成失败'}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white border border-slate-600 rounded-lg shadow-xl py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {/* 画布空白处右键：添加节点 */}
            {contextMenu.nodeId === null && (
              <>
                <button
                  className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => {
                    const newNode: CanvasNode = {
                      id: generateId(),
                      type: 'text',
                      x: contextMenu.x - (canvasRef.current?.getBoundingClientRect().left || 0) - canvasOffset.x,
                      y: contextMenu.y - (canvasRef.current?.getBoundingClientRect().top || 0) - canvasOffset.y,
                      title: '文本节点',
                      content: '',
                    };
                    setNodes(prev => [...prev, newNode]);
                    setSelectedNodeId(newNode.id);
                    setContextMenu(null);
                    setIsDirty(true);
                  }}
                >
                  <Type size={12} /> 添加文本节点
                </button>
                <div className="my-1 border-t border-gray-200" />
              </>
            )}
            {/* 节点右键 */}
            {contextMenu.nodeId !== null && (
              <>
                <button
                  className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => duplicateNode(contextMenu.nodeId!)}
                >
                  <Copy size={12} /> 复制节点
                </button>
                {(() => {
                  const node = nodes.find(n => n.id === contextMenu.nodeId);
                  return node && node.type !== 'video' && node.type !== 'text' ? (
                    <button
                      className="w-full px-3 py-1.5 text-left text-xs text-yellow-700 hover:bg-gray-100 flex items-center gap-2"
                      onClick={() => setMainNode(contextMenu.nodeId!)}
                    >
                      <Star size={12} /> {node.isMain ? '取消主节点' : '设为主节点'}
                    </button>
                  ) : null;
                })()}
                <button
                  className="w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => deleteNode(contextMenu.nodeId!)}
                >
                  <Trash2 size={12} /> 删除节点
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default NodeCanvas;
