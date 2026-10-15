import React from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * 路由守卫组件 - 功能优先模式
 * 允许所有用户访问所有功能，无需登录
 * 登录仅用于数据同步和个性化功能
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  // 功能优先：不再强制要求登录
  // 所有用户都可以访问所有功能
  return <>{children}</>;
};

export default ProtectedRoute;
