import React, { Suspense, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Layout from './components/Layout';
import { PreviewProvider } from './components/PreviewProvider';
import { WorkbenchProvider } from './contexts/WorkbenchContext';
import { AIAssistantProvider } from './contexts/AIAssistantContext';
import { StoryboardBridgeProvider } from './contexts/StoryboardBridgeContext';
import Skeleton from './components/Skeleton';
import ErrorBoundary from './components/ErrorBoundary';

// 懒加载主要视图组件
const DynamicWorkbench = React.lazy(() => import('./components/DynamicWorkbench'));
const ScriptStudio = React.lazy(() => import('./views/ScriptStudio/index'));
const StoryBoardPage = React.lazy(() => import('./views/StoryBoardPage'));
const Projects = React.lazy(() => import('./views/Projects'));
const Settings = React.lazy(() => import('./views/Settings'));
const UserCenter = React.lazy(() => import('./views/UserCenter'));
// SketchStudio removed - 草图功能已集成到魔术空间
const Landing = React.lazy(() => import('./views/Landing'));

// 加载中回退组件
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full">
    <Skeleton lines={5} className="w-96" />
  </div>
);

// 页面过渡动画包装组件
const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
    exit={{ opacity: 0, y: -8, filter: 'blur(2px)' }}
    transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
    className="h-full"
  >
    {children}
  </motion.div>
);

// 带动画的路由内容组件
const AnimatedRoutes: React.FC = () => {
  const location = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><DynamicWorkbench /></PageTransition>
          </Suspense>
        } />
        <Route path="/studio" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><ScriptStudio /></PageTransition>
          </Suspense>
        } />
        <Route path="/assets" element={<Navigate to="/storyboard" replace />} />
        <Route path="/storyboard" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><StoryBoardPage /></PageTransition>
          </Suspense>
        } />
        <Route path="/projects" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><Projects /></PageTransition>
          </Suspense>
        } />
        {/* 设置页面 - 独立路由 */}
        <Route path="/settings" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><Settings /></PageTransition>
          </Suspense>
        } />
        <Route path="/user-center" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><UserCenter /></PageTransition>
          </Suspense>
        } />
        {/* 草图绘制已集成到魔术空间，不再作为独立页面
        <Route path="/sketch" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><SketchStudio /></PageTransition>
          </Suspense>
        } />
        */}
        <Route path="/marketplace/*" element={<Navigate to="/" replace />} />
        <Route path="/teams" element={<Navigate to="/" replace />} />
        <Route path="/teams/:id" element={<Navigate to="/" replace />} />
        <Route path="/extensions" element={<Navigate to="/" replace />} />
        <Route path="/invite/:code" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
};

const App: React.FC = () => {
  // 定期清理过期附件缓存
  useEffect(() => {
    const cleanupCache = async () => {
      try {
        const { cleanupOldAttachments, getCacheStats } = await import('./services/attachmentCache');
        
        // 清理 7 天前的附件
        const cleaned = await cleanupOldAttachments(7);
        if (cleaned > 0) {
          console.log('[App] 定期清理了', cleaned, '个过期附件');
        }
        
        // 获取缓存统计
        const stats = await getCacheStats();
        console.log('[App] 附件缓存统计:', {
          文件数: stats.totalFiles,
          总大小: `${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`,
        });
      } catch (error) {
        console.error('[App] 清理附件缓存失败:', error);
      }
    };

    // 启动时立即执行一次
    cleanupCache();

    // 每小时执行一次清理
    const interval = setInterval(cleanupCache, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <ErrorBoundary>
      <Router>
        <PreviewProvider>
          <Routes>
            {/* 公开路由 - 不需要登录 */}
            <Route path="/auth" element={<Navigate to="/" replace />} />
            <Route path="/landing" element={
              <Suspense fallback={<LoadingFallback />}>
                <Landing />
              </Suspense>
            } />

            {/* 本地免登录：直接进入应用 */}
            <Route path="*" element={
              <WorkbenchProvider>
                <AIAssistantProvider>
                  <StoryboardBridgeProvider>
                    <Layout>
                      <AnimatedRoutes />
                    </Layout>
                  </StoryboardBridgeProvider>
                </AIAssistantProvider>
              </WorkbenchProvider>
            } />
          </Routes>
        </PreviewProvider>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
