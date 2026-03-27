/**
 * 绘图工具组件
 * 工具栏、画布、图层管理、AI辅助绘图集成
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Slider, Tooltip, Popover, PopoverTrigger, PopoverContent, Select, SelectItem } from '@heroui/react';
import { 
  Pencil, Eraser, Square, Type, Undo, Redo,
  ZoomIn, ZoomOut, Move, Eye, EyeOff, Lock, Unlock, Plus, Trash2,
  Wand2, Sparkles, MousePointer, PaintBucket, GripVertical, Loader2
} from 'lucide-react';
import { MangaPage } from '../../../types/projectTypes';
import { AIModel } from '../../../components/AIModelSelector';
import { useToast } from '../../../contexts/ToastContext';
import { useTaskRunner } from '../../../hooks/useTaskRunner';

// ==================== 类型定义 ====================

interface DrawingToolsProps {
  projectId: number;
  episodeNumber: number;
  pageNumber: number;
  page?: MangaPage;
  models?: AIModel[];
  imageModel?: string;
}

// 图层数据结构
interface DrawingLayer {
  id: string;
  name: string;
  type: 'background' | 'lineart' | 'color' | 'text' | 'effect';
  visible: boolean;
  locked: boolean;
  opacity: number;
  order: number;
}

// 绘图工具数据结构
interface DrawingTool {
  type: 'pen' | 'eraser' | 'select' | 'fill' | 'text' | 'shape';
  size: number;
  color: string;
  opacity: number;
}

// AI风格选项
type AIStyle = 'realistic' | 'japanese' | 'american' | 'cartoon' | 'sketch';

// ==================== 颜色预设 ====================

const PRESET_COLORS = [
  '#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF',
  '#FF0000', '#FF6600', '#FFCC00', '#33CC00', '#00CCFF', '#0066FF',
  '#6600FF', '#FF00FF', '#FF99CC', '#FFCC99', '#99FF99', '#99CCFF',
];

// ==================== 默认图层 ====================

const DEFAULT_LAYERS: DrawingLayer[] = [
  { id: 'layer_bg', name: '背景层', type: 'background', visible: true, locked: false, opacity: 100, order: 0 },
  { id: 'layer_lineart', name: '线稿层', type: 'lineart', visible: true, locked: false, opacity: 100, order: 1 },
  { id: 'layer_color', name: '上色层', type: 'color', visible: true, locked: false, opacity: 100, order: 2 },
];

// ==================== AI风格选项 ====================

const AI_STYLES: { value: AIStyle; label: string }[] = [
  { value: 'realistic', label: '写实风格' },
  { value: 'japanese', label: '日式漫画' },
  { value: 'american', label: '美式漫画' },
  { value: 'cartoon', label: '卡通风格' },
  { value: 'sketch', label: '素描风格' },
];

// ==================== 工具栏组件 ====================

interface ToolbarProps {
  tool: DrawingTool;
  onToolChange: (updates: Partial<DrawingTool>) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({
  tool,
  onToolChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) => {
  const tools: { id: DrawingTool['type']; icon: React.ElementType; label: string }[] = [
    { id: 'select', icon: MousePointer, label: '选择工具' },
    { id: 'pen', icon: Pencil, label: '画笔' },
    { id: 'eraser', icon: Eraser, label: '橡皮擦' },
    { id: 'fill', icon: PaintBucket, label: '填充' },
    { id: 'text', icon: Type, label: '文字' },
    { id: 'shape', icon: Square, label: '形状' },
  ];

  return (
    <div className="w-14 flex flex-col items-center gap-1 p-2 border-r border-[var(--border-color)] bg-[var(--bg-nav)]">
      {/* 工具按钮 */}
      {tools.map((t) => {
        const Icon = t.icon;
        return (
          <Tooltip key={t.id} content={t.label} placement="right">
            <button
              onClick={() => onToolChange({ type: t.id })}
              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                tool.type === t.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
              }`}
            >
              <Icon className="w-5 h-5" />
            </button>
          </Tooltip>
        );
      })}

      <div className="w-8 h-px bg-[var(--border-color)] my-2" />

      {/* 撤销/重做 */}
      <Tooltip content="撤销 (Ctrl+Z)" placement="right">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
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
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
            canRedo
              ? 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
              : 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
          }`}
        >
          <Redo className="w-5 h-5" />
        </button>
      </Tooltip>

      <div className="w-8 h-px bg-[var(--border-color)] my-2" />

      {/* 颜色选择器 */}
      <Popover placement="right">
        <PopoverTrigger>
          <button className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[var(--bg-input)]">
            <div
              className="w-6 h-6 rounded border-2 border-[var(--border-color)]"
              style={{ backgroundColor: tool.color }}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-3 bg-[var(--bg-elevated)]">
          <div className="grid grid-cols-6 gap-1.5">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => onToolChange({ color })}
                className={`w-6 h-6 rounded border-2 transition-transform hover:scale-110 ${
                  tool.color === color ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <input
            type="color"
            value={tool.color}
            onChange={(e) => onToolChange({ color: e.target.value })}
            className="w-full h-8 mt-3 rounded cursor-pointer"
          />
        </PopoverContent>
      </Popover>

      {/* 画笔属性 */}
      <Popover placement="right">
        <PopoverTrigger>
          <button className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[var(--bg-input)] text-[var(--text-secondary)]">
            <div className="text-xs font-medium">{tool.size}</div>
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-3 bg-[var(--bg-elevated)] w-52">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">笔刷大小: {tool.size}px</label>
              <Slider
                size="sm"
                step={1}
                minValue={1}
                maxValue={100}
                value={tool.size}
                onChange={(val) => onToolChange({ size: val as number })}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">透明度: {tool.opacity}%</label>
              <Slider
                size="sm"
                step={1}
                minValue={1}
                maxValue={100}
                value={tool.opacity}
                onChange={(val) => onToolChange({ opacity: val as number })}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// ==================== 画布组件 ====================

interface CanvasAreaProps {
  page?: MangaPage;
  tool: DrawingTool;
}

const CanvasArea: React.FC<CanvasAreaProps> = ({ page, tool }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(100);
  const [isDrawing, setIsDrawing] = useState(false);

  // 初始化画布
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  // 绘图逻辑
  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool.type !== 'pen' && tool.type !== 'eraser') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    setIsDrawing(true);
    
    const rect = canvas.getBoundingClientRect();
    const scale = zoom / 100;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = tool.size;
    ctx.strokeStyle = tool.type === 'eraser' ? '#FFFFFF' : tool.color;
    ctx.globalAlpha = tool.opacity / 100;
  }, [tool, zoom]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const scale = zoom / 100;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing, zoom]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-app)] overflow-hidden">
      {/* 顶部信息栏 */}
      <div className="h-10 px-4 flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-nav)]">
        <div className="text-sm text-[var(--text-primary)]">
          {page ? `第${page.episode_number}话 - 第${page.page_number}页` : '未选择页面'}
        </div>
        
        {/* 缩放控制 */}
        <div className="flex items-center gap-2">
          <Button size="sm" isIconOnly variant="light" onPress={() => setZoom(z => Math.max(25, z - 25))}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm text-[var(--text-primary)] w-14 text-center">{zoom}%</span>
          <Button size="sm" isIconOnly variant="light" onPress={() => setZoom(z => Math.min(400, z + 25))}>
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* 画布区域 */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-6">
        {page ? (
          <div
            className="shadow-2xl ring-1 ring-black/10"
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
        ) : (
          <div className="text-center text-[var(--text-muted)]">
            <Square className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">选择页面开始编辑</p>
            <p className="text-sm mt-2">在页面布局标签页中选择或创建一个页面</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== 图层面板组件 ====================

interface LayerPanelProps {
  layers: DrawingLayer[];
  activeLayerId: string;
  onLayerSelect: (id: string) => void;
  onLayerToggleVisibility: (id: string) => void;
  onLayerToggleLock: (id: string) => void;
  onLayerOpacityChange: (id: string, opacity: number) => void;
  onLayerReorder: (fromIndex: number, toIndex: number) => void;
  onLayerAdd: () => void;
  onLayerDelete: (id: string) => void;
}

const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  activeLayerId,
  onLayerSelect,
  onLayerToggleVisibility,
  onLayerToggleLock,
  onLayerOpacityChange,
  onLayerReorder,
  onLayerAdd,
  onLayerDelete,
}) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const sortedLayers = [...layers].sort((a, b) => b.order - a.order);

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      onLayerReorder(dragIndex, index);
      setDragIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  return (
    <div className="w-56 border-l border-[var(--border-color)] bg-[var(--bg-nav)] flex flex-col">
      <div className="p-3 border-b border-[var(--border-color)] flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--text-primary)]">图层管理</span>
        <Button size="sm" isIconOnly variant="light" onPress={onLayerAdd}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sortedLayers.map((layer, index) => (
          <div
            key={layer.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            onClick={() => onLayerSelect(layer.id)}
            className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
              activeLayerId === layer.id
                ? 'bg-[var(--accent)]/20 border border-[var(--accent)]/50'
                : 'hover:bg-[var(--bg-input)] border border-transparent'
            } ${dragIndex === index ? 'opacity-50' : ''}`}
          >
            {/* 拖拽手柄 */}
            <GripVertical className="w-3 h-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 cursor-grab" />
            
            {/* 可见性切换 */}
            <button
              onClick={(e) => { e.stopPropagation(); onLayerToggleVisibility(layer.id); }}
              className="p-1 rounded hover:bg-[var(--bg-input)]"
            >
              {layer.visible ? (
                <Eye className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              )}
            </button>
            
            {/* 锁定切换 */}
            <button
              onClick={(e) => { e.stopPropagation(); onLayerToggleLock(layer.id); }}
              className="p-1 rounded hover:bg-[var(--bg-input)]"
            >
              {layer.locked ? (
                <Lock className="w-3.5 h-3.5 text-[var(--accent)]" />
              ) : (
                <Unlock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              )}
            </button>
            
            {/* 图层名称 */}
            <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{layer.name}</span>
            
            {/* 透明度 */}
            <span className="text-xs text-[var(--text-muted)]">{layer.opacity}%</span>
            
            {/* 删除按钮 */}
            {sortedLayers.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); onLayerDelete(layer.id); }}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20"
              >
                <Trash2 className="w-3 h-3 text-red-400" />
              </button>
            )}
          </div>
        ))}
      </div>
      
      {/* 当前图层透明度调节 */}
      {activeLayerId && (
        <div className="p-3 border-t border-[var(--border-color)]">
          <label className="text-xs text-[var(--text-muted)] mb-2 block">
            图层透明度: {layers.find(l => l.id === activeLayerId)?.opacity || 100}%
          </label>
          <Slider
            size="sm"
            step={1}
            minValue={0}
            maxValue={100}
            value={layers.find(l => l.id === activeLayerId)?.opacity || 100}
            onChange={(val) => onLayerOpacityChange(activeLayerId, val as number)}
          />
        </div>
      )}
    </div>
  );
};

