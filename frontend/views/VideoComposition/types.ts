/**
 * 视频合成模块类型定义
 */

export interface CompositionClip {
  id: string;
  storyboardId: number;
  scriptId: number;
  episodeNumber: number;
  order: number;
  videoUrl: string;
  description: string;
  dialogue: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
  transition: TransitionType;
  volume: number;
}

export type TransitionType = 'none' | 'fade' | 'black';

export interface EpisodeGroup {
  scriptId: number;
  episodeNumber: number;
  title: string;
  clips: CompositionClip[];
  expanded: boolean;
}

export interface TimelineState {
  clips: CompositionClip[];
  currentTime: number;
  totalDuration: number;
  selectedClipId: string | null;
  playing: boolean;
  zoom: number;
}

export interface ExportOptions {
  format: 'mp4' | 'webm';
  resolution: '480p' | '720p' | '1080p' | '1440p' | '4k';
  fps: 24 | 30 | 60;
  quality: 'low' | 'medium' | 'high';
}

export interface ExportProgress {
  stage: 'idle' | 'loading' | 'processing' | 'done' | 'error';
  percent: number;
  message: string;
  detail?: string;
  currentStep?: number;
  totalSteps?: number;
  startTime?: number;
  debugLogs?: string[];
}

export interface SubtitleItem {
  id: string;
  clipId: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  bgColor: string;
  position: 'top' | 'center' | 'bottom';
  bold: boolean;
}

export interface BGMTrack {
  id: string;
  name: string;
  url: string;
  file?: File;
  duration: number;
  volume: number;
  startOffset: number;
  loop: boolean;
}
