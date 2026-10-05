import React, { useCallback, useEffect, useState } from 'react';
import { Minus, Square, Copy, X, FolderOpen } from 'lucide-react';
import { isTauri } from '../services/localApi';
import { useWorkbench } from '../contexts/WorkbenchContext';

/**
 * 获取当前窗口的最小化 / 最大化(还原) / 关闭 控制逻辑。
 * 动态导入 @tauri-apps/api/window，浏览器端不会打包 Tauri API。
 */
function useWindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  const getWindow = useCallback(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow();
  }, []);

  // 同步最大化状态（用于切换 最大化/还原 图标）
  useEffect(() => {
    if (!isTauri()) return;
    let mounted = true;
    const sync = async () => {
      try {
        const win = await getWindow();
        const maximized = await win.isMaximized();
        if (mounted) setIsMaximized(maximized);
      } catch {
        // 窗口操作中忽略
      }
    };
    sync();
    window.addEventListener('resize', sync);
    const timer = setInterval(sync, 1000);
    return () => {
      mounted = false;
      window.removeEventListener('resize', sync);
      clearInterval(timer);
    };
  }, [getWindow]);

  const minimize = useCallback(async () => { (await getWindow()).minimize(); }, [getWindow]);
  const toggleMaximize = useCallback(async () => { (await getWindow()).toggleMaximize(); }, [getWindow]);
  const close = useCallback(async () => { (await getWindow()).close(); }, [getWindow]);

  return { isMaximized, minimize, toggleMaximize, close };
}

/**
 * 工具栏内联风格的窗口控制按钮组。
 * 并入应用顶部工具栏（pro-toolbar）右侧使用，与信件/全屏图标按钮风格一致。
 */
export const WindowControls: React.FC = () => {
  const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

  const btnCls = 'p-1.5 rounded-lg text-(--text-muted) hover:text-(--text-primary) hover:bg-white/10 transition-colors';

  return (
    <div className="flex items-center gap-0.5 ml-1">
      <button type="button" aria-label="最小化" onClick={minimize} className={btnCls}>
        <Minus className="w-4 h-4" />
      </button>
      <button type="button" aria-label={isMaximized ? '还原' : '最大化'} onClick={toggleMaximize} className={btnCls}>
        {isMaximized ? <Copy className="w-4 h-4 rotate-180" /> : <Square className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        aria-label="关闭"
        onClick={close}
        className="p-1.5 rounded-lg text-(--text-muted) hover:text-white hover:bg-[#c42b1c] transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

/**
 * 独立的全宽标题栏（用于没有应用工具栏的页面，如 Auth）。
 * 拖拽交由 data-tauri-drag-region 原生处理：
 * 不能在 mousedown 调用 startDragging()，其系统模态拖拽循环会吞掉 click 事件。
 */
const TitleBar: React.FC = () => {
  const { currentProject } = useWorkbench();
  
  return (
    <header
      data-tauri-drag-region
      className="flex items-center justify-between h-9 shrink-0 select-none bg-(--bg-nav) border-b border-(--border-color)"
    >
      <div data-tauri-drag-region className="flex items-center gap-2 pl-3 h-full flex-1 min-w-0">
        <div className="w-4 h-4 rounded bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
          <span className="text-white text-[9px] font-bold">A</span>
        </div>
        {currentProject ? (
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <FolderOpen className="w-3 h-3 text-blue-500 shrink-0" />
            <span className="text-xs font-medium text-(--text-primary) truncate">
              {currentProject.name}
            </span>
          </div>
        ) : (
          <span data-tauri-drag-region className="text-xs text-(--text-primary) opacity-80">子墨视频Studio</span>
        )}
      </div>
      <WindowControls />
    </header>
  );
};

export default TitleBar;
