/**
 * 片段属性面板
 * 显示和编辑选中片段的属性（转场、时长裁剪、音量等）
 */

import React from 'react';
import { Button, Select, SelectItem, Slider } from '@heroui/react';
import { Scissors, Volume2, Sparkles, Trash2 } from 'lucide-react';
import type { CompositionClip, TransitionType } from '../types';

interface ClipPropertiesProps {
  clip: CompositionClip | null;
  onUpdate: (clipId: string, updates: Partial<CompositionClip>) => void;
  onRemove: (clipId: string) => void;
}

const TRANSITION_OPTIONS: { value: TransitionType; label: string }[] = [
  { value: 'none', label: '无转场' },
  { value: 'fade', label: '淡入淡出' },
  { value: 'black', label: '黑场过渡' }
];

const ClipProperties: React.FC<ClipPropertiesProps> = ({ clip, onUpdate, onRemove }) => {
  if (!clip) {
    return (
      <div className="p-4 text-center text-slate-400">
        <p className="text-sm">选择片段查看属性</p>
      </div>
    );
  }

  const effectiveDuration = Math.max(clip.duration - clip.trimStart - clip.trimEnd, 0);

  return (
    <div className="p-4 space-y-5">
      {/* 片段信息 */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">片段信息</h4>
        <div className="bg-slate-800/40 rounded-lg p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">集数</span>
            <span className="text-slate-300 font-medium">第 {clip.episodeNumber} 集</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">序号</span>
            <span className="text-slate-300 font-medium">#{clip.order + 1}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">原始时长</span>
            <span className="text-slate-300 font-medium font-mono">{clip.duration.toFixed(1)}s</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">有效时长</span>
            <span className="text-blue-400 font-medium font-mono">{effectiveDuration.toFixed(1)}s</span>
          </div>
        </div>
      </div>

      {/* 描述 */}
      {(clip.description || clip.dialogue) && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">描述</h4>
          <p className="text-xs text-slate-400 bg-slate-800/40 rounded-lg p-3 leading-relaxed">
            {clip.description || clip.dialogue}
          </p>
        </div>
      )}

      {/* 裁剪 */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Scissors className="w-3.5 h-3.5" />
          裁剪
        </h4>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">入点</span>
              <span className="text-slate-300 font-mono">{clip.trimStart.toFixed(1)}s</span>
            </div>
            <Slider
              size="sm"
              step={0.1}
              minValue={0}
              maxValue={Math.max(clip.duration - clip.trimEnd - 0.1, 0)}
              value={clip.trimStart}
              onChange={(val) => onUpdate(clip.id, { trimStart: val as number })}
              className="max-w-full"
            />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">出点</span>
              <span className="text-slate-300 font-mono">{clip.trimEnd.toFixed(1)}s</span>
            </div>
            <Slider
              size="sm"
              step={0.1}
              minValue={0}
              maxValue={Math.max(clip.duration - clip.trimStart - 0.1, 0)}
              value={clip.trimEnd}
              onChange={(val) => onUpdate(clip.id, { trimEnd: val as number })}
              className="max-w-full"
            />
          </div>
        </div>
      </div>

      {/* 转场 */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          转场效果
        </h4>
        <Select
          size="sm"
          selectedKeys={[clip.transition]}
          onChange={(e) => onUpdate(clip.id, { transition: e.target.value as TransitionType })}
          classNames={{
            trigger: "bg-slate-800/60 border border-slate-600/50",
            value: "text-sm"
          }}
        >
          {TRANSITION_OPTIONS.map(opt => (
            <SelectItem key={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </Select>
      </div>

      {/* 音量 */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5" />
          音量
        </h4>
        <div className="flex items-center gap-3">
          <Slider
            size="sm"
            step={0.05}
            minValue={0}
            maxValue={1}
            value={clip.volume}
            onChange={(val) => onUpdate(clip.id, { volume: val as number })}
            className="flex-1"
          />
          <span className="text-xs text-slate-400 font-mono w-10 text-right">
            {Math.round(clip.volume * 100)}%
          </span>
        </div>
      </div>

      {/* 移除 */}
      <Button
        size="sm"
        variant="flat"
        className="w-full bg-red-500/10 text-red-400 font-medium"
        startContent={<Trash2 className="w-3.5 h-3.5" />}
        onPress={() => onRemove(clip.id)}
      >
        从时间线移除
      </Button>
    </div>
  );
};

export default ClipProperties;
