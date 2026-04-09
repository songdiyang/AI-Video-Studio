import React, { useState, useCallback, useEffect, memo } from 'react';
import { Card, CardBody, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Checkbox, Tooltip } from '@heroui/react';
import { Trash2, ImageIcon, Pencil, Plus, Edit3 } from 'lucide-react';
import SceneImageGenerator from '../SceneImageGenerator';
import { StoryboardScene } from '../useSceneManager';
import { TaskState } from '../../../hooks/useTaskRunner';
import SceneCardHeader from './SceneCardHeader';
import SceneCardContent from './SceneCardContent';
import SceneCardMetadata from './SceneCardMetadata';
import SceneCardActions from './SceneCardActions';
import VideoPreviewModal from './VideoPreviewModal';
import LazyImage from '../../../components/LazyImage';
import { getAuthToken } from '../../../services/auth';
import { validateFrameReadiness, formatValidationMessage } from '../utils/validateFrameReadiness';
import { useToast } from '../../../contexts/ToastContext';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { SpatialDescription } from '../useSceneManager';
import type { StoryboardValidationIssue } from '../utils/validateStoryboardContent';
import { getWorstSeverity } from '../utils/validateStoryboardContent';

export interface SceneCardProps {
  scene: StoryboardScene;
  index: number;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  projectId?: number | null;
  scriptId?: number | null;
  onSelect: (id: number) => void;
  onMoveUp: (id: number) => void;
  onMoveDown: (id: number) => void;
  onDelete: (id: number) => void;
  onUpdateDescription: (id: number, description: string) => Promise<boolean>;
  onGenerateImage: (id: number, prompt: string) => Promise<{ success: boolean; error?: string }>;
  onGenerateVideo: (id: number) => Promise<{ success: boolean; error?: string }>;
  onUpdateScene?: (id: number, updates: Partial<StoryboardScene>) => void;
  onOpenSketchEditor?: (id: number) => void;
  imageTask?: TaskState;
  videoTask?: TaskState;
  validationIssues?: StoryboardValidationIssue[];
}

