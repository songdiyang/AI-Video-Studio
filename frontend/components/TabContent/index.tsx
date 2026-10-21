import React from 'react';
import { TabItem } from '../TabBar';

interface TabContentProps {
  activeTab: TabItem | null;
  children: React.ReactNode;
}

const TabContent: React.FC<TabContentProps> = ({ activeTab, children }) => {
  if (!activeTab) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-app)]">
        <div className="text-center space-y-4">
          <div className="text-[var(--text-muted)] text-sm mb-2">点击分镜列表打开分镜</div>
          <div className="space-y-2 text-xs text-[var(--text-muted)] opacity-60">
            <div className="flex items-center justify-center gap-2">
              <span>打开智能会话</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[10px]">Ctrl + L</kbd>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span>打开 Quest 模式</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[10px]">Ctrl + E</kbd>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span>打开行间会话</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[10px]">Ctrl + I</kbd>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span>在文件中查找</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[10px]">Ctrl + Shift + F</kbd>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span>显示所有命令</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[10px]">Ctrl + Shift + P</kbd>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden min-h-0">
      {children}
    </div>
  );
};

export default TabContent;
