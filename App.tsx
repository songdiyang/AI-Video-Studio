import React, { Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Layout from './components/Layout';
import Auth from './views/Auth';
import AdminRoute from './components/AdminRoute';
import ProtectedRoute from './components/ProtectedRoute';
import { PreviewProvider } from './components/PreviewProvider';
import { WorkbenchProvider } from './contexts/WorkbenchContext';
import TaskQueueBubble from './components/TaskQueueBubble';
import Skeleton from './components/Skeleton';
import ErrorBoundary from './components/ErrorBoundary';

// 懒加载主要视图组件
const DynamicWorkbench = React.lazy(() => import('./components/DynamicWorkbench'));
const ScriptStudio = React.lazy(() => import('./views/ScriptStudio/index'));
const AssetsManager = React.lazy(() => import('./views/AssetsManager'));
const Projects = React.lazy(() => import('./views/Projects'));
const Settings = React.lazy(() => import('./views/Settings'));
const UserCenter = React.lazy(() => import('./views/UserCenter'));
const SketchStudio = React.lazy(() => import('./views/SketchStudio'));
const Landing = React.lazy(() => import('./views/Landing'));
const Pricing = React.lazy(() => import('./views/Pricing'));
const TemplateGallery = React.lazy(() => import('./views/TemplateGallery'));
const Community = React.lazy(() => import('./views/Community'));
const CreatorProfile = React.lazy(() => import('./views/Community/CreatorProfile'));
const Teams = React.lazy(() => import('./views/Teams'));
const AcceptInvite = React.lazy(() => import('./views/AcceptInvite'));

// 懒加载管理员模块
const AdminLogin = React.lazy(() => import('./views/AdminLogin'));
const AdminLayout = React.lazy(() => import('./views/admin/AdminLayout'));
const Dashboard = React.lazy(() => import('./views/admin/Dashboard'));
const ServiceDashboard = React.lazy(() => import('./views/admin/ServiceDashboard'));
const AIModels = React.lazy(() => import('./views/admin/AIModels'));
const UserManagement = React.lazy(() => import('./views/admin/UserManagement'));
const ModelStatsDashboard = React.lazy(() => import('./views/admin/ModelStatsDashboard'));
const RateLimitManagement = React.lazy(() => import('./views/admin/RateLimitManagement'));
const SubscriptionManagement = React.lazy(() => import('./views/admin/SubscriptionManagement'));
const SiteSettings = React.lazy(() => import('./views/admin/SiteSettings'));

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
        <Route path="/assets" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><AssetsManager /></PageTransition>
          </Suspense>
        } />
        <Route path="/projects" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><Projects /></PageTransition>
          </Suspense>
        } />
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
        <Route path="/sketch" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><SketchStudio /></PageTransition>
          </Suspense>
        } />
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
        <Route path="/teams" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><Teams /></PageTransition>
          </Suspense>
        } />
        <Route path="/teams/:id" element={
          <Suspense fallback={<LoadingFallback />}>
            <PageTransition><Teams /></PageTransition>
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
            <Route path="/pricing" element={
              <Suspense fallback={<LoadingFallback />}>
                <Pricing />
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
              <Route path="ai-models" element={
                <Suspense fallback={<LoadingFallback />}>
                  <AIModels />
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
              <Route path="subscriptions" element={
                <Suspense fallback={<LoadingFallback />}>
                  <SubscriptionManagement />
                </Suspense>
              } />
              <Route path="site-settings" element={
                <Suspense fallback={<LoadingFallback />}>
                  <SiteSettings />
                </Suspense>
              } />
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
            </Route>

            {/* 受保护路由 - 需要登录 */}
            <Route path="*" element={
              <ProtectedRoute>
                <WorkbenchProvider>
                  <Layout>
                    <AnimatedRoutes />
                  </Layout>
                </WorkbenchProvider>
              </ProtectedRoute>
            } />
          </Routes>
          <TaskQueueBubble />
        </PreviewProvider>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
