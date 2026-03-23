/**
 * 绘图工具组件
 * 画布组件、图层管理、AI辅助绘图集成
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Slider, Tooltip, Popover, PopoverTrigger, PopoverContent } from '@heroui/react';
import { 
  Pencil, Eraser, Square, Circle, Type, Image, Undo, Redo,
  ZoomIn, ZoomOut, Move, Layers, Palette, Download, Upload,
  Wand2, Sparkles, MousePointer, PenTool, Brush
} from 'lucide-react';
import { MangaPage } from '../../../types/projectTypes';
import { useToast } from '../../../contexts/ToastContext';
import { getAuthToken } from '../../../services/auth';

// ==================== 类型定义 ====================

interface DrawingToolsProps {
  projectId: number;
  episodeNumber: number;
  pageNumber: number;
  page?: MangaPage;
}

type Tool = 'select' | 'pencil' | 'brush' | 'eraser' | 'rectangle' | 'ellipse' | 'text' | 'move';

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  type: 'sketch' | 'lineart' | 'color' | 'effects';
}

interface BrushSettings {
  size: number;
  opacity: number;
  color: string;
  hardness: number;
}

// ==================== 颜色面板 ====================

const PRESET_COLORS = [
  '#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF',
  '#FF0000', '#FF6600', '#FFCC00', '#00FF00', '#00CCFF', '#0066FF',
  '#6600FF', '#FF00FF', '#FF99CC', '#FFCC99', '#99FF99', '#99CCFF',
];

// ==================== 工具栏组件 ====================

interface ToolbarProps {
  currentTool: Tool;
  onToolChange: (tool: Tool) => void;
  brushSettings: BrushSettings;
  onBrushSettingsChange: (settings: Partial<BrushSettings>) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({
  currentTool,
  onToolChange,
  brushSettings,
  onBrushSettingsChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) => {
  const tools: { id: Tool; icon: React.ElementType; label: string }[] = [
    { id: 'select', icon: MousePointer, label: '选择' },
    { id: 'move', icon: Move, label: '移动' },
    { id: 'pencil', icon: PenTool, label: '铅笔' },
    { id: 'brush', icon: Brush, label: '画笔' },
    { id: 'eraser', icon: Eraser, label: '橡皮擦' },
    { id: 'rectangle', icon: Square, label: '矩形' },
    { id: 'ellipse', icon: Circle, label: '椭圆' },
    { id: 'text', icon: Type, label: '文字' },
  ];

  return (
    <div className="flex flex-col gap-2 p-2 border-r border-[var(--border-color)] bg-[var(--bg-nav)]">
      {/* 工具按钮 */}
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <Tooltip key={tool.id} content={tool.label} placement="right">
            <button
              onClick={() => onToolChange(tool.id)}
              className={`p-2 rounded-lg transition-colors ${
                currentTool === tool.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
              }`}
            >
              <Icon className="w-5 h-5" />
            </button>
          </Tooltip>
        );
      })}

      <div className="h-px bg-[var(--border-color)] my-2" />

      {/* 撤销/重做 */}
      <Tooltip content="撤销 (Ctrl+Z)" placement="right">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-2 rounded-lg transition-colors ${
            canUndo
              ? 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
              : 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
          }`}
        >
          <Undo className="w-5 h-5" />
        </button>
      </Tooltip>
      <Tooltip content="重做 (Ctrl+Y)" placement="right">
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`p-2 rounded-lg transition-colors ${
            canRedo
              ? 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
              : 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
          }`}
        >
          <Redo className="w-5 h-5" />
        </button>
      </Tooltip>

      <div className="h-px bg-[var(--border-color)] my-2" />

      {/* 颜色选择器 */}
      <Popover placement="right">
        <PopoverTrigger>
          <button className="p-2 rounded-lg hover:bg-[var(--bg-input)]">
            <div
              className="w-5 h-5 rounded border border-[var(--border-color)]"
              style={{ backgroundColor: brushSettings.color }}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-3 bg-[var(--bg-elevated)]">
          <div className="grid grid-cols-6 gap-1">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => onBrushSettingsChange({ color })}
                className={`w-6 h-6 rounded border ${
                  brushSettings.color === color ? 'border-[var(--accent)]' : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <input
            type="color"
            value={brushSettings.color}
            onChange={(e) => onBrushSettingsChange({ color: e.target.value })}
            className="w-full h-8 mt-2 rounded cursor-pointer"
          />
        </PopoverContent>
      </Popover>

      {/* 画笔大小 */}
      <Popover placement="right">
        <PopoverTrigger>
          <button className="p-2 rounded-lg hover:bg-[var(--bg-input)] text-[var(--text-secondary)]">
            <Pencil className="w-5 h-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-3 bg-[var(--bg-elevated)] w-48">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[var(--text-muted)]">大小: {brushSettings.size}px</label>
              <Slider
                size="sm"
                step={1}
                minValue={1}
                maxValue={100}
                value={brushSettings.size}
                onChange={(val) => onBrushSettingsChange({ size: val as number })}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">不透明度: {brushSettings.opacity}%</label>
              <Slider
                size="sm"
                step={1}
                minValue={1}
                maxValue={100}
                value={brushSettings.opacity}
                onChange={(val) => onBrushSettingsChange({ opacity: val as number })}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// ==================== 图层面板 ====================

interface LayerPanelProps {
  layers: Layer[];
  activeLayerId: string;
  onLayerSelect: (id: string) => void;
  onLayerToggleVisibility: (id: string) => void;
  onLayerToggleLock: (id: string) => void;
  onLayerOpacityChange: (id: string, opacity: number) => void;
  onAddLayer: () => void;
}

const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  activeLayerId,
  onLayerSelect,
  onLayerToggleVisibility,
  onAddLayer,
}) => {
  return (
    <div className="w-56 border-l border-[var(--border-color)] bg-[var(--bg-nav)] flex flex-col">
      <div className="p-3 border-b border-[var(--border-color)] flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--text-primary)]">图层</span>
        <Button size="sm" isIconOnly variant="light" onPress={onAddLayer}>
          <Layers className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {layers.map((layer) => (
          <div
            key={layer.id}
            onClick={() => onLayerSelect(layer.id)}
            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${
              activeLayerId === layer.id
                ? 'bg-[var(--accent)]/20 border border-[var(--accent)]/50'
                : 'hover:bg-[var(--bg-input)]'
            }`}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onLayerToggleVisibility(layer.id); }}
              className={`w-4 h-4 rounded ${layer.visible ? 'bg-[var(--accent)]' : 'bg-[var(--bg-input)] border border-[var(--border-color)]'}`}
            />
            <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{layer.name}</span>
            <span className="text-xs text-[var(--text-muted)]">{layer.opacity}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== 画布组件 ====================

interface CanvasProps {
  tool: Tool;
  brushSettings: BrushSettings;
  onDraw?: () => void;
}

const Canvas: React.FC<CanvasProps> = ({ tool, brushSettings }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [zoom, setZoom] = useState(100);
  
  // 初始化画布
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 设置白色背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);
  
  // 绘图逻辑
  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== 'pencil' && tool !== 'brush' && tool !== 'eraser') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    setIsDrawing(true);
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSettings.size;
    ctx.strokeStyle = tool === 'eraser' ? '#FFFFFF' : brushSettings.color;
    ctx.globalAlpha = brushSettings.opacity / 100;
  }, [tool, brushSettings]);
  
  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing]);
  
  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-gray-800 overflow-hidden">
      {/* 缩放控制 */}
      <div className="p-2 border-b border-[var(--border-color)] flex items-center justify-center gap-2 bg-[var(--bg-nav)]">
        <Button size="sm" isIconOnly variant="light" onPress={() => setZoom(z => Math.max(25, z - 25))}>
          <ZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-sm text-[var(--text-primary)] w-16 text-center">{zoom}%</span>
        <Button size="sm" isIconOnly variant="light" onPress={() => setZoom(z => Math.min(400, z + 25))}>
          <ZoomIn className="w-4 h-4" />
        </Button>
      </div>
      
      {/* 画布容器 */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        <div
          className="shadow-2xl"
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center' }}
        >
          <canvas
            ref={canvasRef}
            width={600}
            height={800}
            className="bg-white cursor-crosshair"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
          />
        </div>
      </div>
    </div>
  );
};

// ==================== AI 辅助面板 ====================

interface AIPanelProps {
  onGenerate: (prompt: string) => void;
  isGenerating: boolean;
}

const AIPanel: React.FC<AIPanelProps> = ({ onGenerate, isGenerating }) => {
  const [prompt, setPrompt] = useState('');

  return (
    <div className="w-64 border-l border-[var(--border-color)] bg-[var(--bg-nav)] flex flex-col">
      <div className="p-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2 text-[var(--text-primary)]">
          <Wand2 className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-sm font-medium">AI 辅助绘图</span>
        </div>
      </div>
      
      <div className="flex-1 p-3 space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="描述你想要生成的内容..."
          className="w-full h-32 px-3 py-2 text-sm rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none"
        />
        
        <Button
          color="primary"
          className="w-full"
          isLoading={isGenerating}
          startContent={!isGenerating && <Sparkles className="w-4 h-4" />}
          onPress={() => onGenerate(prompt)}
        >
          {isGenerating ? '生成中...' : 'AI 生成'}
        </Button>
        
        <div className="text-xs text-[var(--text-muted)]">
          <p>快捷功能:</p>
          <ul className="mt-1 space-y-1">
            <li>• 线稿提取</li>
            <li>• 自动上色</li>
            <li>• 背景生成</li>
            <li>• 人物姿态参考</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// ==================== 主组件 ====================

const DrawingTools: React.FC<DrawingToolsProps> = ({
  projectId,
  episodeNumber,
  pageNumber,
  page,
}) => {
  const { showToast } = useToast();
  
  // 状态
  const [currentTool, setCurrentTool] = useState<Tool>('pencil');
  const [brushSettings, setBrushSettings] = useState<BrushSettings>({
    size: 5,
    opacity: 100,
    color: '#000000',
    hardness: 100,
  });
  const [layers, setLayers] = useState<Layer[]>([
    { id: 'sketch', name: '草稿层', visible: true, locked: false, opacity: 50, type: 'sketch' },
    { id: 'lineart', name: '线稿层', visible: true, locked: false, opacity: 100, type: 'lineart' },
    { id: 'color', name: '上色层', visible: true, locked: false, opacity: 100, type: 'color' },
  ]);
  const [activeLayerId, setActiveLayerId] = useState('lineart');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // 更新画笔设置
  const handleBrushSettingsChange = useCallback((settings: Partial<BrushSettings>) => {
    setBrushSettings(prev => ({ ...prev, ...settings }));
  }, []);
  
  // 撤销
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
    }
  }, [historyIndex]);
  
  // 重做
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
    }
  }, [historyIndex, history.length]);
  
  // 图层操作
  const handleLayerToggleVisibility = useCallback((id: string) => {
    setLayers(prev => prev.map(l => 
      l.id === id ? { ...l, visible: !l.visible } : l
    ));
  }, []);
  
  const handleAddLayer = useCallback(() => {
    const newLayer: Layer = {
      id: `layer_${Date.now()}`,
      name: `图层 ${layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 100,
      type: 'color',
    };
    setLayers(prev => [newLayer, ...prev]);
    setActiveLayerId(newLayer.id);
  }, [layers.length]);
  
  // AI 生成
  const handleAIGenerate = useCallback(async (prompt: string) => {
    if (!prompt.trim()) {
      showToast('请输入生成内容描述', 'warning');
      return;
    }
    
    setIsGenerating(true);
    try {
      // 这里实现 AI 生成逻辑
      await new Promise(resolve => setTimeout(resolve, 2000));
      showToast('AI 生成功能开发中', 'info');
    } catch {
      showToast('生成失败', 'error');
    } finally {
      setIsGenerating(false);
    }
  }, [showToast]);

  return (
    <div className="h-full flex">
      {/* 左侧工具栏 */}
      <Toolbar
        currentTool={currentTool}
        onToolChange={setCurrentTool}
        brushSettings={brushSettings}
        onBrushSettingsChange={handleBrushSettingsChange}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
      />
      
      {/* 中间画布 */}
      <Canvas tool={currentTool} brushSettings={brushSettings} />
      
      {/* 右侧面板区域 */}
      <div className="flex">
        {/* 图层面板 */}
        <LayerPanel
          layers={layers}
          activeLayerId={activeLayerId}
          onLayerSelect={setActiveLayerId}
          onLayerToggleVisibility={handleLayerToggleVisibility}
          onLayerToggleLock={() => {}}
          onLayerOpacityChange={() => {}}
          onAddLayer={handleAddLayer}
        />
        
        {/* AI 辅助面板 */}
        <AIPanel onGenerate={handleAIGenerate} isGenerating={isGenerating} />
      </div>
    </div>
  );
};

export default DrawingTools;
