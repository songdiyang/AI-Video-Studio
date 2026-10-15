/**
 * 左侧边栏：集列表 + 可折叠分镜视频列表
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button, Chip } from '@heroui/react';
import { ChevronDown, ChevronRight, Film, Play, Plus, ListVideo, Download } from 'lucide-react';
import type { EpisodeGroup, CompositionClip } from '../types';

interface EpisodeSidebarProps {
  episodes: EpisodeGroup[];
  selectedEpisode: number | null;
  loading: boolean;
  projectName: string;
  onSelectEpisode: (episodeNumber: number) => void;
  onToggleEpisode: (episodeNumber: number) => void;
  onPreviewClip: (clip: CompositionClip) => void;
  onAddEpisodeToTimeline: (clips: CompositionClip[]) => void;
  onAddClipToTimeline: (clip: CompositionClip) => void;
}

const EpisodeSidebar: React.FC<EpisodeSidebarProps> = ({
  episodes,
  selectedEpisode,
  loading,
  projectName,
  onSelectEpisode,
  onToggleEpisode,
  onPreviewClip,
  onAddEpisodeToTimeline,
  onAddClipToTimeline
}) => {
  if (loading) {
    return (
      <div className="w-64 flex-shrink-0 border-r border-slate-700/50 bg-slate-900/60 flex items-center justify-center">
        <div className="text-center text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3" />
          <p className="text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <div className="w-64 flex-shrink-0 border-r border-slate-700/50 bg-slate-900/60 flex items-center justify-center">
        <div className="text-center text-slate-500 px-6">
          <ListVideo className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium">暂无视频</p>
          <p className="text-xs mt-1">请先在分镜页面生成视频</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 flex-shrink-0 border-r border-slate-700/50 bg-slate-900/60 flex flex-col">
      {/* 标题 */}
      <div className="p-4 border-b border-slate-700/50">
        <h3 className="text-sm font-bold text-slate-100">视频片段</h3>
        <p className="text-xs text-slate-400 mt-1">
          {episodes.length} 集 · {episodes.reduce((sum, ep) => sum + ep.clips.length, 0)} 个片段
        </p>
      </div>

      {/* 集列表 */}
      <div className="flex-1 overflow-y-auto">
        {episodes.map((episode) => (
          <EpisodeItem
            key={episode.scriptId}
            episode={episode}
            isSelected={selectedEpisode === episode.episodeNumber}
            projectName={projectName}
            onSelect={() => onSelectEpisode(episode.episodeNumber)}
            onToggle={() => onToggleEpisode(episode.episodeNumber)}
            onPreviewClip={onPreviewClip}
            onAddToTimeline={() => onAddEpisodeToTimeline(episode.clips)}
            onAddClipToTimeline={onAddClipToTimeline}
          />
        ))}
      </div>
    </div>
  );
};

interface EpisodeItemProps {
  episode: EpisodeGroup;
  isSelected: boolean;
  projectName: string;
  onSelect: () => void;
  onToggle: () => void;
  onPreviewClip: (clip: CompositionClip) => void;
  onAddToTimeline: () => void;
  onAddClipToTimeline: (clip: CompositionClip) => void;
}

const EpisodeItem: React.FC<EpisodeItemProps> = ({
  episode,
  isSelected,
  projectName,
  onSelect,
  onToggle,
  onPreviewClip,
  onAddToTimeline,
  onAddClipToTimeline
}) => {
  const videoCount = episode.clips.length;

  return (
    <div className={`border-b border-slate-700/30 ${isSelected ? 'bg-blue-500/5' : ''}`}>
      {/* 集标题行 */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-800/40 transition-colors"
        onClick={() => { onSelect(); onToggle(); }}
      >
        <button className="text-slate-500 hover:text-slate-300 flex-shrink-0">
          {episode.expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        <Film className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isSelected ? 'text-blue-400' : 'text-slate-300'}`}>
            第 {episode.episodeNumber} 集
          </p>
        </div>

        <Chip size="sm" variant="flat" className="bg-slate-800/60 text-slate-400 text-xs">
          {videoCount}
        </Chip>

        {videoCount > 0 && (
          <Button
            isIconOnly
            size="sm"
            variant="light"
            className="text-blue-400 hover:text-blue-300 min-w-6 w-6 h-6"
            onPress={(e) => { onAddToTimeline(); }}
            title="添加整集到时间线"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* 分镜视频列表（可折叠） */}
      {episode.expanded && (
        <div className="pb-1">
          {videoCount === 0 ? (
            <p className="text-xs text-slate-400 px-10 py-2">暂无视频片段</p>
          ) : (
            episode.clips.map((clip, idx) => (
              <ClipItem
                key={clip.id}
                clip={clip}
                index={idx}
                projectName={projectName}
                onPreview={() => onPreviewClip(clip)}
                onAdd={() => onAddClipToTimeline(clip)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

interface ClipItemProps {
  clip: CompositionClip;
  index: number;
  projectName: string;
  onPreview: () => void;
  onAdd: () => void;
}

const ClipItem: React.FC<ClipItemProps> = ({ clip, index, projectName, onPreview, onAdd }) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!clip.videoUrl || downloading) return;
    setContextMenu(null);
    setDownloading(true);
    try {
      const res = await fetch(clip.videoUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const name = projectName || '分镜';
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${name}_第${clip.episodeNumber}集_片段${index + 1}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('下载失败:', err);
    } finally {
      setDownloading(false);
    }
  }, [clip.videoUrl, clip.episodeNumber, index, projectName, downloading]);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleScroll = () => setContextMenu(null);
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [contextMenu]);

  return (
    <>
      <div
        className="flex items-center gap-2 px-4 pl-10 py-1.5 cursor-pointer transition-colors group hover:bg-slate-800/40 text-slate-400"
        onClick={onPreview}
        onContextMenu={handleContextMenu}
      >
        <Play className="w-3 h-3 flex-shrink-0 text-slate-400 group-hover:text-blue-500" />
        <span className="text-xs font-medium flex-shrink-0">#{index + 1}</span>
        <span className="text-xs truncate flex-1 opacity-80">
          {clip.description.substring(0, 30) || clip.dialogue.substring(0, 30) || '无描述'}
        </span>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          className="opacity-0 group-hover:opacity-100 text-blue-500 min-w-5 w-5 h-5"
          onPress={onAdd}
          title="添加到时间线"
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-slate-900/95 backdrop-blur-xl rounded-lg shadow-lg border border-slate-700/50 py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-blue-500/10 hover:text-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleDownload}
            disabled={!clip.videoUrl || downloading}
          >
            <Download className={`w-4 h-4 ${downloading ? 'animate-pulse' : ''}`} />
            <span>{downloading ? '下载中...' : '下载分镜视频'}</span>
          </button>
        </div>
      )}
    </>
  );
};

export default EpisodeSidebar;
