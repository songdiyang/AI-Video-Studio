import React, { useEffect, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { checkForAppUpdate, type AppUpdateInfo } from '../services/appUpdater';

/**
 * 自动更新提示（打包版生效）：启动 8 秒后静默检查 GitHub Release，
 * 发现新版弹出自包含模态（不依赖 Toast/Confirm，挂在路由根部即可）。
 * 点「立即更新」→ 下载签名安装包 → passive 安装 → 自动重启。
 */
const UpdatePrompt: React.FC = () => {
  const { t } = useLanguage();
  const u = t.update;
  const [update, setUpdate] = useState<AppUpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    // 延迟检查：避开启动期的工程加载与资源请求
    const timer = setTimeout(() => {
      void checkForAppUpdate().then((found) => {
        if (!disposed && found) setUpdate(found);
      });
    }, 8000);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, []);

  if (!update) return null;

  const handleInstall = async () => {
    setInstalling(true);
    setError('');
    try {
      await update.install();
      // install 内部完成后会 relaunch；走到这里说明重启未生效，保持安装中状态
    } catch {
      setError(u.failed);
      setInstalling(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-full max-w-md rounded-xl border p-5 space-y-4"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Download className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            {u.title}
          </h3>
          {!installing && (
            <button
              type="button"
              onClick={() => setUpdate(null)}
              className="p-1 rounded cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
              aria-label={u.later}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs leading-5" style={{ color: 'var(--text-secondary, var(--text-muted))' }}>
          {u.message.replace('{version}', update.version)}
        </p>
        {update.notes?.trim() && (
          <div
            className="text-[11px] leading-5 rounded-lg border px-3 py-2 max-h-40 overflow-auto whitespace-pre-wrap"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}
          >
            {update.notes.trim()}
          </div>
        )}
        {error && (
          <p className="text-[11px] leading-5" style={{ color: 'var(--danger, #ef4444)' }}>{error}</p>
        )}
        <div className="flex items-center justify-end gap-2">
          {!installing && (
            <button
              type="button"
              onClick={() => setUpdate(null)}
              className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
            >
              {u.later}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleInstall()}
            disabled={installing}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-4 py-1.5 rounded-lg cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
          >
            {installing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {installing ? u.installing : u.install}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdatePrompt;