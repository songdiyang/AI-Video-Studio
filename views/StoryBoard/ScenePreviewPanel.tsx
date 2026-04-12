import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Textarea, Chip } from '@heroui/react';
import { ImageIcon, Video, Film, Camera, Users, MapPin, Zap, X, Trash2, ZoomIn, ZoomOut, RotateCw, Maximize2, Blocks, ChevronDown, ChevronUp, History, Loader2 } from 'lucide-react';
import { StoryboardScene, DialogueLine } from './useSceneManager';
import { TaskState } from '../../hooks/useTaskRunner';
import { getAuthToken } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { validateFrameReadiness, formatValidationMessage } from './utils/validateFrameReadiness';
import SketchPanel from './SceneCard/SketchPanel';
import BlockEditor from './BlockEditor';
import FrameHistoryPanel from './FrameHistoryPanel';
import { BlockEditorState } from './BlockEditor/types/blockTypes';

interface ScenePreviewPanelProps {
  scene: StoryboardScene | null;
  sceneIndex: number;
  projectId?: number | null;
  scriptId?: number | null;
  onUpdateDescription: (description: string) => Promise<boolean>;
  onUpdateDialogues?: (dialogues: DialogueLine[]) => Promise<boolean>;
  onGenerateImage: (id: number, prompt: string) => Promise<{ success: boolean; error?: string }>;
  onGenerateVideo: (id: number) => Promise<{ success: boolean; error?: string }>;
  onUpdateScene?: (updates: Partial<StoryboardScene>) => void;
  imageTask?: TaskState;
  videoTask?: TaskState;
}

