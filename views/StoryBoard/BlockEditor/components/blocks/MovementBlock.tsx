/**
 * 运镜方式积木块
 */

import React from 'react';
import { BlockBase, MovementBlockData } from '../../types/blockTypes';
import { getBlockDefinition, BLOCK_OPTIONS } from '../../utils/blockRegistry';

interface MovementBlockProps {
  block: BlockBase & { data: MovementBlockData };
  isSelected?: boolean;
  onChange?: (data: MovementBlockData) => void;
}

const MovementBlock: React.FC<MovementBlockProps> = ({ block, isSelected, onChange }) => {
  const definition = getBlockDefinition('movement');
  const { value } = block.data;

  return (
    <div
      className={`
        relative rounded-lg border-2 p-3 min-w-[200px]
        ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-blue-300'}
        bg-blue-50 hover:bg-blue-100 transition-colors
      `}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{definition.icon}</span>
        <span className="text-sm font-medium text-blue-700">{definition.label}</span>
      </div>

      {/* 运镜选择 */}
      <div className="grid grid-cols-4 gap-1">
        {BLOCK_OPTIONS.movement.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange?.({ value: option.value as MovementBlockData['value'] })}
            className={`
              flex flex-col items-center gap-1 p-1.5 rounded text-xs
              transition-colors
              ${value === option.value
                ? 'bg-blue-500 text-white'
                : 'bg-white text-slate-600 hover:bg-blue-100'
              }
            `}
          >
            <span>{option.icon}</span>
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default MovementBlock;
