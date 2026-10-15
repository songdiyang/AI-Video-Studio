/**
 * 时间线状态管理 Hook
 * 管理片段排序、选中、播放头位置等
 */

import { useState, useCallback, useMemo } from 'react';
import type { CompositionClip, TimelineState } from '../types';
import { arrayMove } from '@dnd-kit/sortable';

export function useTimeline(initialClips: CompositionClip[]) {
  const [clips, setClips] = useState<CompositionClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);

  // 当外部片段变化时同步
  const syncClips = useCallback((newClips: CompositionClip[]) => {
    setClips(newClips);
    // 如果选中的片段不在新列表中，清除选中
    setSelectedClipId(prev => {
      if (prev && !newClips.find(c => c.id === prev)) return null;
      return prev;
    });
  }, []);

  // 总时长
  const totalDuration = useMemo(() => {
    return clips.reduce((sum, clip) => {
      const effectiveDuration = clip.duration - clip.trimStart - clip.trimEnd;
      return sum + Math.max(effectiveDuration, 0);
    }, 0);
  }, [clips]);

  // 拖拽排序
  const handleReorder = useCallback((activeId: string, overId: string) => {
    setClips(prev => {
      const oldIndex = prev.findIndex(c => c.id === activeId);
      const newIndex = prev.findIndex(c => c.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  // 选中片段
  const selectClip = useCallback((clipId: string | null) => {
    setSelectedClipId(clipId);
  }, []);

  // 更新单个片段属性
  const updateClip = useCallback((clipId: string, updates: Partial<CompositionClip>) => {
    setClips(prev =>
      prev.map(c => c.id === clipId ? { ...c, ...updates } : c)
    );
  }, []);

  // 移除片段
  const removeClip = useCallback((clipId: string) => {
    setClips(prev => prev.filter(c => c.id !== clipId));
    setSelectedClipId(prev => prev === clipId ? null : prev);
  }, []);

  // 添加片段到时间线末尾
  const addClip = useCallback((clip: CompositionClip) => {
    setClips(prev => [...prev, clip]);
  }, []);

  // 添加整集所有片段
  const addEpisodeClips = useCallback((episodeClips: CompositionClip[]) => {
    setClips(prev => {
      const existingIds = new Set(prev.map(c => c.id));
      const newClips = episodeClips.filter(c => !existingIds.has(c.id));
      return [...prev, ...newClips];
    });
  }, []);

  // 清空时间线
  const clearTimeline = useCallback(() => {
    setClips([]);
    setSelectedClipId(null);
    setCurrentTime(0);
    setPlaying(false);
  }, []);

  const selectedClip = clips.find(c => c.id === selectedClipId) || null;

  const state: TimelineState = {
    clips,
    currentTime,
    totalDuration,
    selectedClipId,
    playing,
    zoom
  };

  return {
    state,
    clips,
    selectedClip,
    selectedClipId,
    currentTime,
    totalDuration,
    playing,
    zoom,
    syncClips,
    setCurrentTime,
    setPlaying,
    setZoom,
    handleReorder,
    selectClip,
    updateClip,
    removeClip,
    addClip,
    addEpisodeClips,
    clearTimeline
  };
}
