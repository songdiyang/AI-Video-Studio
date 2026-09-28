import React, { Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Layout from './components/Layout';
import Auth from './views/Auth';
import AdminRoute from './components/AdminRoute';
import ProtectedRoute from './components/ProtectedRoute';
import { PreviewProvider } from './components/PreviewProvider';
import { WorkbenchProvider } from './contexts/WorkbenchContext';
import { AIAssistantProvider } from './contexts/AIAssistantContext';
import { StoryboardBridgeProvider } from './contexts/StoryboardBridgeContext';
import Skeleton from './components/Skeleton';
import ErrorBoundary from './components/ErrorBoundary';
import { ExtensionProvider } from './contexts/ExtensionContext';

// 懒加载主要视图组件
const DynamicWorkbench = React.lazy(() => import('./components/DynamicWorkbench'));
const ScriptStudio = React.lazy(() => import('./views/ScriptStudio/index'));
// 资产管理页面已移除，功能已集成到工作台标签页
// const AssetsManager = React.lazy(() => import('./views/AssetsManager'));
const StoryBoardPage = React.lazy(() => import('./views/StoryBoardPage'));
const Projects = React.lazy(() => import('./views/Projects'));
const Settings = React.lazy(() => import('./views/Settings'));
const UserCenter = React.lazy(() => import('./views/UserCenter'));
// SketchStudio removed - 草图功能已集成到魔术空间
const Landing = React.lazy(() => import('./views/Landing'));
const TemplateGallery = React.lazy(() => import('./views/TemplateGallery'));
const Community = React.lazy(() => import('./views/Community'));
const CreatorProfile = React.lazy(() => import('./views/Community/CreatorProfile'));
const Teams = React.lazy(() => import('./views/Teams'));
const AcceptInvite = React.lazy(() => import('./views/AcceptInvite'));
// 扩展页面已集成到工作台标签页
// const Extensions = React.lazy(() => import('./views/Extensions'));

// 懒加载管理员模块
const AdminLogin = React.lazy(() => import('./views/AdminLogin'));
const AdminLayout = React.lazy(() => import('./views/admin/AdminLayout'));
const Dashboard = React.lazy(() => import('./views/admin/Dashboard'));
const ServiceDashboard = React.lazy(() => import('./views/admin/ServiceDashboard'));
const AIModels = React.lazy(() => import('./views/admin/AIModels'));
const UserManagement = React.lazy(() => import('./views/admin/UserManagement'));
const ModelStatsDashboard = React.lazy(() => import('./views/admin/ModelStatsDashboard'));
const RateLimitManagement = React.lazy(() => import('./views/admin/RateLimitManagement'));
const SiteSettings = React.lazy(() => import('./views/admin/SiteSettings'));
const FeedbackManagement = React.lazy(() => import('./views/admin/FeedbackManagement'));
const ErrorMonitor = React.lazy(() => import('./views/admin/ErrorMonitor'));
const AnnouncementManagement = React.lazy(() => import('./views/admin/AnnouncementManagement'));
const AdminLog = React.lazy(() => import('./views/admin/AdminLog'));
const ModelProviders = React.lazy(() => import('./views/admin/ModelProviders'));
const RAGStatus = React.lazy(() => import('./views/admin/RAGStatus'));

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
        {/* 资产管理页面已移除，功能已集成到工作台标签页 */}
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
        <Route path="/templates" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><TemplateGallery /></PageTransition>
          </Suspense>
        } />
        <Route path="/community" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><Community /></PageTransition>
          </Suspense>
        } />
        <Route path="/community/creator/:id" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><CreatorProfile /></PageTransition>
          </Suspense>
        } />
        {/* 模板市场已移除，路由重定向到首页 */}
        <Route path="/marketplace/*" element={<Navigate to="/" replace />} />
        <Route path="/teams" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><ProtectedRoute><Teams /></ProtectedRoute></PageTransition>
          </Suspense>
        } />
        {/* 扩展页面已集成到工作台标签页，不再作为独立路由 */}
        <Route path="/extensions" element={<Navigate to="/" replace />} />
        <Route path="/teams/:id" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><ProtectedRoute><Teams /></ProtectedRoute></PageTransition>
          </Suspense>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Router>
        <PreviewProvider>
          <Routes>
            {/* 公开路由 - 不需要登录 */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/landing" element={
              <Suspense fallback={<LoadingFallback />}>
                <Landing />
              </Suspense>
            } />
            <Route path="/invite/:code" element={
              <Suspense fallback={<LoadingFallback />}>
                <AcceptInvite />
              </Suspense>
            } />
            <Route path="/admin/login" element={
              <Suspense fallback={<LoadingFallback />}>
                <AdminLogin />
              </Suspense>
            } />

            {/* 管理员路由 - 需要管理员权限 */}
            <Route path="/admin" element={
              <AdminRoute>
                <Suspense fallback={<LoadingFallback />}>
                  <AdminLayout />
                </Suspense>
              </AdminRoute>
            }>
              <Route path="dashboard" element={
                <Suspense fallback={<LoadingFallback />}>
                  <Dashboard />
                </Suspense>
              } />
              <Route path="services" element={
                <Suspense fallback={<LoadingFallback />}>
                  <ServiceDashboard />
                </Suspense>
              } />
              {/* 非商业化功能已迁移到 /settings */}
              {/* <Route path="ai-models" element={
                <Suspense fallback={<LoadingFallback />}>
                  <AIModels />
                </Suspense>
              } />
              <Route path="model-providers" element={
                <Suspense fallback={<LoadingFallback />}>
                  <ModelProviders />
                </Suspense>
              } />
              <Route path="users" element={
                <Suspense fallback={<LoadingFallback />}>
                  <UserManagement />
                </Suspense>
              } />
              <Route path="model-stats" element={
                <Suspense fallback={<LoadingFallback />}>
                  <ModelStatsDashboard />
                </Suspense>
              } />
              <Route path="rate-limits" element={
                <Suspense fallback={<LoadingFallback />}>
                  <RateLimitManagement />
                </Suspense>
              } />
              <Route path="site-settings" element={
                <Suspense fallback={<LoadingFallback />}>
                  <SiteSettings />
                </Suspense>
              } />
              <Route path="feedback" element={
                <Suspense fallback={<LoadingFallback />}>
                  <FeedbackManagement />
                </Suspense>
              } />
              <Route path="error-monitor" element={
                <Suspense fallback={<LoadingFallback />}>
                  <ErrorMonitor />
                </Suspense>
              } />
              <Route path="announcements" element={
                <Suspense fallback={<LoadingFallback />}>
                  <AnnouncementManagement />
                </Suspense>
              } />
              <Route path="logs" element={
                <Suspense fallback={<LoadingFallback />}>
                  <AdminLog />
                </Suspense>
              } />
              <Route path="rag-status" element={
                <Suspense fallback={<LoadingFallback />}>
                  <RAGStatus />
                </Suspense>
              } /> */}
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
            </Route>

            {/* 受保护路由 - 需要登录 */}
            <Route path="*" element={
              <ProtectedRoute>
                <WorkbenchProvider>
                  <AIAssistantProvider>
                    <ExtensionProvider>
                      <StoryboardBridgeProvider>
                        <Layout>
                          <AnimatedRoutes />
                        </Layout>
                      </StoryboardBridgeProvider>
                    </ExtensionProvider>
                  </AIAssistantProvider>
                </WorkbenchProvider>
              </ProtectedRoute>
            } />
          </Routes>
        </PreviewProvider>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
