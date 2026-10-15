/**
 * BGM 音频轨道组件
 * 上传/管理背景音乐
 */

import React, { useRef } from 'react';
import { Button, Slider } from '@heroui/react';
import { Music, Upload, Trash2, Volume2, Repeat } from 'lucide-react';
import type { BGMTrack } from '../types';

interface AudioTrackProps {
  bgm: BGMTrack | null;
  totalDuration: number;
  zoom: number;
  onUpload: (file: File) => void;
  onUpdate: (updates: Partial<BGMTrack>) => void;
  onRemove: () => void;
}

const AudioTrack: React.FC<AudioTrackProps> = ({
  bgm,
  totalDuration,
  zoom,
  onUpload,
  onUpdate,
  onRemove
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
    // 重置 input 以便重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg overflow-hidden flex flex-col">
      {/* 轨道标题栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-700/50 border-b border-slate-600">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-300">🎵 音频轨</span>
          {bgm && <span className="text-xs text-slate-500 truncate max-w-[120px]">{bgm.name}</span>}
        </div>
        <div className="flex items-center gap-1">
          {bgm && (
            <>
              {/* 音量 */}
              <Volume2 className="w-3 h-3 text-slate-400" />
              <Slider
                size="sm"
                step={0.05}
                minValue={0}
                maxValue={1}
                value={bgm.volume}
                onChange={(val) => onUpdate({ volume: val as number })}
                className="w-20"
                classNames={{ track: "bg-slate-600", filler: "bg-green-500" }}
              />
              <span className="text-[10px] text-slate-500 w-8 text-right font-mono">
                {Math.round(bgm.volume * 100)}%
              </span>

              {/* 循环 */}
              <Button
                isIconOnly size="sm" variant="light"
                className={`min-w-6 w-6 h-6 ${bgm.loop ? 'text-green-400' : 'text-slate-500'}`}
                onPress={() => onUpdate({ loop: !bgm.loop })}
                title={bgm.loop ? '循环播放中' : '单次播放'}
              >
                <Repeat className="w-3 h-3" />
              </Button>

              {/* 删除 */}
              <Button
                isIconOnly size="sm" variant="light"
                className="text-red-400 hover:text-red-300 min-w-6 w-6 h-6"
                onPress={onRemove}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 轨道内容 */}
      <div className="overflow-x-auto overflow-y-hidden p-3 min-h-[36px]">
        {bgm ? (
          <div className="relative h-[36px]" style={{ width: `${Math.max(totalDuration * 60 * zoom, 300)}px` }}>
            {/* BGM 条 */}
            <div
              className="absolute top-0 h-full rounded bg-green-600/30 border border-green-500/50 flex items-center px-3 gap-2"
              style={{
                left: 0,
                width: bgm.loop ? '100%' : `${totalDuration > 0 ? Math.min((bgm.duration / totalDuration) * 100, 100) : 100}%`
              }}
            >
              <Music className="w-3 h-3 text-green-400 flex-shrink-0" />
              <span className="text-xs text-green-300 truncate">{bgm.name}</span>
              <span className="text-[10px] text-green-400/60 flex-shrink-0 font-mono">
                {formatDuration(bgm.duration)}
              </span>
            </div>
          </div>
        ) : (
          <div
            className="flex items-center justify-center h-[36px] border border-dashed border-slate-600 rounded cursor-pointer hover:border-slate-500 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-3.5 h-3.5 text-slate-500 mr-1.5" />
            <span className="text-xs text-slate-500">点击上传背景音乐</span>
          </div>
        )}
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
};

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default AudioTrack;
