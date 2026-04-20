import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@heroui/react';
import { Wand2, X, RotateCcw, Sparkles, Compass } from 'lucide-react';
import TrackballWidget, { Rotation } from './TrackballWidget';
import ImageCanvas, { ImageCanvasHandle } from './ImageCanvas';
import PaintCanvas, { PaintCanvasHandle, ColorInstruction } from './PaintCanvas';

export interface CameraGenerateParams {
  compositeImageBase64: string;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  zoomLevel: number;
  imageOffsetX: number;
  imageOffsetY: number;
  mode: 'expand' | 'focus';
  sourceImageUrl: string;
}

export interface PaintGenerateParams {
  compositeImageBase64: string;
  maskImageBase64: string;
  sourceImageUrl: string;
  colorInstructions: ColorInstruction[];
}

type MagicSpaceMode = 'camera' | 'paint';

interface MagicSpacePanelProps {
  sourceImageUrl: string;
  aspectRatio: string;
  onGenerateWithCamera: (params: CameraGenerateParams) => void;
  onGenerateWithPaint: (params: PaintGenerateParams) => void;
  onCancel: () => void;
  isGenerating: boolean;
}

const MagicSpacePanel: React.FC<MagicSpacePanelProps> = ({
  sourceImageUrl,
  aspectRatio,
  onGenerateWithCamera,
  onGenerateWithPaint,
  onCancel,
  isGenerating,
}) => {
  const [activeMode, setActiveMode] = useState<MagicSpaceMode>('paint');

  // 视角模式状态
  const [rotation, setRotation] = useState<Rotation>({ x: 0, y: 0, z: 0 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [cameraMode, setCameraMode] = useState<'expand' | 'focus'>('expand');
  const cameraCanvasRef = useRef<ImageCanvasHandle>(null);

  // 涂改模式状态
  const paintCanvasRef = useRef<PaintCanvasHandle>(null);
  const [strokeCount, setStrokeCount] = useState(0);

  // 视角模式回调
  const handleRotationChange = useCallback((newRotation: Rotation) => {
    setRotation(newRotation);
  }, []);

  const handleZoomChange = useCallback((zoom: number) => {
    setZoomLevel(zoom);
  }, []);

  const handlePositionChange = useCallback((offsetX: number, offsetY: number) => {
    setImageOffset({ x: offsetX, y: offsetY });
  }, []);

  const handleCameraModeChange = useCallback((newMode: 'expand' | 'focus') => {
    setCameraMode(newMode);
  }, []);

  const handleAxisSliderChange = useCallback((axis: 'x' | 'y' | 'z', value: number) => {
    setRotation(prev => ({ ...prev, [axis]: value }));
  }, []);

  const handleAxisInputChange = useCallback((axis: 'x' | 'y' | 'z', value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      const clamped = Math.max(-180, Math.min(180, num));
      setRotation(prev => ({ ...prev, [axis]: clamped }));
    }
  }, []);

  // 生成处理
  const handleGenerate = useCallback(async () => {
    try {
      if (activeMode === 'camera') {
        // 视角模式
        if (!cameraCanvasRef.current) return;
        const base64 = await cameraCanvasRef.current.exportCanvasImage();
        if (!base64) return;
        onGenerateWithCamera({
          compositeImageBase64: base64,
          rotationX: rotation.x,
          rotationY: rotation.y,
          rotationZ: rotation.z,
          zoomLevel,
          imageOffsetX: imageOffset.x,
          imageOffsetY: imageOffset.y,
          mode: cameraMode,
          sourceImageUrl,
        });
      } else {
        // 涂改模式
        if (!paintCanvasRef.current) return;
        const compositeImageBase64 = await paintCanvasRef.current.exportCompositeImage();
        const maskImageBase64 = await paintCanvasRef.current.exportMaskImage();
        const colorInstructions = paintCanvasRef.current.getColorInstructions();

        if (!compositeImageBase64 || !maskImageBase64) return;
        if (colorInstructions.length === 0) return;

        onGenerateWithPaint({
          compositeImageBase64,
          maskImageBase64,
          sourceImageUrl,
          colorInstructions,
        });
      }
    } catch (err) {
      console.error('[MagicSpace] Export failed:', err);
    }
  }, [activeMode, rotation, zoomLevel, imageOffset, cameraMode, sourceImageUrl, onGenerateWithCamera, onGenerateWithPaint]);

  const handleCancel = useCallback(() => {
    cameraCanvasRef.current?.resetCanvas();
    paintCanvasRef.current?.resetCanvas();
    setRotation({ x: 0, y: 0, z: 0 });
    setZoomLevel(1);
    setImageOffset({ x: 0, y: 0 });
    setCameraMode('expand');
    onCancel();
  }, [onCancel]);

  const handleReset = useCallback(() => {
    if (activeMode === 'camera') {
      cameraCanvasRef.current?.resetCanvas();
      setRotation({ x: 0, y: 0, z: 0 });
      setZoomLevel(1);
      setImageOffset({ x: 0, y: 0 });
    } else {
      paintCanvasRef.current?.resetCanvas();
    }
  }, [activeMode]);

  const axisConfigs = [
    { axis: 'x' as const, label: 'X', color: '#ef4444', title: '俯仰' },
    { axis: 'y' as const, label: 'Y', color: '#22c55e', title: '偏航' },
    { axis: 'z' as const, label: 'Z', color: '#3b82f6', title: '翻滚' },
  ];

  const canGenerate = activeMode === 'camera' || (activeMode === 'paint' && strokeCount > 0);

  return (
    <div className="h-full flex flex-col bg-[var(--bg-app)] rounded-lg overflow-hidden">
      {/* 顶部：模式切换 + 关闭按钮 */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-black/60 border-b border-white/10">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveMode('paint')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              activeMode === 'paint'
                ? 'bg-purple-500/30 text-purple-200 border border-purple-400/40'
                : 'text-white/50 hover:text-white/80 hover:bg-white/10'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            涂改模式
          </button>
          <button
            onClick={() => setActiveMode('camera')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              activeMode === 'camera'
                ? 'bg-blue-500/30 text-blue-200 border border-blue-400/40'
                : 'text-white/50 hover:text-white/80 hover:bg-white/10'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            视角模式
          </button>
        </div>
        <button
          onClick={handleCancel}
          disabled={isGenerating}
          className="p-1.5 rounded-lg bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-colors border border-white/10"
          title="关闭魔术空间"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 画布区域 */}
      <div className="flex-1 relative min-h-0">
        {activeMode === 'camera' ? (
          <>
            <ImageCanvas
              ref={cameraCanvasRef}
              sourceImageUrl={sourceImageUrl}
              aspectRatio={aspectRatio}
              onZoomChange={handleZoomChange}
              onPositionChange={handlePositionChange}
              onModeChange={handleCameraModeChange}
            />
            {/* Trackball widget - top right overlay */}
            <div className="absolute top-2 right-2 z-30 bg-black/50 backdrop-blur-sm rounded-lg p-1.5 border border-white/10">
              <TrackballWidget
                value={rotation}
                onChange={handleRotationChange}
                size={110}
                disabled={isGenerating}
              />
            </div>
          </>
        ) : (
          <PaintCanvas
            ref={paintCanvasRef}
            sourceImageUrl={sourceImageUrl}
            onStrokeCountChange={setStrokeCount}
          />
        )}
      </div>

      {/* 底部控制面板 */}
      <div className="flex-shrink-0 bg-black/60 border-t border-white/10 px-3 py-2 space-y-2">
        {/* 视角模式专用控制 */}
        {activeMode === 'camera' && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold shrink-0">视角</span>
            <div className="flex items-center gap-2 flex-1">
              {axisConfigs.map(({ axis, label, color, title }) => (
                <div key={axis} className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span
                    className="text-[10px] font-bold shrink-0 w-3 text-center"
                    style={{ color }}
                    title={title}
                  >
                    {label}
                  </span>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={rotation[axis]}
                    onChange={(e) => handleAxisSliderChange(axis, parseInt(e.target.value, 10))}
                    disabled={isGenerating}
                    className="flex-1 h-1 appearance-none bg-white/20 rounded-full outline-none cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
                      disabled:opacity-40"
                  />
                  <input
                    type="number"
                    min="-180"
                    max="180"
                    value={rotation[axis]}
                    onChange={(e) => handleAxisInputChange(axis, e.target.value)}
                    disabled={isGenerating}
                    className="w-12 h-5 bg-white/10 border border-white/20 rounded text-[10px] text-white text-center outline-none
                      focus:border-white/40 disabled:opacity-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleReset}
              disabled={isGenerating}
              className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0 disabled:opacity-40"
              title="重置所有参数"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 通用操作按钮 */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="flat"
            className="bg-white/10 text-white/70 border border-white/10 hover:bg-white/20"
            onPress={handleCancel}
            isDisabled={isGenerating}
          >
            取消
          </Button>
          <Button
            size="sm"
            className="pro-btn-primary flex-1"
            startContent={<Wand2 className="w-4 h-4" />}
            onPress={handleGenerate}
            isLoading={isGenerating}
            isDisabled={isGenerating || !canGenerate}
          >
            {activeMode === 'camera'
              ? (cameraMode === 'expand' ? '扩图生成' : '聚焦生成')
              : '魔术生成'}
          </Button>
          <span className="text-[10px] text-white/30">
            {activeMode === 'camera'
              ? (cameraMode === 'expand' ? 'AI将填充空白区域' : 'AI将放大局部细节')
              : (strokeCount > 0 ? `已涂抹 ${strokeCount} 笔` : '请先涂抹需要修改的区域')}
          </span>
        </div>
      </div>
    </div>
  );
};

export default MagicSpacePanel;
