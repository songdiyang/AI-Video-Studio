import React from 'react';
import { Image, Film, FileText, X } from 'lucide-react';

export interface MediaAttachmentProps {
  type: 'image' | 'video' | 'file';
  url: string;
  name?: string;
  removable?: boolean;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}

const sizeMap = {
  sm: { container: 'w-16 h-16', icon: 14, text: 'text-[10px]' },
  md: { container: 'w-24 h-24', icon: 20, text: 'text-xs' },
};

const MediaAttachment: React.FC<MediaAttachmentProps> = ({
  type,
  url,
  name,
  removable = false,
  onRemove,
  size = 'sm',
}) => {
  const s = sizeMap[size];

  const handlePreview = () => {
    if (type === 'image') {
      window.open(url, '_blank');
    }
  };

  return (
    <div
      className={`relative ${s.container} rounded-lg overflow-hidden border border-[var(--border-color)] bg-[var(--bg-input)] group flex-shrink-0 cursor-pointer`}
      onClick={handlePreview}
      title={name || url}
    >
      {type === 'image' ? (
        <img
          src={url}
          alt={name || 'attachment'}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-1">
          {type === 'video' ? (
            <Film size={s.icon} className="text-[var(--text-muted)]" />
          ) : (
            <FileText size={s.icon} className="text-[var(--text-muted)]" />
          )}
          {name && (
            <span className={`${s.text} text-[var(--text-muted)] truncate w-full text-center px-1`}>
              {name}
            </span>
          )}
        </div>
      )}

      {removable && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
};

export default MediaAttachment;
