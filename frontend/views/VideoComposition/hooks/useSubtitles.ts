/**
 * 字幕管理 Hook
 * 基于分镜 dialogue 自动生成字幕，支持编辑
 */

import { useState, useCallback } from 'react';
import type { CompositionClip, SubtitleItem, SubtitleStyle } from '../types';

const DEFAULT_STYLE: SubtitleStyle = {
  fontFamily: 'sans-serif',
  fontSize: 24,
  color: '#FFFFFF',
  bgColor: 'rgba(0,0,0,0.6)',
  position: 'bottom',
  bold: true
};

export function useSubtitles() {
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [style, setStyle] = useState<SubtitleStyle>(DEFAULT_STYLE);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);

  // 从时间线片段自动生成字幕
  const generateFromClips = useCallback((clips: CompositionClip[]) => {
    let timeOffset = 0;
    const items: SubtitleItem[] = [];

    for (const clip of clips) {
      if (clip.dialogue && clip.dialogue.trim()) {
        const effectiveDuration = Math.max(clip.duration - clip.trimStart - clip.trimEnd, 0.5);
        items.push({
          id: `sub-${clip.id}`,
          clipId: clip.id,
          text: clip.dialogue.trim(),
          startTime: timeOffset,
          endTime: timeOffset + effectiveDuration
        });
      }
      timeOffset += Math.max(clip.duration - clip.trimStart - clip.trimEnd, 0.5);
    }

    setSubtitles(items);
  }, []);

  // 添加字幕
  const addSubtitle = useCallback((clipId: string, text: string, startTime: number, endTime: number) => {
    const id = `sub-${Date.now()}`;
    setSubtitles(prev => [...prev, { id, clipId, text, startTime, endTime }]);
    return id;
  }, []);

  // 更新字幕
  const updateSubtitle = useCallback((id: string, updates: Partial<SubtitleItem>) => {
    setSubtitles(prev =>
      prev.map(s => s.id === id ? { ...s, ...updates } : s)
    );
  }, []);

  // 删除字幕
  const removeSubtitle = useCallback((id: string) => {
    setSubtitles(prev => prev.filter(s => s.id !== id));
    setSelectedSubtitleId(prev => prev === id ? null : prev);
  }, []);

  // 清空字幕
  const clearSubtitles = useCallback(() => {
    setSubtitles([]);
    setSelectedSubtitleId(null);
  }, []);

  // 更新样式
  const updateStyle = useCallback((updates: Partial<SubtitleStyle>) => {
    setStyle(prev => ({ ...prev, ...updates }));
  }, []);

  const selectedSubtitle = subtitles.find(s => s.id === selectedSubtitleId) || null;

  return {
    subtitles,
    style,
    selectedSubtitleId,
    selectedSubtitle,
    setSelectedSubtitleId,
    generateFromClips,
    addSubtitle,
    updateSubtitle,
    removeSubtitle,
    clearSubtitles,
    updateStyle
  };
}