// ==================== AI辅助面板组件 ====================

interface AIPanelProps {
  projectId: number;
  imageModel?: string;
}

const AIPanel: React.FC<AIPanelProps> = ({ projectId, imageModel }) => {
  const { showToast } = useToast();
  const { tasks, runTask, clearTask, isTaskActive } = useTaskRunner({ projectId });
  
  const [selectedStyle, setSelectedStyle] = useState<AIStyle>('japanese');
  const [prompt, setPrompt] = useState('');
  
  // 任务key
  const LINEART_KEY = 'ai_lineart';
  const COLORIZE_KEY = 'ai_colorize';
  
  const lineartTask = tasks[LINEART_KEY];
  const colorizeTask = tasks[COLORIZE_KEY];
  
  // AI生成线稿
  const handleGenerateLineart = async () => {
    if (!imageModel) {
      showToast('请先配置图像模型', 'warning');
      return;
    }
    
    try {
      await runTask(LINEART_KEY, 'manga_lineart_generation', {
        model: imageModel,
        style: selectedStyle,
        prompt: prompt || '清晰的漫画线稿',
      });
      showToast('线稿生成任务已启动', 'success');
    } catch (err: any) {
      showToast(err.message || '启动任务失败', 'error');
    }
  };
  
  // AI自动上色
  const handleAutoColorize = async () => {
    if (!imageModel) {
      showToast('请先配置图像模型', 'warning');
      return;
    }
    
    try {
      await runTask(COLORIZE_KEY, 'manga_auto_colorize', {
        model: imageModel,
        style: selectedStyle,
        prompt: prompt || '精美的漫画上色',
      });
      showToast('自动上色任务已启动', 'success');
    } catch (err: any) {
      showToast(err.message || '启动任务失败', 'error');
    }
  };
  
  // 清除任务状态
  const handleClearTask = (key: string) => {
    clearTask(key);
  };
  
  const renderTaskStatus = (key: string, task: typeof lineartTask) => {
    if (!task) return null;
    
    const isActive = task.status === 'pending' || task.status === 'running';
    
    return (
      <div className={`mt-2 p-2 rounded-lg text-xs ${
        task.status === 'completed' ? 'bg-green-500/10 text-green-400' :
        task.status === 'failed' ? 'bg-red-500/10 text-red-400' :
        'bg-[var(--accent)]/10 text-[var(--accent)]'
      }`}>
        <div className="flex items-center justify-between">
          <span>
            {isActive && <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />}
            {task.status === 'pending' && '等待中...'}
            {task.status === 'running' && `处理中 ${task.progress}%`}
            {task.status === 'completed' && '已完成'}
            {task.status === 'failed' && (task.error || '失败')}
          </span>
          {!isActive && (
            <button onClick={() => handleClearTask(key)} className="hover:underline">
              清除
            </button>
          )}
        </div>
        {isActive && (
          <div className="mt-1 h-1 bg-black/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-current transition-all duration-300"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-64 border-l border-[var(--border-color)] bg-[var(--bg-nav)] flex flex-col">
      <div className="p-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2 text-[var(--text-primary)]">
          <Wand2 className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-sm font-medium">AI 辅助绘图</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* 风格选择 */}
        <div>
          <label className="text-xs text-[var(--text-muted)] mb-2 block">绘画风格</label>
          <select
            value={selectedStyle}
            onChange={(e) => setSelectedStyle(e.target.value as AIStyle)}
            className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)]"
          >
            {AI_STYLES.map(style => (
              <option key={style.value} value={style.value}>{style.label}</option>
            ))}
          </select>
        </div>
        
        {/* 提示词 */}
        <div>
          <label className="text-xs text-[var(--text-muted)] mb-2 block">描述提示（可选）</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述画面内容或风格..."
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none"
          />
        </div>
        
        {/* AI生成线稿 */}
        <div>
          <Button
            color="primary"
            variant="flat"
            className="w-full"
            isLoading={isTaskActive(LINEART_KEY)}
            startContent={!isTaskActive(LINEART_KEY) && <Pencil className="w-4 h-4" />}
            onPress={handleGenerateLineart}
          >
            AI生成线稿
          </Button>
          {renderTaskStatus(LINEART_KEY, lineartTask)}
        </div>
        
        {/* AI自动上色 */}
        <div>
          <Button
            color="secondary"
            variant="flat"
            className="w-full"
            isLoading={isTaskActive(COLORIZE_KEY)}
            startContent={!isTaskActive(COLORIZE_KEY) && <Sparkles className="w-4 h-4" />}
            onPress={handleAutoColorize}
          >
            AI自动上色
          </Button>
          {renderTaskStatus(COLORIZE_KEY, colorizeTask)}
        </div>
        
        {/* 模型信息 */}
        <div className="pt-3 border-t border-[var(--border-color)]">
          <div className="text-xs text-[var(--text-muted)]">
            <p className="mb-1">当前模型:</p>
            <p className="text-[var(--text-secondary)] truncate">
              {imageModel || '未配置'}
            </p>
          </div>
        </div>
        
        {/* 快捷提示 */}
        <div className="text-xs text-[var(--text-muted)]">
          <p className="font-medium mb-1">快捷功能:</p>
          <ul className="space-y-1 text-[var(--text-muted)]">
            <li>• 线稿提取 - 从草稿生成干净线稿</li>
            <li>• 自动上色 - AI智能配色</li>
            <li>• 支持多种漫画风格</li>
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
  models,
  imageModel,
}) => {
  // 绘图工具状态
  const [tool, setTool] = useState<DrawingTool>({
    type: 'pen',
    size: 5,
    color: '#000000',
    opacity: 100,
  });
  
  // 图层状态
  const [layers, setLayers] = useState<DrawingLayer[]>(DEFAULT_LAYERS);
  const [activeLayerId, setActiveLayerId] = useState('layer_lineart');
  
  // 历史记录（简化版）
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  
  // 更新工具
  const handleToolChange = useCallback((updates: Partial<DrawingTool>) => {
    setTool(prev => ({ ...prev, ...updates }));
  }, []);
  
  // 图层操作
  const handleLayerToggleVisibility = useCallback((id: string) => {
    setLayers(prev => prev.map(l => 
      l.id === id ? { ...l, visible: !l.visible } : l
    ));
  }, []);
  
  const handleLayerToggleLock = useCallback((id: string) => {
    setLayers(prev => prev.map(l => 
      l.id === id ? { ...l, locked: !l.locked } : l
    ));
  }, []);
  
  const handleLayerOpacityChange = useCallback((id: string, opacity: number) => {
    setLayers(prev => prev.map(l => 
      l.id === id ? { ...l, opacity } : l
    ));
  }, []);
  
  const handleLayerReorder = useCallback((fromIndex: number, toIndex: number) => {
    setLayers(prev => {
      const sorted = [...prev].sort((a, b) => b.order - a.order);
      const [moved] = sorted.splice(fromIndex, 1);
      sorted.splice(toIndex, 0, moved);
      return sorted.map((l, idx) => ({ ...l, order: sorted.length - 1 - idx }));
    });
  }, []);
  
  const handleLayerAdd = useCallback(() => {
    const maxOrder = Math.max(...layers.map(l => l.order));
    const newLayer: DrawingLayer = {
      id: `layer_${Date.now()}`,
      name: `图层 ${layers.length + 1}`,
      type: 'color',
      visible: true,
      locked: false,
      opacity: 100,
      order: maxOrder + 1,
    };
    setLayers(prev => [...prev, newLayer]);
    setActiveLayerId(newLayer.id);
  }, [layers]);
  
  const handleLayerDelete = useCallback((id: string) => {
    if (layers.length <= 1) return;
    setLayers(prev => prev.filter(l => l.id !== id));
    if (activeLayerId === id) {
      setActiveLayerId(layers.find(l => l.id !== id)?.id || '');
    }
  }, [layers, activeLayerId]);

  return (
    <div className="h-full flex">
      {/* 左侧工具栏 */}
      <Toolbar
        tool={tool}
        onToolChange={handleToolChange}
        onUndo={() => {}}
        onRedo={() => {}}
        canUndo={canUndo}
        canRedo={canRedo}
      />
      
      {/* 中间画布区域 */}
      <CanvasArea page={page} tool={tool} />
      
      {/* 右侧面板 */}
      <div className="flex">
        {/* 图层面板 */}
        <LayerPanel
          layers={layers}
          activeLayerId={activeLayerId}
          onLayerSelect={setActiveLayerId}
          onLayerToggleVisibility={handleLayerToggleVisibility}
          onLayerToggleLock={handleLayerToggleLock}
          onLayerOpacityChange={handleLayerOpacityChange}
          onLayerReorder={handleLayerReorder}
          onLayerAdd={handleLayerAdd}
          onLayerDelete={handleLayerDelete}
        />
        
        {/* AI辅助面板 */}
        <AIPanel projectId={projectId} imageModel={imageModel} />
      </div>
    </div>
  );
};

export default DrawingTools;
