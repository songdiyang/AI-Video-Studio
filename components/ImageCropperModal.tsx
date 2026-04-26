/**
 * 图片裁剪模态框
 * ──────────────────────────────────────────────────────────────
 * 自建轻量实现（不依赖外部库），支持：
 *  - 自由矩形框选（鼠标/触摸拖动）
 *  - 四角缩放 + 框内拖动
 *  - 自由比例 / 16:9 / 1:1 切换
 *  - Canvas 导出 JPEG Blob（质量 0.92）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import { Crop, Check, X } from 'lucide-react';

export type CropAspect = 'free' | '16:9' | '1:1' | '4:3';

const ASPECT_MAP: Record<CropAspect, number | null> = {
  free: null,
  '16:9': 16 / 9,
  '1:1': 1,
  '4:3': 4 / 3,
};

interface CropRect {
  x: number; // 相对图片显示区域的像素
  y: number;
  w: number;
  h: number;
}

interface ImageCropperModalProps {
  isOpen: boolean;
  imageUrl: string;
  defaultAspect?: CropAspect;
  onClose: () => void;
  onCropped: (blob: Blob) => void;
}

type DragMode = 'none' | 'move' | 'nw' | 'ne' | 'sw' | 'se';

const MIN_SIZE = 30; // 最小裁剪尺寸（显示像素）

const ImageCropperModal: React.FC<ImageCropperModalProps> = ({
  isOpen,
  imageUrl,
  defaultAspect = '16:9',
  onClose,
  onCropped,
}) => {
  const [aspect, setAspect] = useState<CropAspect>(defaultAspect);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [imgDisplaySize, setImgDisplaySize] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [exporting, setExporting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startCrop: CropRect;
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    startCrop: { x: 0, y: 0, w: 0, h: 0 },
  });

  const aspectRatio = ASPECT_MAP[aspect];

  // 图片加载完成后，初始化裁剪框（居中 80%）
  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const nW = img.naturalWidth;
    const nH = img.naturalHeight;
    const dW = img.clientWidth;
    const dH = img.clientHeight;
    setImgNaturalSize({ w: nW, h: nH });
    setImgDisplaySize({ w: dW, h: dH });

    let w = dW * 0.8;
    let h = dH * 0.8;
    if (aspectRatio) {
      // 保持比例，取最大能放入的尺寸
      if (w / h > aspectRatio) w = h * aspectRatio;
      else h = w / aspectRatio;
    }
    const x = (dW - w) / 2;
    const y = (dH - h) / 2;
    setCrop({ x, y, w, h });
  }, [aspectRatio]);

  // 切换比例时，按新比例调整裁剪框
  useEffect(() => {
    if (!crop || !imgDisplaySize) return;
    if (!aspectRatio) return;
    const currentRatio = crop.w / crop.h;
    if (Math.abs(currentRatio - aspectRatio) < 0.01) return;
    let w = crop.w;
    let h = crop.h;
    if (w / h > aspectRatio) w = h * aspectRatio;
    else h = w / aspectRatio;
    // 保持中心
    const cx = crop.x + crop.w / 2;
    const cy = crop.y + crop.h / 2;
    let x = cx - w / 2;
    let y = cy - h / 2;
    x = Math.max(0, Math.min(x, imgDisplaySize.w - w));
    y = Math.max(0, Math.min(y, imgDisplaySize.h - h));
    setCrop({ x, y, w, h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect]);

  // 切换图片或关闭时重置
  useEffect(() => {
    if (!isOpen) {
      setImgNaturalSize(null);
      setImgDisplaySize(null);
      setCrop(null);
    }
  }, [isOpen]);

  // 指针按下：根据位置判定拖动模式
  const getPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (mode: DragMode) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!crop) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = getPointer(e);
    dragRef.current = { mode, startX: p.x, startY: p.y, startCrop: { ...crop } };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { mode, startX, startY, startCrop } = dragRef.current;
    if (mode === 'none' || !crop || !imgDisplaySize) return;
    const p = getPointer(e);
    const dx = p.x - startX;
    const dy = p.y - startY;
    const bounds = imgDisplaySize;

    let next: CropRect = { ...startCrop };

    if (mode === 'move') {
      next.x = Math.max(0, Math.min(startCrop.x + dx, bounds.w - startCrop.w));
      next.y = Math.max(0, Math.min(startCrop.y + dy, bounds.h - startCrop.h));
    } else {
      // 四角缩放
      let x1 = startCrop.x;
      let y1 = startCrop.y;
      let x2 = startCrop.x + startCrop.w;
      let y2 = startCrop.y + startCrop.h;
      if (mode === 'nw') { x1 = startCrop.x + dx; y1 = startCrop.y + dy; }
      if (mode === 'ne') { x2 = startCrop.x + startCrop.w + dx; y1 = startCrop.y + dy; }
      if (mode === 'sw') { x1 = startCrop.x + dx; y2 = startCrop.y + startCrop.h + dy; }
      if (mode === 'se') { x2 = startCrop.x + startCrop.w + dx; y2 = startCrop.y + startCrop.h + dy; }
      x1 = Math.max(0, Math.min(x1, bounds.w));
      x2 = Math.max(0, Math.min(x2, bounds.w));
      y1 = Math.max(0, Math.min(y1, bounds.h));
      y2 = Math.max(0, Math.min(y2, bounds.h));
      let w = Math.max(MIN_SIZE, x2 - x1);
      let h = Math.max(MIN_SIZE, y2 - y1);
      // 锁比例：以鼠标移动距离较大的一侧为主
      if (aspectRatio) {
        if (w / h > aspectRatio) w = h * aspectRatio;
        else h = w / aspectRatio;
        // 重新计算锚点
        if (mode === 'nw') { x1 = x2 - w; y1 = y2 - h; }
        if (mode === 'ne') { y1 = y2 - h; x2 = x1 + w; }
        if (mode === 'sw') { x1 = x2 - w; y2 = y1 + h; }
        if (mode === 'se') { x2 = x1 + w; y2 = y1 + h; }
      }
      next = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    setCrop(next);
  };

  const handlePointerUp = () => {
    dragRef.current.mode = 'none';
  };

  // 导出裁剪结果
  const handleConfirm = useCallback(async () => {
    if (!crop || !imgNaturalSize || !imgDisplaySize || !imgRef.current) return;
    setExporting(true);
    try {
      const scaleX = imgNaturalSize.w / imgDisplaySize.w;
      const scaleY = imgNaturalSize.h / imgDisplaySize.h;
      const sx = Math.round(crop.x * scaleX);
      const sy = Math.round(crop.y * scaleY);
      const sw = Math.round(crop.w * scaleX);
      const sh = Math.round(crop.h * scaleY);

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');
      ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
      );
      if (!blob) throw new Error('Canvas export failed');
      onCropped(blob);
      onClose();
    } catch (err) {
      console.error('[ImageCropperModal] export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [crop, imgNaturalSize, imgDisplaySize, onCropped, onClose]);

  const aspectOptions: { value: CropAspect; label: string }[] = useMemo(
    () => [
      { value: 'free', label: '自由' },
      { value: '16:9', label: '16:9' },
      { value: '4:3', label: '4:3' },
      { value: '1:1', label: '1:1' },
    ],
    [],
  );

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="3xl"
      classNames={{
        backdrop: 'bg-black/70 backdrop-blur-sm',
        base: 'bg-(--bg-elevated) border border-(--border-color) shadow-2xl',
        header: 'border-b border-(--border-color)',
        body: 'py-4',
        footer: 'border-t border-(--border-color)',
      }}
    >
      <ModalContent>
        <ModalHeader className="text-(--text-primary) font-bold flex items-center gap-2">
          <Crop className="w-4 h-4 text-(--accent)" />
          裁剪封面
        </ModalHeader>
        <ModalBody>
          {/* 比例切换 */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-(--text-muted)">比例：</span>
            {aspectOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAspect(opt.value)}
                className={`px-3 py-1 text-xs rounded-md border transition-all cursor-pointer ${
                  aspect === opt.value
                    ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent)'
                    : 'border-(--border-color) bg-(--bg-input) text-(--text-secondary) hover:border-(--accent)/30'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 裁剪区域 */}
          <div className="flex items-center justify-center bg-black/40 rounded-lg overflow-hidden" style={{ minHeight: 320 }}>
            <div
              ref={containerRef}
              className="relative inline-block select-none"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{ touchAction: 'none' }}
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt="crop source"
                crossOrigin="anonymous"
                onLoad={handleImageLoad}
                className="block max-w-full max-h-[60vh] pointer-events-none"
                draggable={false}
              />
              {/* 遮罩 + 裁剪框 */}
              {crop && imgDisplaySize && (
                <>
                  {/* 四向遮罩 */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute bg-black/55" style={{ left: 0, top: 0, right: 0, height: crop.y }} />
                    <div className="absolute bg-black/55" style={{ left: 0, top: crop.y + crop.h, right: 0, bottom: 0 }} />
                    <div className="absolute bg-black/55" style={{ left: 0, top: crop.y, width: crop.x, height: crop.h }} />
                    <div className="absolute bg-black/55" style={{ left: crop.x + crop.w, top: crop.y, right: 0, height: crop.h }} />
                  </div>
                  {/* 裁剪框本体 */}
                  <div
                    className="absolute border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.4)] cursor-move"
                    style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
                    onPointerDown={handlePointerDown('move')}
                  >
                    {/* 三分网格线 */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute top-1/3 left-0 right-0 border-t border-white/40" />
                      <div className="absolute top-2/3 left-0 right-0 border-t border-white/40" />
                      <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/40" />
                      <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/40" />
                    </div>
                    {/* 四角缩放手柄 */}
                    {(['nw', 'ne', 'sw', 'se'] as DragMode[]).map((m) => (
                      <div
                        key={m}
                        onPointerDown={handlePointerDown(m)}
                        className="absolute w-3 h-3 bg-white border border-black/30 rounded-sm"
                        style={{
                          left: m.includes('w') ? -6 : undefined,
                          right: m.includes('e') ? -6 : undefined,
                          top: m.includes('n') ? -6 : undefined,
                          bottom: m.includes('s') ? -6 : undefined,
                          cursor: m === 'nw' || m === 'se' ? 'nwse-resize' : 'nesw-resize',
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 提示 */}
          <p className="text-xs text-(--text-muted) mt-2">
            拖动方框可移动位置，拖动四角可调整大小。选定后保存将作为新封面使用。
          </p>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="flat"
            onPress={onClose}
            className="bg-(--bg-input) text-(--text-secondary)"
            startContent={<X className="w-4 h-4" />}
          >
            取消
          </Button>
          <Button
            color="primary"
            onPress={handleConfirm}
            isDisabled={!crop || exporting}
            startContent={<Check className="w-4 h-4" />}
          >
            {exporting ? '处理中...' : '应用裁剪'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ImageCropperModal;
