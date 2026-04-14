import React, { useState, useRef, useEffect } from 'react';
import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Plus, Images, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SceneCard from './SceneCard';
import { StoryboardScene } from './useSceneManager';
import { TaskState } from '../../hooks/useTaskRunner';
import type { StoryboardValidationIssue } from './utils/validateStoryboardContent';
import { useImagePreloader, useScrollIndex } from './hooks/useImagePreloader';

interface SceneListProps {
  scenes: StoryboardScene[];
  selectedScene: number | null;
  projectId?: number | null;
  scriptId?: number | null;
  isLoading?: boolean;
  onSelectScene: (id: number) => void;
  onMoveScene: (id: number, direction: 'up' | 'down') => void;
  onDeleteScene: (id: number) => void;
  onAddScene: () => void;
  onUpdateDescription: (id: number, description: string) => Promise<boolean>;
  onGenerateImage: (id: number, prompt: string, regenerateTarget?: 'first' | 'last' | 'both', forceRegenerate?: boolean) => Promise<{ success: boolean; error?: string }>;
  onGenerateVideo: (id: number) => Promise<{ success: boolean; error?: string }>;
  onUpdateScene?: (id: number, updates: Partial<StoryboardScene>) => void;
  tasks: Record<string, TaskState>;
  onReorderScenes: (newScenes: StoryboardScene[]) => void;
  onBatchGenerate?: (overwriteFrames: boolean) => void;
  isBatchGenerating?: boolean;
  batchProgress?: number;
  onBatchGenerateVideo?: (overwriteVideos: boolean) => void;
  isBatchGeneratingVideo?: boolean;
  batchVideoProgress?: number;
  sceneValidationMap?: Map<number, StoryboardValidationIssue[]>;
}

// 列表容器动画配置
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

// 列表项动画配置
const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  show: { 
    opacity: 1, 
    x: 0,
    transition: {
      duration: 0.2,
      ease: [0.4, 0, 0.2, 1] as const,
    },
  },
};

