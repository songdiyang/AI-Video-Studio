import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { Button, Chip, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/react';
import { 
  Play, Pause, SkipBack, SkipForward, Maximize2, Minimize2, 
  Volume2, VolumeX, X, ChevronDown, ChevronUp, Star, Shirt
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { StoryboardScene } from '../useSceneManager';
import { useAnimaticPlayer } from './useAnimaticPlayer';
import { useKeyboardShortcuts, ShortcutConfig } from '../../../hooks/useKeyboardShortcuts';

interface AnimaticPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  storyboards: StoryboardScene[];
  initialIndex?: number;
}

// 播放速度选项
const SPEED_OPTIONS = [
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1, label: '1x' },
  { value: 1.25, label: '1.25x' },
  { value: 1.5, label: '1.5x' },
  { value: 2, label: '2x' },
];

// 格式化时间 MM:SS
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const AnimaticPreview: React.FC<AnimaticPreviewProps> = ({
  isOpen,
  onClose,
  storyboards,
  initialIndex = 0
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  
  const {
    currentIndex,
    isPlaying,
    playbackSpeed,
    currentTime,
    totalDuration,
    globalTime,
    play,
    pause,
    togglePlay,
    goToNext,
    goToPrev,
    goToIndex,
    seekGlobal,
    setPlaybackSpeed,
    currentStoryboard,
    getClipDuration,
    progress,
    videoRef,
    onVideoEnded,
    onVideoTimeUpdate
  } = useAnimaticPlayer({
    storyboards,
    defaultDuration: 2.5
  });
  
  // 初始化索引
  useEffect(() => {
    if (isOpen && initialIndex >= 0 && initialIndex < storyboards.length) {
      goToIndex(initialIndex);
    }
  }, [isOpen, initialIndex, storyboards.length, goToIndex]);
  
  // 阻止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);
  
  // 全屏状态监听
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);
  
  // 全屏切换
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
      }
    } catch (e) {
      console.error('Fullscreen error:', e);
    }
  }, []);
  
  // 静音切换
  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
  }, [isMuted, videoRef]);
  
  // 计算分镜段位置（进度条分隔）
  const segmentPositions = useMemo(() => {
    if (totalDuration === 0) return [];
    
    const positions: number[] = [];
    let accumulated = 0;
    
    for (let i = 0; i < storyboards.length - 1; i++) {
      accumulated += getClipDuration(storyboards[i]);
      positions.push((accumulated / totalDuration) * 100);
    }
    
    return positions;
  }, [storyboards, totalDuration, getClipDuration]);
  
  // 进度条点击
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || totalDuration === 0) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekGlobal(ratio * totalDuration);
  }, [totalDuration, seekGlobal]);
  
  // 进度条拖拽
  const handleProgressDrag = useCallback((e: MouseEvent) => {
    if (!progressBarRef.current || totalDuration === 0 || !isDragging) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekGlobal(ratio * totalDuration);
  }, [totalDuration, seekGlobal, isDragging]);
  
  // 拖拽事件处理
  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e: MouseEvent) => handleProgressDrag(e);
      const handleMouseUp = () => setIsDragging(false);
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleProgressDrag]);
  
  // 快捷键配置
  const shortcuts: ShortcutConfig[] = useMemo(() => [
    { key: ' ', action: togglePlay, description: '播放/暂停', scope: 'animatic' },
    { key: 'Escape', action: onClose, description: '关闭预览', scope: 'animatic' },
    { key: 'ArrowLeft', action: goToPrev, description: '上一个分镜', scope: 'animatic' },
    { key: 'ArrowRight', action: goToNext, description: '下一个分镜', scope: 'animatic' },
    { key: 'f', action: toggleFullscreen, description: '全屏', scope: 'animatic' },
    { key: 'm', action: toggleMute, description: '静音', scope: 'animatic' },
    {
      key: '[',
      action: () => setPlaybackSpeed(Math.max(0.5, playbackSpeed - 0.25)),
      description: '减慢速度',
      scope: 'animatic',
    },
    {
      key: ']',
      action: () => setPlaybackSpeed(Math.min(2, playbackSpeed + 0.25)),
      description: '加快速度',
      scope: 'animatic',
    },
  ], [togglePlay, onClose, goToPrev, goToNext, toggleFullscreen, toggleMute, playbackSpeed, setPlaybackSpeed]);
  
  useKeyboardShortcuts(shortcuts, isOpen);
  
  // 获取当前显示的图片 URL
  const getCurrentImageUrl = useCallback(() => {
    if (!currentStoryboard) return null;
    return currentStoryboard.startFrame || currentStoryboard.imageUrl || null;
  }, [currentStoryboard]);
  
  // 获取转场动画配置
  const getTransitionConfig = useCallback(() => {
    const transitionType = currentStoryboard?.shotLanguage?.transitionType;
    
    switch (transitionType) {
      case 'fade':
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          transition: { duration: 0.3 }
        };
      case 'dissolve':
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          transition: { duration: 0.5 }
        };
      default:
        // cut: 无动画
        return {
          initial: { opacity: 1 },
          animate: { opacity: 1 },
          exit: { opacity: 1 },
          transition: { duration: 0 }
        };
    }
  }, [currentStoryboard?.shotLanguage?.transitionType]);
  
  // 视频时间更新处理
  const handleVideoTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      onVideoTimeUpdate(videoRef.current.currentTime);
    }
  }, [videoRef, onVideoTimeUpdate]);
  
  // 视频静音同步
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted, videoRef]);
  
  if (!isOpen) return null;
  
  const transitionConfig = getTransitionConfig();
  const imageUrl = getCurrentImageUrl();
  const hasVideo = !!currentStoryboard?.videoUrl;
  
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onClick={(e) => {
        // 点击背景关闭（排除控制区域）
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50">
        <Button
          isIconOnly
          size="sm"
          variant="light"
          className="text-white/70 hover:text-white"
          onPress={onClose}
          aria-label="关闭预览"
        >
          <X className="w-5 h-5" />
        </Button>
        
        <div className="flex items-center gap-2">
          <span className="text-white/90 font-medium">Animatic 预览</span>
          <Chip size="sm" variant="flat" className="bg-white/10 text-white/70">
            {storyboards.length > 0
              ? `${currentIndex + 1} / ${storyboards.length}`
              : '暂无分镜'}
          </Chip>
        </div>
        
        <div className="w-8" /> {/* 占位，保持居中 */}
      </div>
      
      {/* 主显示区 */}
      <div 
        className="flex-1 relative flex items-center justify-center min-h-0 overflow-hidden"
        onClick={togglePlay}
      >
        <AnimatePresence mode="wait">
          {hasVideo ? (
            <motion.video
              key={`video-${currentStoryboard?.id}`}
              ref={videoRef}
              src={currentStoryboard?.videoUrl}
              className="max-w-full max-h-full object-contain"
              autoPlay={isPlaying}
              onEnded={onVideoEnded}
              onTimeUpdate={handleVideoTimeUpdate}
              playsInline
              muted={isMuted}
              onClick={(e) => e.stopPropagation()}
              {...transitionConfig}
            />
          ) : imageUrl ? (
            <motion.img
              key={`img-${currentStoryboard?.id}`}
              src={imageUrl}
              alt={currentStoryboard?.description || '分镜画面'}
              className="max-w-full max-h-full object-contain"
              draggable={false}
              {...transitionConfig}
            />
          ) : (
            <motion.div
              key="placeholder"
              className="flex flex-col items-center justify-center text-white/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="w-24 h-24 rounded-lg bg-slate-800 flex items-center justify-center mb-4">
                <Play className="w-10 h-10 opacity-30" />
              </div>
              <p className="text-sm">暂无画面</p>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* 播放/暂停覆盖指示 */}
        <AnimatePresence>
          {!isPlaying && imageUrl && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="w-20 h-20 rounded-full bg-black/50 flex items-center justify-center">
                <Play className="w-10 h-10 text-white ml-1" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* 进度条 */}
      <div className="px-4 py-2 bg-black/50">
        <div
          ref={progressBarRef}
          className="w-full h-2 bg-slate-700 rounded-full cursor-pointer group relative"
          onClick={handleProgressClick}
          onMouseDown={() => setIsDragging(true)}
        >
          {/* 分镜段分隔标记 */}
          {segmentPositions.map((pos, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-0.5 bg-slate-500/60 z-10"
              style={{ left: `${pos}%` }}
            />
          ))}
          
          {/* 已播放进度 */}
          <div
            className="h-full bg-purple-500 rounded-full relative transition-all group-hover:bg-purple-400"
            style={{ width: `${progress}%` }}
          >
            {/* 进度条拖拽手柄 */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity -mr-2" />
          </div>
        </div>
        
        {/* 分镜段指示（文字） */}
        <div className="flex mt-1 text-[10px] text-white/40 h-4 overflow-hidden">
          {storyboards.map((sb, i) => {
            const duration = getClipDuration(sb);
            const widthPercent = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
            
            return (
              <div
                key={sb.id}
                className={`flex-shrink-0 text-center truncate cursor-pointer hover:text-white/60 transition-colors ${
                  i === currentIndex ? 'text-purple-400' : ''
                }`}
                style={{ width: `${widthPercent}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  goToIndex(i);
                }}
                title={`#${i + 1}`}
              >
                {widthPercent > 3 ? i + 1 : ''}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* 控制栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50">
        {/* 左侧：播放控制 */}
        <div className="flex items-center gap-1">
          <Button
            isIconOnly
            size="sm"
            variant="light"
            className="text-white/70 hover:text-white"
            onPress={goToPrev}
            isDisabled={currentIndex === 0}
            aria-label="上一个分镜"
          >
            <SkipBack className="w-4 h-4" />
          </Button>
          
          <Button
            isIconOnly
            size="sm"
            variant="light"
            className="text-white hover:text-purple-400"
            onPress={togglePlay}
            aria-label={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </Button>
          
          <Button
            isIconOnly
            size="sm"
            variant="light"
            className="text-white/70 hover:text-white"
            onPress={goToNext}
            isDisabled={currentIndex >= storyboards.length - 1}
            aria-label="下一个分镜"
          >
            <SkipForward className="w-4 h-4" />
          </Button>
        </div>
        
        {/* 中间：时间显示 */}
        <span className="text-xs text-white/60 font-mono">
          {formatTime(globalTime)} / {formatTime(totalDuration)}
        </span>
        
        {/* 右侧：其他控制 */}
        <div className="flex items-center gap-1">
          {/* 速度选择 */}
          <Dropdown>
            <DropdownTrigger>
              <Button
                size="sm"
                variant="light"
                className="text-white/70 hover:text-white min-w-[60px]"
              >
                {playbackSpeed}x
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="播放速度"
              selectedKeys={[String(playbackSpeed)]}
              onAction={(key) => setPlaybackSpeed(Number(key))}
            >
              {SPEED_OPTIONS.map(opt => (
                <DropdownItem key={String(opt.value)}>
                  {opt.label}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
          
          {/* 静音按钮 */}
          <Button
            isIconOnly
            size="sm"
            variant="light"
            className="text-white/70 hover:text-white"
            onPress={toggleMute}
            aria-label={isMuted ? '取消静音' : '静音'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
          
          {/* 全屏按钮 */}
          <Button
            isIconOnly
            size="sm"
            variant="light"
            className="text-white/70 hover:text-white"
            onPress={toggleFullscreen}
            aria-label={isFullscreen ? '退出全屏' : '全屏'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
          
          {/* 信息栏折叠按钮 */}
          <Button
            isIconOnly
            size="sm"
            variant="light"
            className="text-white/70 hover:text-white"
            onPress={() => setShowInfo(!showInfo)}
            aria-label={showInfo ? '隐藏信息' : '显示信息'}
          >
            {showInfo ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      
      {/* 信息栏 */}
      <AnimatePresence>
        {showInfo && currentStoryboard && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-black/50 border-t border-white/10 overflow-hidden"
          >
            <div className="px-4 py-3 space-y-2">
              {/* 第一行：基本信息和镜头语言 */}
              <div className="flex flex-wrap items-center gap-2">
                <Chip size="sm" variant="flat" className="bg-purple-500/20 text-purple-300">
                  #{currentIndex + 1}
                </Chip>
                
                {currentStoryboard.shotType && (
                  <Chip size="sm" variant="flat" className="bg-blue-500/20 text-blue-300">
                    {currentStoryboard.shotType}
                  </Chip>
                )}
                
                {/* 镜头语言参数 */}
                {currentStoryboard.shotLanguage && (
                  <>
                    {currentStoryboard.shotLanguage.shotSize && (
                      <Chip size="sm" variant="flat" className="bg-slate-500/20 text-slate-300">
                        {currentStoryboard.shotLanguage.shotSize}
                      </Chip>
                    )}
                    {currentStoryboard.shotLanguage.cameraHeight && (
                      <Chip size="sm" variant="flat" className="bg-slate-500/20 text-slate-300">
                        {currentStoryboard.shotLanguage.cameraHeight}
                      </Chip>
                    )}
                    {currentStoryboard.shotLanguage.cameraMovement && (
                      <Chip size="sm" variant="flat" className="bg-slate-500/20 text-slate-300">
                        {currentStoryboard.shotLanguage.cameraMovement}
                      </Chip>
                    )}
                  </>
                )}
                
                {/* 关联角色 - 增强芯片显示白膜/服装状态 */}
                {currentStoryboard.linkedCharacters && currentStoryboard.linkedCharacters.length > 0 && (
                  <span className="text-white/50 text-xs">
                    角色：
                    {currentStoryboard.linkedCharacters.map((char, i) => {
                      const hasBase = char.has_base_model;
                      const stateLabel = char.active_state_name;
                      const stateOutfit = char.active_state_outfit;
                      const chipImage = char.active_state_image_url || char.base_front_view_url || char.image_url;
                      return (
                        <Chip
                          key={char.character_id}
                          size="sm"
                          variant="flat"
                          className="bg-green-500/20 text-green-300 ml-1"
                          startContent={
                            chipImage ? (
                              <img src={chipImage} alt={char.name} className="w-4 h-4 rounded-full object-cover" />
                            ) : undefined
                          }
                        >
                          <span className="flex items-center gap-1">
                            {char.name}
                            {hasBase && <Star className="w-2.5 h-2.5 text-amber-400" />}
                            {stateLabel && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] text-pink-400/80">
                                <Shirt className="w-2 h-2" />
                                {stateLabel}
                              </span>
                            )}
                          </span>
                        </Chip>
                      );
                    })}
                  </span>
                )}
                
                {/* 关联场景 */}
                {currentStoryboard.linkedScenes && currentStoryboard.linkedScenes.length > 0 && (
                  <span className="text-white/50 text-xs">
                    场景：
                    {currentStoryboard.linkedScenes.map((scene) => (
                      <Chip key={scene.scene_id} size="sm" variant="flat" className="bg-orange-500/20 text-orange-300 ml-1">
                        {scene.name}
                      </Chip>
                    ))}
                  </span>
                )}
              </div>
              
              {/* 第二行：描述 */}
              {currentStoryboard.description && (
                <p className="text-sm text-white/70 line-clamp-2">
                  {currentStoryboard.description}
                </p>
              )}
              
              {/* 第三行：对话 */}
              {currentStoryboard.dialogue && (
                <p className="text-sm text-white/50 italic line-clamp-1">
                  "{currentStoryboard.dialogue}"
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AnimaticPreview;
