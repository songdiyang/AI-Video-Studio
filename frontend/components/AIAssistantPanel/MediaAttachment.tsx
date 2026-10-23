import React, { useState, useEffect } from 'react';
import { Film, FileText, BookText, X } from 'lucide-react';
import { usePreview } from '../PreviewProvider';

export interface MediaAttachmentProps {
  type: 'image' | 'video' | 'file' | 'script';
  url: string;
  name?: string;
  removable?: boolean;
  onRemove?: () => void;
  size?: 'sm' | 'md';
  /** 本地缓存 ID（用于从 IndexedDB 加载） */
  cacheId?: string;
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
  cacheId,
}) => {
  const s = sizeMap[size];
  const { openPreview } = usePreview();
  const [displayUrl, setDisplayUrl] = useState<string>(url);
  const [loading, setLoading] = useState(false);

  // 如果有 cacheId，从本地缓存加载
  useEffect(() => {
    if (cacheId && url.startsWith('file://')) {
      setLoading(true);
      import('../../services/attachmentCache').then(({ getAttachmentAsObjectUrl }) => {
        return getAttachmentAsObjectUrl(cacheId);
      }).then((objectUrl) => {
        if (objectUrl) {
          setDisplayUrl(objectUrl);
        }
        setLoading(false);
      }).catch((err) => {
        console.error('[MediaAttachment] 加载缓存失败:', err);
        setLoading(false);
      });
    }
  }, [cacheId, url]);

  // 双击图片 → 复用全局 Lightbox 放大预览（支持滚轮/双指缩放）
  const handleDoubleClick = () => {
    if (type === 'image' && displayUrl && !loading) {
      openPreview([{ src: displayUrl, alt: name }]);
    }
  };

  return (
    <div
      className={`relative ${s.container} rounded-lg overflow-hidden border border-(--border-color) bg-(--bg-input) group shrink-0 ${type === 'image' ? 'cursor-zoom-in' : 'cursor-pointer'}`}
      onDoubleClick={handleDoubleClick}
      title={type === 'image' ? `双击放大${name ? `：${name}` : ''}` : (name || url)}
    >
      {type === 'image' ? (
        loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-(--accent) border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <img
            src={displayUrl}
            alt={name || 'attachment'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-1">
          {type === 'video' ? (
            <Film size={s.icon} className="text-(--text-muted)" />
          ) : type === 'script' ? (
            <BookText size={s.icon} className="text-(--accent)" />
          ) : (
            <FileText size={s.icon} className="text-(--text-muted)" />
          )}
          {name && (
            <span className={`${s.text} ${type === 'script' ? 'text-(--accent)' : 'text-(--text-muted)'} truncate w-full text-center px-1`}>
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
