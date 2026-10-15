/**
 * 字幕轨道组件
 * 显示字幕条目，支持选中编辑
 */

import React from 'react';
import { Button, Input, Textarea } from '@heroui/react';
import { Type, Plus, Trash2, Wand2 } from 'lucide-react';
import type { SubtitleItem, CompositionClip } from '../types';

interface SubtitleTrackProps {
  subtitles: SubtitleItem[];
  clips: CompositionClip[];
  selectedSubtitleId: string | null;
  totalDuration: number;
  zoom: number;
  onSelectSubtitle: (id: string | null) => void;
  onUpdateSubtitle: (id: string, updates: Partial<SubtitleItem>) => void;
  onRemoveSubtitle: (id: string) => void;
  onGenerateFromClips: (clips: CompositionClip[]) => void;
}

const SubtitleTrack: React.FC<SubtitleTrackProps> = ({
  subtitles,
  clips,
  selectedSubtitleId,
  totalDuration,
  zoom,
  onSelectSubtitle,
  onUpdateSubtitle,
  onRemoveSubtitle,
  onGenerateFromClips
}) => {
  return (
    <div className="bg-slate-800 rounded-lg overflow-hidden flex flex-col">
      {/* 轨道标题栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-700/50 border-b border-slate-600">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-300">🔤 字幕轨</span>
          <span className="text-xs text-slate-500">{subtitles.length} 条字幕</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm" variant="light"
            className="text-amber-400 hover:text-amber-300 h-6 text-xs px-2"
            startContent={<Wand2 className="w-3 h-3" />}
            onPress={() => onGenerateFromClips(clips)}
          >
            自动生成
          </Button>
        </div>
      </div>

      {/* 字幕条目 */}
      <div className="overflow-x-auto overflow-y-hidden p-3">
        {subtitles.length === 0 ? (
          <div className="text-center text-slate-500 py-2">
            <p className="text-xs">暂无字幕 · 点击「自动生成」从分镜台词创建</p>
          </div>
        ) : (
          <div className="relative min-h-[36px]" style={{ width: `${Math.max(totalDuration * 60 * zoom, 300)}px` }}>
            {subtitles.map((sub) => {
              const left = totalDuration > 0 ? (sub.startTime / totalDuration) * 100 : 0;
              const width = totalDuration > 0 ? ((sub.endTime - sub.startTime) / totalDuration) * 100 : 10;
              const isSelected = selectedSubtitleId === sub.id;

              return (
                <div
                  key={sub.id}
                  className={`absolute top-0 h-[36px] rounded cursor-pointer transition-colors border text-xs flex items-center px-2 truncate
                    ${isSelected
                      ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                      : 'bg-slate-600/50 border-slate-500 text-slate-300 hover:border-slate-400'
                    }`}
                  style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                  onClick={() => onSelectSubtitle(sub.id)}
                  title={sub.text}
                >
                  {sub.text}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubtitleTrack;
