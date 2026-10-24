import React, { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';

export type ToastType = 'debug' | 'info' | 'success' | 'warn' | 'error' | 'warning';

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: ReactNode;
}

/**
 * 通知上下文，不渲染任何 UI。
 * 右下角通知弹层已移除，showToast 仅作为静默出口保留：
 * 业务侧数十处调用无需改动，错误与警告输出到 Console 便于排查。
 */
export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    if (type === 'error' || type === 'warning' || type === 'warn') {
      console.warn('[toast]', type, message);
    }
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  );
};
