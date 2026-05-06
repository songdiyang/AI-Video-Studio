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
}

interface SketchCanvasProps {
  onStrokeCountChange?: (count: number) => void;
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
}, ref) => {
  const excalidrawRef = useRef<ExcalidrawAPI | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [elementCount, setElementCount] = useState(0);

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

  useImperativeHandle(ref, () => ({
    exportSketchImage,
    resetCanvas,
    hasContent,
  }));

  return (
    <div className="flex h-full">
      {/* 左侧工具栏 */}
      <div className="flex flex-col items-center gap-2 px-2 py-3 bg-black/40 border-r border-white/10 w-12 shrink-0">
        {/* 清除全部 */}
        <button
          onClick={resetCanvas}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all"
          title="清除全部"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="w-6 h-px bg-white/20 my-1" />

        {/* 元素计数 */}
        <div className="text-[9px] text-white/40 text-center">
          {elementCount}
        </div>
      </div>

      {/* Excalidraw 画布区域 */}
      <div className="flex-1 relative min-w-0 bg-white">
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
            theme="dark"
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
                viewBackgroundColor: '#ffffff',
                exportBackground: true,
                gridSize: null,
              },
            }}
          />
        </React.Suspense>

        {/* 提示 */}
        {elementCount === 0 && isReady && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-black/20 text-sm">手绘场景草图，AI将根据草图生成图片</span>
          </div>
        )}
      </div>
    </div>
  );
});

SketchCanvas.displayName = 'SketchCanvas';

export default SketchCanvas;
