import React, { Suspense, useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { X, Loader2, HelpCircle, Download, FileImage, FileCode, Check, Cloud, CloudOff, Upload, FileJson, Pencil } from 'lucide-react';
import { Tooltip, Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Input } from '@heroui/react';
// 导入 Excalidraw CSS - 必须在使用组件前导入
import '@excalidraw/excalidraw/index.css';
import SketchToolbar from './SketchToolbar';
import { useSketchEditor } from '../hooks/useSketchEditor';
import { useToast } from '../../../../contexts/ToastContext';
import { useTheme } from '../../../../contexts/ThemeContext';
import {
  exportSketchToPNG,
  exportSketchToSVG,
  downloadBlob,
  downloadSVG,
  generateFilename,
  exportToExcalidrawFile,
  downloadExcalidrawFile,
  parseExcalidrawFile
} from '../utils/sketchExport';

// 动态导入 Excalidraw 组件（避免增加首屏包体积）
// 使用 Performance API 追踪加载时间
const Excalidraw = React.lazy(() => {
  const startTime = performance.now();
  performance.mark('excalidraw-load-start');
  
  return import('@excalidraw/excalidraw').then((module) => {
    const loadTime = performance.now() - startTime;
    performance.mark('excalidraw-load-end');
    performance.measure('excalidraw-load-time', 'excalidraw-load-start', 'excalidraw-load-end');
    
    console.log(`[Performance] Excalidraw loaded in ${loadTime.toFixed(0)}ms`);
    
    // 超过3秒记录警告
    if (loadTime > 3000) {
      console.warn(`[Performance] Excalidraw load time exceeded 3s threshold: ${loadTime.toFixed(0)}ms`);
    }
    
    return { default: module.Excalidraw };
  });
});

export interface SketchEditorProps {
  // 分镜模式（保持现有行为）
  storyboardId?: number;
  // 独立模式
  standalone?: boolean;
  sketchProjectId?: number;
  title?: string;
  onTitleChange?: (title: string) => void;
  // 通用
  initialData?: unknown;
  backgroundImage?: string;
  onSave: (result: { sketchUrl?: string; sketchData?: unknown }) => void;
  onClose: () => void;
}

// Excalidraw API 类型定义 - 使用 any 类型避免与库的具体类型耦合
interface ExcalidrawAPI {
  getSceneElements: () => readonly unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
  updateScene: (scene: { elements?: readonly unknown[]; appState?: Record<string, unknown> }) => void;
  resetScene: () => void;
}

// 将 Excalidraw 原生 API 转换为简化版本
const wrapExcalidrawAPI = (nativeApi: any): ExcalidrawAPI => ({
  getSceneElements: () => nativeApi.getSceneElements(),
  getAppState: () => nativeApi.getAppState(),
  getFiles: () => nativeApi.getFiles(),
  updateScene: (scene) => nativeApi.updateScene(scene),
  resetScene: () => nativeApi.resetScene()
});

// 保存状态类型
type SaveStatus = 'saved' | 'saving' | 'unsaved';

// 大画布检测阈值 - 移到组件外部避免每次渲染重新创建
const LARGE_CANVAS_THRESHOLD = 500;

// Debounce 工具函数
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): { (...args: Parameters<T>): void; cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debouncedFn = (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };

  debouncedFn.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debouncedFn;
}

