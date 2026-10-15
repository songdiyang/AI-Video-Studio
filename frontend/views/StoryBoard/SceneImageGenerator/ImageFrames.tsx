import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Spinner } from '@heroui/react';
import { Plus, RefreshCw, ZoomIn, X, ImageOff } from 'lucide-react';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { useLazyImage } from '../../../components/LazyImage';

/**
 * 带懒加载和渐进式加载的图片组件
 * - 使用 Intersection Observer 实现懒加载
 * - blur-up 效果：加载时显示模糊背景，加载完成后渐变为清晰
 * - 骨架屏动画显示加载状态
 * - 优雅的错误状态显示
 * - 兼容 Edge lazy-load 干预：通过 img.complete 兜底检测
 */
interface LoadableImageProps {
  src: string;
  alt: string;
  onClick?: () => void;
  className?: string;
}

const LoadableImage: React.FC<LoadableImageProps> = ({ src, alt, onClick, className }) => {
  const { containerRef, isVisible, isLoaded, hasError, handleLoad, handleError } = useLazyImage(src);
  const imgRef = useRef<HTMLImageElement>(null);

  // Edge 浏览器干预兜底：检测 img.complete 状态防止 onLoad 被阻断后图片永远不显示
  useEffect(() => {
    if (isLoaded || hasError || !isVisible || !src) return;
    const img = imgRef.current;
    if (!img) return;

    if (img.complete && img.naturalWidth > 0) {
      handleLoad();
      return;
    }

    let attempts = 0;
    const maxAttempts = 34;
    const timer = setInterval(() => {
      attempts++;
      if (img.complete) {
        clearInterval(timer);
        if (img.naturalWidth > 0) {
          handleLoad();
        } else {
          handleError();
        }
      } else if (attempts >= maxAttempts) {
        clearInterval(timer);
        if (!img.complete) handleError();
      }
    }, 300);

    return () => clearInterval(timer);
  }, [isVisible, src]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      {/* 骨架屏占位符 - blur-up 效果背景 */}
      <div 
        className={`absolute inset-0 bg-gradient-to-br from-slate-700/60 via-slate-600/40 to-slate-800/60 rounded-lg transition-all duration-300 ${
          isLoaded && !hasError ? 'opacity-0 scale-105 blur-0' : 'opacity-100 scale-100'
        }`}
        style={{ filter: isLoaded ? 'none' : 'blur(10px)' }}
      >
        {/* 骨架屏 pulse 动画 */}
        {!isVisible && (
          <div className="absolute inset-0 animate-pulse bg-slate-600/30 rounded-lg" />
        )}
        {/* 加载中的 spinner */}
        {isVisible && !isLoaded && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* 错误状态 */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800/90 rounded-lg z-10">
          <ImageOff className="w-4 h-4 text-slate-500 mb-1" />
          <span className="text-slate-500 text-[8px]">加载失败</span>
        </div>
      )}

      {/* 实际图片 - 只有进入视口后才加载 */}
      {isVisible && !hasError && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onLoad={handleLoad}
          onError={handleError}
          onClick={onClick}
          className={`${className} transition-all duration-300 ease-out ${
            isLoaded ? 'opacity-100 blur-0 scale-100' : 'opacity-0 blur-sm scale-105'
          }`}
        />
      )}
    </div>
  );
};

interface ImageFramesProps {
  startFrame?: string;
  endFrame?: string;
  hasAction?: boolean;
  hasVideo?: boolean;
  isGenerating: boolean;
  hasImages: boolean;
  onQuickGenerate: () => void;
  onOpenGenerateModal: () => void;
  onPreview: (imageUrl: string) => void;
  onDeleteFrames?: () => void;
  onDeleteFirstFrame?: () => Promise<void>;
  onDeleteLastFrame?: () => Promise<void>;
  error: string | null;
}

