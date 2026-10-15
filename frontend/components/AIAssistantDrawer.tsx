/**
 * AI 助手全局右侧侧边栏
 * ──────────────────────────────────────────────────────────────
 * 独立组件，只订阅 AIAssistantUI / AIAssistantData Context。
 * 数据频繁变化时只重渲染本组件（未展开时节点不存在，近乎零成本），
 * 不会触发 Layout 顶栏的重新渲染，有效缓解浏览器卡顿。
 *
 * 形态：桌面端作为 Layout 主区域右侧的停靠列（挤压内容区而非覆盖）；
 * 小屏（<768px）退化为固定定位覆盖层，避免挤压主编辑区。
 */
import React, { lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAIAssistantUI, useAIAssistantData } from '../contexts/AIAssistantContext';
import { useResizableSidebar } from '../hooks/useResizableSidebar';

const AIAssistantPanel = lazy(() => import('./AIAssistantPanel'));

const AIAssistantDrawer: React.FC = () => {
  const { isOpen, close, projectId } = useAIAssistantUI();
  const { currentFrame, scenes, onAction, characters, locations, scripts, projectName, projectDescription } = useAIAssistantData();
  // 左缘拖拽伸缩（宽度持久化 + 双击复位）
  const resize = useResizableSidebar({
    storageKey: 'nanostory_ai_sidebar_width',
    defaultWidth: 440,
    minWidth: 320,
    maxWidth: 720,
    side: 'right',
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          key="ai-assistant-sidebar"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative shrink-0 min-w-0 pt-11 pb-7 bg-(--bg-app) border-l border-(--border-color) overflow-hidden flex flex-col max-md:fixed max-md:top-10 max-md:right-0 max-md:bottom-0 max-md:h-auto max-md:w-full max-md:max-w-[440px] max-md:z-[150] max-md:shadow-2xl"
          style={{ width: `min(${resize.width}px, 95vw)` }}
        >
          {/* 拖拽伸缩手柄（小屏覆盖层模式下不需要） */}
          <div
            {...resize.handleProps}
            role="separator"
            aria-orientation="vertical"
            className={`absolute left-0 top-0 bottom-0 w-[5px] z-10 cursor-col-resize transition-colors max-md:hidden ${
              resize.isDragging ? 'bg-(--accent)/60' : 'hover:bg-(--accent)/40'
            }`}
          />
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full bg-(--bg-app) border-l border-(--border-color) text-sm text-(--text-muted)">
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                加载中...
              </div>
            }
          >
            <AIAssistantPanel
              projectId={projectId}
              projectName={projectName}
              projectDescription={projectDescription}
              currentFrame={currentFrame}
              scenes={scenes}
              characters={characters}
              locations={locations}
              scripts={scripts}
              onClose={close}
              onAction={onAction || undefined}
            />
          </Suspense>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};

export default AIAssistantDrawer;
