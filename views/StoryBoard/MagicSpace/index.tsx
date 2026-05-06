import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@heroui/react';
import { Wand2, X, RotateCcw, Sparkles, Compass, Maximize2, Camera } from 'lucide-react';
import TrackballWidget, { Rotation } from './TrackballWidget';
import LightingWidget, { LightingDirection } from './LightingWidget';
import Scene3DViewer, { SceneCamera, SceneLighting } from './Scene3DViewer';
import ImageCanvas, { ImageCanvasHandle } from './ImageCanvas';
import PaintCanvas, { PaintCanvasHandle, ColorInstruction } from './PaintCanvas';
import { useWorkbench } from '../../../contexts/WorkbenchContext';
import { fetchCharactersByProject } from '../../../services/assets';

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
  lighting?: LightingDirection;
}

export interface PaintGenerateParams {
  compositeImageBase64: string;
  maskImageBase64: string;
  sourceImageUrl: string;
  colorInstructions: ColorInstruction[];
}

type MagicSpaceMode = 'camera' | 'paint' | 'expand';

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
  const { currentProject } = useWorkbench();
  const [activeMode, setActiveMode] = useState<MagicSpaceMode>('paint');

  // Project characters for 3D scene binding
  const [projectCharacters, setProjectCharacters] = useState<any[]>([]);

  useEffect(() => {
    if (currentProject?.id) {
      fetchCharactersByProject(currentProject.id)
        .then(chars => setProjectCharacters(chars))
        .catch(err => console.error('[MagicSpace] 加载角色失败:', err));
    }
  }, [currentProject?.id]);

  // 扩图模式状态
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [expandMode, setExpandMode] = useState<'expand' | 'focus'>('expand');
  const expandCanvasRef = useRef<ImageCanvasHandle>(null);

  // 视角模式状态
  const [rotation, setRotation] = useState<Rotation>({ x: 0, y: 0, z: 0 });
  const [lighting, setLighting] = useState<LightingDirection>({ azimuth: 45, elevation: 30 });
  const [sceneCamera, setSceneCamera] = useState<SceneCamera>({ x: 15, y: 30, z: 0 });
  const [sceneLighting, setSceneLighting] = useState<SceneLighting>({ azimuth: 45, elevation: 45 });
  const cameraCanvasRef = useRef<ImageCanvasHandle>(null);

  // 涂改模式状态
  const paintCanvasRef = useRef<PaintCanvasHandle>(null);
  const [strokeCount, setStrokeCount] = useState(0);

  // Character panel open state (no longer hides widgets)
  const [, setIsCharacterPanelOpen] = useState(false);

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

  const handleExpandModeChange = useCallback((newMode: 'expand' | 'focus') => {
    setExpandMode(newMode);
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

  const handleLightingChange = useCallback((newLighting: LightingDirection) => {
    setLighting(newLighting);
  }, []);

  const handleSceneCameraChange = useCallback((newCamera: SceneCamera) => {
    setSceneCamera(newCamera);
    // Sync to legacy rotation
    setRotation({ x: newCamera.x, y: newCamera.y, z: newCamera.z });
  }, []);

  const handleSceneLightingChange = useCallback((newLighting: SceneLighting) => {
    setSceneLighting(newLighting);
    // Sync to legacy lighting
    setLighting({ azimuth: newLighting.azimuth, elevation: newLighting.elevation });
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
          mode: expandMode,
          sourceImageUrl,
          lighting,
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
  }, [activeMode, rotation, zoomLevel, imageOffset, expandMode, lighting, sourceImageUrl, onGenerateWithCamera, onGenerateWithPaint]);

  const handleCancel = useCallback(() => {
    cameraCanvasRef.current?.resetCanvas();
    expandCanvasRef.current?.resetCanvas();
    paintCanvasRef.current?.resetCanvas();
    setRotation({ x: 0, y: 0, z: 0 });
    setZoomLevel(1);
    setImageOffset({ x: 0, y: 0 });
    setExpandMode('expand');
    onCancel();
  }, [onCancel]);

  const handleReset = useCallback(() => {
    if (activeMode === 'camera') {
      setRotation({ x: 0, y: 0, z: 0 });
      setLighting({ azimuth: 45, elevation: 30 });
      setSceneCamera({ x: 15, y: 30, z: 0 });
      setSceneLighting({ azimuth: 45, elevation: 45 });
    } else if (activeMode === 'expand') {
      expandCanvasRef.current?.resetCanvas();
      setZoomLevel(1);
      setImageOffset({ x: 0, y: 0 });
      setExpandMode('expand');
    } else {
      paintCanvasRef.current?.resetCanvas();
    }
  }, [activeMode]);

  const axisConfigs = [
    { axis: 'x' as const, label: 'X', color: '#ef4444', title: '俯仰' },
    { axis: 'y' as const, label: 'Y', color: '#22c55e', title: '偏航' },
    { axis: 'z' as const, label: 'Z', color: '#3b82f6', title: '翻滚' },
  ];

  const canGenerate = activeMode === 'camera' || activeMode === 'expand' || (activeMode === 'paint' && strokeCount > 0);

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
            涂改
          </button>
          <button
            onClick={() => setActiveMode('expand')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              activeMode === 'expand'
                ? 'bg-green-500/30 text-green-200 border border-green-400/40'
                : 'text-white/50 hover:text-white/80 hover:bg-white/10'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            扩图
          </button>
          <button
            onClick={() => setActiveMode('camera')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              activeMode === 'camera'
                ? 'bg-blue-500/30 text-blue-200 border border-blue-400/40'
                : 'text-white/50 hover:text-white/80 hover:bg-white/10'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            视角
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
      <div className="flex-1 relative min-h-0 flex">
        {activeMode === 'camera' && (
          <>
            {/* 3D Scene Viewer - takes remaining width */}
            <div className="flex-1 relative z-20">
              <Scene3DViewer
                sourceImageUrl={sourceImageUrl}
                camera={sceneCamera}
                lighting={sceneLighting}
                onCameraChange={handleSceneCameraChange}
                onLightingChange={handleSceneLightingChange}
                disabled={isGenerating}
                projectCharacters={projectCharacters}
                onCharacterPanelOpen={setIsCharacterPanelOpen}
              />
            </div>

            {/* Blender-style Right Sidebar */}
            <div className="w-[260px] flex-shrink-0 bg-[#1e1e2e] border-l border-white/10 flex flex-col z-30 overflow-hidden">
              {/* Sidebar Header */}
              <div className="flex-shrink-0 px-3 py-2 border-b border-white/10 bg-[#252536]">
                <span className="text-[11px] text-white/60 font-medium uppercase tracking-wider">场景属性</span>
              </div>

              {/* Sidebar Content - Scrollable */}
              <div className="flex-1 overflow-y-auto py-2 space-y-3">
                {/* Camera Section */}
                <div className="px-3">
                  <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                    摄影机
                  </div>
                  <div className="bg-black/30 rounded-lg p-2 border border-white/5">
                    <TrackballWidget
                      value={rotation}
                      onChange={handleRotationChange}
                      size={90}
                      disabled={isGenerating}
                    />
                    <div className="mt-2 space-y-1">
                      {[
                        { axis: 'x' as const, label: 'X', color: '#ef4444' },
                        { axis: 'y' as const, label: 'Y', color: '#22c55e' },
                        { axis: 'z' as const, label: 'Z', color: '#3b82f6' },
                      ].map(({ axis, label, color }) => (
                        <div key={axis} className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold shrink-0 w-3 text-center" style={{ color }}>{label}</span>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            step="1"
                            value={rotation[axis]}
                            onChange={(e) => handleAxisSliderChange(axis, parseInt(e.target.value, 10))}
                            className="flex-1 h-1 appearance-none bg-white/20 rounded-full outline-none cursor-pointer
                              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                          />
                          <input
                            type="number"
                            min="-180"
                            max="180"
                            value={rotation[axis]}
                            onChange={(e) => handleAxisInputChange(axis, e.target.value)}
                            className="w-10 h-5 bg-white/10 border border-white/20 rounded text-[9px] text-white text-center outline-none focus:border-white/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Lighting Section */}
                <div className="px-3">
                  <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    打光器
                  </div>
                  <div className="bg-black/30 rounded-lg p-2 border border-white/5 flex flex-col items-center">
                    <LightingWidget
                      value={lighting}
                      onChange={handleLightingChange}
                      size={90}
                      disabled={isGenerating}
                    />
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-white/50">
                      <span>方位: {Math.round(lighting.azimuth)}°</span>
                      <span>高度: {Math.round(lighting.elevation)}°</span>
                    </div>
                    {/* Lighting XYZ sliders */}
                    <div className="w-full mt-2 space-y-1">
                      {[
                        { key: 'azimuth' as const, label: 'X', color: '#ef4444', min: -180, max: 180 },
                        { key: 'elevation' as const, label: 'Y', color: '#22c55e', min: -90, max: 90 },
                      ].map(({ key, label, color, min, max }) => (
                        <div key={key} className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold shrink-0 w-3 text-center" style={{ color }}>{label}</span>
                          <input
                            type="range"
                            min={min}
                            max={max}
                            step="1"
                            value={lighting[key]}
                            onChange={(e) => handleLightingChange({ ...lighting, [key]: parseInt(e.target.value, 10) })}
                            className="flex-1 h-1 appearance-none bg-white/20 rounded-full outline-none cursor-pointer
                              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                          />
                          <input
                            type="number"
                            min={min}
                            max={max}
                            value={lighting[key]}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              handleLightingChange({ ...lighting, [key]: Math.max(min, Math.min(max, val)) });
                            }}
                            className="w-10 h-5 bg-white/10 border border-white/20 rounded text-[9px] text-white text-center outline-none focus:border-white/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>


              </div>
            </div>
          </>
        )}
        {activeMode === 'expand' && (
          <ImageCanvas
            ref={expandCanvasRef}
            sourceImageUrl={sourceImageUrl}
            aspectRatio={aspectRatio}
            onZoomChange={handleZoomChange}
            onPositionChange={handlePositionChange}
            onModeChange={handleExpandModeChange}
          />
        )}
        {activeMode === 'paint' && (
          <PaintCanvas
            ref={paintCanvasRef}
            sourceImageUrl={sourceImageUrl}
            onStrokeCountChange={setStrokeCount}
          />
        )}
      </div>

      {/* 底部控制面板 */}
      <div className="flex-shrink-0 bg-black/60 border-t border-white/10 px-3 py-2 space-y-2">
        {/* 扩图模式专用控制 */}
        {activeMode === 'expand' && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold shrink-0">扩图</span>
            <span className="text-[10px] text-white/30">
              {expandMode === 'expand' ? '缩小图片，AI将填充空白区域' : '放大图片，AI将补充局部细节'}
            </span>
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
              ? '视角生成'
              : activeMode === 'expand'
                ? (expandMode === 'expand' ? '扩图生成' : '聚焦生成')
                : '魔术生成'}
          </Button>
          <span className="text-[10px] text-white/30">
            {activeMode === 'camera'
              ? '根据摄影机和打光角度生成新视角'
              : activeMode === 'expand'
                ? (expandMode === 'expand' ? 'AI将填充空白区域' : 'AI将放大局部细节')
                : (strokeCount > 0 ? `已涂抹 ${strokeCount} 笔` : '请先涂抹需要修改的区域')}
          </span>
        </div>
      </div>
    </div>
  );
};

export default MagicSpacePanel;