// Skeleton loading component for scene list
const SceneListSkeleton: React.FC = () => (
  <div className="space-y-1.5 p-2">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="animate-pulse">
        <div className="bg-[var(--bg-card)] rounded-lg p-2 border border-[var(--border-color)]">
          <div className="flex items-start gap-2">
            {/* Image placeholder */}
            <div className="w-16 h-10 bg-[var(--bg-app)] rounded flex-shrink-0" />
            {/* Content placeholder */}
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-[var(--bg-app)] rounded w-16" />
              <div className="h-2.5 bg-[var(--bg-app)] rounded w-full" />
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

const SceneList: React.FC<SceneListProps> = ({
  scenes,
  selectedScene,
  projectId,
  scriptId,
  isLoading = false,
  onSelectScene,
  onMoveScene,
  onDeleteScene,
  onAddScene,
  onUpdateDescription,
  onGenerateImage,
  onGenerateVideo,
  onUpdateScene,
  tasks,
  onReorderScenes,
  onBatchGenerate,
  isBatchGenerating = false,
  batchProgress = 0,
  onBatchGenerateVideo,
  isBatchGeneratingVideo = false,
  batchVideoProgress = 0,
  sceneValidationMap
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showBatchVideoModal, setShowBatchVideoModal] = useState(false);
  // 标记首次加载完成，用于控制 layout 动画
  const [hasLoaded, setHasLoaded] = useState(false);

  // 滚动容器 ref，用于追踪滚动位置
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // 追踪当前滚动位置对应的分镜索引，每个卡片约 120px 高度
  const currentScrollIndex = useScrollIndex(scrollContainerRef, 120, 100);
  
  // 预加载当前位置前后各 3 个分镜的图片
  useImagePreloader(scenes, currentScrollIndex, 3);

  // 首次加载完成后启用 layout 动画
  useEffect(() => {
    if (scenes.length > 0 && !hasLoaded) {
      const timer = setTimeout(() => setHasLoaded(true), scenes.length * 50 + 300);
      return () => clearTimeout(timer);
    }
  }, [scenes.length, hasLoaded]);

  // 统计已有帧的镜头数
  const scenesWithFrames = scenes.filter(s => s.startFrame).length;
  const totalScenes = scenes.length;

  // 统计已有视频的分镜数
  const scenesWithVideos = scenes.filter(s => s.videoUrl).length;

  const handleBatchClick = () => {
    if (!onBatchGenerate || scenes.length === 0) return;
    if (scenesWithFrames > 0) {
      setShowBatchModal(true);
    } else {
      onBatchGenerate(false);
    }
  };

  const handleBatchVideoClick = () => {
    if (!onBatchGenerateVideo || scenes.length === 0) return;
    if (scenesWithVideos > 0) {
      setShowBatchVideoModal(true);
    } else {
      onBatchGenerateVideo(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newScenes = [...scenes];
    const [draggedScene] = newScenes.splice(draggedIndex, 1);
    newScenes.splice(dropIndex, 0, draggedScene);
    
    onReorderScenes(newScenes);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };
  return (
    <div className="h-full flex flex-col bg-[var(--bg-app)]">
      {/* 紧凑的头部操作栏 */}
      <div className="flex-shrink-0 px-2 py-2 border-b border-[var(--border-color)] flex items-center justify-between gap-2">
        <Button
          size="sm"
          className="pro-btn h-7 px-2 text-xs"
          startContent={<Plus className="w-3.5 h-3.5" />}
          onPress={onAddScene}
        >
          添加
        </Button>
        <div className="flex items-center gap-1">
          {onBatchGenerate && scenes.length > 0 && (
            <Button
              size="sm"
              className="h-7 px-2 text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30"
              startContent={<Images className="w-3.5 h-3.5" />}
              onPress={handleBatchClick}
              isLoading={isBatchGenerating}
              isDisabled={isBatchGenerating || isBatchGeneratingVideo}
            >
              {isBatchGenerating ? `${batchProgress}%` : '帧'}
            </Button>
          )}
          {onBatchGenerateVideo && scenes.length > 0 && (
            <Button
              size="sm"
              className="h-7 px-2 text-xs bg-rose-500/20 text-rose-400 border border-rose-500/30"
              startContent={<Video className="w-3.5 h-3.5" />}
              onPress={handleBatchVideoClick}
              isLoading={isBatchGeneratingVideo}
              isDisabled={isBatchGeneratingVideo || isBatchGenerating}
            >
              {isBatchGeneratingVideo ? `${batchVideoProgress}%` : '视频'}
            </Button>
          )}
        </div>
      </div>

      {/* 分镜卡片列表 - 紧凑间距 */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-2 space-y-1.5 scroll-fade-top scroll-fade-bottom"
      >
        {isLoading ? (
          <SceneListSkeleton />
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-1.5"
          >
            {scenes.map((scene, index) => (
              <motion.div
                key={scene.id}
                variants={itemVariants}
                layout={hasLoaded}
                draggable
                onDragStart={(e) => handleDragStart(e as any, index)}
                onDragOver={(e) => handleDragOver(e as any, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e as any, index)}
                onDragEnd={handleDragEnd}
                className={`${
                  draggedIndex === index ? 'opacity-50 scale-95' : ''
                } ${
                  dragOverIndex === index ? 'transform translate-y-1' : ''
                }`}
                style={{
                  // 性能优化：让浏览器跳过离屏元素的渲染
                  contentVisibility: 'auto',
                  containIntrinsicSize: '0 72px', // 紧凑卡片高度
                }}
              >
                <SceneCard
                  scene={scene}
                  index={index}
                  isSelected={selectedScene === scene.id}
                  isFirst={index === 0}
                  isLast={index === scenes.length - 1}
                  projectId={projectId}
                  scriptId={scriptId}
                  onSelect={onSelectScene}
                  onMoveUp={(id) => onMoveScene(id, 'up')}
                  onMoveDown={(id) => onMoveScene(id, 'down')}
                  onDelete={onDeleteScene}
                  onUpdateDescription={onUpdateDescription}
                  onGenerateImage={onGenerateImage}
                  onGenerateVideo={onGenerateVideo}
                  onUpdateScene={onUpdateScene}
                  imageTask={tasks[`img_${scene.id}`]}
                  videoTask={tasks[`vid_${scene.id}`]}
                  validationIssues={sceneValidationMap?.get(scene.id)}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
      {/* 批量生成确认弹窗 */}
      <Modal isOpen={showBatchModal} onOpenChange={setShowBatchModal} size="sm" classNames={{ base: "pro-modal" }}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-[var(--text-primary)]">检测到已有帧图片</ModalHeader>
              <ModalBody>
                <p className="text-sm text-[var(--text-secondary)]">
                  当前 {totalScenes} 个分镜中，已有 <span className="font-bold text-amber-400">{scenesWithFrames}</span> 个分镜已生成帧图片。
                </p>
                <p className="text-sm text-[var(--text-muted)] mt-1">请选择处理方式：</p>
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="flat"
                  onPress={onClose}
                  className="pro-btn"
                >
                  取消
                </Button>
                <Button
                  className="pro-btn bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/30"
                  onPress={() => {
                    onClose();
                    onBatchGenerate?.(false);
                  }}
                >
                  跳过已有
                </Button>
                <Button
                  className="pro-btn-primary"
                  onPress={() => {
                    onClose();
                    onBatchGenerate?.(true);
                  }}
                >
                  全部覆盖
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 批量视频生成确认弹窗 */}
      <Modal isOpen={showBatchVideoModal} onOpenChange={setShowBatchVideoModal} size="sm" classNames={{ base: "pro-modal" }}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-[var(--text-primary)]">检测到已有视频</ModalHeader>
              <ModalBody>
                <p className="text-sm text-[var(--text-secondary)]">
                  当前 {totalScenes} 个分镜中，已有 <span className="font-bold text-rose-400">{scenesWithVideos}</span> 个分镜已生成视频。
                </p>
                <p className="text-sm text-[var(--text-muted)] mt-1">请选择处理方式：</p>
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="flat"
                  onPress={onClose}
                  className="pro-btn"
                >
                  取消
                </Button>
                <Button
                  className="pro-btn bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/30"
                  onPress={() => {
                    onClose();
                    onBatchGenerateVideo?.(false);
                  }}
                >
                  跳过已有
                </Button>
                <Button
                  className="pro-btn-primary"
                  onPress={() => {
                    onClose();
                    onBatchGenerateVideo?.(true);
                  }}
                >
                  全部覆盖
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default SceneList;
