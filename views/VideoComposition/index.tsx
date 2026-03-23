/**
 * 视频合成主页面
 * 组合所有子组件：侧边栏、合成预览、时间线多轨道、属性面板、导出工具栏
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@heroui/react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import EpisodeSidebar from './components/EpisodeSidebar';
import VideoPreview from './components/VideoPreview';
import ClipPreviewModal from './components/ClipPreviewModal';
import Timeline from './components/Timeline';
import SubtitleTrack from './components/SubtitleTrack';
import AudioTrack from './components/AudioTrack';
import ClipProperties from './components/ClipProperties';
import SubtitleStylePanel from './components/SubtitleStylePanel';
import ExportToolbar from './components/ExportToolbar';
import { useCompositionData } from './hooks/useCompositionData';
import { useTimeline } from './hooks/useTimeline';
import { useSubtitles } from './hooks/useSubtitles';
import { useBGM } from './hooks/useBGM';
import { useFFmpegExport } from './hooks/useFFmpegExport';
import { useToast } from '../../contexts/ToastContext';
import { useKeyboardShortcuts, ShortcutConfig, VIDEO_COMPOSITION_SHORTCUTS_CONFIG } from '../../hooks/useKeyboardShortcuts';
import type { CompositionClip, ExportOptions } from './types';

interface VideoCompositionProps {
  projectId: number | null;
  projectName?: string;
}

const VideoComposition: React.FC<VideoCompositionProps> = ({ projectId, projectName }) => {
  const { showToast } = useToast();
  const compositionData = useCompositionData(projectId);
  const timeline = useTimeline(compositionData.currentClips);
  const subtitles = useSubtitles();
  const bgm = useBGM({ onError: (msg) => showToast(msg, 'error') });
  const ffmpeg = useFFmpegExport();

  // 右侧面板
  const [showPanel, setShowPanel] = useState(true);
  const [panelTab, setPanelTab] = useState<'clip' | 'subtitle'>('clip');

  // 单个分镜预览弹窗
  const [previewClip, setPreviewClip] = useState<CompositionClip | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // 导出设置
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'mp4',
    resolution: '1080p',
    fps: 30,
    quality: 'high',
  });

  // 侧边栏片段点击 → 弹窗预览
  const handlePreviewClip = useCallback((clip: CompositionClip) => {
    setPreviewClip(clip);
    setPreviewOpen(true);
  }, []);

  // 合成预览检测到片段时长
  const handleDurationDetected = useCallback((clipId: string, duration: number) => {
    timeline.updateClip(clipId, { duration });
  }, [timeline.updateClip]);

  // 合成预览当前播放片段变化 → 高亮时间线
  const handleCurrentClipChange = useCallback((clipId: string | null) => {
    if (clipId) timeline.selectClip(clipId);
  }, [timeline.selectClip]);

  // BGM 跟随播放状态
  const handlePlayingChange = useCallback((playing: boolean) => {
    timeline.setPlaying(playing);
    bgm.syncPlayState(playing);
  }, [timeline.setPlaying, bgm.syncPlayState]);

  // 导出
  const handleExport = useCallback(async () => {
    if (timeline.clips.length === 0) return;
    const url = await ffmpeg.exportVideo(timeline.clips, exportOptions);
    if (url) {
      const filename = `composition_ep${compositionData.selectedEpisode || 1}`;
      ffmpeg.downloadVideo(url, filename, exportOptions.format);
    }
  }, [timeline.clips, ffmpeg, compositionData.selectedEpisode, exportOptions]);

  // 视频合成快捷键
  const compositionShortcuts = useMemo<ShortcutConfig[]>(() => [
    {
      ...VIDEO_COMPOSITION_SHORTCUTS_CONFIG.PLAY_PAUSE,
      action: () => {
        timeline.setPlaying(!timeline.playing);
      },
    },
    {
      ...VIDEO_COMPOSITION_SHORTCUTS_CONFIG.PREV_CLIP,
      action: () => {
        if (timeline.clips.length === 0) return;
        const currentIndex = timeline.clips.findIndex(c => c.id === timeline.selectedClipId);
        if (currentIndex > 0) {
          timeline.selectClip(timeline.clips[currentIndex - 1].id);
        }
      },
    },
    {
      ...VIDEO_COMPOSITION_SHORTCUTS_CONFIG.NEXT_CLIP,
      action: () => {
        if (timeline.clips.length === 0) return;
        const currentIndex = timeline.clips.findIndex(c => c.id === timeline.selectedClipId);
        if (currentIndex < timeline.clips.length - 1) {
          timeline.selectClip(timeline.clips[currentIndex + 1].id);
        }
      },
    },
    {
      ...VIDEO_COMPOSITION_SHORTCUTS_CONFIG.DELETE_CLIP,
      action: () => {
        if (timeline.selectedClipId) {
          timeline.removeClip(timeline.selectedClipId);
        }
      },
    },
    {
      ...VIDEO_COMPOSITION_SHORTCUTS_CONFIG.EXPORT_VIDEO,
      action: () => {
        handleExport();
      },
    },
    {
      ...VIDEO_COMPOSITION_SHORTCUTS_CONFIG.CLEAR_TIMELINE,
      action: () => {
        timeline.clearTimeline();
      },
    },
    {
      ...VIDEO_COMPOSITION_SHORTCUTS_CONFIG.ZOOM_IN,
      action: () => {
        timeline.setZoom(Math.min(timeline.zoom * 1.2, 5));
      },
    },
    {
      ...VIDEO_COMPOSITION_SHORTCUTS_CONFIG.ZOOM_OUT,
      action: () => {
        timeline.setZoom(Math.max(timeline.zoom / 1.2, 0.5));
      },
    },
    {
      ...VIDEO_COMPOSITION_SHORTCUTS_CONFIG.RESET_ZOOM,
      action: () => {
        timeline.setZoom(1);
      },
    },
    {
      ...VIDEO_COMPOSITION_SHORTCUTS_CONFIG.TOGGLE_PANEL,
      action: () => {
        setShowPanel(prev => !prev);
      },
    },
    {
      ...VIDEO_COMPOSITION_SHORTCUTS_CONFIG.MUTE_TOGGLE,
      action: () => {
        // 切换静音状态 - 需要VideoPreview组件支持
        showToast('静音切换功能开发中', 'info');
      },
    },
    {
      ...VIDEO_COMPOSITION_SHORTCUTS_CONFIG.FULLSCREEN,
      action: () => {
        // 全屏预览
        const videoElement = document.querySelector('video');
        if (videoElement && videoElement.requestFullscreen) {
          videoElement.requestFullscreen();
        }
      },
    },
  ], [timeline, handleExport, showToast]);

  // 注册快捷键
  useKeyboardShortcuts(compositionShortcuts, true);

  return (
    <div className="h-full flex flex-col bg-[#0c0e1a] overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：集列表 + 分镜视频 */}
        <EpisodeSidebar
          episodes={compositionData.episodes}
          selectedEpisode={compositionData.selectedEpisode}
          loading={compositionData.loading}
          projectName={projectName || ''}
          onSelectEpisode={compositionData.setSelectedEpisode}
          onToggleEpisode={compositionData.toggleEpisode}
          onPreviewClip={handlePreviewClip}
          onAddEpisodeToTimeline={timeline.addEpisodeClips}
          onAddClipToTimeline={timeline.addClip}
        />

        {/* 中间主区域 */}
        <div className="flex-1 flex flex-col min-w-0 p-4 gap-3">
          {/* 上：合成预览播放器 */}
          <div className="flex-1 min-h-0">
            <VideoPreview
              clips={timeline.clips}
              playing={timeline.playing}
              onPlayingChange={handlePlayingChange}
              onDurationDetected={handleDurationDetected}
              onCurrentClipChange={handleCurrentClipChange}
            />
          </div>

          {/* 下：多轨道时间线 */}
          <div className="flex flex-col gap-1.5">
            <Timeline
              clips={timeline.clips}
              selectedClipId={timeline.selectedClipId}
              zoom={timeline.zoom}
              onSelectClip={timeline.selectClip}
              onReorder={timeline.handleReorder}
              onRemoveClip={timeline.removeClip}
              onZoomChange={timeline.setZoom}
            />
            <SubtitleTrack
              subtitles={subtitles.subtitles}
              clips={timeline.clips}
              selectedSubtitleId={subtitles.selectedSubtitleId}
              totalDuration={timeline.totalDuration}
              zoom={timeline.zoom}
              onSelectSubtitle={subtitles.setSelectedSubtitleId}
              onUpdateSubtitle={subtitles.updateSubtitle}
              onRemoveSubtitle={subtitles.removeSubtitle}
              onGenerateFromClips={subtitles.generateFromClips}
            />
            <AudioTrack
              bgm={bgm.bgm}
              totalDuration={timeline.totalDuration}
              zoom={timeline.zoom}
              onUpload={bgm.uploadBGM}
              onUpdate={bgm.updateBGM}
              onRemove={bgm.removeBGM}
            />
          </div>
        </div>

        {/* 右侧：属性面板 */}
        {showPanel && (
          <div className="w-64 flex-shrink-0 border-l border-[var(--border-color)] bg-[var(--bg-nav)] overflow-y-auto flex flex-col">
            {/* 面板 Tab 切换 */}
            <div className="flex border-b border-[var(--border-color)]">
              <button
                className={`flex-1 text-xs font-medium py-2.5 transition-colors ${
                  panelTab === 'clip'
                    ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
                onClick={() => setPanelTab('clip')}
              >
                片段属性
              </button>
              <button
                className={`flex-1 text-xs font-medium py-2.5 transition-colors ${
                  panelTab === 'subtitle'
                    ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
                onClick={() => setPanelTab('subtitle')}
              >
                字幕样式
              </button>
            </div>

            {/* 面板内容 */}
            <div className="flex-1 overflow-y-auto">
              {panelTab === 'clip' ? (
                <ClipProperties
                  clip={timeline.selectedClip}
                  onUpdate={timeline.updateClip}
                  onRemove={timeline.removeClip}
                />
              ) : (
                <div className="p-4">
                  <SubtitleStylePanel
                    style={subtitles.style}
                    selectedSubtitle={subtitles.selectedSubtitle}
                    onUpdateStyle={subtitles.updateStyle}
                    onUpdateSubtitle={subtitles.updateSubtitle}
                    onRemoveSubtitle={subtitles.removeSubtitle}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* 面板切换按钮 */}
        <Button
          isIconOnly
          size="sm"
          variant="light"
          className="absolute right-2 top-2 z-10 text-[var(--text-muted)] hover:text-[var(--accent)]"
          onPress={() => setShowPanel(prev => !prev)}
          title={showPanel ? '收起面板' : '展开面板'}
        >
          {showPanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
        </Button>
      </div>

      {/* 底部工具栏 */}
      <ExportToolbar
        clipCount={timeline.clips.length}
        totalDuration={timeline.totalDuration}
        exportProgress={ffmpeg.progress}
        exportOptions={exportOptions}
        onExport={handleExport}
        onClearTimeline={timeline.clearTimeline}
        onOptionsChange={setExportOptions}
      />

      {/* 单个分镜视频预览弹窗 */}
      <ClipPreviewModal
        clip={previewClip}
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
};

export default VideoComposition;
