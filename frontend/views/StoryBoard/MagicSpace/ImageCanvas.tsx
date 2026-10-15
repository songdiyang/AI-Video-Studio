import React, { useCallback, useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface ImageCanvasProps {
  sourceImageUrl: string;
  aspectRatio: string; // e.g. "16:9"
  onZoomChange?: (zoom: number) => void;
  onPositionChange?: (offsetX: number, offsetY: number) => void;
  onModeChange?: (mode: 'expand' | 'focus') => void;
}

export interface ImageCanvasHandle {
  exportCanvasImage: () => Promise<string>;
  resetCanvas: () => void;
  getZoomLevel: () => number;
  getOffset: () => { x: number; y: number };
}

// Parse aspect ratio string to width/height ratio
function parseAspectRatio(ar: string): number {
  const parts = ar.split(':').map(Number);
  if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
    return parts[0] / parts[1];
  }
  return 16 / 9; // default
}

const ImageCanvas = forwardRef<ImageCanvasHandle, ImageCanvasProps>(({
  sourceImageUrl,
  aspectRatio,
  onZoomChange,
  onPositionChange,
  onModeChange,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [zoom, setZoom] = useState(1); // 1 = image fills canvas
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // pixel offset from center
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  const ratio = parseAspectRatio(aspectRatio);

  // Load source image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => {
      console.error('[ImageCanvas] Failed to load image');
      setImageLoaded(false);
    };
    img.src = sourceImageUrl;
  }, [sourceImageUrl]);

  // Detect mode based on zoom level
  useEffect(() => {
    if (zoom < 0.95) {
      onModeChange?.('expand');
    } else if (zoom > 1.05) {
      onModeChange?.('focus');
    } else {
      onModeChange?.('expand');
    }
  }, [zoom, onModeChange]);

  // Reset canvas
  const resetCanvas = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    onZoomChange?.(1);
    onPositionChange?.(0, 0);
  }, [onZoomChange, onPositionChange]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    exportCanvasImage,
    resetCanvas,
    getZoomLevel: () => zoom,
    getOffset: () => offset,
  }));

  // Export current canvas state as base64 PNG
  const exportCanvasImage = useCallback(async (): Promise<string> => {
    const container = containerRef.current;
    if (!container || !imageRef.current) return '';

    const rect = container.getBoundingClientRect();
    const canvasWidth = Math.round(rect.width);
    const canvasHeight = Math.round(rect.height);

    const offscreen = document.createElement('canvas');
    offscreen.width = canvasWidth;
    offscreen.height = canvasHeight;
    const ctx = offscreen.getContext('2d')!;

    // Fill black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw the image with current zoom and offset
    const img = imageRef.current;
    const canvasAspect = canvasWidth / canvasHeight;
    const imgAspect = img.naturalWidth / img.naturalHeight;

    // Base size: image fills canvas at zoom=1
    let drawWidth: number, drawHeight: number;
    if (imgAspect > canvasAspect) {
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / imgAspect;
    } else {
      drawHeight = canvasHeight;
      drawWidth = canvasHeight * imgAspect;
    }

    // Apply zoom
    drawWidth *= zoom;
    drawHeight *= zoom;

    // Apply offset (centered + user offset)
    const drawX = (canvasWidth - drawWidth) / 2 + offset.x;
    const drawY = (canvasHeight - drawHeight) / 2 + offset.y;

    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

    return offscreen.toDataURL('image/png');
  }, [zoom, offset]);

  // Mouse handlers for dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  }, [offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const newOffset = {
      x: dragStart.current.offsetX + dx,
      y: dragStart.current.offsetY + dy,
    };
    setOffset(newOffset);
    onPositionChange?.(
      newOffset.x / (containerRef.current?.clientWidth || 1),
      newOffset.y / (containerRef.current?.clientHeight || 1)
    );
  }, [onPositionChange]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Wheel zoom - use non-passive listener to allow preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setZoom(z => {
        const newZoom = Math.max(0.2, Math.min(3, z + delta));
        onZoomChange?.(newZoom);
        return newZoom;
      });
    };

    container.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => container.removeEventListener('wheel', handleWheelNative);
  }, [onZoomChange]);

  const handleZoomIn = useCallback(() => {
    setZoom(z => {
      const newZoom = Math.min(3, z + 0.1);
      onZoomChange?.(newZoom);
      return newZoom;
    });
  }, [onZoomChange]);

  const handleZoomOut = useCallback(() => {
    setZoom(z => {
      const newZoom = Math.max(0.2, z - 0.1);
      onZoomChange?.(newZoom);
      return newZoom;
    });
  }, [onZoomChange]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newZoom = parseFloat(e.target.value);
    setZoom(newZoom);
    onZoomChange?.(newZoom);
  }, [onZoomChange]);

  // Calculate the displayed image transform
  const imageStyle: React.CSSProperties = imageLoaded ? {
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
    transformOrigin: 'center center',
    cursor: isDragging.current ? 'grabbing' : 'grab',
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    transition: isDragging.current ? 'none' : 'transform 0.15s ease',
    userSelect: 'none',
    pointerEvents: 'auto',
  } : {};

  // Calculate if image is smaller than canvas (expand mode)
  const isExpanding = zoom < 0.95;
  const isFocusing = zoom > 1.05;

  return (
    <div className="flex flex-col h-full">
      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        style={{
          aspectRatio: `${ratio}`,
          maxHeight: '100%',
        }}
      >
        {/* Checkerboard / grid background */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%),
              linear-gradient(-45deg, rgba(255,255,255,0.03) 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.03) 75%),
              linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.03) 75%)
            `,
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}
        />

        {/* Expand hint: diagonal lines where image doesn't cover */}
        {isExpanding && (
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              backgroundImage: `repeating-linear-gradient(
                45deg,
                transparent,
                transparent 8px,
                rgba(147, 51, 234, 0.08) 8px,
                rgba(147, 51, 234, 0.08) 16px
              )`,
            }}
          />
        )}

        {/* Mode indicator */}
        <div className="absolute top-2 left-2 z-20">
          {isExpanding && (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/30 text-purple-300 border border-purple-500/30">
              扩图模式 - AI将填充空白区域
            </span>
          )}
          {isFocusing && (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/30 text-amber-300 border border-amber-500/30">
              聚焦模式 - 放大局部细节
            </span>
          )}
        </div>

        {/* The source image */}
        {imageLoaded && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img
              src={sourceImageUrl}
              alt="源图片"
              draggable={false}
              style={imageStyle}
              className="select-none"
            />
          </div>
        )}

        {/* Loading state */}
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-black/40 border-t border-white/10">
        <button
          onClick={handleZoomOut}
          className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          title="缩小"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <input
          type="range"
          min="0.2"
          max="3"
          step="0.05"
          value={zoom}
          onChange={handleSliderChange}
          className="flex-1 h-1 appearance-none bg-white/20 rounded-full outline-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <button
          onClick={handleZoomIn}
          className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          title="放大"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] text-white/50 min-w-[3rem] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={resetCanvas}
          className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          title="重置"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});

ImageCanvas.displayName = 'ImageCanvas';

export default ImageCanvas;
