import React, { useState, useCallback, useEffect, memo } from 'react';
import { Card, CardBody, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Checkbox, Tooltip } from '@heroui/react';
import { Trash2, ImageIcon, Pencil, Plus, Edit3, Download, Film, Image } from 'lucide-react';
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
import StoryboardLockButton from '../components/StoryboardLockButton';
import { ShotSizeBadge, ShotSizeSelector } from '../components/ShotSizeSelector';
import { CameraMovementSelector } from '../components/CameraMovementSelector';
import { CAMERA_MOVEMENT_LABELS } from '../components/CameraMovementSelector';
import { FrameTypeSelector } from '../components/FrameTypeSelector';

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
  onGenerateImage: (id: number, prompt: string, regenerateTarget?: 'first' | 'last' | 'both', forceRegenerate?: boolean) => Promise<{ success: boolean; error?: string }>;
  onGenerateVideo: (id: number) => Promise<{ success: boolean; error?: string }>;
  onUpdateScene?: (id: number, updates: Partial<StoryboardScene>) => void;
  onOpenSketchEditor?: (id: number) => void;
  imageTask?: TaskState;
  videoTask?: TaskState;
  validationIssues?: StoryboardValidationIssue[];
  onContextMenu?: (e: React.MouseEvent) => void;
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
  validationIssues,
  onContextMenu
}) => {
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(scene.baseDescription);
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  useEffect(() => {
    if (!isEditingDescription) {
      setEditedDescription(scene.baseDescription);
    }
  }, [scene.baseDescription, isEditingDescription]);

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

  // 右键菜单处理
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) {
      onContextMenu(e);
    }
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
        className={`transition-all cursor-pointer rounded-lg group/scene ${
          isSelected
            ? 'border-l-2 border-l-[var(--accent)] border-y border-r border-[var(--border-color)] bg-[var(--bg-card-hover)]'
            : `border border-[var(--border-color)] hover:border-[var(--accent)]/30 bg-[var(--bg-card)]${scene.isLocked ? ' opacity-75' : ''}`
        }`}
        isPressable={false}
        onPress={() => onSelect(scene.id)}
        onContextMenu={handleContextMenu}
      >
        <CardBody className="p-1.5 relative">
          {/* 操作按钮 - 悬浮显示在右上角 */}
          <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 opacity-0 group-hover/scene:opacity-100 transition-opacity">
            {/* 锁定按钮 */}
            <div onClick={(e) => e.stopPropagation()}>
              <StoryboardLockButton
                storyboardId={scene.id}
                isLocked={scene.isLocked || false}
                size="sm"
                onLockChange={(locked) => {
                  if (onUpdateScene) {
                    onUpdateScene(scene.id, { isLocked: locked });
                  }
                }}
              />
            </div>
          </div>

          <div 
            className="flex gap-1.5 min-w-0"
            onClick={() => onSelect(scene.id)}
            onContextMenu={handleContextMenu}
          >
            {/* 紧凑的序号 */}
            <div className="flex flex-col items-center justify-center w-5 flex-shrink-0 relative">
              <span className={`text-[11px] font-bold ${
                isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
              }`}>
                {index + 1}
              </span>
              {/* 检验标记 */}
              {validationSeverity && (
                <span
                  className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${
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
                className="relative w-14 h-9 flex-shrink-0 rounded overflow-hidden bg-[var(--bg-app)] cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-[var(--accent)]/50 transition-all"
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
                onContextMenu={handleContextMenu}
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
                    <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-purple-500/80 flex items-center justify-center">
                      <Pencil className="w-2 h-2 text-white" />
                    </div>
                  </Tooltip>
                )}
              </div>
            ) : (
              <div className="relative w-14 h-9 flex-shrink-0 rounded border border-dashed border-[var(--border-color)] flex items-center justify-center bg-[var(--bg-app)]">
                {isGeneratingImage ? (
                  <div className="w-3 h-3 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ImageIcon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                )}
                {/* 无图时的草图指示 */}
                {scene.sketchUrl && (
                  <Tooltip content="已有草图">
                    <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-purple-500/80 flex items-center justify-center">
                      <Pencil className="w-2 h-2 text-white" />
                    </div>
                  </Tooltip>
                )}
              </div>
            )}

            {/* 内容 */}
            <div className="flex-1 min-w-0 overflow-hidden pr-6">
              {/* 描述文字 */}
              <p className="text-[11px] text-[var(--text-secondary)] leading-snug overflow-hidden text-ellipsis" style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical'
              }}>
                {scene.baseDescription || '暂无描述'}
              </p>
              {/* 元数据工具栏 - 紧凑单行 */}
              <div className="flex items-center gap-1 mt-0.5">
                {/* 景别 */}
                {onUpdateScene && (
                  <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                    <ShotSizeSelector
                      value={scene.shotType}
                      onChange={async (newValue) => {
                        onUpdateScene(scene.id, { shotType: newValue });
                      }}
                      compact={true}
                    />
                  </div>
                )}
                {!onUpdateScene && scene.shotType && (
                  <ShotSizeBadge value={scene.shotType} />
                )}
                {/* 运镜 */}
                {onUpdateScene && (
                  <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                    <CameraMovementSelector
                      value={scene.cameraMovement}
                      onChange={async (newValue) => {
                        onUpdateScene(scene.id, { cameraMovement: newValue });
                      }}
                      compact={true}
                    />
                  </div>
                )}
                {!onUpdateScene && scene.cameraMovement && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-slate-500/15 text-slate-400 whitespace-nowrap">
                    {CAMERA_MOVEMENT_LABELS[scene.cameraMovement] || scene.cameraMovement}
                  </span>
                )}
                {/* 画面类型 */}
                {onUpdateScene && (
                  <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                    <FrameTypeSelector
                      hasAction={scene.hasAction}
                      onChange={(newHasAction) => {
                        onUpdateScene(scene.id, { hasAction: newHasAction });
                      }}
                      compact={true}
                    />
                  </div>
                )}
                {!onUpdateScene && scene.hasAction && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-slate-500/15 text-slate-400 whitespace-nowrap">
                    运动
                  </span>
                )}
                {/* 状态标签 */}
                {scene.videoUrl && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 whitespace-nowrap">
                    视频
                  </span>
                )}
                {isGeneratingVideo && !scene.videoUrl && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 flex items-center gap-0.5 whitespace-nowrap">
                    <div className="w-1.5 h-1.5 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    生成中
                  </span>
                )}
                {scene.isLocked && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 whitespace-nowrap">
                    已锁定
                  </span>
                )}
              </div>
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
