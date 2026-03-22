import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';
import { ShortcutConfig, formatShortcutKey, GLOBAL_SHORTCUTS_CONFIG, STORYBOARD_SHORTCUTS_CONFIG, ANIMATIC_SHORTCUTS_CONFIG } from '../hooks/useKeyboardShortcuts';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

// 作用域名称映射
const scopeNames: Record<string, string> = {
  global: '全局导航',
  storyboard: '分镜操作',
  script: '剧本操作',
  assets: '资产管理',
  animatic: 'Animatic 预览',
};

// 所有快捷键配置（合并全局和分镜）
const allShortcuts: ShortcutConfig[] = [
  // 全局导航
  { ...GLOBAL_SHORTCUTS_CONFIG.NAVIGATE_WORKSPACE, action: () => {} },
  { ...GLOBAL_SHORTCUTS_CONFIG.NAVIGATE_ASSETS, action: () => {} },
  { ...GLOBAL_SHORTCUTS_CONFIG.NAVIGATE_PROJECTS, action: () => {} },
  { ...GLOBAL_SHORTCUTS_CONFIG.NAVIGATE_SETTINGS, action: () => {} },
  { ...GLOBAL_SHORTCUTS_CONFIG.SHOW_HELP, action: () => {} },
  // 分镜操作
  { ...STORYBOARD_SHORTCUTS_CONFIG.SELECT_PREV, action: () => {} },
  { ...STORYBOARD_SHORTCUTS_CONFIG.SELECT_NEXT, action: () => {} },
  { ...STORYBOARD_SHORTCUTS_CONFIG.NEW_SCENE, action: () => {} },
  { ...STORYBOARD_SHORTCUTS_CONFIG.DELETE_SCENE, action: () => {} },
  { ...STORYBOARD_SHORTCUTS_CONFIG.REFRESH_LIST, action: () => {} },
  { ...STORYBOARD_SHORTCUTS_CONFIG.DESELECT, action: () => {} },
  // Animatic 预览
  ...ANIMATIC_SHORTCUTS_CONFIG,
];

// 按作用域分组
const groupedShortcuts = allShortcuts.reduce((acc, shortcut) => {
  const scope = shortcut.scope || 'global';
  if (!acc[scope]) {
    acc[scope] = [];
  }
  acc[scope].push(shortcut);
  return acc;
}, {} as Record<string, ShortcutConfig[]>);

const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({ isOpen, onClose }) => {
  // 按 Escape 关闭
  React.useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
            onClick={onClose}
            aria-hidden="true"
          />
          
          {/* 模态框 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] w-full max-w-lg max-h-[80vh] overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-help-title"
          >
            <div className="pro-card bg-[var(--bg-card)] rounded-xl shadow-2xl overflow-hidden">
              {/* 头部 */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[var(--accent)]/10">
                    <Keyboard className="w-5 h-5 text-[var(--accent)]" />
                  </div>
                  <h2 id="shortcuts-help-title" className="text-lg font-semibold text-[var(--text-primary)]">
                    键盘快捷键
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors focus-visible-ring"
                  aria-label="关闭"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* 内容 */}
              <div className="p-5 overflow-y-auto max-h-[60vh] space-y-6">
                {Object.entries(groupedShortcuts).map(([scope, shortcuts]) => (
                  <div key={scope}>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                      {scopeNames[scope] || scope}
                    </h3>
                    <div className="space-y-2">
                      {shortcuts.map((shortcut, index) => (
                        <div
                          key={`${scope}-${index}`}
                          className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--bg-app)]/50 hover:bg-[var(--bg-app)] transition-colors"
                        >
                          <span className="text-sm text-[var(--text-secondary)]">
                            {shortcut.description}
                          </span>
                          <kbd className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium text-[var(--text-primary)] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-md shadow-sm min-w-[2.5rem] justify-center">
                            {formatShortcutKey(shortcut)}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* 底部提示 */}
              <div className="px-5 py-3 border-t border-[var(--border-color)] bg-[var(--bg-app)]/30">
                <p className="text-xs text-[var(--text-muted)] text-center">
                  按 <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[var(--bg-card)] border border-[var(--border-color)] rounded">Esc</kbd> 或点击背景关闭
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default KeyboardShortcutsHelp;
