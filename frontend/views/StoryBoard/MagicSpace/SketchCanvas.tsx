import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { RotateCcw, Loader2 } from 'lucide-react';
import '@excalidraw/excalidraw/index.css';

// 动态导入 Excalidraw 组件（避免增加首屏包体积）
const Excalidraw = React.lazy(() => {
  const startTime = performance.now();
  return import('@excalidraw/excalidraw').then((module) => {
    const loadTime = performance.now() - startTime;
    console.log(`[SketchCanvas] Excalidraw loaded in ${loadTime.toFixed(0)}ms`);
    return { default: module.Excalidraw };
  });
});

// 动态导入导出工具
const exportToBlob = async (opts: any): Promise<Blob | null> => {
  try {
    const { exportToBlob: fn } = await import('@excalidraw/excalidraw');
    return await fn(opts);
  } catch (error) {
    console.error('[SketchCanvas] exportToBlob failed:', error);
    return null;
  }
};

export interface SketchCanvasHandle {
  exportSketchImage: () => Promise<string>;
  resetCanvas: () => void;
  hasContent: () => boolean;
  loadSketchData: (data: any) => void;
  getSketchData: () => any;
}

interface SketchCanvasProps {
  onStrokeCountChange?: (count: number) => void;
  initialData?: any;  // 初始草图数据
}

interface ExcalidrawAPI {
  getSceneElements: () => readonly unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
  updateScene: (scene: { elements?: readonly unknown[]; appState?: Record<string, unknown> }) => void;
  resetScene: () => void;
}

const SketchCanvas = forwardRef<SketchCanvasHandle, SketchCanvasProps>(({
  onStrokeCountChange,
  initialData,
}, ref) => {
  const excalidrawRef = useRef<ExcalidrawAPI | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [elementCount, setElementCount] = useState(0);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);

  // 加载初始数据
  useEffect(() => {
    if (isReady && initialData && !initialDataLoaded && excalidrawRef.current) {
      try {
        const elements = initialData.elements || [];
        const appState = initialData.appState || {};
        const files = initialData.files || {};
        
        excalidrawRef.current.updateScene({
          elements,
          appState: {
            ...appState,
            viewBackgroundColor: '#f5f5f5',
            exportBackground: true,
          },
        });
        
        setElementCount(elements.length);
        onStrokeCountChange?.(elements.length);
        setInitialDataLoaded(true);
        
        console.log('[SketchCanvas] Initial data loaded:', { elementCount: elements.length });
      } catch (error) {
        console.error('[SketchCanvas] Failed to load initial data:', error);
      }
    }
  }, [isReady, initialData, initialDataLoaded, onStrokeCountChange]);

  // 监听元素变化
  const handleChange = useCallback((elements: readonly unknown[]) => {
    const count = elements.length;
    setElementCount(count);
    onStrokeCountChange?.(count);
  }, [onStrokeCountChange]);

  // 导出草图为 PNG base64
  const exportSketchImage = useCallback(async (): Promise<string> => {
    if (!excalidrawRef.current) {
      throw new Error('草图编辑器未就绪');
    }

    const elements = excalidrawRef.current.getSceneElements();
    const appState = excalidrawRef.current.getAppState();
    const files = excalidrawRef.current.getFiles();

    const blob = await exportToBlob({
      elements,
      appState: {
        ...appState,
        exportBackground: true,
        viewBackgroundColor: '#ffffff',
      },
      files: files ?? undefined,
      mimeType: 'image/png',
      quality: 1,
    });

    if (!blob) {
      throw new Error('导出草图失败');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }, []);

  // 重置画布
  const resetCanvas = useCallback(() => {
    if (excalidrawRef.current) {
      excalidrawRef.current.updateScene({ elements: [] });
    }
    setElementCount(0);
    onStrokeCountChange?.(0);
  }, [onStrokeCountChange]);

  // 检查是否有内容
  const hasContent = useCallback(() => {
    return elementCount > 0;
  }, [elementCount]);

  // 加载草图数据
  const loadSketchData = useCallback((data: any) => {
    if (!excalidrawRef.current || !data) return;
    
    try {
      const elements = data.elements || [];
      const appState = data.appState || {};
      
      excalidrawRef.current.updateScene({
        elements,
        appState: {
          ...appState,
          viewBackgroundColor: '#f5f5f5',
          exportBackground: true,
        },
      });
      
      setElementCount(elements.length);
      onStrokeCountChange?.(elements.length);
      setInitialDataLoaded(true);
      
      console.log('[SketchCanvas] Sketch data loaded:', { elementCount: elements.length });
    } catch (error) {
      console.error('[SketchCanvas] Failed to load sketch data:', error);
    }
  }, [onStrokeCountChange]);

  // 获取当前草图数据
  const getSketchData = useCallback(() => {
    if (!excalidrawRef.current) return null;
    
    return {
      elements: excalidrawRef.current.getSceneElements(),
      appState: excalidrawRef.current.getAppState(),
      files: excalidrawRef.current.getFiles(),
    };
  }, []);

  useImperativeHandle(ref, () => ({
    exportSketchImage,
    resetCanvas,
    hasContent,
    loadSketchData,
    getSketchData,
  }));

  return (
    <div className="h-full w-full relative">
      {/* Excalidraw 画布区域 - 使用原生工具栏 */}
      <div className="excalidraw-container absolute inset-0 bg-white">
        <React.Suspense
          fallback={
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-app)]">
              <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin mb-3" />
              <p className="text-sm text-[var(--text-muted)]">加载绘图编辑器...</p>
            </div>
          }
        >
          <Excalidraw
            excalidrawAPI={(api: any) => {
              excalidrawRef.current = {
                getSceneElements: () => api.getSceneElements(),
                getAppState: () => api.getAppState(),
                getFiles: () => api.getFiles(),
                updateScene: (scene) => api.updateScene(scene),
                resetScene: () => api.resetScene(),
              };
              setIsReady(true);
            }}
            onChange={handleChange}
            theme="light"
            UIOptions={{
              canvasActions: {
                saveToActiveFile: false,
                loadScene: false,
                export: false,
                toggleTheme: false,
                saveAsImage: false,
              },
              tools: {
                image: false,
              },
            }}
            initialData={{
              appState: {
                viewBackgroundColor: '#f5f5f5',
                exportBackground: true,
                gridSize: null,
              },
            }}
          />
        </React.Suspense>

        {/* 提示 */}
        {elementCount === 0 && isReady && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <span className="text-black/20 text-sm">手绘场景草图，AI将根据草图生成图片</span>
          </div>
        )}
      </div>
    </div>
  );
});

SketchCanvas.displayName = 'SketchCanvas';

export default SketchCanvas;
