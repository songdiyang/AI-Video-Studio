/**
 * 文本描述积木块
 */

import React from 'react';
import { BlockBase, TextBlockData } from '../../types/blockTypes';
import { getBlockDefinition } from '../../utils/blockRegistry';

interface TextBlockProps {
  block: BlockBase & { data: TextBlockData };
  isSelected?: boolean;
  onChange?: (data: TextBlockData) => void;
}

const TextBlock: React.FC<TextBlockProps> = ({ block, isSelected, onChange }) => {
  const definition = getBlockDefinition('text');
  const { text } = block.data;

  return (
    <div
      className={`
        relative rounded-lg border-2 p-3 min-w-[280px]
        ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-300'}
        bg-slate-50 hover:bg-slate-100 transition-colors
      `}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{definition.icon}</span>
        <span className="text-sm font-medium text-slate-700">{definition.label}</span>
      </div>

      {/* 文本输入 */}
      <textarea
        value={text}
        onChange={(e) => onChange?.({ text: e.target.value })}
        placeholder="输入分镜描述..."
        className="
          w-full min-h-[60px] p-2 text-sm
          bg-white border border-slate-200 rounded
          focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400
          resize-none
        "
        rows={2}
      />
    </div>
  );
};

export default TextBlock;
