/**
 * 时间轴编辑器组件
 * 视频预览、播放控制、时间轴轨道、片段拖拽
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button, Slider } from '@heroui/react';
import {
  Play, Pause, Square, SkipBack, SkipForward,
  Plus, Trash2, Maximize2, Volume2, Film, Music
} from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';

// ==================== 类型定义 ====================

export interface VideoClip {
  id: string;
  type: 'video' | 'audio' | 'image';
  name: string;
  startTime: number;
  duration: number;
  track: number;
  thumbnailUrl?: string;
  color?: string;
}

interface TimelineEditorProps {
  projectId: number;
  clips: VideoClip[];
  onClipsChange: (clips: VideoClip[]) => void;
  aiModels?: any;
}

// 轨道颜色配置
const TRACK_COLORS = {
  video: 'bg-blue-500',
  audio: 'bg-green-500',
  image: 'bg-purple-500',
};

// ==================== 辅助函数 ====================

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

const formatTimeShort = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// ==================== 时间轴编辑器组件 ====================

const TimelineEditor: React.FC<TimelineEditorProps> = ({
  projectId,
  clips,
  onClipsChange,
  aiModels,
}) => {
  const { showToast } = useToast();
  
  // 播放状态
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // 选中状态
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  
  // 缩放控制 (50% - 200%)
  const [zoom, setZoom] = useState(100);
  
  // 拖拽状态
  const [dragState, setDragState] = useState<{
    clipId: string;
    type: 'move' | 'resize-start' | 'resize-end';
    startX: number;
    startTime: number;
    startDuration: number;
  } | null>(null);
  
  // 播放头拖拽状态
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  
  // 时间轴容器引用
  const timelineRef = useRef<HTMLDivElement>(null);
  
  // 计算总时长
  const totalDuration = useMemo(() => {
    if (clips.length === 0) return 30; // 默认30秒
    return Math.max(30, ...clips.map(c => c.startTime + c.duration)) + 5;
  }, [clips]);
  
  // 视频轨道和音频轨道分离
  const videoClips = useMemo(() => clips.filter(c => c.type === 'video' || c.type === 'image'), [clips]);
  const audioClips = useMemo(() => clips.filter(c => c.type === 'audio'), [clips]);
  
  // 像素与时间转换
  const pixelsPerSecond = useMemo(() => (zoom / 100) * 10, [zoom]);
  const timelineWidth = totalDuration * pixelsPerSecond;
  
  // 时间转像素
  const timeToPixels = useCallback((time: number) => time * pixelsPerSecond, [pixelsPerSecond]);
  
  // 像素转时间
  const pixelsToTime = useCallback((pixels: number) => pixels / pixelsPerSecond, [pixelsPerSecond]);

  // ==================== 播放控制 ====================
  
  const handlePlay = useCallback(() => {
    if (playing) {
      // 暂停
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      setPlaying(false);
    } else {
      // 播放
      setPlaying(true);
      playIntervalRef.current = setInterval(() => {
        setCurrentTime(prev => {
          if (prev >= totalDuration) {
            clearInterval(playIntervalRef.current!);
            playIntervalRef.current = null;
            setPlaying(false);
            return 0;
          }
          return prev + 0.1;
        });
      }, 100);
    }
  }, [playing, totalDuration]);
  
  const handleStop = useCallback(() => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    setPlaying(false);
    setCurrentTime(0);
  }, []);
  
  const handlePrevFrame = useCallback(() => {
    setCurrentTime(prev => Math.max(0, prev - 1 / 30)); // 前一帧 (30fps)
  }, []);
  
  const handleNextFrame = useCallback(() => {
    setCurrentTime(prev => Math.min(totalDuration, prev + 1 / 30)); // 后一帧
  }, [totalDuration]);
  
  // 清理播放定时器
  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, []);

  // ==================== 片段操作 ====================
  
  const handleAddVideoClip = useCallback(() => {
    const lastEndTime = videoClips.length > 0
      ? Math.max(...videoClips.map(c => c.startTime + c.duration))
      : 0;
    
    const newClip: VideoClip = {
      id: `clip_${Date.now()}`,
      type: 'video',
      name: `视频片段 ${videoClips.length + 1}`,
      startTime: lastEndTime,
      duration: 5,
      track: 0,
      color: '#3B82F6',
    };
    onClipsChange([...clips, newClip]);
    setSelectedClipId(newClip.id);
    showToast('已添加视频片段', 'success');
  }, [clips, videoClips, onClipsChange, showToast]);
  
  const handleAddAudioClip = useCallback(() => {
    const lastEndTime = audioClips.length > 0
      ? Math.max(...audioClips.map(c => c.startTime + c.duration))
      : 0;
    
    const newClip: VideoClip = {
      id: `audio_${Date.now()}`,
      type: 'audio',
      name: `音频 ${audioClips.length + 1}`,
      startTime: lastEndTime,
      duration: 10,
      track: 1,
      color: '#22C55E',
    };
    onClipsChange([...clips, newClip]);
    setSelectedClipId(newClip.id);
    showToast('已添加音频片段', 'success');
  }, [clips, audioClips, onClipsChange, showToast]);
  
  const handleDeleteClip = useCallback((clipId: string) => {
    onClipsChange(clips.filter(c => c.id !== clipId));
    if (selectedClipId === clipId) {
      setSelectedClipId(null);
    }
    showToast('已删除片段', 'success');
  }, [clips, selectedClipId, onClipsChange, showToast]);

  // ==================== 拖拽处理 ====================
  
  const handleClipMouseDown = useCallback((
    e: React.MouseEvent,
    clipId: string,
    type: 'move' | 'resize-start' | 'resize-end'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;
    
    setSelectedClipId(clipId);
    setDragState({
      clipId,
      type,
      startX: e.clientX,
      startTime: clip.startTime,
      startDuration: clip.duration,
    });
  }, [clips]);
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragState) {
      const deltaX = e.clientX - dragState.startX;
      const deltaTime = pixelsToTime(deltaX);
      
      onClipsChange(clips.map(clip => {
        if (clip.id !== dragState.clipId) return clip;
        
        if (dragState.type === 'move') {
          return {
            ...clip,
            startTime: Math.max(0, dragState.startTime + deltaTime),
          };
        } else if (dragState.type === 'resize-end') {
          return {
            ...clip,
            duration: Math.max(0.5, dragState.startDuration + deltaTime),
          };
        } else if (dragState.type === 'resize-start') {
          const newStartTime = Math.max(0, dragState.startTime + deltaTime);
          const timeDiff = newStartTime - dragState.startTime;
          return {
            ...clip,
            startTime: newStartTime,
            duration: Math.max(0.5, dragState.startDuration - timeDiff),
          };
        }
        return clip;
      }));
    }
    
    if (draggingPlayhead && timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const scrollLeft = timelineRef.current.scrollLeft;
      const x = e.clientX - rect.left + scrollLeft;
      const newTime = Math.max(0, Math.min(totalDuration, pixelsToTime(x)));
      setCurrentTime(newTime);
    }
  }, [dragState, draggingPlayhead, clips, pixelsToTime, totalDuration, onClipsChange]);
  
  const handleMouseUp = useCallback(() => {
    setDragState(null);
    setDraggingPlayhead(false);
  }, []);
  
  // 全局鼠标事件监听
  useEffect(() => {
    if (dragState || draggingPlayhead) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState, draggingPlayhead, handleMouseMove, handleMouseUp]);

  // ==================== 播放头拖拽 ====================
  
  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingPlayhead(true);
  }, []);
  
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const scrollLeft = timelineRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    const newTime = Math.max(0, Math.min(totalDuration, pixelsToTime(x)));
    setCurrentTime(newTime);
  }, [totalDuration, pixelsToTime]);

  // ==================== 缩放控制 ====================
  
  const handleFitToView = useCallback(() => {
    if (!timelineRef.current) return;
    const containerWidth = timelineRef.current.clientWidth - 80; // 减去轨道标签宽度
    const fitZoom = Math.round((containerWidth / totalDuration / 10) * 100);
    setZoom(Math.max(50, Math.min(200, fitZoom)));
  }, [totalDuration]);

  // ==================== 时间刻度渲染 ====================
  
  const renderTimeRuler = () => {
    const marks: React.ReactNode[] = [];
    const interval = zoom >= 100 ? 5 : zoom >= 75 ? 10 : 15; // 根据缩放调整刻度间隔
    
    for (let t = 0; t <= totalDuration; t += interval) {
      marks.push(
        <div
          key={t}
          className="absolute flex flex-col items-start"
          style={{ left: `${timeToPixels(t)}px` }}
        >
          <div className="h-3 w-px bg-[var(--border-color)]" />
          <span className="text-[10px] text-[var(--text-muted)] mt-0.5 -ml-2">
            {formatTimeShort(t)}
          </span>
        </div>
      );
      
      // 添加小刻度
      if (zoom >= 75) {
        for (let st = t + 1; st < t + interval && st < totalDuration; st++) {
          marks.push(
            <div
              key={`sub_${st}`}
              className="absolute h-1.5 w-px bg-[var(--border-color)]/50"
              style={{ left: `${timeToPixels(st)}px` }}
            />
          );
        }
      }
    }
    return marks;
  };

  // ==================== 片段渲染 ====================
  
  const renderClip = (clip: VideoClip) => {
    const isSelected = selectedClipId === clip.id;
    const colorClass = TRACK_COLORS[clip.type] || TRACK_COLORS.video;
    
    return (
      <div
        key={clip.id}
        className={`absolute top-1 bottom-1 rounded-md cursor-pointer transition-all select-none ${
          isSelected
            ? `${colorClass} ring-2 ring-white shadow-lg`
            : `${colorClass}/80 hover:${colorClass}`
        }`}
        style={{
          left: `${timeToPixels(clip.startTime)}px`,
          width: `${Math.max(40, timeToPixels(clip.duration))}px`,
        }}
        onMouseDown={(e) => handleClipMouseDown(e, clip.id, 'move')}
      >
        {/* 左边缘拖拽手柄 */}
        <div
          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l-md"
          onMouseDown={(e) => handleClipMouseDown(e, clip.id, 'resize-start')}
        />
        
        {/* 片段内容 */}
        <div className="px-2 py-1 h-full flex items-center overflow-hidden">
          <span className="text-xs text-white truncate font-medium">
            {clip.name}
          </span>
        </div>
        
        {/* 右边缘拖拽手柄 */}
        <div
          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r-md"
          onMouseDown={(e) => handleClipMouseDown(e, clip.id, 'resize-end')}
        />
        
        {/* 删除按钮 */}
        {isSelected && (
          <button
            onClick={(e) => { e.stopPropagation(); handleDeleteClip(clip.id); }}
            className="absolute -top-2 -right-2 p-1 rounded-full bg-red-500 hover:bg-red-600 shadow-md"
          >
            <Trash2 className="w-3 h-3 text-white" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[var(--bg-app)]">
      {/* 视频预览区 */}
      <div className="h-56 bg-black flex items-center justify-center border-b border-[var(--border-color)] relative">
        <div className="text-center text-white">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-white/10 flex items-center justify-center">
            <Film className="w-8 h-8 opacity-50" />
          </div>
          <p className="text-sm opacity-50">视频预览区</p>
          <p className="text-xs opacity-30 mt-1">{formatTime(currentTime)}</p>
        </div>
      </div>

      {/* 播放控制栏 */}
      <div className="h-14 px-4 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-nav)]">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            isIconOnly
            variant="flat"
            onPress={handlePrevFrame}
            className="text-[var(--text-primary)]"
          >
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            isIconOnly
            color={playing ? 'warning' : 'primary'}
            onPress={handlePlay}
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button
            size="sm"
            isIconOnly
            variant="flat"
            onPress={handleStop}
            className="text-[var(--text-primary)]"
          >
            <Square className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            isIconOnly
            variant="flat"
            onPress={handleNextFrame}
            className="text-[var(--text-primary)]"
          >
            <SkipForward className="w-4 h-4" />
          </Button>
          
          <div className="ml-4 px-3 py-1 rounded bg-[var(--bg-input)] font-mono text-sm text-[var(--text-primary)]">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-muted)]">缩放</span>
          <Slider
            size="sm"
            step={10}
            minValue={50}
            maxValue={200}
            value={zoom}
            onChange={(val) => setZoom(val as number)}
            className="w-28"
            classNames={{
              track: "bg-[var(--bg-input)]",
              filler: "bg-[var(--accent)]"
            }}
          />
          <span className="text-xs text-[var(--text-muted)] w-10">{zoom}%</span>
          <Button
            size="sm"
            isIconOnly
            variant="flat"
            onPress={handleFitToView}
            className="text-[var(--text-primary)]"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 时间轴区域 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* 时间标尺 */}
        <div className="h-8 border-b border-[var(--border-color)] bg-[var(--bg-nav)] flex">
          <div className="w-20 flex-shrink-0 border-r border-[var(--border-color)]" />
          <div
            ref={timelineRef}
            className="flex-1 overflow-x-auto relative"
            onClick={handleTimelineClick}
          >
            <div className="h-full relative" style={{ width: `${timelineWidth}px` }}>
              {renderTimeRuler()}
              
              {/* 播放头 */}
              <div
                className="absolute top-0 bottom-0 w-px bg-red-500 cursor-ew-resize z-20"
                style={{ left: `${timeToPixels(currentTime)}px` }}
                onMouseDown={handlePlayheadMouseDown}
              >
                <div className="absolute -top-0.5 -left-1.5 w-3 h-3 bg-red-500 rounded-sm transform rotate-45" />
              </div>
            </div>
          </div>
        </div>

        {/* 轨道区域 */}
        <div className="flex-1 overflow-y-auto">
          {/* 视频轨道 */}
          <div className="h-16 flex border-b border-[var(--border-color)]">
            <div className="w-20 flex-shrink-0 border-r border-[var(--border-color)] bg-[var(--bg-nav)] flex items-center px-2 gap-2">
              <Film className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-[var(--text-muted)]">视频</span>
            </div>
            <div className="flex-1 overflow-x-auto bg-[var(--bg-input)]/50 relative">
              <div
                className="h-full relative"
                style={{ width: `${timelineWidth}px`, minWidth: '100%' }}
              >
                {videoClips.map(renderClip)}
                
                {/* 播放头线条 */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-red-500/50 pointer-events-none z-10"
                  style={{ left: `${timeToPixels(currentTime)}px` }}
                />
              </div>
            </div>
            <Button
              size="sm"
              isIconOnly
              variant="flat"
              onPress={handleAddVideoClip}
              className="flex-shrink-0 m-2"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* 音频轨道 */}
          <div className="h-14 flex border-b border-[var(--border-color)]">
            <div className="w-20 flex-shrink-0 border-r border-[var(--border-color)] bg-[var(--bg-nav)] flex items-center px-2 gap-2">
              <Music className="w-4 h-4 text-green-400" />
              <span className="text-xs text-[var(--text-muted)]">音频</span>
            </div>
            <div className="flex-1 overflow-x-auto bg-[var(--bg-input)]/30 relative">
              <div
                className="h-full relative"
                style={{ width: `${timelineWidth}px`, minWidth: '100%' }}
              >
                {audioClips.map(renderClip)}
                
                {/* 播放头线条 */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-red-500/50 pointer-events-none z-10"
                  style={{ left: `${timeToPixels(currentTime)}px` }}
                />
              </div>
            </div>
            <Button
              size="sm"
              isIconOnly
              variant="flat"
              onPress={handleAddAudioClip}
              className="flex-shrink-0 m-2"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          
          {/* 空白区域提示 */}
          {clips.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] py-8">
              <div className="text-center">
                <p className="text-sm">点击 + 按钮添加视频或音频片段</p>
                <p className="text-xs mt-1 opacity-60">拖拽片段可移动位置，拖拽边缘可调整时长</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimelineEditor;
