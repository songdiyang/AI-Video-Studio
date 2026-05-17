import React from 'react';
import { User, MapPin, Package, Trash2 } from 'lucide-react';
import { SlotType } from '../AvatarSlot';

interface ResourceCardProps {
  type: SlotType;
  name: string;
  imageUrl?: string;
  isActive?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onDelete?: () => void;
}

const iconMap = { character: User, scene: MapPin, prop: Package };

const ResourceCard: React.FC<ResourceCardProps> = ({ type, name, imageUrl, isActive, onClick, onDoubleClick, onDelete }) => {
  const Icon = iconMap[type];

  return (
    <div
      className="relative group cursor-pointer rounded-xl overflow-hidden transition-all flex flex-col"
      style={{
        border: isActive 
          ? '1px solid var(--accent-primary)' 
          : '1px solid var(--border-color)',
        boxShadow: isActive ? '0 0 0 1px rgba(6, 182, 212, 0.3)' : 'none',
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* 图片区域 */}
      <div className="flex-1 min-h-0 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-input)' }}>
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <Icon className="w-8 h-8" />
            <span className="text-[10px]">暂无图片</span>
          </div>
        )}
      </div>

      {/* 名字 */}
      <div className="shrink-0 px-2 py-1.5" style={{ backgroundColor: 'var(--bg-card)' }}>
        <p 
          className="text-xs font-medium text-center truncate"
          style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)' }}
        >
          {name}
        </p>
      </div>

      {/* 删除按钮 */}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute top-1 right-1 p-1 rounded bg-red-600/80 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
          title="删除"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}

      {/* 在线指示 */}
      {imageUrl && (
        <div 
          className="absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full bg-emerald-400"
          style={{ border: '2px solid var(--bg-card)' }}
        />
      )}
    </div>
  );
};

export default ResourceCard;
