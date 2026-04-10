/**
 * 积木块面板
 * 左侧的分类积木块选择区域
 */

import React, { useState } from 'react';
import { BlockCategory, BlockType } from '../types/blockTypes';
import { getBlockCategories, getBlockTypesByCategory, getBlockDefinition } from '../utils/blockRegistry';

interface BlockPaletteProps {
  onDragStart?: (type: BlockType) => void;
}

const BlockPalette: React.FC<BlockPaletteProps> = ({ onDragStart }) => {
  const [activeCategory, setActiveCategory] = useState<BlockCategory>('text');
  const categories = getBlockCategories();
  const blockTypes = getBlockTypesByCategory(activeCategory);

  const handleDragStart = (e: React.DragEvent, type: BlockType) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type }));
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart?.(type);
  };

  return (
    <div className="w-64 bg-[var(--bg-card)] border-r border-[var(--border-color)] flex flex-col h-full">
      {/* 标题 */}
      <div className="p-4 border-b border-[var(--border-color)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">积木块</h3>
        <p className="text-xs text-[var(--text-muted)] mt-1">拖拽积木到画布</p>
      </div>

      {/* 分类标签 */}
      <div className="flex flex-wrap gap-1 p-2 border-b border-[var(--border-color)]">
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`
              px-3 py-1.5 rounded text-xs font-medium transition-colors
              ${activeCategory === cat.key
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
              }
            `}
          >
            <span className="mr-1">{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* 积木块列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {blockTypes.map((type) => {
          const definition = getBlockDefinition(type);
          return (
            <div
              key={type}
              draggable
              onDragStart={(e) => handleDragStart(e, type)}
              className={`
                p-3 rounded-lg border cursor-move
                transition-all hover:shadow-md hover:scale-[1.02]
                ${definition.color.replace('bg-', 'bg-opacity-50 bg-')}
                border-opacity-50
                ${definition.color.replace('bg-', 'border-')}
              `}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{definition.icon}</span>
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {definition.label}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {definition.description}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 提示 */}
      <div className="p-3 border-t border-[var(--border-color)] text-xs text-[var(--text-muted)]">
        <p>💡 提示：拖拽积木到右侧画布进行组合</p>
      </div>
    </div>
  );
};

export default BlockPalette;
