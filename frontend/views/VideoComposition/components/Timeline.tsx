/**
 * 时间线轨道组件
 * 视频轨道 + 拖拽排序
 */

import React, { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@heroui/react';
import { Trash2, GripVertical, ZoomIn, ZoomOut } from 'lucide-react';
import type { CompositionClip } from '../types';

interface TimelineProps {
  clips: CompositionClip[];
  selectedClipId: string | null;
  zoom: number;
  onSelectClip: (clipId: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onRemoveClip: (clipId: string) => void;
  onZoomChange: (zoom: number) => void;
}

const Timeline: React.FC<TimelineProps> = ({
  clips,
  selectedClipId,
  zoom,
  onSelectClip,
  onReorder,
  onRemoveClip,
  onZoomChange
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  }, [onReorder]);

  const totalDuration = clips.reduce((sum, c) => sum + Math.max(c.duration - c.trimStart - c.trimEnd, 0.5), 0);

  if (clips.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 flex items-center justify-center min-h-[140px]">
        <div className="text-center text-slate-500">
          <p className="text-sm">时间线为空</p>
          <p className="text-xs mt-1">从左侧列表添加片段到时间线</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg overflow-hidden flex flex-col min-h-[140px]">
      {/* 轨道标题栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-700/50 border-b border-slate-600">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-300">🎬 视频轨</span>
          <span className="text-xs text-slate-500">{clips.length} 个片段 · {formatDuration(totalDuration)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            isIconOnly size="sm" variant="light"
            className="text-slate-400 hover:text-white min-w-6 w-6 h-6"
            onPress={() => onZoomChange(Math.max(0.5, zoom - 0.25))}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <Button
            isIconOnly size="sm" variant="light"
            className="text-slate-400 hover:text-white min-w-6 w-6 h-6"
            onPress={() => onZoomChange(Math.min(3, zoom + 0.25))}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* 轨道内容 */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-3">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={clips.map(c => c.id)} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-1.5 items-stretch min-h-[80px]">
              {clips.map((clip, idx) => (
                <SortableClip
                  key={clip.id}
                  clip={clip}
                  index={idx}
                  isSelected={selectedClipId === clip.id}
                  zoom={zoom}
                  onSelect={() => onSelectClip(clip.id)}
                  onRemove={() => onRemoveClip(clip.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};

interface SortableClipProps {
  clip: CompositionClip;
  index: number;
  isSelected: boolean;
  zoom: number;
  onSelect: () => void;
  onRemove: () => void;
}

const SortableClip: React.FC<SortableClipProps> = ({
  clip,
  index,
  isSelected,
  zoom,
  onSelect,
  onRemove
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: clip.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  // 宽度基于时长，最小 60px
  const effectiveDuration = Math.max(clip.duration - clip.trimStart - clip.trimEnd, 0.5);
  const width = Math.max(60, effectiveDuration * 60 * zoom);

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, width: `${width}px` }}
      className={`flex-shrink-0 rounded-md border cursor-pointer transition-colors group relative
        ${isSelected
          ? 'bg-blue-600/30 border-blue-500 ring-1 ring-blue-400/50'
          : 'bg-slate-700/60 border-slate-600 hover:border-slate-500'
        }
        ${isDragging ? 'z-10 shadow-lg' : ''}`}
      onClick={onSelect}
    >
      {/* 拖拽手柄 */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* 内容 */}
      <div className="px-5 py-2 h-full flex flex-col justify-between min-h-[72px]">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-bold ${isSelected ? 'text-blue-300' : 'text-slate-300'}`}>
            {index + 1}
          </span>
          <Button
            isIconOnly size="sm" variant="light"
            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 min-w-5 w-5 h-5"
            onPress={(e) => { onRemove(); }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>

        <div className="flex-1 flex items-center">
          <p className="text-xs text-slate-400 truncate leading-tight">
            {clip.description.substring(0, 20) || clip.dialogue.substring(0, 20) || '—'}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-500">
            E{clip.episodeNumber}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            {formatDuration(effectiveDuration)}
          </span>
        </div>
      </div>

      {/* 转场标记 */}
      {clip.transition !== 'none' && (
        <div className="absolute -right-2 top-1/2 -translate-y-1/2 z-10 bg-amber-500 rounded-full w-3.5 h-3.5 flex items-center justify-center">
          <span className="text-[8px] text-white font-bold">
            {clip.transition === 'fade' ? 'F' : 'B'}
          </span>
        </div>
      )}
    </div>
  );
};

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default Timeline;