const ScenePreviewPanel: React.FC<ScenePreviewPanelProps> = ({
  scene,
  sceneIndex,
  projectId,
  scriptId,
  onUpdateDescription,
  onUpdateDialogues,
  onGenerateImage,
  onGenerateVideo,
  onUpdateScene,
  imageTask,
  videoTask
}) => {
  const [showStartFrame, setShowStartFrame] = useState(true);
  const [isDirectorSpaceExpanded, setIsDirectorSpaceExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState<{ type: 'first' | 'last' | null }>({ type: null });
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // 追踪编辑器当前文本（可能未保存）
  const [currentEditorText, setCurrentEditorText] = useState<string>('');
  useEffect(() => {
    if (scene?.description) setCurrentEditorText(scene.description);
  }, [scene?.id, scene?.description]);

  const isGeneratingImage = imageTask?.status === 'pending' || imageTask?.status === 'running';
  const isGeneratingVideo = videoTask?.status === 'pending' || videoTask?.status === 'running';
  const isGenerating = isGeneratingImage || isGeneratingVideo;

  // 生成进度百分比
  const generatingProgress = isGeneratingImage
    ? (imageTask?.progress ?? 0)
    : isGeneratingVideo
      ? (videoTask?.progress ?? 0)
      : 0;

  // 预检：生成首尾帧前校验
  const validateForFrame = async (): Promise<{ ready: boolean; blocking: boolean; message?: string }> => {
    if (!projectId || !scene) return { ready: true, blocking: false };
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

  // 预检：生成视频前校验
  const validateForVideo = async (): Promise<{ ready: boolean; message?: string }> => {
    if (!scene) return { ready: true };
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

  // 生成前先保存当前编辑器文本
  const saveBeforeGenerate = async (): Promise<boolean> => {
    if (!scene) return false;
    const textToSave = currentEditorText.trim();
    if (!textToSave) {
      showToast('分镜描述不能为空', 'error');
      return false;
    }
    // 如果文本与已保存的不同，先保存
    if (textToSave !== scene.description) {
      try {
        const success = await onUpdateDescription(textToSave);
        if (!success) {
          showToast('保存分镜描述失败', 'error');
          return false;
        }
      } catch {
        showToast('保存分镜描述失败', 'error');
        return false;
      }
    }
    return true;
  };

  // 生成首尾帧
  const handleGenerateImage = async () => {
    if (!scene) return;

    // 先保存当前编辑器文本
    const saved = await saveBeforeGenerate();
    if (!saved) return;
    
    const check = await validateForFrame();
    if (!check.ready) {
      if (check.blocking) {
        showToast(`无法生成首尾帧：${check.message}`, 'error');
        return;
      }
      const proceed = await confirm({
        title: '资产不完整',
        message: `以下资产不完整，生成效果可能不一致：\n\n${check.message}\n\n是否仍然继续生成？`,
        type: 'warning',
        confirmText: '继续生成'
      });
      if (!proceed) return;
    }
    
    // 使用当前编辑器文本（而非 scene.description）
    const result = await onGenerateImage(scene.id, currentEditorText.trim());
    if (!result.success) {
      showToast(result.error || '图片生成失败', 'error');
    }
  };

  // 生成视频
  const handleGenerateVideo = async () => {
    if (!scene) return;

    // 先保存当前编辑器文本
    const saved = await saveBeforeGenerate();
    if (!saved) return;
    
    const check = await validateForVideo();
    if (!check.ready) {
      showToast(`无法生成视频：${check.message}`, 'error');
      return;
    }
    
    const result = await onGenerateVideo(scene.id);
    if (!result.success) {
      showToast(result.error || '视频生成失败', 'error');
    }
  };

  // 删除帧（全部）
  const handleDeleteFrames = useCallback(async () => {
    if (!scene) return;
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
      if (onUpdateScene) {
        onUpdateScene({ startFrame: undefined, endFrame: undefined, imageUrl: undefined });
      }
      showToast('已删除首尾帧', 'success');
    } catch (err) {
      console.error('[ScenePreviewPanel] 删除首尾帧失败:', err);
      showToast('删除失败', 'error');
    }
  }, [scene, onUpdateScene, showToast]);

  // 独立删除首帧
  const handleDeleteFirstFrame = useCallback(async () => {
    if (!scene) return;
    const confirmed = await confirm({
      title: '删除首帧',
      message: scene.videoUrl
        ? '该分镜已生成视频，删除首帧可能需要重新生成视频。\n\n确定要删除首帧吗？尾帧将保留。'
        : '确定要删除首帧吗？尾帧将保留，下次生成时可以参考尾帧。',
      type: scene.videoUrl ? 'warning' : 'danger',
      confirmText: '删除首帧',
      cancelText: '取消'
    });
    if (!confirmed) return;
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
      if (onUpdateScene) {
        onUpdateScene({ startFrame: undefined, imageUrl: scene.endFrame || undefined });
      }
      setShowStartFrame(false); // 切换到尾帧显示
      showToast('已删除首帧，尾帧已保留', 'success');
    } catch (err) {
      console.error('[ScenePreviewPanel] 删除首帧失败:', err);
      showToast('删除失败', 'error');
    }
  }, [scene, onUpdateScene, showToast, confirm]);

  // 独立删除尾帧
  const handleDeleteLastFrame = useCallback(async () => {
    if (!scene) return;
    const confirmed = await confirm({
      title: '删除尾帧',
      message: '确定要删除尾帧吗？首帧将保留，下次生成时可以参考首帧。',
      type: 'danger',
      confirmText: '删除尾帧',
      cancelText: '取消'
    });
    if (!confirmed) return;
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
      if (onUpdateScene) {
        onUpdateScene({ endFrame: undefined });
      }
      setShowStartFrame(true); // 切换到首帧显示
      showToast('已删除尾帧，首帧已保留', 'success');
    } catch (err) {
      console.error('[ScenePreviewPanel] 删除尾帧失败:', err);
      showToast('删除失败', 'error');
    }
  }, [scene, onUpdateScene, showToast, confirm]);

  // 删除视频
  const handleDeleteVideo = useCallback(async () => {
    if (!scene) return;
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
        onUpdateScene({ videoUrl: undefined });
      }
      showToast('已删除视频', 'success');
    } catch (err) {
      console.error('[ScenePreviewPanel] 删除视频失败:', err);
      showToast('删除失败', 'error');
    }
  }, [scene, onUpdateScene, showToast]);

  // 空状态
  if (!scene) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg-app)]">
        <div className="text-center">
          <Film className="w-16 h-16 mx-auto mb-4 text-[var(--text-muted)] opacity-30" />
          <p className="text-sm text-[var(--text-muted)]">选择一个分镜以查看详情</p>
        </div>
      </div>
    );
  }

  // 判断当前显示的媒体
  const hasFrames = scene.startFrame || scene.endFrame;
  const hasVideo = !!scene.videoUrl;
  const currentFrame = showStartFrame ? scene.startFrame : scene.endFrame;

  // Lightbox 放大预览状态
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [lightboxPos, setLightboxPos] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const openLightbox = () => {
    setLightboxZoom(1);
    setLightboxPos({ x: 0, y: 0 });
    setLightboxOpen(true);
  };

  const handleLightboxWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    setLightboxZoom(z => Math.min(5, Math.max(0.5, z + (e.deltaY > 0 ? -0.2 : 0.2))));
  }, []);

  const handleLightboxMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, posX: lightboxPos.x, posY: lightboxPos.y };
  }, [lightboxPos]);

  const handleLightboxMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setLightboxPos({
      x: dragStart.current.posX + (e.clientX - dragStart.current.x),
      y: dragStart.current.posY + (e.clientY - dragStart.current.y)
    });
  }, []);

  const handleLightboxMouseUp = useCallback(() => { isDragging.current = false; }, []);

  return (
    <div className="h-full flex flex-col bg-[var(--bg-app)]">
      {/* 预览区域 */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-0 relative">
        {/* 生成中遮罩层 */}
        {isGenerating && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg">
            <Loader2 className="w-10 h-10 text-[var(--accent)] animate-spin mb-3" />
            <p className="text-sm font-medium text-white mb-2">
              {isGeneratingImage ? '正在生成首尾帧...' : '正在生成视频...'}
            </p>
            {generatingProgress > 0 && (
              <div className="w-48 flex flex-col items-center gap-1.5">
                <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(100, generatingProgress)}%` }}
                  />
                </div>
                <span className="text-xs text-white/70">{Math.round(generatingProgress)}%</span>
              </div>
            )}
            <p className="text-xs text-white/50 mt-2">请勿关闭页面</p>
          </div>
        )}
        {hasVideo ? (
          // 视频预览
          <div className="relative w-full h-full flex items-center justify-center">
            <video
              src={scene.videoUrl}
              controls
              className="max-w-full max-h-full rounded-lg shadow-2xl"
              style={{ maxHeight: 'calc(100% - 2rem)' }}
            />
            <button
              onClick={handleDeleteVideo}
              disabled={isGenerating}
              className={`absolute top-2 right-2 p-2 rounded-lg bg-black/50 text-white transition-colors ${
                isGenerating ? 'opacity-40 cursor-not-allowed' : 'hover:bg-red-500/80'
              }`}
              title="删除视频"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : hasFrames ? (
          // 帧图片预览
          <div className="relative w-full h-full flex items-center justify-center">
            {currentFrame ? (
              <>
                <img
                  src={currentFrame}
                  alt={`分镜 ${sceneIndex + 1} - ${showStartFrame ? '首帧' : '尾帧'}`}
                  className="max-w-full max-h-full rounded-lg shadow-2xl object-contain cursor-zoom-in hover:ring-2 hover:ring-[var(--accent)]/50 transition-all"
                  style={{ maxHeight: 'calc(100% - 2rem)' }}
                  onClick={openLightbox}
                  title="点击放大预览，拖拽到积木编辑器"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify({
                      type: 'reference-image',
                      imageUrl: currentFrame,
                      source: 'frame',
                      frameType: showStartFrame ? 'start' : 'end',
                      sceneId: scene.id
                    }));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                />
                {/* 左上角：历史版本按钮 */}
                <button
                  onClick={() => setShowHistory({ type: showStartFrame ? 'first' : 'last' })}
                  disabled={isGenerating}
                  className={`absolute top-2 left-2 p-2 rounded-lg bg-black/50 text-white/80 transition-colors flex items-center gap-1.5 ${
                    isGenerating ? 'opacity-40 cursor-not-allowed' : 'hover:bg-black/70 hover:text-white'
                  }`}
                  title="查看历史版本"
                >
                  <History className="w-4 h-4" />
                  <span className="text-xs">历史版本</span>
                </button>
                {/* 放大按钮提示 */}
                <button
                  onClick={openLightbox}
                  className="absolute bottom-4 right-4 p-2 rounded-lg bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
                  title="放大预览"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </>
            ) : (
              // 当前帧缺失，显示生成按钮
              <div className="flex flex-col items-center justify-center text-center">
                <div className="w-32 h-20 rounded-lg border-2 border-dashed border-[var(--border-color)] flex items-center justify-center mb-3">
                  <ImageIcon className="w-8 h-8 text-[var(--text-muted)]" />
                </div>
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  {showStartFrame ? '首帧已删除，尾帧已保留' : '尾帧已删除，首帧已保留'}
                </p>
                <Button
                  size="sm"
                  className="pro-btn-primary"
                  startContent={<ImageIcon className="w-4 h-4" />}
                  onPress={handleGenerateImage}
                  isLoading={isGeneratingImage}
                  isDisabled={isGeneratingImage}
                >
                  生成{showStartFrame ? '首帧' : '尾帧'}（参考{showStartFrame ? '尾帧' : '首帧'}）
                </Button>
              </div>
            )}
            
            {/* 帧切换控制 - 动作镜头始终显示切换器 */}
            {scene.hasAction && (scene.startFrame || scene.endFrame) && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
                <button
                  onClick={() => setShowStartFrame(true)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    showStartFrame
                      ? (scene.startFrame ? 'bg-[var(--accent)] text-white' : 'bg-red-500/60 text-white')
                      : (scene.startFrame ? 'text-white/70 hover:text-white' : 'text-red-400/70 hover:text-red-300')
                  }`}
                >
                  首帧{!scene.startFrame ? '(已删)' : ''}
                </button>
                <button
                  onClick={() => setShowStartFrame(false)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    !showStartFrame
                      ? (scene.endFrame ? 'bg-[var(--accent)] text-white' : 'bg-red-500/60 text-white')
                      : (scene.endFrame ? 'text-white/70 hover:text-white' : 'text-red-400/70 hover:text-red-300')
                  }`}
                >
                  尾帧{!scene.endFrame ? '(已删)' : ''}
                </button>
              </div>
            )}

            {/* 删除帧按钮组 */}
            {currentFrame && (
              <div className="absolute top-2 right-2 flex items-center gap-1">
                {/* 独立删除当前帧 */}
                {scene.hasAction && scene.startFrame && scene.endFrame && (
                  <button
                    onClick={showStartFrame ? handleDeleteFirstFrame : handleDeleteLastFrame}
                    disabled={isGenerating}
                    className={`p-2 rounded-lg bg-black/50 text-white transition-colors ${
                      isGenerating ? 'opacity-40 cursor-not-allowed' : 'hover:bg-orange-500/80'
                    }`}
                    title={`删除${showStartFrame ? '首帧' : '尾帧'}（保留${showStartFrame ? '尾帧' : '首帧'}）`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {/* 删除全部帧 */}
                <button
                  onClick={handleDeleteFrames}
                  disabled={isGenerating}
                  className={`p-2 rounded-lg bg-black/50 text-white transition-colors ${
                    isGenerating ? 'opacity-40 cursor-not-allowed' : 'hover:bg-red-500/80'
                  }`}
                  title="删除全部帧"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          // 无媒体时的占位
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-32 h-20 rounded-lg border-2 border-dashed border-[var(--border-color)] flex items-center justify-center mb-4">
              <ImageIcon className="w-8 h-8 text-[var(--text-muted)]" />
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-4">暂无预览图片</p>
            <Button
              size="sm"
              className="pro-btn-primary"
              startContent={<ImageIcon className="w-4 h-4" />}
              onPress={handleGenerateImage}
              isLoading={isGeneratingImage}
              isDisabled={isGeneratingImage}
            >
              生成首尾帧
            </Button>
          </div>
        )}
      </div>

      {/* Lightbox 放大预览 */}
      {lightboxOpen && currentFrame && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
          onWheel={handleLightboxWheel}
          onMouseMove={handleLightboxMouseMove}
          onMouseUp={handleLightboxMouseUp}
          onMouseLeave={handleLightboxMouseUp}
          style={{ cursor: isDragging.current ? 'grabbing' : 'default' }}
        >
          {/* 顶部工具栏 */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 z-10" onClick={e => e.stopPropagation()}>
            <button onClick={() => setLightboxZoom(z => Math.min(5, z + 0.5))} className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors" title="放大">
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="text-xs text-white/70 min-w-[3rem] text-center">{Math.round(lightboxZoom * 100)}%</span>
            <button onClick={() => setLightboxZoom(z => Math.max(0.5, z - 0.5))} className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors" title="缩小">
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-white/20" />
            <button onClick={() => { setLightboxZoom(1); setLightboxPos({ x: 0, y: 0 }); }} className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors" title="重置">
              <RotateCw className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-white/20" />
            <button onClick={() => setLightboxOpen(false)} className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors" title="关闭">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 图片 */}
          <img
            src={currentFrame}
            alt={`分镜 ${sceneIndex + 1} 放大预览`}
            className="select-none"
            style={{
              transform: `translate(${lightboxPos.x}px, ${lightboxPos.y}px) scale(${lightboxZoom})`,
              transition: isDragging.current ? 'none' : 'transform 0.15s ease',
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              cursor: lightboxZoom > 1 ? (isDragging.current ? 'grabbing' : 'grab') : 'default',
              borderRadius: '8px'
            }}
            onClick={e => e.stopPropagation()}
            onMouseDown={handleLightboxMouseDown}
            draggable={false}
          />

          {/* 底部帧信息 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/50">
            分镜 #{sceneIndex + 1} · {showStartFrame ? '首帧' : '尾帧'} · 滚轮缩放 · 拖拽平移 · 点击空白关闭
          </div>
        </div>
      )}

      {/* 信息和操作区域 */}
      <div className="flex-shrink-0 border-t border-[var(--border-color)] bg-[var(--bg-card)]">
        {/* 元数据 */}
        <div className="px-4 py-3 border-b border-[var(--border-color)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              分镜 #{sceneIndex + 1}
            </span>
            <div className="flex items-center gap-1.5">
              {scene.shotType && (
                <Chip size="sm" variant="flat" className="bg-cyan-500/20 text-cyan-400 text-xs">
                  <Camera className="w-3 h-3 mr-1" />
                  {scene.shotType}
                </Chip>
              )}
              {scene.hasAction && (
                <Chip size="sm" variant="flat" className="bg-amber-500/20 text-amber-400 text-xs">
                  <Zap className="w-3 h-3 mr-1" />
                  动作镜头
                </Chip>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 text-xs">
            {scene.characters && scene.characters.length > 0 && (
              <div className="flex items-center gap-1 text-[var(--text-muted)]">
                <Users className="w-3 h-3" />
                <span>{scene.characters.join(', ')}</span>
              </div>
            )}
            {scene.location && (
              <div className="flex items-center gap-1 text-[var(--text-muted)]">
                <MapPin className="w-3 h-3" />
                <span>{scene.location}</span>
              </div>
            )}
            {scene.duration && (
              <div className="flex items-center gap-1 text-[var(--text-muted)]">
                <Video className="w-3 h-3" />
                <span>{scene.duration}s</span>
              </div>
            )}
          </div>
        </div>

        {/* 导演空间 - 可折叠 */}
        <div className="border-t border-[var(--border-color)]">
          {/* 标题栏 - 可点击折叠 */}
          <button
            onClick={() => setIsDirectorSpaceExpanded(!isDirectorSpaceExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Blocks className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                导演空间
              </span>
              {/* 生成模式状态标签 */}
              {scene.startFrame && scene.endFrame ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/20 text-rose-400">
                  视频生成
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/20 text-blue-400">
                  图片生成
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isDirectorSpaceExpanded && scene.description && (
                <span className="text-xs text-[var(--text-muted)] truncate max-w-[200px]">
                  {scene.description.slice(0, 30)}{scene.description.length > 30 ? '...' : ''}
                </span>
              )}
              {isDirectorSpaceExpanded ? (
                <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
              ) : (
                <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
              )}
            </div>
          </button>

          {/* 可折叠内容区 */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              isDirectorSpaceExpanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="px-4 pb-3">
              <div className="h-[320px]">
                <BlockEditor
                  storyboardId={scene.id}
                  projectId={projectId || undefined}
                  scriptId={scriptId || undefined}
                  initialBlocks={scene.description ? [{ id: 'init-text', type: 'text' as const, category: 'text' as const, data: { text: scene.description }, position: { x: 0, y: 0 } }] : []}
                  availableFrames={{
                    startFrame: scene.startFrame,
                    endFrame: scene.endFrame
                  }}
                  dialogue={scene.dialogue}
                  dialogues={scene.dialogues}
                  characters={scene.characters}
                  onUpdateDialogues={onUpdateDialogues}
                  onChange={(state: BlockEditorState) => {
                    // 同步编辑器当前文本到组件状态
                    if (state.generatedPrompt !== undefined) {
                      setCurrentEditorText(state.generatedPrompt);
                    }
                  }}
                  onSave={async (state: BlockEditorState) => {
                    const success = await onUpdateDescription(state.generatedPrompt);
                    return success;
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 草图面板 - 已隐藏 */}
        {/*
        <div className="px-4 py-3 border-t border-[var(--border-color)]">
          <SketchPanel
            storyboardId={scene.id}
            sketchUrl={scene.sketchUrl}
            sketchType={scene.sketchType}
            sketchData={scene.sketchData}
            controlStrength={scene.controlStrength}
            backgroundImage={scene.startFrame}
            onSketchChange={(updates) => {
              if (onUpdateScene) {
                onUpdateScene(updates);
              }
            }}
          />
        </div>
        */}

        {/* 生成操作 */}
        <div className="px-4 py-3 border-t border-[var(--border-color)] flex items-center gap-2">
          <Button
            size="sm"
            className={hasFrames 
              ? "bg-[var(--bg-app)] text-[var(--text-secondary)] border border-[var(--border-color)]"
              : "pro-btn-primary"
            }
            startContent={<ImageIcon className="w-4 h-4" />}
            onPress={handleGenerateImage}
            isLoading={isGeneratingImage}
            isDisabled={isGeneratingImage || isGeneratingVideo}
          >
            {hasFrames ? '重新生成帧' : '生成首尾帧'}
          </Button>
          
          {hasFrames && (
            <Button
              size="sm"
              className={hasVideo
                ? "bg-[var(--bg-app)] text-[var(--text-secondary)] border border-[var(--border-color)]"
                : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
              }
              startContent={<Film className="w-4 h-4" />}
              onPress={handleGenerateVideo}
              isLoading={isGeneratingVideo}
              isDisabled={isGeneratingImage || isGeneratingVideo}
            >
              {hasVideo ? '重新生成视频' : '生成视频'}
            </Button>
          )}

          {/* 状态提示 */}
          {(isGeneratingImage || isGeneratingVideo) && (
            <span className="text-xs text-[var(--text-muted)] ml-auto">
              {isGeneratingImage ? '正在生成图片...' : '正在生成视频...'}
            </span>
          )}
        </div>
      </div>

      {/* 历史版本面板 */}
      {scene && showHistory.type && (
        <FrameHistoryPanel
          storyboardId={scene.id}
          frameType={showHistory.type}
          isOpen={!!showHistory.type}
          onClose={() => setShowHistory({ type: null })}
          onRestoreVersion={(_versionId, frameUrl, restoredFrameType) => {
            // 用恢复的帧 URL 更新场景数据，让预览立即刷新
            if (frameUrl && onUpdateScene) {
              const updates: Partial<StoryboardScene> = {};
              if (restoredFrameType === 'first') {
                updates.startFrame = frameUrl;
                updates.imageUrl = frameUrl; // imageUrl 通常与首帧一致
              } else {
                updates.endFrame = frameUrl;
              }
              onUpdateScene(updates);
            }
            showToast('版本已恢复', 'success');
            setShowHistory({ type: null });
          }}
        />
      )}
    </div>
  );
};

export default ScenePreviewPanel;
