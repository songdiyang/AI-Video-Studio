/**
 * VSCode 式右侧 AI 助手面板
 * ──────────────────────────────────────────────────────────────
 * 由 AIAssistantContext 的 isOpen 控制显隐，作为布局右侧停靠列。
 * 宽度可拖拽（useResizableSidebar），数据来自 AIAssistantData Context。
 */
import React, { lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAIAssistantUI, useAIAssistantData } from '../../contexts/AIAssistantContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResizableSidebar } from '../../hooks/useResizableSidebar';
import ResizeRevealHandle from './ResizeRevealHandle';

const AIAssistantPanel = lazy(() => import('../AIAssistantPanel'));

const AIAssistantSidePanel: React.FC = () => {
  const { isOpen, open, close, projectId } = useAIAssistantUI();
  const { currentFrame, scenes, onAction, characters, locations, studios, scripts, projectName, projectDescription } = useAIAssistantData();
  const { t } = useLanguage();

  const resize = useResizableSidebar({
    storageKey: 'nanostory_ai_sidebar_width',
    defaultWidth: 400,
    minWidth: 300,
    maxWidth: 720,
    side: 'right',
    // 先拖到最小宽度 300，继续向内拖 60px 才收起（参考 VS Code）
    collapseThreshold: 240,
    onCollapse: close,
  });

  return (
    <>
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
            className={`absolute left-0 top-0 bottom-0 w-1.25 z-10 cursor-col-resize transition-colors ${
              resize.isDragging ? 'bg-(--accent)/60' : 'hover:bg-(--accent)/40'
            }`}
          />
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-sm text-(--text-muted)">
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                {t.common.loading}
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
              studios={studios}
              scripts={scripts}
              onClose={close}
              onAction={onAction || undefined}
            />
          </Suspense>
        </motion.aside>
      )}
    </AnimatePresence>
      {!isOpen && (
        <ResizeRevealHandle
          side="right"
          label={t.frame.activityBar.revealRight}
          onReveal={open}
        />
      )}
    </>
  );
};

export default AIAssistantSidePanel;
