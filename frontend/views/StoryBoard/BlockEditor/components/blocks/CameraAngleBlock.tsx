/**
 * 镜头角度积木块
 */

import React from 'react';
import { BlockBase, CameraAngleBlockData } from '../../types/blockTypes';
import { getBlockDefinition, BLOCK_OPTIONS } from '../../utils/blockRegistry';

interface CameraAngleBlockProps {
  block: BlockBase & { data: CameraAngleBlockData };
  isSelected?: boolean;
  onChange?: (data: CameraAngleBlockData) => void;
}

const CameraAngleBlock: React.FC<CameraAngleBlockProps> = ({ block, isSelected, onChange }) => {
  const definition = getBlockDefinition('camera_angle');
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

      {/* 角度选择 */}
      <div className="grid grid-cols-1 gap-1">
        {BLOCK_OPTIONS.cameraAngle.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange?.({ value: option.value as CameraAngleBlockData['value'] })}
            className={`
              flex items-center gap-2 p-2 rounded text-sm
              transition-colors text-left
              ${value === option.value
                ? 'bg-blue-500 text-white'
                : 'bg-white text-slate-600 hover:bg-blue-100'
              }
            `}
          >
            <span>{option.icon}</span>
            <div>
              <div className="font-medium">{option.label}</div>
              <div className={`text-xs ${value === option.value ? 'text-blue-100' : 'text-slate-400'}`}>
                {option.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default CameraAngleBlock;