const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  index,
  isSelected,
  isFirst,
  isLast,
  projectId,
  scriptId,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  onUpdateDescription,
  onGenerateImage,
  onGenerateVideo,
  onUpdateScene,
  onOpenSketchEditor,
  imageTask,
  videoTask,
  validationIssues
}) => {
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(scene.description);
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  useEffect(() => {
    if (!isEditingDescription) {
      setEditedDescription(scene.description);
    }
  }, [scene.description, isEditingDescription]);

  const isGeneratingImage = imageTask?.status === 'pending' || imageTask?.status === 'running';
  const isGeneratingVideo = videoTask?.status === 'pending' || videoTask?.status === 'running';

  // 删除视频（数据库 + MinIO 存储桶）
  const handleDeleteVideo = useCallback(async () => {
    try {
      const token = getAuthToken();
      await fetch(`/api/storyboards/${scene.id}/media`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ videoUrl: null })
      });
      if (onUpdateScene) {
        onUpdateScene(scene.id, { videoUrl: undefined });
      }
      console.log('[SceneCard] 已删除视频, sceneId:', scene.id);
    } catch (err) {
      console.error('[SceneCard] 删除视频失败:', err);
    }
  }, [scene.id, onUpdateScene]);

  // 删除首尾帧（动作镜头同时删除首帧和尾帧）
  const handleDeleteFrames = useCallback(async () => {
    try {
      const token = getAuthToken();
      await fetch(`/api/storyboards/${scene.id}/media`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ startFrame: null, endFrame: null })
      });
      // 更新本地状态
      if (onUpdateScene) {
        onUpdateScene(scene.id, { startFrame: undefined, endFrame: undefined, imageUrl: undefined });
      }
      console.log('[SceneCard] 已删除首尾帧, sceneId:', scene.id);
    } catch (err) {
      console.error('[SceneCard] 删除首尾帧失败:', err);
    }
  }, [scene.id, onUpdateScene]);

  // 独立删除首帧
  const handleDeleteFirstFrame = useCallback(async () => {
    try {
      const token = getAuthToken();
      await fetch(`/api/storyboards/${scene.id}/media`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ firstFrameUrl: null })
      });
      // 更新本地状态：只清除 startFrame
      if (onUpdateScene) {
        onUpdateScene(scene.id, { 
          startFrame: undefined, 
          imageUrl: scene.endFrame || undefined 
        });
      }
      console.log('[SceneCard] 已删除首帧, sceneId:', scene.id);
    } catch (err) {
      console.error('[SceneCard] 删除首帧失败:', err);
    }
  }, [scene.id, scene.endFrame, onUpdateScene]);

  // 独立删除尾帧
  const handleDeleteLastFrame = useCallback(async () => {
    try {
      const token = getAuthToken();
      await fetch(`/api/storyboards/${scene.id}/media`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ lastFrameUrl: null })
      });
      // 更新本地状态：只清除 endFrame
      if (onUpdateScene) {
        onUpdateScene(scene.id, { endFrame: undefined });
      }
      console.log('[SceneCard] 已删除尾帧, sceneId:', scene.id);
    } catch (err) {
      console.error('[SceneCard] 删除尾帧失败:', err);
    }
  }, [scene.id, onUpdateScene]);

  const handleSaveDescription = async () => {
    if (isSavingDescription) {
      return;
    }

    setIsSavingDescription(true);
    const success = await onUpdateDescription(scene.id, editedDescription);
    setIsSavingDescription(false);

    if (success) {
      setIsEditingDescription(false);
    }
  };

  // localStorage key: 按 scriptId 存储"不再提示"状态
  const SKIP_DELETE_CONFIRM_KEY = `skipDeleteConfirm_${scriptId || 'default'}`;

  const handleDeleteClick = useCallback((id: number) => {
    const skipConfirm = localStorage.getItem(SKIP_DELETE_CONFIRM_KEY) === 'true';
    if (skipConfirm) {
      onDelete(id);
    } else {
      setShowDeleteConfirm(true);
    }
  }, [SKIP_DELETE_CONFIRM_KEY, onDelete]);

  const handleConfirmDelete = () => {
    if (dontAskAgain) {
      localStorage.setItem(SKIP_DELETE_CONFIRM_KEY, 'true');
    }
    setShowDeleteConfirm(false);
    setDontAskAgain(false);
    onDelete(scene.id);
  };

  // 预检：生成首尾帧前校验角色+场景字段完整性（前端本地校验）
  const validateForFrame = async (): Promise<{ ready: boolean; blocking: boolean; message?: string }> => {
    if (!projectId) return { ready: true, blocking: false };
    try {
      const result = await validateFrameReadiness(
        projectId,
        scene.characters || [],
        scene.location || '',
        scriptId || undefined,
        scene.id
      );
      if (!result.ready) {
        const msg = formatValidationMessage(result);
        return {
          ready: false,
          blocking: result.blockingIssues.length > 0,
          message: msg
        };
      }
      return { ready: true, blocking: false };
    } catch {
      return { ready: true, blocking: false };
    }
  };

  // 预检：生成视频前校验首尾帧+提示词完整性
  const validateForVideo = async (): Promise<{ ready: boolean; message?: string }> => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${scene.id}/validate?type=video`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (!res.ok) return { ready: true };
      const data = await res.json();
      if (!data.ready) {
        const msg = data.issues.map((i: any) => i.message).join('\n');
        return { ready: false, message: msg };
      }
      return { ready: true };
    } catch {
      return { ready: true };
    }
  };

  // 带预检的图片生成
  const handleGenerateImageWithValidation = async (prompt: string) => {
    const check = await validateForFrame();
    if (!check.ready) {
      if (check.blocking) {
        // 阻止性问题：不允许继续
        showToast(`无法生成首尾帧：${check.message}`, 'error');
        return { success: false, error: '校验未通过' };
      }
      // 警告性问题：允许用户选择是否继续
      const proceed = await confirm({
        title: '资产不完整',
        message: `以下资产不完整，生成效果可能不一致：\n\n${check.message}\n\n是否仍然继续生成？`,
        type: 'warning',
        confirmText: '继续生成'
      });
      if (!proceed) return { success: false, error: '用户取消' };
    }
    return onGenerateImage(scene.id, prompt);
  };

  const handleGenerateVideo = async () => {
    const check = await validateForVideo();
    if (!check.ready) {
      showToast(`无法生成视频：${check.message}`, 'error');
      return;
    }
    const result = await onGenerateVideo(scene.id);
    if (!result.success) {
      showToast('视频生成失败，请稍后重试', 'error');
    }
  };

    // 计算检验标记的严重程度
    const validationSeverity = validationIssues && validationIssues.length > 0
      ? getWorstSeverity(validationIssues)
      : null;
  
  return (
    <>
      <Card
        className={`transition-all cursor-pointer ${
          isSelected
            ? 'border-l-2 border-l-[var(--accent)] border-y border-r border-[var(--border-color)] bg-[var(--bg-card-hover)]'
            : 'border border-[var(--border-color)] hover:border-[var(--accent)]/30 bg-[var(--bg-card)]'
        }`}
        isPressable={false}
        onPress={() => onSelect(scene.id)}
      >
        <CardBody className="p-2">
          <div 
            className="flex gap-2"
            onClick={() => onSelect(scene.id)}
          >
            {/* 紧凑的序号 */}
            <div className="flex flex-col items-center justify-center w-6 flex-shrink-0 relative">
              <span className={`text-xs font-bold ${
                isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
              }`}>
                {index + 1}
              </span>
              {/* 检验标记 */}
              {validationSeverity && (
                <span
                  className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
                    validationSeverity === 'error' ? 'bg-rose-500' :
                    validationSeverity === 'warning' ? 'bg-amber-500' : 'bg-sky-500'
                  }`}
                  title={validationIssues!.map(i => i.message).join('\n')}
                />
              )}
            </div>

            {/* 缩略图 - 支持拖拽到积木编辑器 */}
            {(scene.startFrame || scene.videoUrl) ? (
              <div 
                className="relative w-16 h-10 flex-shrink-0 rounded overflow-hidden bg-[var(--bg-app)] cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-[var(--accent)]/50 transition-all"
                draggable={!!scene.startFrame}
                onDragStart={(e) => {
                  if (scene.startFrame) {
                    e.dataTransfer.setData('application/json', JSON.stringify({
                      type: 'reference-image',
                      imageUrl: scene.startFrame,
                      source: 'scene',
                      sceneId: scene.id,
                      sceneIndex: index
                    }));
                    e.dataTransfer.effectAllowed = 'copy';
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {scene.videoUrl ? (
                  <div 
                    className="w-full h-full flex items-center justify-center cursor-pointer bg-gradient-to-br from-rose-500/20 to-purple-500/20"
                    onClick={(e) => { e.stopPropagation(); setShowVideoPreview(true); }}
                  >
                    <div className="w-4 h-4 rounded-full bg-white/90 flex items-center justify-center">
                      <div className="w-0 h-0 border-t-[3px] border-t-transparent border-l-[5px] border-l-[var(--bg-app)] border-b-[3px] border-b-transparent ml-0.5" />
                    </div>
                  </div>
                ) : (
                  <LazyImage
                    src={scene.startFrame!}
                    alt={`分镜 ${index + 1} 缩略图`}
                    className="w-full h-full pointer-events-none"
                  />
                )}
                {/* 生成状态指示 */}
                {isGeneratingImage && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {/* 草图指示图标 */}
                {scene.sketchUrl && (
                  <Tooltip content="已有草图">
                    <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-purple-500/80 flex items-center justify-center">
                      <Pencil className="w-2.5 h-2.5 text-white" />
                    </div>
                  </Tooltip>
                )}
              </div>
            ) : (
              <div className="relative w-16 h-10 flex-shrink-0 rounded border border-dashed border-[var(--border-color)] flex items-center justify-center bg-[var(--bg-app)]">
                {isGeneratingImage ? (
                  <div className="w-3 h-3 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-[var(--text-muted)]" />
                )}
                {/* 无图时的草图指示 */}
                {scene.sketchUrl && (
                  <Tooltip content="已有草图">
                    <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-purple-500/80 flex items-center justify-center">
                      <Pencil className="w-2.5 h-2.5 text-white" />
                    </div>
                  </Tooltip>
                )}
              </div>
            )}

            {/* 内容 */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-tight">
                {scene.description || '暂无描述'}
              </p>
              {/* 元数据标签 */}
              <div className="flex items-center gap-1 mt-1">
                {scene.shotType && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                    {scene.shotType}
                  </span>
                )}
                {scene.hasAction && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">
                    动作
                  </span>
                )}
                {scene.videoUrl && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-rose-500/20 text-rose-400">
                    视频
                  </span>
                )}
              </div>
            </div>

            {/* 悬停时显示的操作按钮 */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              {/* 草图按钮 - 已隐藏 */}
              {/*
              <Tooltip content={scene.sketchUrl ? "编辑草图" : "添加草图"}>
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenSketchEditor?.(scene.id); }}
                  className={`p-1 rounded transition-colors ${
                    scene.sketchUrl 
                      ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30' 
                      : 'hover:bg-purple-500/20 text-[var(--text-muted)] hover:text-purple-400'
                  }`}
                >
                  {scene.sketchUrl ? <Edit3 className="w-3.5 h-3.5" /> : <><Plus className="w-2 h-2" /><Pencil className="w-3 h-3" /></>}
                </button>
              </Tooltip>
              */}
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteClick(scene.id); }}
                className="p-1 rounded hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      <VideoPreviewModal
        scene={scene}
        index={index}
        isGeneratingVideo={isGeneratingVideo}
        onGenerateVideo={handleGenerateVideo}
        onDeleteVideo={handleDeleteVideo}
        showVideoPreview={showVideoPreview}
        setShowVideoPreview={setShowVideoPreview}
        isModal
      />

      {/* 删除确认弹窗 */}
      <Modal isOpen={showDeleteConfirm} onOpenChange={setShowDeleteConfirm} size="sm" classNames={{ base: "pro-modal" }}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-red-400">删除分镜</ModalHeader>
              <ModalBody>
                <p className="text-sm text-[var(--text-secondary)]">
                  确定要删除分镜 <span className="font-bold">#{index + 1}</span> 吗？此操作不可撤销。
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  仅删除分镜记录，不会影响角色和场景数据。
                </p>
                <Checkbox
                  size="sm"
                  isSelected={dontAskAgain}
                  onValueChange={setDontAskAgain}
                  className="mt-2"
                >
                  <span className="text-xs text-[var(--text-muted)]">本集不再提示</span>
                </Checkbox>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" size="sm" onPress={onClose} className="pro-btn">
                  取消
                </Button>
                <Button
                  size="sm"
                  className="bg-red-500 text-white font-semibold hover:bg-red-600"
                  onPress={handleConfirmDelete}
                >
                  确认删除
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};

// 使用 React.memo 优化渲染性能，避免父组件更新时不必要的重渲染
export default memo(SceneCard);
