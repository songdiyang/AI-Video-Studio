/**
 * 草图导出工具
 * 提供 Excalidraw 数据导出为 PNG/SVG 以及下载、缩略图生成功能
 */

// 使用简化类型定义避免依赖 @excalidraw 内部类型
type ExcalidrawElement = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  [key: string]: unknown;
};

type AppState = Record<string, unknown> & {
  viewBackgroundColor?: string;
  exportBackground?: boolean;
  exportWithDarkMode?: boolean;
};

type BinaryFiles = Record<string, unknown> | null;

/**
 * 导出为 PNG Blob
 * 动态导入 exportToBlob 避免增加首屏包体积
 */
export async function exportSketchToPNG(
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles | null
): Promise<Blob | null> {
  try {
    const { exportToBlob } = await import('@excalidraw/excalidraw');
    
    const blob = await exportToBlob({
      elements,
      appState: {
        ...appState,
        exportBackground: true,
        viewBackgroundColor: appState.viewBackgroundColor ?? '#ffffff'
      } as AppState,
      files: files ?? undefined,
      mimeType: 'image/png',
      quality: 1
    });
    
    return blob;
  } catch (error) {
    console.error('[sketchExport] 导出 PNG 失败:', error);
    return null;
  }
}

/**
 * 导出为 SVG 字符串
 * 动态导入 exportToSvg 避免增加首屏包体积
 */
export async function exportSketchToSVG(
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles | null
): Promise<string | null> {
  try {
    const { exportToSvg } = await import('@excalidraw/excalidraw');
    
    const svg = await exportToSvg({
      elements,
      appState: {
        ...appState,
        exportBackground: true,
        viewBackgroundColor: appState.viewBackgroundColor ?? '#ffffff'
      } as AppState,
      files: files ?? undefined
    });
    
    // 将 SVGElement 转换为字符串
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    
    return svgString;
  } catch (error) {
    console.error('[sketchExport] 导出 SVG 失败:', error);
    return null;
  }
}

/**
 * 触发 Blob 文件下载
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 触发 SVG 字符串下载
 */
export function downloadSVG(svgString: string, filename: string): void {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, filename);
}

/**
 * 生成缩略图（用于 SketchPreview）
 * @returns 返回 data URL 或 null
 */
export async function generateThumbnail(
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles | null,
  size: { width: number; height: number }
): Promise<string | null> {
  try {
    const { exportToBlob } = await import('@excalidraw/excalidraw');
    
    // 计算合适的导出尺寸
    const exportAppState: Partial<AppState> = {
      ...appState,
      exportBackground: true,
      viewBackgroundColor: appState.viewBackgroundColor ?? '#ffffff',
      exportWithDarkMode: false
    };
    
    const blob = await exportToBlob({
      elements,
      appState: exportAppState as AppState,
      files: files ?? undefined,
      mimeType: 'image/png',
      quality: 0.8,
      maxWidthOrHeight: Math.max(size.width, size.height) * 2 // 2倍分辨率保证清晰度
    });
    
    // 转换为 data URL
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('[sketchExport] 生成缩略图失败:', error);
    return null;
  }
}

/**
 * 获取场景边界（用于缩放计算）
 */
export function getSceneBounds(elements: readonly ExcalidrawElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} | null {
  const visibleElements = elements.filter(el => !el.isDeleted);
  
  if (visibleElements.length === 0) {
    return null;
  }
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  for (const el of visibleElements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * 生成默认文件名
 */
export function generateFilename(prefix: string = 'sketch', extension: string = 'png'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${prefix}_${timestamp}.${extension}`;
}
