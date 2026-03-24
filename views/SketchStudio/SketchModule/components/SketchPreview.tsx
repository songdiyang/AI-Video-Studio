import React, { useState, useEffect, useMemo } from 'react';
import { Pencil, ZoomIn, Loader2 } from 'lucide-react';
import { generateThumbnail } from '../utils/sketchExport';
import type { SketchType } from '../types/sketch';

// 尺寸配置
const SIZE_CONFIG = {
  sm: { width: 80, height: 60 },
  md: { width: 160, height: 120 },
  lg: { width: 320, height: 240 }
} as const;

// 草图类型标签映射
const SKETCH_TYPE_LABELS: Record<SketchType, string> = {
  stick_figure: '火柴人',
  storyboard_sketch: '故事板',
  detailed_lineart: '精细线稿'
};

export interface SketchPreviewProps {
  /** Excalidraw 场景数据（JSON） */
  sketchData?: {
    elements?: readonly unknown[];
    appState?: Record<string, unknown>;
    files?: Record<string, unknown>;
  };
  /** 或者直接使用草图图片 URL */
  sketchUrl?: string;
  /** 预览尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 点击回调（通常用于打开编辑器） */
  onClick?: () => void;
  /** 是否显示类型标签 */
  showTypeLabel?: boolean;
  /** 草图类型 */
  sketchType?: SketchType;
  /** 自定义类名 */
  className?: string;
}

/**
 * 草图预览组件
 * 支持显示草图图片或从 Excalidraw 数据生成缩略图
 */
const SketchPreview: React.FC<SketchPreviewProps> = ({
  sketchData,
  sketchUrl,
  size = 'md',
  onClick,
  showTypeLabel = false,
  sketchType,
  className = ''
}) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // 获取尺寸配置
  const dimensions = SIZE_CONFIG[size];

  // 判断是否有数据
  const hasData = useMemo(() => {
    if (sketchUrl) return true;
    if (sketchData?.elements && Array.isArray(sketchData.elements)) {
      const visibleElements = (sketchData.elements as any[]).filter(el => !el.isDeleted);
      return visibleElements.length > 0;
    }
    return false;
  }, [sketchUrl, sketchData]);

  // 从 sketchData 生成缩略图
  useEffect(() => {
    // 如果有 sketchUrl，优先使用
    if (sketchUrl) {
      setThumbnailUrl(null);
      return;
    }

    // 如果没有 sketchData 或没有元素，不生成缩略图
    if (!sketchData?.elements || !Array.isArray(sketchData.elements)) {
      setThumbnailUrl(null);
      return;
    }

    const visibleElements = (sketchData.elements as any[]).filter(el => !el.isDeleted);
    if (visibleElements.length === 0) {
      setThumbnailUrl(null);
      return;
    }

    // 异步生成缩略图
    let cancelled = false;
    setIsLoading(true);

    generateThumbnail(
      sketchData.elements as any,
      (sketchData.appState || {}) as any,
      (sketchData.files || null) as any,
      dimensions
    ).then((url) => {
      if (!cancelled) {
        setThumbnailUrl(url);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setThumbnailUrl(null);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sketchData, sketchUrl, dimensions]);

  // 确定显示的图片 URL
  const displayUrl = sketchUrl || thumbnailUrl;

  // 容器样式
  const containerStyle: React.CSSProperties = {
    width: dimensions.width,
    height: dimensions.height
  };

  return (
    <div
      className={`
        relative overflow-hidden rounded-lg border border-[var(--border-color)]
        bg-[var(--bg-card)] transition-all duration-200
        ${onClick ? 'cursor-pointer hover:border-[var(--accent)] hover:shadow-md' : ''}
        ${className}
      `}
      style={containerStyle}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 加载状态 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-card)]">
          <Loader2 className="w-5 h-5 text-[var(--text-muted)] animate-spin" />
        </div>
      )}

      {/* 有数据时显示图片 */}
      {!isLoading && hasData && displayUrl && (
        <img
          src={displayUrl}
          alt="草图预览"
          className="w-full h-full object-contain"
          loading="lazy"
        />
      )}

      {/* 无数据时显示占位图 */}
      {!isLoading && !hasData && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[var(--text-muted)]">
          <Pencil className={`${size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-6 h-6' : 'w-8 h-8'}`} />
          {size !== 'sm' && (
            <span className="text-xs">无草图</span>
          )}
        </div>
      )}

      {/* 悬浮遮罩和提示 */}
      {onClick && isHovered && hasData && (
        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-1 transition-opacity duration-200">
          <ZoomIn className="w-5 h-5 text-white" />
          <span className="text-xs text-white">点击编辑</span>
        </div>
      )}

      {/* 草图类型标签 */}
      {showTypeLabel && sketchType && (
        <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-app)]/80 backdrop-blur-sm text-[var(--text-muted)] border border-[var(--border-color)]">
          {SKETCH_TYPE_LABELS[sketchType]}
        </div>
      )}
    </div>
  );
};

export default SketchPreview;
