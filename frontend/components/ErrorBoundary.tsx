import React, { Component, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

// 内部函数组件获取翻译
function ErrorFallbackUI({ onReset }: { onReset: () => void }) {
  // 这里不能用 useLanguage，因为 ErrorBoundary 可能在 LanguageProvider 出错时触发
  // 使用硬编码的双语文本作为降级方案
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)] px-4"
         style={{ background: 'var(--bg-body, #1e1e2e)' }}>
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--danger,#ef4444)]/10">
          <AlertTriangle className="w-8 h-8 text-[var(--danger,#ef4444)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary,#e0e0e8)]">
            出现了意外错误 / Unexpected Error
          </h1>
          <p className="text-sm text-[var(--text-muted,#5a6070)] mt-2">
            应用程序遇到了一个问题，请尝试刷新页面或返回首页。
          </p>
          <p className="text-sm text-[var(--text-muted,#5a6070)]">
            The application encountered a problem. Please try refreshing or go back to home.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onReset}
            className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors interactive-press"
            style={{
              backgroundColor: 'var(--accent, #3b82f6)',
              color: 'white',
            }}
          >
            <RefreshCw className="w-4 h-4" />
            重试 / Retry
          </button>
          <a
            href="#/"
            onClick={() => window.location.reload()}
            className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors interactive-press"
            style={{
              backgroundColor: 'var(--bg-input, #1a1a2e)',
              border: '1px solid var(--border-color, rgba(100,120,180,0.15))',
              color: 'var(--text-secondary, #8890a0)',
            }}
          >
            <Home className="w-4 h-4" />
            首页 / Home
          </a>
        </div>
      </div>
    </div>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallbackUI onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
