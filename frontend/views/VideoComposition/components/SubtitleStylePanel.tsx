/**
 * 字幕样式面板
 * 编辑字幕的字体、大小、颜色、位置
 */

import React from 'react';
import { Button, Input, Select, SelectItem, Slider } from '@heroui/react';
import { Type, Bold, AlignCenter } from 'lucide-react';
import type { SubtitleStyle, SubtitleItem } from '../types';

interface SubtitleStylePanelProps {
  style: SubtitleStyle;
  selectedSubtitle: SubtitleItem | null;
  onUpdateStyle: (updates: Partial<SubtitleStyle>) => void;
  onUpdateSubtitle: (id: string, updates: Partial<SubtitleItem>) => void;
  onRemoveSubtitle: (id: string) => void;
}

const FONT_OPTIONS = [
  { key: 'sans-serif', label: '默认无衬线' },
  { key: 'serif', label: '衬线体' },
  { key: '"Microsoft YaHei"', label: '微软雅黑' },
  { key: '"SimHei"', label: '黑体' },
  { key: 'monospace', label: '等宽字体' },
];

const POSITION_OPTIONS = [
  { key: 'top', label: '顶部' },
  { key: 'center', label: '居中' },
  { key: 'bottom', label: '底部' },
];

const SubtitleStylePanel: React.FC<SubtitleStylePanelProps> = ({
  style,
  selectedSubtitle,
  onUpdateStyle,
  onUpdateSubtitle,
  onRemoveSubtitle
}) => {
  return (
    <div className="space-y-5">
      {/* 全局字幕样式 */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Type className="w-3.5 h-3.5" />
          字幕样式
        </h4>

        <div className="space-y-3">
          {/* 字体 */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">字体</label>
            <Select
              size="sm"
              selectedKeys={[style.fontFamily]}
              onChange={(e) => onUpdateStyle({ fontFamily: e.target.value })}
              classNames={{
                trigger: "bg-slate-800/60 border border-slate-600/50 h-8",
                value: "text-xs"
              }}
            >
              {FONT_OPTIONS.map(opt => (
                <SelectItem key={opt.key}>{opt.label}</SelectItem>
              ))}
            </Select>
          </div>

          {/* 字号 */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">字号</span>
              <span className="text-slate-300 font-mono">{style.fontSize}px</span>
            </div>
            <Slider
              size="sm"
              step={1}
              minValue={12}
              maxValue={48}
              value={style.fontSize}
              onChange={(val) => onUpdateStyle({ fontSize: val as number })}
              className="max-w-full"
            />
          </div>

          {/* 颜色 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-slate-500 mb-1 block">文字颜色</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={style.color}
                  onChange={(e) => onUpdateStyle({ color: e.target.value })}
                  className="w-7 h-7 rounded border border-slate-600/50 cursor-pointer"
                />
                <span className="text-xs text-slate-400 font-mono">{style.color}</span>
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-500 mb-1 block">背景颜色</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={style.bgColor.startsWith('rgba') ? '#000000' : style.bgColor}
                  onChange={(e) => onUpdateStyle({ bgColor: e.target.value + '99' })}
                  className="w-7 h-7 rounded border border-slate-600/50 cursor-pointer"
                />
                <span className="text-xs text-slate-400 font-mono truncate">{style.bgColor.substring(0, 9)}</span>
              </div>
            </div>
          </div>

          {/* 位置 + 粗体 */}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-slate-500 mb-1 block">位置</label>
              <Select
                size="sm"
                selectedKeys={[style.position]}
                onChange={(e) => onUpdateStyle({ position: e.target.value as SubtitleStyle['position'] })}
                classNames={{
                  trigger: "bg-slate-800/60 border border-slate-600/50 h-8",
                  value: "text-xs"
                }}
              >
                {POSITION_OPTIONS.map(opt => (
                  <SelectItem key={opt.key}>{opt.label}</SelectItem>
                ))}
              </Select>
            </div>
            <Button
              size="sm"
              variant={style.bold ? 'solid' : 'flat'}
              className={`min-w-9 h-8 ${style.bold ? 'bg-blue-500 text-white' : 'bg-slate-800/60 text-slate-400'}`}
              isIconOnly
              onPress={() => onUpdateStyle({ bold: !style.bold })}
              title="粗体"
            >
              <Bold className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* 预览 */}
          <div className="bg-slate-900 rounded-lg p-4 flex items-center justify-center min-h-[60px]">
            <span
              style={{
                fontFamily: style.fontFamily,
                fontSize: `${Math.min(style.fontSize, 20)}px`,
                color: style.color,
                backgroundColor: style.bgColor,
                fontWeight: style.bold ? 'bold' : 'normal',
                padding: '2px 8px',
                borderRadius: '4px'
              }}
            >
              字幕预览效果
            </span>
          </div>
        </div>
      </div>

      {/* 选中字幕编辑 */}
      {selectedSubtitle && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">编辑字幕</h4>
          <div className="space-y-3 bg-slate-800/40 rounded-lg p-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">内容</label>
              <Input
                size="sm"
                value={selectedSubtitle.text}
                onValueChange={(val) => onUpdateSubtitle(selectedSubtitle.id, { text: val })}
                classNames={{
                  input: "text-xs",
                  inputWrapper: "bg-slate-800/60 border border-slate-600/50 h-8"
                }}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">开始 (s)</label>
                <Input
                  size="sm"
                  type="number"
                  step={0.1}
                  value={String(selectedSubtitle.startTime.toFixed(1))}
                  onValueChange={(val) => onUpdateSubtitle(selectedSubtitle.id, { startTime: parseFloat(val) || 0 })}
                  classNames={{
                    input: "text-xs font-mono",
                    inputWrapper: "bg-slate-800/60 border border-slate-600/50 h-8"
                  }}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">结束 (s)</label>
                <Input
                  size="sm"
                  type="number"
                  step={0.1}
                  value={String(selectedSubtitle.endTime.toFixed(1))}
                  onValueChange={(val) => onUpdateSubtitle(selectedSubtitle.id, { endTime: parseFloat(val) || 0 })}
                  classNames={{
                    input: "text-xs font-mono",
                    inputWrapper: "bg-slate-800/60 border border-slate-600/50 h-8"
                  }}
                />
              </div>
            </div>
            <Button
              size="sm"
              variant="flat"
              className="w-full bg-red-500/10 text-red-400 text-xs"
              onPress={() => onRemoveSubtitle(selectedSubtitle.id)}
            >
              删除此字幕
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubtitleStylePanel;
