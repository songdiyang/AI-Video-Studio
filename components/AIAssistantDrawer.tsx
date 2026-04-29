/**
 * AI 助手全局抽屉
 * ──────────────────────────────────────────────────────────────
 * 独立组件，只订阅 AIAssistantUI / AIAssistantData Context。
 * 数据频繁变化时只重渲染本组件（未展开时 motion.div 不存在，近乎零成本），
 * 不会触发 Layout 顶栏的重新渲染，有效缓解浏览器卡顿。
 */
import React, { lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAIAssistantUI, useAIAssistantData } from '../contexts/AIAssistantContext';

const AIAssistantPanel = lazy(() => import('./AIAssistantPanel'));

const AIAssistantDrawer: React.FC = () => {
  const { isOpen, close, projectId } = useAIAssistantUI();
  const { currentFrame, scenes, onAction, characters, locations, scripts } = useAIAssistantData();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="ai-assistant-drawer"
          className="fixed top-0 right-0 h-full w-[440px] max-w-[95vw] z-[150] shadow-2xl"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        >
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
              currentFrame={currentFrame}
              scenes={scenes}
              characters={characters}
              locations={locations}
              scripts={scripts}
              onClose={close}
              onAction={onAction || undefined}
            />
          </Suspense>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AIAssistantDrawer;
