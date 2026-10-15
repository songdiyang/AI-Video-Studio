/**
 * 动作类型积木块
 */

import React from 'react';
import { BlockBase, ActionBlockData } from '../../types/blockTypes';
import { getBlockDefinition, BLOCK_OPTIONS } from '../../utils/blockRegistry';

interface ActionBlockProps {
  block: BlockBase & { data: ActionBlockData };
  isSelected?: boolean;
  onChange?: (data: ActionBlockData) => void;
}

const ActionBlock: React.FC<ActionBlockProps> = ({ block, isSelected, onChange }) => {
  const definition = getBlockDefinition('action');
  const { type, customType } = block.data;

  return (
    <div
      className={`
        relative rounded-lg border-2 p-3 min-w-[200px]
        ${isSelected ? 'border-amber-500 ring-2 ring-amber-200' : 'border-amber-300'}
        bg-amber-50 hover:bg-amber-100 transition-colors
      `}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{definition.icon}</span>
        <span className="text-sm font-medium text-amber-700">{definition.label}</span>
      </div>

      {/* 动作类型选择 */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        {BLOCK_OPTIONS.actionType.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange?.({ type: option.value as ActionBlockData['type'], customType })}
            className={`
              flex flex-col items-center gap-1 p-1.5 rounded text-xs
              transition-colors
              ${type === option.value
                ? 'bg-amber-500 text-white'
                : 'bg-white text-slate-600 hover:bg-amber-100'
              }
            `}
          >
            <span>{option.icon}</span>
            <span>{option.label}</span>
          </button>
        ))}
      </div>

      {/* 自定义动作输入 */}
      {type === 'custom' && (
        <input
          type="text"
          value={customType || ''}
          onChange={(e) => onChange?.({ type: 'custom', customType: e.target.value })}
          placeholder="输入自定义动作..."
          className="
            w-full p-2 text-sm
            bg-white border border-amber-200 rounded
            focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400
          "
        />
      )}
    </div>
  );
};

export default ActionBlock;
