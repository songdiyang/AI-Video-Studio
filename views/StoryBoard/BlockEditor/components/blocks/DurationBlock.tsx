/**
 * 时长积木块
 */

import React from 'react';
import { BlockBase, DurationBlockData } from '../../types/blockTypes';
import { getBlockDefinition } from '../../utils/blockRegistry';

interface DurationBlockProps {
  block: BlockBase & { data: DurationBlockData };
  isSelected?: boolean;
  onChange?: (data: DurationBlockData) => void;
}

const DurationBlock: React.FC<DurationBlockProps> = ({ block, isSelected, onChange }) => {
  const definition = getBlockDefinition('duration');
  const { seconds } = block.data;

  const presets = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];

  return (
    <div
      className={`
        relative rounded-lg border-2 p-3 min-w-[160px]
        ${isSelected ? 'border-amber-500 ring-2 ring-amber-200' : 'border-amber-300'}
        bg-amber-50 hover:bg-amber-100 transition-colors
      `}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{definition.icon}</span>
        <span className="text-sm font-medium text-amber-700">{definition.label}</span>
      </div>

      {/* 时长滑块 */}
      <div className="mb-3">
        <input
          type="range"
          min="0.5"
          max="60"
          step="0.5"
          value={seconds}
          onChange={(e) => onChange?.({ seconds: parseFloat(e.target.value) })}
          className="w-full h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>0.5s</span>
          <span>60s</span>
        </div>
      </div>

      {/* 数值显示 */}
      <div className="flex items-center gap-2 mb-2">
        <input
          type="number"
          min="0.5"
          max="60"
          step="0.5"
          value={seconds}
          onChange={(e) => onChange?.({ seconds: parseFloat(e.target.value) || 3 })}
          className="
            w-20 p-2 text-sm text-center
            bg-white border border-amber-200 rounded
            focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400
          "
        />
        <span className="text-sm text-slate-600">秒</span>
      </div>

      {/* 快捷预设 */}
      <div className="flex flex-wrap gap-1">
        {presets.map((preset) => (
          <button
            key={preset}
            onClick={() => onChange?.({ seconds: preset })}
            className={`
              px-2 py-1 rounded text-xs
              transition-colors
              ${seconds === preset
                ? 'bg-amber-500 text-white'
                : 'bg-white text-slate-600 hover:bg-amber-100 border border-amber-200'
              }
            `}
          >
            {preset}s
          </button>
        ))}
      </div>
    </div>
  );
};

export default DurationBlock;
