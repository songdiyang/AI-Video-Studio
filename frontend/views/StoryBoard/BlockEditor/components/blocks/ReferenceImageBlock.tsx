/**
 * 参考图片积木块
 * 显示引用的图片作为参考
 */

import React from 'react';
import { BlockBase, ReferenceImageBlockData } from '../../types/blockTypes';
import { getBlockDefinition } from '../../utils/blockRegistry';
import { ImageIcon, X, ExternalLink } from 'lucide-react';

interface ReferenceImageBlockProps {
  block: BlockBase & { data: ReferenceImageBlockData };
  isSelected?: boolean;
  onChange?: (data: ReferenceImageBlockData) => void;
  onDelete?: () => void;
}

const ReferenceImageBlock: React.FC<ReferenceImageBlockProps> = ({
  block,
  isSelected,
  onChange,
  onDelete,
}) => {
  const definition = getBlockDefinition('reference_image');
  const { imageUrl, source, description } = block.data;

  const sourceLabels: Record<string, string> = {
    scene: '场景图',
    frame: '帧图片',
    upload: '上传图片',
  };

  const sourceColors: Record<string, string> = {
    scene: 'bg-emerald-500',
    frame: 'bg-blue-500',
    upload: 'bg-purple-500',
  };

  return (
    <div
      className={`
        relative rounded-lg border-2 p-3 min-w-[200px]
        ${isSelected ? 'border-purple-500 ring-2 ring-purple-200' : 'border-purple-300'}
        bg-purple-50 hover:bg-purple-100 transition-colors
      `}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{definition.icon}</span>
          <span className="text-sm font-medium text-purple-700">{definition.label}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* 来源标签 */}
          <span className={`text-xs px-1.5 py-0.5 rounded text-white ${sourceColors[source] || 'bg-gray-500'}`}>
            {sourceLabels[source] || '未知'}
          </span>
          {/* 删除按钮 */}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1 rounded hover:bg-purple-200 text-purple-600 transition-colors"
              title="删除"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 图片显示 */}
      {imageUrl ? (
        <div className="relative group">
          <img
            src={imageUrl}
            alt="参考图片"
            className="w-full h-20 object-cover rounded border border-purple-200"
          />
          {/* 悬停操作 */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded">
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 bg-white rounded-full hover:bg-gray-100 transition-colors"
              title="查看原图"
            >
              <ExternalLink className="w-4 h-4 text-gray-700" />
            </a>
          </div>
        </div>
      ) : (
        <div className="w-full h-20 flex flex-col items-center justify-center bg-purple-100/50 rounded border border-dashed border-purple-300">
          <ImageIcon className="w-8 h-8 text-purple-300 mb-1" />
          <span className="text-xs text-purple-400">暂无图片</span>
        </div>
      )}

      {/* 描述输入 */}
      <input
        type="text"
        value={description || ''}
        onChange={(e) => onChange?.({ ...block.data, description: e.target.value })}
        placeholder="添加描述..."
        className="
          w-full mt-2 p-1.5 text-xs
          bg-white border border-purple-200 rounded
          focus:outline-none focus:ring-1 focus:ring-purple-300 focus:border-purple-400
          placeholder:text-purple-300
        "
      />
    </div>
  );
};

export default ReferenceImageBlock;
