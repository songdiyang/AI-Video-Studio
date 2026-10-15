import React, { useCallback, useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Eraser, RotateCcw, Minus, Plus } from 'lucide-react';

// 预设颜色
const PRESET_COLORS = [
  { hex: '#ef4444', name: '红' },
  { hex: '#3b82f6', name: '蓝' },
  { hex: '#22c55e', name: '绿' },
  { hex: '#eab308', name: '黄' },
  { hex: '#a855f7', name: '紫' },
  { hex: '#f97316', name: '橙' },
];

export interface ColorInstruction {
  color: string;      // hex color
  label: string;      // 用户描述的操作
  colorName: string;  // 颜色中文名
}

export interface PaintCanvasHandle {
  exportCompositeImage: () => Promise<string>;  // 合成图（原图+涂抹）
  exportMaskImage: () => Promise<string>;        // 黑白掩膜图
  getColorInstructions: () => ColorInstruction[];
  resetCanvas: () => void;
}

interface PaintCanvasProps {
  sourceImageUrl: string;
  onStrokeCountChange?: (count: number) => void;
}

interface Stroke {
  color: string;
  points: { x: number; y: number }[];
  brushSize: number;
}

const PaintCanvas = forwardRef<PaintCanvasHandle, PaintCanvasProps>(({
  sourceImageUrl,
  onStrokeCountChange,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);   // 底层：源图
  const paintCanvasRef = useRef<HTMLCanvasElement>(null); // 上层：涂抹

  const [imageLoaded, setImageLoaded] = useState(false);
  const [activeColor, setActiveColor] = useState(PRESET_COLORS[0].hex);
  const [brushSize, setBrushSize] = useState(20);
  const [isEraser, setIsEraser] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 450 });

  const imageRef = useRef<HTMLImageElement | null>(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef<Stroke | null>(null);
  const dpr = useRef(1);

  // 已使用的颜色及对应指令
  const [colorLabels, setColorLabels] = useState<Record<string, string>>({});

  // 加载源图
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => {
      console.error('[PaintCanvas] Failed to load image');
    };
    img.src = sourceImageUrl;
  }, [sourceImageUrl]);

  // 初始化画布尺寸
  useEffect(() => {
    const updateSize = () => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      dpr.current = window.devicePixelRatio || 1;
      setCanvasSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 绘制源图到底层 Canvas
  useEffect(() => {
    if (!imageLoaded || !bgCanvasRef.current || !imageRef.current) return;
    const canvas = bgCanvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const img = imageRef.current;

    const cw = canvasSize.width * dpr.current;
    const ch = canvasSize.height * dpr.current;
    canvas.width = cw;
    canvas.height = ch;
    ctx.scale(dpr.current, dpr.current);

    // 填充黑色背景
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    // 居中绘制图片（contain）
    const canvasAspect = canvasSize.width / canvasSize.height;
    const imgAspect = img.naturalWidth / img.naturalHeight;
    let drawWidth: number, drawHeight: number;
    if (imgAspect > canvasAspect) {
      drawWidth = canvasSize.width;
      drawHeight = canvasSize.width / imgAspect;
    } else {
      drawHeight = canvasSize.height;
      drawWidth = canvasSize.height * imgAspect;
    }
    const drawX = (canvasSize.width - drawWidth) / 2;
    const drawY = (canvasSize.height - drawHeight) / 2;

    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
  }, [imageLoaded, canvasSize]);

  // 重新绘制所有笔迹到上层 Canvas
  const redrawStrokes = useCallback((extraStroke?: Stroke) => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const cw = canvasSize.width * dpr.current;
    const ch = canvasSize.height * dpr.current;
    canvas.width = cw;
    canvas.height = ch;
    ctx.scale(dpr.current, dpr.current);

    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    const allStrokes = extraStroke ? [...strokes, extraStroke] : strokes;
    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.5;
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  }, [strokes, canvasSize]);

  useEffect(() => {
    redrawStrokes();
  }, [strokes, redrawStrokes]);

  // 涂抹事件处理
  const getCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawing.current = true;
    const pos = getCanvasPos(e);

    if (isEraser) {
      // 橡皮擦：删除最近的笔迹
      // 找到距离点击位置最近的笔迹并删除
      setStrokes(prev => {
        for (let i = prev.length - 1; i >= 0; i--) {
          const stroke = prev[i];
          for (const pt of stroke.points) {
            const dist = Math.sqrt((pt.x - pos.x) ** 2 + (pt.y - pos.y) ** 2);
            if (dist < stroke.brushSize + 10) {
              return prev.filter((_, idx) => idx !== i);
            }
          }
        }
        return prev;
      });
      isDrawing.current = false;
      return;
    }

    currentStroke.current = {
      color: activeColor,
      points: [pos],
      brushSize,
    };
  }, [activeColor, brushSize, isEraser, getCanvasPos]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || !currentStroke.current) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    currentStroke.current.points.push(pos);
    redrawStrokes(currentStroke.current);
  }, [getCanvasPos, redrawStrokes]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawing.current || !currentStroke.current) {
      isDrawing.current = false;
      return;
    }
    isDrawing.current = false;
    const stroke = currentStroke.current;
    currentStroke.current = null;
    if (stroke.points.length >= 2) {
      setStrokes(prev => [...prev, stroke]);
    }
  }, []);

  // 计算已使用的颜色
  const usedColors = [...new Set(strokes.map(s => s.color))];

  useEffect(() => {
    onStrokeCountChange?.(strokes.length);
  }, [strokes.length, onStrokeCountChange]);

  // 导出合成图（原图 + 涂抹叠加）
  const exportCompositeImage = useCallback(async (): Promise<string> => {
    const offscreen = document.createElement('canvas');
    const cw = canvasSize.width * dpr.current;
    const ch = canvasSize.height * dpr.current;
    offscreen.width = cw;
    offscreen.height = ch;
    const ctx = offscreen.getContext('2d')!;

    // 画底层源图
    if (bgCanvasRef.current) {
      ctx.drawImage(bgCanvasRef.current, 0, 0);
    }

    // 画涂抹层
    if (paintCanvasRef.current) {
      ctx.drawImage(paintCanvasRef.current, 0, 0);
    }

    return offscreen.toDataURL('image/png');
  }, [canvasSize]);

  // 导出黑白掩膜图（白色=涂抹区域，黑色=保留区域）
  const exportMaskImage = useCallback(async (): Promise<string> => {
    const offscreen = document.createElement('canvas');
    const cw = canvasSize.width * dpr.current;
    const ch = canvasSize.height * dpr.current;
    offscreen.width = cw;
    offscreen.height = ch;
    const ctx = offscreen.getContext('2d')!;

    // 黑色背景（保留区域）
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cw, ch);

    // 绘制所有笔迹为白色（修改区域）
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = stroke.brushSize * dpr.current;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x * dpr.current, stroke.points[0].y * dpr.current);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * dpr.current, stroke.points[i].y * dpr.current);
      }
      ctx.stroke();
    }

    return offscreen.toDataURL('image/png');
  }, [strokes, canvasSize]);

  // 获取颜色指令
  const getColorInstructions = useCallback((): ColorInstruction[] => {
    return usedColors.map(hex => {
      const preset = PRESET_COLORS.find(c => c.hex === hex);
      return {
        color: hex,
        label: colorLabels[hex] || '',
        colorName: preset?.name || hex,
      };
    });
  }, [usedColors, colorLabels]);

  // 重置
  const resetCanvas = useCallback(() => {
    setStrokes([]);
    setColorLabels({});
  }, []);

  useImperativeHandle(ref, () => ({
    exportCompositeImage,
    exportMaskImage,
    getColorInstructions,
    resetCanvas,
  }));

  return (
    <div className="flex h-full">
      {/* 左侧工具栏 */}
      <div className="flex flex-col items-center gap-2 px-2 py-3 bg-black/40 border-r border-white/10 w-12 shrink-0">
        {/* 颜色选择 */}
        {PRESET_COLORS.map(c => (
          <button
            key={c.hex}
            onClick={() => { setActiveColor(c.hex); setIsEraser(false); }}
            className={`w-7 h-7 rounded-full border-2 transition-all ${
              activeColor === c.hex && !isEraser
                ? 'border-white scale-110 shadow-lg'
                : 'border-transparent hover:border-white/50'
            }`}
            style={{ backgroundColor: c.hex }}
            title={c.name}
          />
        ))}

        <div className="w-6 h-px bg-white/20 my-1" />

        {/* 橡皮擦 */}
        <button
          onClick={() => setIsEraser(!isEraser)}
          className={`p-1.5 rounded-lg transition-all ${
            isEraser ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white hover:bg-white/10'
          }`}
          title="橡皮擦"
        >
          <Eraser className="w-4 h-4" />
        </button>

        {/* 清除全部 */}
        <button
          onClick={resetCanvas}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all"
          title="清除全部"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="w-6 h-px bg-white/20 my-1" />

        {/* 笔刷大小 */}
        <button onClick={() => setBrushSize(s => Math.max(5, s - 5))} className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10" title="缩小笔刷">
          <Minus className="w-3.5 h-3.5" />
        </button>
        <div className="text-[9px] text-white/50 text-center">{brushSize}px</div>
        <button onClick={() => setBrushSize(s => Math.min(80, s + 5))} className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10" title="增大笔刷">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 中间画布区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden bg-black/40"
          style={{ cursor: isEraser ? 'crosshair' : 'crosshair' }}
        >
          {/* 底层 Canvas：源图 */}
          <canvas
            ref={bgCanvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ pointerEvents: 'none' }}
          />
          {/* 上层 Canvas：涂抹层 */}
          <canvas
            ref={paintCanvasRef}
            className="absolute inset-0 w-full h-full"
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />
          {/* 提示 */}
          {strokes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-white/20 text-sm">用颜色笔涂抹需要修改的区域</span>
            </div>
          )}
        </div>
      </div>

      {/* 右侧指令面板 */}
      <div className="flex flex-col gap-2 px-2 py-3 bg-black/40 border-l border-white/10 w-48 shrink-0">
        <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-1">颜色指令</div>
        {usedColors.length === 0 && (
          <div className="text-[10px] text-white/25 text-center mt-4">先在画布上涂抹</div>
        )}
        {usedColors.map(hex => {
          const preset = PRESET_COLORS.find(c => c.hex === hex);
          return (
            <div key={hex} className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-sm shrink-0 border border-white/20" style={{ backgroundColor: hex }} />
              <span className="text-[10px] text-white/50 shrink-0">{preset?.name || ''}</span>
              <input
                type="text"
                value={colorLabels[hex] || ''}
                onChange={e => setColorLabels(prev => ({ ...prev, [hex]: e.target.value }))}
                placeholder="描述操作..."
                className="flex-1 min-w-0 h-6 px-1.5 bg-white/10 border border-white/15 rounded text-[10px] text-white outline-none
                  placeholder:text-white/25 focus:border-white/30"
              />
            </div>
          );
        })}
        {usedColors.length > 0 && (
          <div className="mt-auto text-[9px] text-white/20 leading-tight">
            为每种颜色描述操作意图，如"删除花瓶"、"添加猫咪"
          </div>
        )}
      </div>
    </div>
  );
});

PaintCanvas.displayName = 'PaintCanvas';

export default PaintCanvas;
export { PRESET_COLORS };