// 加载指示器组件 - 带超时提示的骨架屏
const SketchEditorSkeleton: React.FC = () => {
  const [showExtendedHint, setShowExtendedHint] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowExtendedHint(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-[var(--bg-app)]">
      {/* 加载动画 */}
      <div className="relative">
        <Loader2 className="w-12 h-12 text-[var(--accent)] animate-spin" />
        <div className="absolute inset-0 w-12 h-12 border-4 border-[var(--accent)]/20 rounded-full" />
      </div>
      
      {/* 骨架屏区域 - 模拟工具栏 */}
      <div className="w-full max-w-md space-y-4 px-8">
        <div className="h-10 bg-[var(--bg-elevated)] rounded-lg animate-pulse" />
        <div className="flex gap-2">
          <div className="h-8 w-8 bg-[var(--bg-elevated)] rounded animate-pulse" />
          <div className="h-8 w-8 bg-[var(--bg-elevated)] rounded animate-pulse" />
          <div className="h-8 w-8 bg-[var(--bg-elevated)] rounded animate-pulse" />
          <div className="flex-1" />
          <div className="h-8 w-20 bg-[var(--bg-elevated)] rounded animate-pulse" />
        </div>
      </div>
      
      {/* 文字提示 */}
      <div className="text-center space-y-2">
        <p className="text-sm text-[var(--text-muted)]">正在加载绘图编辑器...</p>
        {showExtendedHint && (
          <p className="text-xs text-[var(--text-muted)]/70 animate-fade-in">
            编辑器体积较大，首次加载可能需要几秒...
          </p>
        )}
      </div>
    </div>
  );
};

// 保存状态指示器组件
const SaveStatusIndicator: React.FC<{ status: SaveStatus }> = ({ status }) => {
  const config = {
    saved: { icon: Check, text: '已保存', color: 'text-green-500' },
    saving: { icon: Cloud, text: '保存中...', color: 'text-yellow-500' },
    unsaved: { icon: CloudOff, text: '未保存', color: 'text-[var(--text-muted)]' }
  };

  const { icon: Icon, text, color } = config[status];

  return (
    <div className={`flex items-center gap-1.5 text-xs ${color}`}>
      <Icon className={`w-3.5 h-3.5 ${status === 'saving' ? 'animate-pulse' : ''}`} />
      <span>{text}</span>
    </div>
  );
};

