/**
 * BGM 管理 Hook
 * 管理背景音乐的上传、播放、音量控制
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { BGMTrack } from '../types';

interface UseBGMOptions {
  onError?: (message: string) => void;
}

export function useBGM(options: UseBGMOptions = {}) {
  const { onError } = options;
  const [bgm, setBgm] = useState<BGMTrack | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 初始化 audio 元素
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  // BGM 变化时更新 audio
  useEffect(() => {
    if (!audioRef.current) return;
    if (bgm) {
      audioRef.current.src = bgm.url;
      audioRef.current.volume = bgm.volume;
      audioRef.current.loop = bgm.loop;
    } else {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
  }, [bgm?.url, bgm?.loop]);

  // 音量变化
  useEffect(() => {
    if (audioRef.current && bgm) {
      audioRef.current.volume = bgm.volume;
    }
  }, [bgm?.volume]);

  // 上传 BGM 文件
  const uploadBGM = useCallback((file: File) => {
    // 释放旧的 blob URL
    if (bgm?.url && bgm.url.startsWith('blob:')) {
      URL.revokeObjectURL(bgm.url);
    }

    const url = URL.createObjectURL(file);
    const audio = new Audio(url);

    audio.addEventListener('loadedmetadata', () => {
      setBgm({
        id: `bgm-${Date.now()}`,
        name: file.name,
        url,
        file,
        duration: audio.duration,
        volume: 0.5,
        startOffset: 0,
        loop: true
      });
    });

    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      onError?.('无法加载音频文件');
    });
  }, [bgm, onError]);

  // 更新 BGM 属性
  const updateBGM = useCallback((updates: Partial<BGMTrack>) => {
    setBgm(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  // 移除 BGM
  const removeBGM = useCallback(() => {
    if (bgm?.url && bgm.url.startsWith('blob:')) {
      URL.revokeObjectURL(bgm.url);
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setBgm(null);
  }, [bgm]);

  // 播放/暂停 BGM（跟随视频播放状态）
  const syncPlayState = useCallback((playing: boolean) => {
    if (!audioRef.current || !bgm) return;
    if (playing) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [bgm]);

  // 同步时间位置
  const syncTime = useCallback((globalTime: number) => {
    if (!audioRef.current || !bgm) return;
    const bgmTime = (globalTime + bgm.startOffset) % (bgm.duration || 1);
    // 只在差距较大时才 seek，避免频繁跳转
    if (Math.abs(audioRef.current.currentTime - bgmTime) > 1) {
      audioRef.current.currentTime = bgmTime;
    }
  }, [bgm]);

  return {
    bgm,
    audioRef,
    uploadBGM,
    updateBGM,
    removeBGM,
    syncPlayState,
    syncTime
  };
}
