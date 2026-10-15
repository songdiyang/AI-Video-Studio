/**
 * 场景选择积木块
 */

import React from 'react';
import { BlockBase, SceneBlockData, ProjectScene } from '../../types/blockTypes';
import { getBlockDefinition } from '../../utils/blockRegistry';

interface SceneBlockProps {
  block: BlockBase & { data: SceneBlockData };
  isSelected?: boolean;
  onChange?: (data: SceneBlockData) => void;
  scenes?: ProjectScene[];
}

const SceneBlock: React.FC<SceneBlockProps> = ({
  block,
  isSelected,
  onChange,
  scenes = [],
}) => {
  const definition = getBlockDefinition('scene');
  const { sceneId, sceneName } = block.data;

  return (
    <div
      className={`
        relative rounded-lg border-2 p-3 min-w-[220px]
        ${isSelected ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-emerald-300'}
        bg-emerald-50 hover:bg-emerald-100 transition-colors
      `}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{definition.icon}</span>
        <span className="text-sm font-medium text-emerald-700">{definition.label}</span>
      </div>

      {/* 场景选择 */}
      <select
        value={sceneId || ''}
        onChange={(e) => {
          const id = parseInt(e.target.value);
          const scene = scenes.find(s => s.id === id);
          onChange?.({
            sceneId: id,
            sceneName: scene?.name || '',
          });
        }}
        className="
          w-full p-2 text-sm
          bg-white border border-emerald-200 rounded
          focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400
        "
      >
        <option value="">选择场景...</option>
        {scenes.map((scene) => (
          <option key={scene.id} value={scene.id}>
            {scene.name}
          </option>
        ))}
      </select>

      {/* 已选场景显示 */}
      {sceneName && (
        <div className="mt-2 flex items-center gap-2 p-2 bg-white rounded border border-emerald-200">
          {scenes.find(s => s.id === sceneId)?.image ? (
            <img
              src={scenes.find(s => s.id === sceneId)?.image}
              alt={sceneName}
              className="w-8 h-8 rounded object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded bg-emerald-200 flex items-center justify-center text-xs">
              🏞️
            </div>
          )}
          <span className="text-sm text-slate-700">{sceneName}</span>
        </div>
      )}
    </div>
  );
};

export default SceneBlock;
