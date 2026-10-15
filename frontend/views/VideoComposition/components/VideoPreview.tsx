/**
 * 合成预览播放器
 * 顺序播放时间线上所有片段，自动切换下一个，模拟完整合成视频
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Button, Chip } from '@heroui/react';
import { Play, Pause, SkipBack, SkipForward, Maximize2, Volume2 } from 'lucide-react';
import type { CompositionClip } from '../types';

interface VideoPreviewProps {
  clips: CompositionClip[];
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  onDurationDetected?: (clipId: string, duration: number) => void;
  onCurrentClipChange?: (clipId: string | null) => void;
}

const VideoPreview: React.FC<VideoPreviewProps> = ({
  clips,
  playing,
  onPlayingChange,
  onDurationDetected,
  onCurrentClipChange
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [clipTime, setClipTime] = useState(0);
  const [clipDuration, setClipDuration] = useState(0);

  const currentClip = clips[currentIndex] || null;

  // 计算总时长和全局进度
  const totalDuration = useMemo(() => {
    return clips.reduce((sum, c) => sum + Math.max(c.duration || 0, 0), 0);
  }, [clips]);

  const globalTime = useMemo(() => {
    let t = 0;
    for (let i = 0; i < currentIndex; i++) {
      t += Math.max(clips[i].duration || 0, 0);
    }
    return t + clipTime;
  }, [clips, currentIndex, clipTime]);

  // 当 clips 变化时重置到第一个
  useEffect(() => {
    if (clips.length === 0) {
      setCurrentIndex(0);
      setClipTime(0);
      setClipDuration(0);
      return;
    }
    if (currentIndex >= clips.length) {
      setCurrentIndex(0);
    }
  }, [clips.length]);

  // 加载当前片段
  useEffect(() => {
    if (videoRef.current && currentClip) {
      videoRef.current.src = currentClip.videoUrl;
      videoRef.current.load();
      setClipTime(0);
      setClipDuration(0);
      onCurrentClipChange?.(currentClip.id);
    } else {
      onCurrentClipChange?.(null);
    }
  }, [currentIndex, currentClip?.id]);

  // 播放/暂停同步
  useEffect(() => {
    if (!videoRef.current || !currentClip) return;
    if (playing) {
      videoRef.current.play().catch(() => onPlayingChange(false));
    } else {
      videoRef.current.pause();
    }
  }, [playing, currentIndex]);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setClipDuration(dur);
      if (currentClip && onDurationDetected && dur > 0) {
        onDurationDetected(currentClip.id, dur);
      }
      // 自动播放（如果正在播放状态）
      if (playing) {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [currentClip, onDurationDetected, playing]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setClipTime(videoRef.current.currentTime);
    }
  }, []);

  // 当前片段播放完毕 → 自动切换下一个
  const handleEnded = useCallback(() => {
    if (currentIndex < clips.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // 全部播放完毕
      onPlayingChange(false);
      setCurrentIndex(0);
    }
  }, [currentIndex, clips.length, onPlayingChange]);

  const togglePlay = () => {
    if (clips.length === 0) return;
    onPlayingChange(!playing);
  };

  const skipToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const skipToNext = () => {
    if (currentIndex < clips.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  // 全局进度条点击 → 定位到对应片段和时间
  const seekGlobal = (ratio: number) => {
    const targetTime = ratio * totalDuration;
    let accumulated = 0;
    for (let i = 0; i < clips.length; i++) {
      const dur = Math.max(clips[i].duration || 0, 0);
      if (accumulated + dur > targetTime) {
        setCurrentIndex(i);
        const localTime = targetTime - accumulated;
        // 需要等视频加载后再 seek
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.currentTime = localTime;
            setClipTime(localTime);
          }
        }, 100);
        return;
      }
      accumulated += dur;
    }
  };

  const handleFullscreen = () => {
    videoRef.current?.requestFullscreen?.();
  };

  if (clips.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900 rounded-lg">
        <div className="text-center text-slate-500">
          <Play className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">时间线为空</p>
          <p className="text-xs mt-1 opacity-60">从左侧添加片段到时间线后即可预览合成效果</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-900 rounded-lg overflow-hidden">
      {/* 视频区域 */}
      <div className="flex-1 relative flex items-center justify-center bg-black min-h-0">
        <video
          ref={videoRef}
          className="max-w-full max-h-full object-contain"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onClick={togglePlay}
          playsInline
        />

        {/* 当前片段信息 */}
        {currentClip && (
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <Chip size="sm" variant="flat" className="bg-black/60 text-white/80 text-xs">
              {currentIndex + 1} / {clips.length}
            </Chip>
            <span className="text-xs text-white/60 bg-black/40 rounded px-1.5 py-0.5">
              第 {currentClip.episodeNumber} 集 · 镜头 {currentClip.order + 1}
            </span>
          </div>
        )}
      </div>

      {/* 全局进度条 */}
      <div className="px-4 pt-2">
        <div
          className="w-full h-1.5 bg-slate-700 rounded-full cursor-pointer group relative"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            seekGlobal(ratio);
          }}
        >
          {/* 片段分隔标记 */}
          {clips.length > 1 && totalDuration > 0 && (() => {
            let acc = 0;
            return clips.slice(0, -1).map((c, i) => {
              acc += Math.max(c.duration || 0, 0);
              const pct = (acc / totalDuration) * 100;
              return (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 w-px bg-slate-500/60"
                  style={{ left: `${pct}%` }}
                />
              );
            });
          })()}

          <div
            className="h-full bg-blue-500 rounded-full relative transition-all group-hover:bg-blue-400"
            style={{ width: `${totalDuration > 0 ? (globalTime / totalDuration) * 100 : 0}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>

      {/* 控制栏 */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-1">
          <Button isIconOnly size="sm" variant="light" className="text-white/70 hover:text-white" onPress={skipToPrev} isDisabled={currentIndex === 0}>
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button isIconOnly size="sm" variant="light" className="text-white hover:text-blue-400" onPress={togglePlay}>
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </Button>
          <Button isIconOnly size="sm" variant="light" className="text-white/70 hover:text-white" onPress={skipToNext} isDisabled={currentIndex >= clips.length - 1}>
            <SkipForward className="w-4 h-4" />
          </Button>
        </div>

        <span className="text-xs text-white/60 font-mono">
          {formatTime(globalTime)} / {formatTime(totalDuration)}
        </span>

        <div className="flex items-center gap-1">
          <Volume2 className="w-3.5 h-3.5 text-white/40" />
          <Button isIconOnly size="sm" variant="light" className="text-white/70 hover:text-white" onPress={handleFullscreen}>
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default VideoPreview;
