/**
 * 积木画布
 * 中央的工作区域，用于放置和编辑积木
 */

import React, { useState, useCallback, useRef } from 'react';
import { Block, BlockType, BlockData, ProjectCharacter, ProjectScene } from '../types/blockTypes';
import { generateBlockId, getBlockDefaultData, getBlockDefinition } from '../utils/blockRegistry';
import {
  TextBlock,
  ShotSizeBlock,
  CameraAngleBlock,
  MovementBlock,
  CharacterBlock,
  SceneBlock,
  ActionBlock,
  DurationBlock,
  ReferenceImageBlock,
} from './blocks';

interface BlockCanvasProps {
  blocks: Block[];
  selectedBlockId: string | null;
  characters?: ProjectCharacter[];
  scenes?: ProjectScene[];
  onBlocksChange: (blocks: Block[]) => void;
  onSelectBlock: (id: string | null) => void;
  onDeleteBlock: (id: string) => void;
}

const BlockCanvas: React.FC<BlockCanvasProps> = ({
  blocks,
  selectedBlockId,
  characters,
  scenes,
  onBlocksChange,
  onSelectBlock,
  onDeleteBlock,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // 处理拖拽进入
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingOver(true);
  }, []);

  // 处理拖拽离开
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  }, []);

  // 处理放置
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      // 处理参考图片拖拽
      if (data.type === 'reference-image') {
        const newBlock: Block = {
          id: generateBlockId(),
          type: 'reference_image',
          category: 'reference',
          position: {
            x: e.clientX - rect.left - 100,
            y: e.clientY - rect.top - 60,
          },
          data: {
            imageUrl: data.imageUrl,
            source: data.source,
            description: data.description || '',
          },
        };
        onBlocksChange([...blocks, newBlock]);
        onSelectBlock(newBlock.id);
        return;
      }

      // 处理普通积木拖拽
      if (data.type) {
        const newBlock: Block = {
          id: generateBlockId(),
          type: data.type as BlockType,
          category: getBlockDefinition(data.type as BlockType).category,
          position: {
            x: e.clientX - rect.left - 100,
            y: e.clientY - rect.top - 30,
          },
          data: getBlockDefaultData(data.type as BlockType),
        };
        onBlocksChange([...blocks, newBlock]);
        onSelectBlock(newBlock.id);
      }
    } catch (error) {
      console.error('[BlockCanvas] Drop error:', error);
    }
  }, [blocks, onBlocksChange, onSelectBlock]);

  // 更新积木数据
  const handleBlockDataChange = useCallback((blockId: string, newData: BlockData) => {
    const updatedBlocks = blocks.map((block) =>
      block.id === blockId ? { ...block, data: newData } : block
    );
    onBlocksChange(updatedBlocks);
  }, [blocks, onBlocksChange]);

  // 渲染积木块
  const renderBlock = (block: Block) => {
    const isSelected = selectedBlockId === block.id;
    const onChange = (data: BlockData) => handleBlockDataChange(block.id, data);

    switch (block.type) {
      case 'text':
        return <TextBlock block={block as any} isSelected={isSelected} onChange={onChange} />;
      case 'shot_size':
        return <ShotSizeBlock block={block as any} isSelected={isSelected} onChange={onChange} />;
      case 'camera_angle':
        return <CameraAngleBlock block={block as any} isSelected={isSelected} onChange={onChange} />;
      case 'movement':
        return <MovementBlock block={block as any} isSelected={isSelected} onChange={onChange} />;
      case 'character':
        return <CharacterBlock block={block as any} isSelected={isSelected} onChange={onChange} characters={characters} />;
      case 'scene':
        return <SceneBlock block={block as any} isSelected={isSelected} onChange={onChange} scenes={scenes} />;
      case 'action':
        return <ActionBlock block={block as any} isSelected={isSelected} onChange={onChange} />;
      case 'duration':
        return <DurationBlock block={block as any} isSelected={isSelected} onChange={onChange} />;
      case 'reference_image':
        return (
          <ReferenceImageBlock
            block={block as any}
            isSelected={isSelected}
            onChange={onChange}
            onDelete={() => onDeleteBlock(block.id)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={canvasRef}
      className={`
        flex-1 relative overflow-auto
        ${isDraggingOver ? 'bg-blue-50/50' : 'bg-[var(--bg-app)]'}
        transition-colors
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => onSelectBlock(null)}
    >
      {/* 网格背景 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, var(--border-color) 1px, transparent 1px),
            linear-gradient(to bottom, var(--border-color) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
          opacity: 0.3,
        }}
      />

      {/* 积木块 */}
      <div className="relative min-h-full p-8" style={{ minWidth: '100%', minHeight: '100%' }}>
        {blocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-[var(--text-muted)]">
              <div className="text-4xl mb-4">🧩</div>
              <p className="text-sm">从左侧拖拽积木块到这里</p>
              <p className="text-xs mt-2">组合积木生成分镜描述</p>
            </div>
          </div>
        )}

        {blocks.map((block) => (
          <div
            key={block.id}
            className="absolute"
            style={{ left: block.position.x, top: block.position.y }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectBlock(block.id);
            }}
          >
            <div className="relative group">
              {renderBlock(block)}

              {/* 删除按钮 */}
              {selectedBlockId === block.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteBlock(block.id);
                  }}
                  className="
                    absolute -top-2 -right-2 w-5 h-5
                    bg-red-500 text-white rounded-full
                    flex items-center justify-center text-xs
                    opacity-0 group-hover:opacity-100
                    transition-opacity hover:bg-red-600
                  "
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BlockCanvas;
