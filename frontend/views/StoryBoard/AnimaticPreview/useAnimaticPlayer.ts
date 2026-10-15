import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { StoryboardScene } from '../useSceneManager';

export interface UseAnimaticPlayerProps {
  storyboards: StoryboardScene[];
  defaultDuration?: number;
}

export interface UseAnimaticPlayerReturn {
  // 状态
  currentIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  currentTime: number;
  totalDuration: number;
  globalTime: number;
  
  // 控制
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  goToNext: () => void;
  goToPrev: () => void;
  goToIndex: (index: number) => void;
  seekGlobal: (time: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  
  // 辅助
  currentStoryboard: StoryboardScene | null;
  getClipDuration: (sb: StoryboardScene) => number;
  progress: number;
  
  // 视频控制
  videoRef: React.RefObject<HTMLVideoElement>;
  onVideoEnded: () => void;
  onVideoTimeUpdate: (currentTime: number) => void;
}

/**
 * Animatic 播放器核心 Hook
 * 
 * 支持图片和视频混合播放：
 * - 图片模式：显示 duration 时长后自动切换
 * - 视频模式：播放视频并监听 ended 事件
 */
export function useAnimaticPlayer({
  storyboards,
  defaultDuration = 2.5
}: UseAnimaticPlayerProps): UseAnimaticPlayerReturn {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeedState] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const preloadCacheRef = useRef<Map<string, boolean>>(new Map());
  
  // 当前分镜
  const currentStoryboard = storyboards[currentIndex] || null;
  
  // 判断当前分镜是否为视频模式
  const isVideoMode = useMemo(() => {
    return !!currentStoryboard?.videoUrl;
  }, [currentStoryboard?.videoUrl]);
  
  // 获取单个分镜的时长
  const getClipDuration = useCallback((sb: StoryboardScene): number => {
    return sb.duration && sb.duration > 0 ? sb.duration : defaultDuration;
  }, [defaultDuration]);
  
  // 计算所有分镜总时长
  const totalDuration = useMemo(() => {
    return storyboards.reduce((sum, sb) => sum + getClipDuration(sb), 0);
  }, [storyboards, getClipDuration]);
  
  // 计算全局已播放时间
  const globalTime = useMemo(() => {
    let time = 0;
    for (let i = 0; i < currentIndex; i++) {
      time += getClipDuration(storyboards[i]);
    }
    return time + currentTime;
  }, [currentIndex, currentTime, storyboards, getClipDuration]);
  
  // 全局进度百分比
  const progress = useMemo(() => {
    return totalDuration > 0 ? (globalTime / totalDuration) * 100 : 0;
  }, [globalTime, totalDuration]);
  
  // 预加载图片
  const preloadImage = useCallback((url: string) => {
    if (!url || preloadCacheRef.current.has(url)) return;
    
    const img = new Image();
    img.onload = () => {
      preloadCacheRef.current.set(url, true);
    };
    img.src = url;
  }, []);
  
  // 预加载当前分镜前后的图片
  const preloadNearbyImages = useCallback((index: number) => {
    const range = 2;
    for (let i = Math.max(0, index - range); i <= Math.min(storyboards.length - 1, index + range); i++) {
      const sb = storyboards[i];
      if (sb?.startFrame) preloadImage(sb.startFrame);
      if (sb?.endFrame) preloadImage(sb.endFrame);
      if (sb?.imageUrl) preloadImage(sb.imageUrl);
    }
  }, [storyboards, preloadImage]);
  
  // 切换到下一个分镜
  const goToNextInternal = useCallback(() => {
    if (currentIndex < storyboards.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setCurrentTime(0);
      return true;
    }
    return false;
  }, [currentIndex, storyboards.length]);
  