const ImageFrames: React.FC<ImageFramesProps> = ({
  startFrame,
  endFrame,
  hasAction,
  hasVideo,
  isGenerating,
  hasImages,
  onQuickGenerate,
  onOpenGenerateModal,
  onPreview,
  onDeleteFrames,
  onDeleteFirstFrame,
  onDeleteLastFrame,
  error
}) => {
  const showEndFrame = hasAction;
  const { confirm } = useConfirm();
  const [isDeletingFirst, setIsDeletingFirst] = useState(false);
  const [isDeletingLast, setIsDeletingLast] = useState(false);

  // 处理独立删除首帧
  const handleDeleteFirstFrame = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDeleteFirstFrame || isDeletingFirst) return;

    // 构建确认消息
    let message = '确定要删除该首帧吗？此操作不可撤销。';
    if (hasVideo) {
      message = '该分镜已生成视频，删除首帧可能需要重新生成视频。\n\n确定要删除该首帧吗？此操作不可撤销。';
    }

    const confirmed = await confirm({
      title: '删除首帧',
      message,
      type: hasVideo ? 'warning' : 'danger',
      confirmText: '删除',
      cancelText: '取消'
    });

    if (confirmed) {
      setIsDeletingFirst(true);
      try {
        await onDeleteFirstFrame();
      } finally {
        setIsDeletingFirst(false);
      }
    }
  };

  // 处理独立删除尾帧
  const handleDeleteLastFrame = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDeleteLastFrame || isDeletingLast) return;

    const confirmed = await confirm({
      title: '删除尾帧',
      message: '确定要删除该尾帧吗？此操作不可撤销。',
      type: 'danger',
      confirmText: '删除',
      cancelText: '取消'
    });

    if (confirmed) {
      setIsDeletingLast(true);
      try {
        await onDeleteLastFrame();
      } finally {
        setIsDeletingLast(false);
      }
    }
  };

  return (
    <>
      <div className="flex gap-2 flex-shrink-0">
        {/* 图片 / 首帧 */}
        <div className="w-20 h-14 bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg flex items-center justify-center group transition-all duration-300 border border-slate-600/50 relative overflow-hidden">
          {startFrame ? (
            <>
              <LoadableImage
                src={startFrame}
                alt={hasAction ? "首帧" : "图片"}
                className="w-full h-full object-cover rounded-lg cursor-pointer"
                onClick={() => onPreview(startFrame)}
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-1">
                <button
                  onClick={() => onPreview(startFrame)}
                  className="p-1 bg-white/90 rounded-full hover:bg-white transition-colors"
                  title="预览"
                >
                  <ZoomIn className="w-3 h-3 text-slate-700" />
                </button>
              </div>
              {/* 独立删除首帧按钮 */}
              {onDeleteFirstFrame && (
                <button
                  onClick={handleDeleteFirstFrame}
                  disabled={isDeletingFirst}
                  className="absolute top-0.5 right-0.5 p-0.5 bg-red-500/80 rounded-full hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100 z-10 disabled:opacity-50"
                  title="删除首帧"
                >
                  {isDeletingFirst ? (
                    <div className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <X className="w-2.5 h-2.5 text-white" />
                  )}
                </button>
              )}
              {hasAction && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center py-0.5">首帧</div>
              )}
            </>
          ) : isGenerating ? (
            <div className="flex flex-col items-center gap-1 text-blue-500">
              <Spinner size="sm" color="primary" />
              <span className="text-[10px]">生成中</span>
            </div>
          ) : (
            <div 
              onClick={onQuickGenerate}
              className="flex flex-col items-center gap-1 text-slate-400 hover:text-blue-500 transition-colors cursor-pointer w-full h-full justify-center border-2 border-dashed border-slate-600/50 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              <span className="text-[10px]">{hasAction ? '首帧' : '生成'}</span>
            </div>
          )}
        </div>

        {/* 尾帧 - 仅在有动作时显示 */}
        {showEndFrame && (
          <div className="w-20 h-14 bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg flex items-center justify-center group transition-all duration-300 border border-orange-500/30 relative overflow-hidden">
            {endFrame ? (
              <>
                <LoadableImage
                  src={endFrame}
                  alt="尾帧"
                  className="w-full h-full object-cover rounded-lg cursor-pointer"
                  onClick={() => onPreview(endFrame)}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-1">
                  <button
                    onClick={() => onPreview(endFrame)}
                    className="p-1 bg-white/90 rounded-full hover:bg-white transition-colors"
                    title="预览"
                  >
                    <ZoomIn className="w-3 h-3 text-slate-700" />
                  </button>
                </div>
                {/* 独立删除尾帧按钮 */}
                {onDeleteLastFrame && (
                  <button
                    onClick={handleDeleteLastFrame}
                    disabled={isDeletingLast}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-red-500/80 rounded-full hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100 z-10 disabled:opacity-50"
                    title="删除尾帧"
                  >
                    {isDeletingLast ? (
                      <div className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <X className="w-2.5 h-2.5 text-white" />
                    )}
                  </button>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-orange-500/70 text-white text-[10px] text-center py-0.5">尾帧</div>
              </>
            ) : isGenerating ? (
              <div className="flex flex-col items-center gap-1 text-orange-500">
                <Spinner size="sm" color="warning" />
                <span className="text-[10px]">等待</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 text-orange-300/60 w-full h-full justify-center cursor-default border-2 border-dashed border-orange-500/20 rounded-lg">
                <span className="text-[10px]">无尾帧</span>
              </div>
            )}
          </div>
        )}

        {/* 重新生成按钮 */}
        {hasImages && (
          <button
            onClick={onOpenGenerateModal}
            className="w-8 h-14 bg-slate-800/60 hover:bg-blue-500/10 rounded-lg flex items-center justify-center transition-colors border border-slate-600/50"
            title="重新生成"
          >
            <RefreshCw className="w-4 h-4 text-slate-600 hover:text-blue-600" />
          </button>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-500 mt-1">{error}</div>
      )}
    </>
  );
};

export default ImageFrames;
