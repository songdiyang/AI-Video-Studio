/**
 * 节点初始化 Hook
 * 从分镜数据创建初始节点（角色、场景、图片、视频）
 */

import { useEffect } from 'react';
import {
  CanvasNode,
  NodeConnection,
  NodeCanvasProps,
  NODE_WIDTH,
} from '../types';

const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export function useNodeInitializer(
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

    // 2. 角色节点（按分镜绑定的角色）
    const characterNodeIds: string[] = [];
    sceneCharacters?.forEach((char) => {
      const charNodeId = generateId();
      const state = characterStates?.[char.character_id];
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
