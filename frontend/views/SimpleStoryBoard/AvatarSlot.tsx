import React from 'react';
import { User, MapPin, Package, Plus } from 'lucide-react';

export type SlotType = 'character' | 'scene' | 'prop';

interface AvatarSlotProps {
  type: SlotType;
  name?: string;
  imageUrl?: string;
  size?: 'sm' | 'md';
  onClick?: () => void;
}

const iconMap = { character: User, scene: MapPin, prop: Package };

const sizes = {
  sm: { box: 'w-10 h-10', icon: 'w-4 h-4', font: 'text-[10px]', maxW: 'max-w-[48px]' },
  md: { box: 'w-14 h-14', icon: 'w-5 h-5', font: 'text-xs', maxW: 'max-w-[64px]' },
};

const AvatarSlot: React.FC<AvatarSlotProps> = ({ type, name, imageUrl, size = 'sm', onClick }) => {
  const Icon = iconMap[type];
  const s = sizes[size];

  const borderColorMap = {
    character: 'rgba(6, 182, 212, 0.4)',
    scene: 'rgba(16, 185, 129, 0.4)',
    prop: 'rgba(245, 158, 11, 0.4)',
  };

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 group cursor-pointer`}
      title={name}
    >
      <div 
        className={`${s.box} rounded-lg overflow-hidden flex items-center justify-center transition-all relative`}
        style={{
          backgroundColor: 'var(--bg-input)',
          border: `1px solid ${borderColorMap[type]}`,
        }}
      >
        {imageUrl ? (
          <>
            <img src={imageUrl} alt={name} className={`${s.box} object-cover`} />
            <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </>
        ) : (
          <Icon className={`${s.icon}`} style={{ color: 'var(--text-muted)' }} />
        )}
      </div>
      {name && (
        <span 
          className={`${s.font} truncate ${s.maxW} text-center leading-tight transition-colors`}
          style={{ color: 'var(--text-muted)' }}
        >
          {name}
        </span>
      )}
    </button>
  );
};

export const AddSlot: React.FC<{ type: SlotType; size?: 'sm' | 'md'; onClick?: () => void }> = ({ type, size = 'sm', onClick }) => {
  const s = sizes[size];
  const label = type === 'character' ? '角色' : type === 'scene' ? '场景' : '道具';
  return (
    <button
      onClick={onClick}
      className={`${s.box} rounded-lg border-2 border-dashed flex items-center justify-center transition-all cursor-pointer`}
      style={{
        borderColor: 'var(--border-color)',
        color: 'var(--text-muted)',
      }}
      title={`添加${label}`}
    >
      <Plus className={s.icon} />
    </button>
  );
};

export default AvatarSlot;