  // 图片模式定时器 tick
  const tick = useCallback((timestamp: number) => {
    if (!isPlaying) return;
    
    // 视频模式由视频自身控制
    if (isVideoMode) {
      animationFrameRef.current = requestAnimationFrame(tick);
      return;
    }
    
    const delta = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0;
    lastTimeRef.current = timestamp;
    
    // 根据播放速度调整时间增量
    const adjustedDelta = delta * playbackSpeed;
    
    setCurrentTime(prev => {
      const clipDuration = currentStoryboard ? getClipDuration(currentStoryboard) : defaultDuration;
      const newTime = prev + adjustedDelta;
      
      if (newTime >= clipDuration) {
        // 切换到下一个分镜
        const hasNext = goToNextInternal();
        if (!hasNext) {
          // 最后一个分镜播放完毕，停止播放
          setIsPlaying(false);
          return clipDuration;
        }
        return 0;
      }
      
      return newTime;
    });
    
    animationFrameRef.current = requestAnimationFrame(tick);
  }, [isPlaying, isVideoMode, playbackSpeed, currentStoryboard, getClipDuration, defaultDuration, goToNextInternal]);
  
  // 播放控制
  const play = useCallback(() => {
    if (storyboards.length === 0) return;
    
    // 如果已经播放到最后，从头开始
    if (currentIndex >= storyboards.length - 1) {
      const lastClipDuration = getClipDuration(storyboards[currentIndex]);
      if (currentTime >= lastClipDuration) {
        setCurrentIndex(0);
        setCurrentTime(0);
      }
    }
    
    setIsPlaying(true);
    lastTimeRef.current = 0;
  }, [storyboards, currentIndex, currentTime, getClipDuration]);
  
  const pause = useCallback(() => {
    setIsPlaying(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);
  
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);
  
  const goToNext = useCallback(() => {
    if (currentIndex < storyboards.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setCurrentTime(0);
    }
  }, [currentIndex, storyboards.length]);
  
  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setCurrentTime(0);
    }
  }, [currentIndex]);
  
  const goToIndex = useCallback((index: number) => {
    if (index >= 0 && index < storyboards.length) {
      setCurrentIndex(index);
      setCurrentTime(0);
    }
  }, [storyboards.length]);
  
  // 全局进度跳转
  const seekGlobal = useCallback((time: number) => {
    let accumulated = 0;
    
    for (let i = 0; i < storyboards.length; i++) {
      const duration = getClipDuration(storyboards[i]);
      
      if (accumulated + duration > time) {
        setCurrentIndex(i);
        setCurrentTime(time - accumulated);
        
        // 如果是视频模式，设置视频时间
        if (storyboards[i].videoUrl && videoRef.current) {
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.currentTime = time - accumulated;
            }
          }, 100);
        }
        return;
      }
      accumulated += duration;
    }
    
    // 如果超出总时长，跳转到最后
    if (storyboards.length > 0) {
      const lastIndex = storyboards.length - 1;
      setCurrentIndex(lastIndex);
      setCurrentTime(getClipDuration(storyboards[lastIndex]));
    }
  }, [storyboards, getClipDuration]);
  
  const setPlaybackSpeed = useCallback((speed: number) => {
    setPlaybackSpeedState(speed);
    // 如果视频正在播放，同步视频播放速度
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, []);
  
  // 视频结束事件处理
  const onVideoEnded = useCallback(() => {
    const hasNext = goToNextInternal();
    if (!hasNext) {
      setIsPlaying(false);
    }
  }, [goToNextInternal]);
  
  // 视频时间更新处理
  const onVideoTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);
  
  // 启动/停止 animation frame
  useEffect(() => {
    if (isPlaying && !isVideoMode) {
      lastTimeRef.current = 0;
      animationFrameRef.current = requestAnimationFrame(tick);
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, isVideoMode, tick]);
  
  // 当前索引变化时预加载附近图片
  useEffect(() => {
    preloadNearbyImages(currentIndex);
  }, [currentIndex, preloadNearbyImages]);
  
  // 视频播放控制
  useEffect(() => {
    if (!videoRef.current || !isVideoMode) return;
    
    videoRef.current.playbackRate = playbackSpeed;
    
    if (isPlaying) {
      videoRef.current.play().catch(() => {
        // 自动播放被阻止，暂停播放
        setIsPlaying(false);
      });
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, isVideoMode, playbackSpeed, currentIndex]);
  
  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);
  
  return {
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
  };
}

export default useAnimaticPlayer;
