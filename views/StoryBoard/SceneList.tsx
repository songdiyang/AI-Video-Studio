import React, { useState, useRef, useEffect } from 'react';
import { Button, Tooltip } from '@heroui/react';
import { Plus, Video, Download, Film, Image, Trash2, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SceneCard from './SceneCard';
import { StoryboardScene } from './useSceneManager';
import { TaskState } from '../../hooks/useTaskRunner';
import type { StoryboardValidationIssue } from './utils/validateStoryboardContent';
import { useImagePreloader, useScrollIndex } from './hooks/useImagePreloader';
import EpisodeSelector from './EpisodeSelector';

interface Script {
  id: number;
  episode_number: number;
  title: string;
  status: string;
}

interface SceneListProps {
  scenes: StoryboardScene[];
  selectedScene: number | null;
  projectId?: number | null;
  scriptId?: number | null;
  scripts?: Script[];
  currentEpisode?: number;
  currentScriptId?: number | null;
  projectName?: string;
  standaloneMaxEpisode?: number;
  isLoading?: boolean;
  onSelectScene: (id: number) => void;
  onMoveScene: (id: number, direction: 'up' | 'down') => void;
  onDeleteScene: (id: number) => void;
  onInsertScene?: (index: number) => void;
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
  onBatchDownload?: () => void;
  onPlayAnimatic?: () => void;
  onEpisodeSelect?: (script: Script | null) => void;
  onStandaloneEpisodeChange?: (episode: number) => void;
  onCreateNextEpisode?: () => void;
  onUpdateEpisodeTitle?: (scriptId: number, title: string) => Promise<void>;
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
  scripts = [],
  currentEpisode = 1,
  currentScriptId,
  projectName,
  standaloneMaxEpisode,
  isLoading = false,
  onSelectScene,
  onMoveScene,
  onDeleteScene,
  onInsertScene,
  onUpdateDescription,
  onGenerateImage,
  onGenerateVideo,
  onUpdateScene,
  tasks,
  onReorderScenes,
  sceneValidationMap,
  onBatchDownload,
  onPlayAnimatic,
  onEpisodeSelect,
  onStandaloneEpisodeChange,
  onCreateNextEpisode,
  onUpdateEpisodeTitle,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [expandedInsertIndex, setExpandedInsertIndex] = useState<number | null>(null);
  const insertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // 统计
  const totalScenes = scenes.length;
  const scenesWithVideos = scenes.filter(s => s.videoUrl).length;

  // 点击视频进度指示器 → 循环跳转到下一个缺少视频的分镜
  const handleVideoProgressClick = () => {
    const missingScenes = scenes.filter(s => !s.videoUrl);
    if (missingScenes.length === 0) return;
    // 找到当前选中分镜之后的第一个缺视频的，如果没有就回到开头
    const currentIdx = selectedScene ? scenes.findIndex(s => s.id === selectedScene) : -1;
    const next = missingScenes.find(s => {
      const idx = scenes.findIndex(ss => ss.id === s.id);
      return idx > currentIdx;
    }) || missingScenes[0];
    if (next?.id) {
      onSelectScene(next.id);
      requestAnimationFrame(() => {
        const el = scrollContainerRef.current?.querySelector(`[data-scene-id="${next.id}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
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

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sceneId: number; sceneIndex: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  // 下载文件辅助函数
  const downloadFile = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleContextMenu = (e: React.MouseEvent, sceneId: number, sceneIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, sceneId, sceneIndex });
  };

  const handleDownloadVideo = () => {
    if (!contextMenu) return;
    const scene = scenes.find(s => s.id === contextMenu.sceneId);
    if (scene?.videoUrl) {
      downloadFile(scene.videoUrl, `分镜${contextMenu.sceneIndex + 1}_视频.mp4`);
    }
    setContextMenu(null);
  };

  const handleDownloadImage = () => {
    if (!contextMenu) return;
    const scene = scenes.find(s => s.id === contextMenu.sceneId);
    if (scene?.startFrame) {
      downloadFile(scene.startFrame, `分镜${contextMenu.sceneIndex + 1}_首帧.png`);
    }
    setContextMenu(null);
  };

  const handleDeleteSceneFromMenu = () => {
    if (!contextMenu) return;
    onDeleteScene(contextMenu.sceneId);
    setContextMenu(null);
  };

  return (
    <div className="h-full flex flex-col bg-[var(--bg-app)]">
      {/* 紧凑的头部操作栏 */}
      <div className="flex-shrink-0 px-2 py-2 border-b border-[var(--border-color)] flex items-center justify-between gap-2">
        {/* 左侧：项目名 + 集数切换 */}
        <div className="flex items-center gap-2">
          <EpisodeSelector
            scripts={scripts}
            currentEpisode={currentEpisode}
            currentScriptId={currentScriptId}
            projectName={projectName}
            onSelect={onEpisodeSelect}
            onStandaloneEpisodeChange={onStandaloneEpisodeChange}
            standaloneMaxEpisode={standaloneMaxEpisode}
            onCreateNextEpisode={onCreateNextEpisode}
            onUpdateEpisodeTitle={onUpdateEpisodeTitle}
          />
        </div>
        <div className="flex items-center gap-1">
          {/* 批量下载 */}
          {onBatchDownload && (
            <Tooltip content="批量下载打包" placement="bottom">
              <button
                onClick={onBatchDownload}
                className="h-7 w-7 flex items-center justify-center rounded-md text-xs bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:bg-emerald-500/15 hover:text-emerald-400 hover:border-emerald-500/30 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}
          {/* 播放分镜 */}
          {onPlayAnimatic && (
            <Tooltip content="播放分镜预览" placement="bottom">
              <button
                onClick={onPlayAnimatic}
                className="h-7 w-7 flex items-center justify-center rounded-md text-xs bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:bg-purple-500/15 hover:text-purple-400 hover:border-purple-500/30 transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}
          {scenes.length > 0 && (
            <Tooltip content={scenesWithVideos === totalScenes ? '所有视频已完成' : '点击定位缺少视频的分镜'} placement="bottom">
              <button
                onClick={handleVideoProgressClick}
                className={`h-7 px-2.5 text-xs rounded-md border flex items-center gap-1.5 transition-all cursor-pointer ${
                  scenesWithVideos === totalScenes
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span className="font-medium">{scenesWithVideos}/{totalScenes}</span>
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* 分镜卡片列表 - 紧凑间距 */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-2 space-y-1 scroll-fade-top scroll-fade-bottom"
        onContextMenu={(e) => {
          // 空白区域右键菜单
          if (onInsertScene && !(e.target as HTMLElement).closest('[data-scene-id]')) {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, sceneId: -1, sceneIndex: scenes.length });
          }
        }}
      >
        {isLoading ? (
          <SceneListSkeleton />
        ) : scenes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] py-12">
            <Film className="w-10 h-10 mb-3 opacity-30" />
            <div className="text-sm font-medium mb-1">暂无分镜</div>
            <div className="text-xs opacity-60">点击上方"+"按钮或右键添加分镜</div>
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-0"
          >
            {scenes.map((scene, index) => (
              <React.Fragment key={scene.id}>
                <motion.div
                  data-scene-id={scene.id}
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
                    onContextMenu={(e) => handleContextMenu(e, scene.id, index)}
                  />
                </motion.div>
                {/* 分镜间插入区域 - 停疙0.3s展开动画 */}
                {onInsertScene && index < scenes.length - 1 && (
                  <div
                    className={`scene-insert-zone relative flex items-center justify-center cursor-pointer${
                      expandedInsertIndex === index ? ' expanded' : ''
                    }`}
                    onClick={() => onInsertScene(index + 1)}
                    onMouseEnter={() => {
                      if (insertTimerRef.current) clearTimeout(insertTimerRef.current);
                      insertTimerRef.current = setTimeout(() => {
                        setExpandedInsertIndex(index);
                      }, 300);
                    }}
                    onMouseLeave={() => {
                      if (insertTimerRef.current) clearTimeout(insertTimerRef.current);
                      insertTimerRef.current = null;
                      setExpandedInsertIndex(null);
                    }}
                    title="插入新分镜"
                  >
                    <div className={`absolute inset-x-0 flex items-center justify-center transition-opacity duration-150 z-10 ${
                      expandedInsertIndex === index ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}>
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--bg-primary)] border border-[var(--accent)]/40 shadow-md text-[10px] text-[var(--accent)] whitespace-nowrap">
                        <Plus className="w-3 h-3" />
                        插入分镜
                      </div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </motion.div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-[var(--bg-nav)] border border-[var(--border-color)] rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.sceneId === -1 ? (
            /* 空白区域右键菜单 */
            <button
              className="w-full px-3 py-2 text-xs text-left flex items-center gap-2 text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] transition-colors"
              onClick={() => {
                if (onInsertScene) {
                  onInsertScene(scenes.length);
                }
                setContextMenu(null);
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              添加分镜
            </button>
          ) : (
            <>
              {/* 下载视频 */}
              <button
                className="w-full px-3 py-2 text-xs text-left flex items-center gap-2 text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] transition-colors"
                onClick={handleDownloadVideo}
              >
                <Film className="w-3.5 h-3.5" />
                下载视频
              </button>
              {/* 下载图片 */}
              <button
                className="w-full px-3 py-2 text-xs text-left flex items-center gap-2 text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] transition-colors"
                onClick={handleDownloadImage}
              >
                <Image className="w-3.5 h-3.5" />
                下载首帧图片
              </button>
              {/* 分隔线 */}
              <div className="my-1 border-t border-[var(--border-color)]" />
              {/* 删除 */}
              <button
                className="w-full px-3 py-2 text-xs text-left flex items-center gap-2 text-red-400 hover:bg-red-500/10 transition-colors"
                onClick={handleDeleteSceneFromMenu}
              >
                <Trash2 className="w-3.5 h-3.5" />
                删除分镜
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SceneList;
