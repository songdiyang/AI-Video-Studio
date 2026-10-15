/**
 * VSCode 式右侧 AI 助手面板
 * ──────────────────────────────────────────────────────────────
 * 由 AIAssistantContext 的 isOpen 控制显隐，作为布局右侧停靠列。
 * 宽度可拖拽（useResizableSidebar），数据来自 AIAssistantData Context。
 */
import React, { lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAIAssistantUI, useAIAssistantData } from '../../contexts/AIAssistantContext';
import { useResizableSidebar } from '../../hooks/useResizableSidebar';

const AIAssistantPanel = lazy(() => import('../AIAssistantPanel'));

const AIAssistantSidePanel: React.FC = () => {
  const { isOpen, close, projectId } = useAIAssistantUI();
  const { currentFrame, scenes, onAction, characters, locations, scripts, projectName, projectDescription } = useAIAssistantData();

  const resize = useResizableSidebar({
    storageKey: 'nanostory_ai_sidebar_width',
    defaultWidth: 400,
    minWidth: 300,
    maxWidth: 720,
    side: 'right',
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          key="ai-assistant-sidepanel"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative shrink-0 min-w-0 h-full bg-(--bg-app) border-l border-(--border-color) overflow-hidden flex flex-col"
          style={{ width: `min(${resize.width}px, 50vw)` }}
        >
          {/* 拖拽手柄（左缘） */}
          <div
            {...resize.handleProps}
            role="separator"
            aria-orientation="vertical"
            className={`absolute left-0 top-0 bottom-0 w-[5px] z-10 cursor-col-resize transition-colors ${
              resize.isDragging ? 'bg-(--accent)/60' : 'hover:bg-(--accent)/40'
            }`}
          />
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-sm text-(--text-muted)">
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

export default AIAssistantSidePanel;
