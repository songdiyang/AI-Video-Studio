import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@heroui/react';
import { Wand2, X, RotateCcw } from 'lucide-react';
import TrackballWidget, { Rotation } from './TrackballWidget';
import ImageCanvas, { ImageCanvasHandle } from './ImageCanvas';

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

interface CameraControlPanelProps {
  sourceImageUrl: string;
  aspectRatio: string;
  onGenerate: (params: CameraGenerateParams) => void;
  onCancel: () => void;
  isGenerating: boolean;
}

const CameraControlPanel: React.FC<CameraControlPanelProps> = ({
  sourceImageUrl,
  aspectRatio,
  onGenerate,
  onCancel,
  isGenerating,
}) => {
  const [rotation, setRotation] = useState<Rotation>({ x: 0, y: 0, z: 0 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<'expand' | 'focus'>('expand');
  const canvasRef = useRef<ImageCanvasHandle>(null);

  const handleRotationChange = useCallback((newRotation: Rotation) => {
    setRotation(newRotation);
  }, []);

  const handleZoomChange = useCallback((zoom: number) => {
    setZoomLevel(zoom);
  }, []);

  const handlePositionChange = useCallback((offsetX: number, offsetY: number) => {
    setImageOffset({ x: offsetX, y: offsetY });
  }, []);

  const handleModeChange = useCallback((newMode: 'expand' | 'focus') => {
    setMode(newMode);
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

  const handleGenerate = useCallback(async () => {
    if (!canvasRef.current) return;
    try {
      const base64 = await canvasRef.current.exportCanvasImage();
      if (!base64) return;
      onGenerate({
        compositeImageBase64: base64,
        rotationX: rotation.x,
        rotationY: rotation.y,
        rotationZ: rotation.z,
        zoomLevel,
        imageOffsetX: imageOffset.x,
        imageOffsetY: imageOffset.y,
        mode,
        sourceImageUrl,
      });
    } catch (err) {
      console.error('[CameraControl] Export canvas failed:', err);
    }
  }, [rotation, zoomLevel, imageOffset, mode, sourceImageUrl, onGenerate]);

  const handleCancel = useCallback(() => {
    canvasRef.current?.resetCanvas();
    setRotation({ x: 0, y: 0, z: 0 });
    setZoomLevel(1);
    setImageOffset({ x: 0, y: 0 });
    setMode('expand');
    onCancel();
  }, [onCancel]);

  const handleReset = useCallback(() => {
    canvasRef.current?.resetCanvas();
    setRotation({ x: 0, y: 0, z: 0 });
    setZoomLevel(1);
    setImageOffset({ x: 0, y: 0 });
  }, []);

  const axisConfigs = [
    { axis: 'x' as const, label: 'X', color: '#ef4444', title: '俯仰' },
    { axis: 'y' as const, label: 'Y', color: '#22c55e', title: '偏航' },
    { axis: 'z' as const, label: 'Z', color: '#3b82f6', title: '翻滚' },
  ];

  return (
    <div className="h-full flex flex-col bg-[var(--bg-app)] rounded-lg overflow-hidden">
      {/* Main canvas area with trackball overlay */}
      <div className="flex-1 relative min-h-0">
        <ImageCanvas
          ref={canvasRef}
          sourceImageUrl={sourceImageUrl}
          aspectRatio={aspectRatio}
          onZoomChange={handleZoomChange}
          onPositionChange={handlePositionChange}
          onModeChange={handleModeChange}
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

        {/* Close button - top left */}
        <button
          onClick={handleCancel}
          disabled={isGenerating}
          className="absolute top-2 left-2 z-30 p-1.5 rounded-lg bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-colors border border-white/10"
          title="关闭视角调整"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Control panel */}
      <div className="flex-shrink-0 bg-black/60 border-t border-white/10 px-3 py-2 space-y-2">
        {/* XYZ Axis controls */}
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
                  style={{
                    // @ts-ignore - custom property for thumb color
                    '--thumb-color': color,
                  }}
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

        {/* Action buttons */}
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
            isDisabled={isGenerating}
          >
            {mode === 'expand' ? '扩图生成' : '聚焦生成'}
          </Button>
          <span className="text-[10px] text-white/30">
            {mode === 'expand' ? 'AI将填充空白区域' : 'AI将放大局部细节'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CameraControlPanel;
