import React, { Suspense, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Layout from './components/Layout';
import { PreviewProvider } from './components/PreviewProvider';
import { WorkbenchProvider, useWorkbench } from './contexts/WorkbenchContext';
import { AIAssistantProvider } from './contexts/AIAssistantContext';
import { StoryboardBridgeProvider } from './contexts/StoryboardBridgeContext';
import Skeleton from './components/Skeleton';
import ErrorBoundary from './components/ErrorBoundary';
import { isTauri, openProject, takePendingProject, type ProjectMetadata } from './services/localApi';
import { mapLocalProject } from './services/projects';

// 懒加载主要视图组件
const DynamicWorkbench = React.lazy(() => import('./components/DynamicWorkbench'));
const ScriptStudio = React.lazy(() => import('./views/ScriptStudio/index'));
const StoryBoardPage = React.lazy(() => import('./views/StoryBoardPage'));
const Welcome = React.lazy(() => import('./views/Welcome'));
const AppTabs = React.lazy(() => import('./components/AppTabs'));
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
  const { currentProject, isLoading: workbenchLoading } = useWorkbench();

  // 无工程的首屏直接进入欢迎页（不经过页面过渡动画，避免后台启动/隐藏页卡在退出动画）
  if (!workbenchLoading && !currentProject && location.pathname === '/') {
    return <Navigate to="/welcome" replace />;
  }
  
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
        <Route path="/projects" element={<Navigate to="/welcome" replace />} />
        <Route path="/welcome" element={
          <Suspense fallback={<LoadingFallback />}>
            <Welcome />
          </Suspense>
        } />
        {/* 设置：应用级标签容器（不依赖工程） */}
        <Route path="/settings" element={<Navigate to="/app-tabs" replace />} />
        <Route path="/app-tabs" element={
          <Suspense fallback={<LoadingFallback />}>
            <AppTabs />
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

/**
 * 接管双击 .jzp / 命令行打开：
 * - 启动时取走 Rust 侧待打开工程（前端未就绪时已完成导入/注册）
 * - 运行中监听 jzp-project-opened 事件
 */
const PendingProjectOpen: React.FC = () => {
  const navigate = useNavigate();
  const { switchProject } = useWorkbench();

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const openByPath = async (path: string) => {
      try {
        const meta = await openProject(path);
        if (disposed) return;
        const project = mapLocalProject(meta);
        switchProject(project);
        localStorage.setItem('nanostory_last_project_id', String(project.id));
        navigate('/');
      } catch (err) {
        console.error('[PendingProjectOpen] 打开工程失败:', err);
      }
    };

    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<ProjectMetadata>('jzp-project-opened', (event) => {
          const path = event.payload?.path;
          if (!path) return;
          void openByPath(path).finally(() => { void takePendingProject(); });
        });
        if (disposed) {
          unlisten();
          unlisten = undefined;
          return;
        }

        // 先监听再取，避免“事件已发出但监听未注册”的竞态
        const pending = await takePendingProject();
        if (pending && !disposed) await openByPath(pending);
      } catch (err) {
        console.warn('[PendingProjectOpen] 监听工程打开事件失败:', err);
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [navigate, switchProject]);

  return null;
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
                    <PendingProjectOpen />
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