const SketchEditor: React.FC<SketchEditorProps> = ({
  storyboardId,
  standalone = false,
  sketchProjectId,
  title: initialTitle,
  onTitleChange,
  initialData,
  backgroundImage,
  onSave,
  onClose
}) => {
  const excalidrawRef = useRef<ExcalidrawAPI | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { showToast } = useToast();
  const { theme } = useTheme();
  const [isExcalidrawReady, setIsExcalidrawReady] = useState(false);
  
  // 独立模式：可编辑标题
  const [editableTitle, setEditableTitle] = useState(initialTitle ?? '未命名草图');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  
  // 拖拽状态（独立模式文件导入）
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  
  // 自动保存相关状态
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [elementCount, setElementCount] = useState(0);
  
  // 根据当前主题设置 Excalidraw 主题
  const excalidrawTheme = useMemo(() => {
    return theme === 'light' ? 'light' : 'dark';
  }, [theme]);

  const {
    sketchType,
    controlStrength,
    showBackground,
    backgroundType,
    saving,
    setSketchType,
    setControlStrength,
    toggleBackground,
    setBackgroundType,
    setSaving,
    exportAndUpload,
    saveSketchData
  } = useSketchEditor();

  // 自动保存矢量数据的函数
  const autoSaveSketchData = useCallback(async () => {
    // 检查组件是否已卸载 - 通过 ref 是否为 null 来判断
    if (!excalidrawRef.current) return;
    
    try {
      setSaveStatus('saving');
      const elements = excalidrawRef.current.getSceneElements();
      const appState = excalidrawRef.current.getAppState();
      const files = excalidrawRef.current.getFiles();
      
      // 安全检查：确保数据有效
      if (!elements || !Array.isArray(elements)) {
        console.warn('[SketchEditor] 自动保存跳过：无效的元素数据');
        return;
      }
      
      const sketchData = {
        elements,
        appState: {
          viewBackgroundColor: backgroundType === 'white' ? '#ffffff' : 'transparent'
        },
        files
      };
      
      if (standalone) {
        // 独立模式：通过回调传出数据，外部处理持久化
        // 注意：父组件的异常不会传播回来，这是预期行为
        try {
          onSave({ sketchData });
        } catch (callbackError) {
          console.error('[SketchEditor] onSave 回调执行失败:', callbackError);
          throw callbackError;
        }
      } else if (storyboardId !== undefined) {
        // 分镜模式：调用 API 保存
        await saveSketchData(storyboardId, sketchData);
      }
      
      // 再次检查 ref 是否仍然有效（防止在异步操作期间组件卸载）
      if (excalidrawRef.current) {
        setSaveStatus('saved');
      }
    } catch (error) {
      console.error('[SketchEditor] 自动保存失败:', error);
      // 检查组件是否仍然挂载
      if (excalidrawRef.current) {
        setSaveStatus('unsaved');
      }
    }
  }, [storyboardId, standalone, backgroundType, saveSketchData, onSave]);

  // 计算 debounce 延迟：独立模式 3000ms，分镜模式 2000ms
  const baseDebounceDelay = standalone ? 3000 : 2000;
  
  // 创建 debounced 自动保存函数
  // 注意：大画布优化在 handleExcalidrawChange 中动态调整
  const debouncedAutoSave = useMemo(
    () => debounce(autoSaveSketchData, baseDebounceDelay),
    [autoSaveSketchData, baseDebounceDelay]
  );

  // 大画布 debounced 自动保存（5000ms）
  const debouncedAutoSaveLarge = useMemo(
    () => debounce(autoSaveSketchData, 5000),
    [autoSaveSketchData]
  );

  // 清理 debounce 定时器 - 同时清理普通和大画布的 debounce
  useEffect(() => {
    return () => {
      debouncedAutoSave.cancel();
      debouncedAutoSaveLarge.cancel();
    };
  }, [debouncedAutoSave, debouncedAutoSaveLarge]);

  // 组件首次渲染性能追踪
  useEffect(() => {
    performance.mark('sketch-editor-mounted');
    if (performance.getEntriesByName('excalidraw-load-start').length > 0) {
      performance.measure(
        'sketch-editor-total-init',
        'excalidraw-load-start',
        'sketch-editor-mounted'
      );
      const measure = performance.getEntriesByName('sketch-editor-total-init').pop();
      if (measure) {
        console.log(`[Performance] SketchEditor total init: ${measure.duration.toFixed(0)}ms`);
      }
    }
  }, []);

  // 处理 Excalidraw onChange 事件
  const handleExcalidrawChange = useCallback(
    (elements: readonly any[], appState: any) => {
      const visibleElements = elements.filter(el => !el.isDeleted);
      const count = visibleElements.length;
      
      // 使用 requestIdleCallback 处理非紧急状态更新（元素计数、缩放等）
      const updateNonCriticalState = () => {
        setElementCount(count);
        
        if (appState.zoom && typeof appState.zoom === 'object' && 'value' in appState.zoom) {
          setZoomLevel(Math.round((appState.zoom as { value: number }).value * 100));
        }
      };
      
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(updateNonCriticalState, { timeout: 100 });
      } else {
        // 降级处理：使用 setTimeout
        setTimeout(updateNonCriticalState, 0);
      }
      
      // 标记为未保存并触发自动保存
      if (isExcalidrawReady) {
        setSaveStatus('unsaved');
        
        // 大画布优化：元素超过阈值时使用更长的 debounce 延迟
        if (count > LARGE_CANVAS_THRESHOLD) {
          debouncedAutoSave.cancel();
          debouncedAutoSaveLarge();
        } else {
          debouncedAutoSaveLarge.cancel();
          debouncedAutoSave();
        }
      }
    },
    [isExcalidrawReady, debouncedAutoSave, debouncedAutoSaveLarge]
  );

  // 处理 Excalidraw 初始化完成
  const handleExcalidrawMount = useCallback((nativeApi: any) => {
    try {
      const api = wrapExcalidrawAPI(nativeApi);
      excalidrawRef.current = api;
      setIsExcalidrawReady(true);

      // 如果有初始数据，恢复到画布 - 增强防御性验证
      if (initialData && typeof initialData === 'object') {
        const data = initialData as { elements?: readonly unknown[]; appState?: Record<string, unknown> };
        
        // 验证 elements 是否为有效数组
        if (data.elements && Array.isArray(data.elements)) {
          try {
            api.updateScene({
              elements: data.elements,
              appState: data.appState
            });
            // 初始化元素数量 - 安全过滤
            const visibleElements = (data.elements as any[]).filter(
              el => el && typeof el === 'object' && !el.isDeleted
            );
            setElementCount(visibleElements.length);
          } catch (sceneError) {
            console.error('[SketchEditor] 恢复场景数据失败:', sceneError);
            // 场景恢复失败不阻塞编辑器初始化，用户可以从空白画布开始
          }
        }
      }
    } catch (error) {
      console.error('[SketchEditor] Excalidraw 挂载失败:', error);
      // 即使挂载出错，也标记为就绪，让用户能看到错误提示
      setIsExcalidrawReady(true);
    }
  }, [initialData]);

  // 保存草图（手动保存）
  const handleSave = useCallback(async () => {
    if (!excalidrawRef.current) {
      showToast('画布组件未就绪', 'error');
      return;
    }

    // 取消自动保存避免冲突
    debouncedAutoSave.cancel();
    debouncedAutoSaveLarge.cancel();
    setSaving(true);
    setSaveStatus('saving');

    try {
      // 获取画布数据
      const elements = excalidrawRef.current.getSceneElements();
      const appState = excalidrawRef.current.getAppState();
      const files = excalidrawRef.current.getFiles();

      // 构建矢量数据
      const sketchData = {
        elements,
        appState: {
          viewBackgroundColor: backgroundType === 'white' ? '#ffffff' : 'transparent'
        },
        files
      };
      
      if (standalone) {
        // 独立模式：直接通过回调传出数据
        onSave({ sketchData });
        setSaveStatus('saved');
        showToast('草图保存成功', 'success');
      } else if (storyboardId !== undefined) {
        // 分镜模式：导出 PNG 并上传到服务器
        const { exportToBlob: exportToBlobFn } = await import('@excalidraw/excalidraw');

        const blob = await exportToBlobFn({
          elements: elements as Parameters<typeof exportToBlobFn>[0]['elements'],
          appState: {
            ...(appState as object),
            exportBackground: backgroundType === 'white',
            viewBackgroundColor: backgroundType === 'white' ? '#ffffff' : 'transparent'
          } as Parameters<typeof exportToBlobFn>[0]['appState'],
          files: files as Parameters<typeof exportToBlobFn>[0]['files'],
          mimeType: 'image/png',
          quality: 1
        });

        const sketchUrl = await exportAndUpload(blob, storyboardId, sketchType, controlStrength);
        await saveSketchData(storyboardId, sketchData);

        setSaveStatus('saved');
        showToast('草图保存成功', 'success');
        onSave({ sketchUrl, sketchData });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败';
      showToast(message, 'error');
      setSaveStatus('unsaved');
      console.error('[SketchEditor] 保存失败:', error);
    } finally {
      setSaving(false);
    }
  }, [
    storyboardId,
    standalone,
    sketchType,
    controlStrength,
    backgroundType,
    exportAndUpload,
    saveSketchData,
    onSave,
    setSaving,
    showToast,
    debouncedAutoSave,
    debouncedAutoSaveLarge
  ]);

  // 导出 PNG
  const handleExportPNG = useCallback(async () => {
    if (!excalidrawRef.current) {
      showToast('画布组件未就绪', 'error');
      return;
    }

    try {
      const elements = excalidrawRef.current.getSceneElements();
      const appState = excalidrawRef.current.getAppState();
      const files = excalidrawRef.current.getFiles();

      const blob = await exportSketchToPNG(
        elements as any,
        { ...appState as any, viewBackgroundColor: backgroundType === 'white' ? '#ffffff' : 'transparent' },
        files as any
      );

      if (blob) {
        downloadBlob(blob, generateFilename('sketch', 'png'));
        showToast('PNG 导出成功', 'success');
      } else {
        showToast('PNG 导出失败', 'error');
      }
    } catch (error) {
      console.error('[SketchEditor] PNG 导出失败:', error);
      showToast('PNG 导出失败', 'error');
    }
  }, [backgroundType, showToast]);

  // 导出 SVG
  const handleExportSVG = useCallback(async () => {
    if (!excalidrawRef.current) {
      showToast('画布组件未就绪', 'error');
      return;
    }

    try {
      const elements = excalidrawRef.current.getSceneElements();
      const appState = excalidrawRef.current.getAppState();
      const files = excalidrawRef.current.getFiles();

      const svgString = await exportSketchToSVG(
        elements as any,
        { ...appState as any, viewBackgroundColor: backgroundType === 'white' ? '#ffffff' : 'transparent' },
        files as any
      );

      if (svgString) {
        downloadSVG(svgString, generateFilename('sketch', 'svg'));
        showToast('SVG 导出成功', 'success');
      } else {
        showToast('SVG 导出失败', 'error');
      }
    } catch (error) {
      console.error('[SketchEditor] SVG 导出失败:', error);
      showToast('SVG 导出失败', 'error');
    }
  }, [backgroundType, showToast]);

  // 导出 .excalidraw 文件（独立模式专用）
  const handleExportExcalidraw = useCallback(() => {
    if (!excalidrawRef.current) {
      showToast('画布组件未就绪', 'error');
      return;
    }

    try {
      const elements = excalidrawRef.current.getSceneElements();
      const appState = excalidrawRef.current.getAppState();
      const files = excalidrawRef.current.getFiles();

      const jsonString = exportToExcalidrawFile(
        elements as any,
        { ...appState as any, viewBackgroundColor: backgroundType === 'white' ? '#ffffff' : 'transparent' },
        files as any
      );

      const filename = editableTitle 
        ? `${editableTitle.replace(/[^\w\u4e00-\u9fa5-]/g, '_')}.excalidraw`
        : generateFilename('sketch', 'excalidraw');
      
      downloadExcalidrawFile(jsonString, filename);
      showToast('.excalidraw 导出成功', 'success');
    } catch (error) {
      console.error('[SketchEditor] .excalidraw 导出失败:', error);
      showToast('.excalidraw 导出失败', 'error');
    }
  }, [backgroundType, editableTitle, showToast]);

  // 导入 .excalidraw 文件（独立模式专用）
  const handleImportExcalidraw = useCallback((file: File) => {
    if (!excalidrawRef.current) {
      showToast('画布组件未就绪', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = parseExcalidrawFile(content);
        
        if (!parsed) {
          showToast('无法解析文件，请确认是有效的 .excalidraw 文件', 'error');
          return;
        }

        excalidrawRef.current?.updateScene({
          elements: parsed.elements as readonly unknown[],
          appState: parsed.appState as Record<string, unknown>
        });
        
        setElementCount(parsed.elements.filter(el => !el.isDeleted).length);
        setSaveStatus('unsaved');
        showToast('文件导入成功', 'success');
      } catch (error) {
        console.error('[SketchEditor] 导入文件失败:', error);
        showToast('导入文件失败', 'error');
      }
    };
    reader.onerror = () => {
      showToast('读取文件失败', 'error');
    };
    reader.readAsText(file);
  }, [showToast]);

  // 处理文件选择（独立模式文件导入按钮）
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImportExcalidraw(file);
      // 清空 input 以便可以再次选择同一文件
      e.target.value = '';
    }
  }, [handleImportExcalidraw]);

  // 拖拽导入处理（独立模式专用）
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!standalone) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  }, [standalone]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!standalone) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  }, [standalone]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!standalone) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);

    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.excalidraw') || file.type === 'application/json')) {
      handleImportExcalidraw(file);
    } else if (file) {
      showToast('请拖入 .excalidraw 文件', 'warning');
    }
  }, [standalone, handleImportExcalidraw, showToast]);

  // 处理标题编辑（独立模式）
  const handleTitleChange = useCallback((value: string) => {
    setEditableTitle(value);
    onTitleChange?.(value);
  }, [onTitleChange]);

  const handleTitleBlur = useCallback(() => {
    setIsEditingTitle(false);
    if (!editableTitle.trim()) {
      setEditableTitle('未命名草图');
      onTitleChange?.('未命名草图');
    }
  }, [editableTitle, onTitleChange]);

  // 清空画布
  const handleClear = useCallback(() => {
    if (!excalidrawRef.current) return;
    
    // 重置画布场景
    excalidrawRef.current.resetScene();
    setElementCount(0);
    setSaveStatus('unsaved');
    showToast('画布已清空', 'success');
  }, [showToast]);

  // 键盘快捷键处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // ESC 键关闭
      if (e.key === 'Escape' && !saving) {
        onClose();
        return;
      }

      // Ctrl+S / Cmd+S：手动保存
      if (modKey && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        handleSave();
        return;
      }

      // Ctrl+E / Cmd+E：导出 PNG
      if (modKey && e.key === 'e' && !e.shiftKey) {
        e.preventDefault();
        handleExportPNG();
        return;
      }

      // Ctrl+Shift+E / Cmd+Shift+E：导出 SVG
      if (modKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        handleExportSVG();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saving, onClose, handleSave, handleExportPNG, handleExportSVG]);

  return (
    <div 
      className="fixed inset-0 z-fullscreen flex flex-col bg-[var(--bg-app)]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 隐藏的文件输入（用于导入按钮） */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".excalidraw,.json"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* 独立模式：顶部标题栏 */}
      {standalone && (
        <div className="flex items-center gap-3 px-4 py-2 bg-[var(--bg-card)] border-b border-[var(--border-color)]">
          {isEditingTitle ? (
            <Input
              value={editableTitle}
              onValueChange={handleTitleChange}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleBlur()}
              size="sm"
              variant="bordered"
              classNames={{
                input: 'text-base font-medium',
                inputWrapper: 'h-8 min-h-8'
              }}
              autoFocus
            />
          ) : (
            <button
              onClick={() => setIsEditingTitle(true)}
              className="flex items-center gap-2 text-base font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
            >
              <span>{editableTitle}</span>
              <Pencil className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </button>
          )}
        </div>
      )}

      {/* 顶部工具栏 - 独立模式隐藏 SketchTypeSelector 和 ControlStrengthSlider */}
      <SketchToolbar
        sketchType={sketchType}
        controlStrength={controlStrength}
        showBackground={showBackground}
        backgroundType={backgroundType}
        onSketchTypeChange={setSketchType}
        onControlStrengthChange={setControlStrength}
        onToggleBackground={toggleBackground}
        onBackgroundTypeChange={setBackgroundType}
        onSave={handleSave}
        onCancel={onClose}
        onClear={handleClear}
        saving={saving}
        hasBackgroundImage={!!backgroundImage}
        standalone={standalone}
      />

      {/* 画布区域 */}
      <div className="flex-1 relative">
        {/* 背景图层（底图参考） */}
        {backgroundImage && showBackground && (
          <div
            className="absolute inset-0 pointer-events-none z-0 opacity-30"
            style={{
              backgroundImage: `url(${backgroundImage})`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }}
          />
        )}

        {/* Excalidraw 画布 */}
        <div className="absolute inset-0 z-content">
          <Suspense fallback={<SketchEditorSkeleton />}>
            <Excalidraw
              excalidrawAPI={handleExcalidrawMount}
              onChange={handleExcalidrawChange}
              initialData={{
                appState: {
                  viewBackgroundColor: backgroundType === 'white' ? '#ffffff' : 'transparent',
                  currentItemStrokeColor: excalidrawTheme === 'light' ? '#1e1e1e' : '#ffffff',
                  currentItemBackgroundColor: 'transparent',
                  currentItemFillStyle: 'solid',
                  currentItemStrokeWidth: 2,
                  currentItemRoughness: 1, // 手绘风格
                  theme: excalidrawTheme,
                  gridSize: undefined
                }
              }}
              UIOptions={{
                canvasActions: {
                  loadScene: false,
                  saveToActiveFile: false,
                  export: false,
                  saveAsImage: false
                }
              }}
              langCode="zh-CN"
              theme={excalidrawTheme}
            />
          </Suspense>
        </div>

        {/* 关闭按钮（移动端可见） */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-float p-2 rounded-full bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors sm:hidden"
          disabled={saving}
        >
          <X className="w-5 h-5" />
        </button>

        {/* 右上角导出按钮组 */}
        <div className="absolute top-4 right-4 z-float hidden sm:flex items-center gap-2">
          {/* 独立模式：导入按钮 */}
          {standalone && (
            <Button
              variant="flat"
              size="sm"
              startContent={<Upload className="w-4 h-4" />}
              className="bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)]"
              onPress={() => fileInputRef.current?.click()}
            >
              导入
            </Button>
          )}
          
          <Dropdown>
            <DropdownTrigger>
              <Button
                variant="flat"
                size="sm"
                startContent={<Download className="w-4 h-4" />}
                className="bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)]"
              >
                导出
              </Button>
            </DropdownTrigger>
            <DropdownMenu aria-label="导出选项">
              <DropdownItem
                key="png"
                startContent={<FileImage className="w-4 h-4" />}
                description="Ctrl+E"
                onPress={handleExportPNG}
              >
                导出为 PNG
              </DropdownItem>
              <DropdownItem
                key="svg"
                startContent={<FileCode className="w-4 h-4" />}
                description="Ctrl+Shift+E"
                onPress={handleExportSVG}
              >
                导出为 SVG
              </DropdownItem>
              {/* 独立模式：.excalidraw 导出 */}
              {standalone ? (
                <DropdownItem
                  key="excalidraw"
                  startContent={<FileJson className="w-4 h-4" />}
                  description="原生格式"
                  onPress={handleExportExcalidraw}
                >
                  导出为 .excalidraw
                </DropdownItem>
              ) : null}
            </DropdownMenu>
          </Dropdown>
        </div>

        {/* 帮助提示 */}
        <div className="absolute bottom-4 left-4 z-float">
          <Tooltip 
            content={
              <div className="text-xs space-y-1 p-1">
                <p><strong>快捷键提示：</strong></p>
                <p>• V - 选择工具</p>
                <p>• P - 铅笔工具</p>
                <p>• L - 线条工具</p>
                <p>• R - 矩形工具</p>
                <p>• O - 椭圆工具</p>
                <p>• E - 橡皮擦</p>
                <p>• Ctrl+Z - 撤销</p>
                <p>• Ctrl+S - 保存</p>
                <p>• Ctrl+E - 导出 PNG</p>
                <p>• Ctrl+Shift+E - 导出 SVG</p>
                <p>• ESC - 退出编辑器</p>
              </div>
            }
            placement="top"
            classNames={{ content: "bg-[var(--bg-card)] border border-[var(--border-color)]" }}
          >
            <button className="p-2 rounded-full bg-[var(--bg-card)]/80 backdrop-blur-sm border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <HelpCircle className="w-5 h-5" />
            </button>
          </Tooltip>
        </div>

        {/* 底部状态栏 */}
        <div className="absolute bottom-4 right-4 z-float hidden md:flex items-center gap-4 px-3 py-1.5 rounded-lg bg-[var(--bg-card)]/80 backdrop-blur-sm border border-[var(--border-color)]">
          {/* 保存状态 */}
          <SaveStatusIndicator status={saveStatus} />
          
          {/* 分隔符 */}
          <div className="w-px h-4 bg-[var(--border-color)]" />
          
          {/* 缩放比例 */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span>缩放:</span>
            <span className="font-mono">{zoomLevel}%</span>
          </div>
          
          {/* 分隔符 */}
          <div className="w-px h-4 bg-[var(--border-color)]" />
          
          {/* 元素数量 */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span>元素:</span>
            <span className="font-mono">{elementCount}</span>
          </div>
        </div>

        {/* 拖拽覆盖层（独立模式文件导入） */}
        {standalone && isDraggingFile && (
          <div className="absolute inset-0 z-overlay flex items-center justify-center bg-[var(--bg-app)]/90 backdrop-blur-sm border-4 border-dashed border-[var(--accent)] rounded-lg">
            <div className="text-center">
              <Upload className="w-16 h-16 mx-auto text-[var(--accent)] mb-4" />
              <p className="text-lg font-medium text-[var(--text-primary)]">松开鼠标导入文件</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">支持 .excalidraw 格式</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SketchEditor;
