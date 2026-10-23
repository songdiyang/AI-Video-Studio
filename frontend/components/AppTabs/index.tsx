/**
 * 应用级标签容器（不依赖工程）
 * ──────────────────────────────────────────────────────────────
 * 用于无工程时承载应用级标签（当前为「设置」）。
 * 与 PreviewEditor 的工程标签隔离：不读写任何工程数据。
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TabBar, { TabItem } from '../TabBar';
import Settings from '../../views/Settings';
import { useLanguage } from '../../contexts/LanguageContext';

const AppTabs: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const initialTabs = useMemo<TabItem[]>(
    () => [{ id: 'settings', type: 'settings', title: t.nav.settings }],
    [t],
  );
  const [tabs, setTabs] = useState<TabItem[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string | null>('settings');

  const closeTab = useCallback((tabId: string) => {
    const next = tabs.filter((tab) => tab.id !== tabId);
    if (next.length === 0) {
      // 应用级标签全部关闭后回到欢迎页
      navigate('/welcome');
      return;
    }
    setTabs(next);
    if (tabId === activeTabId) setActiveTabId(next[next.length - 1].id);
  }, [tabs, activeTabId, navigate]);

  const closeOthers = useCallback((tabId: string) => {
    setTabs((prev) => prev.filter((tab) => tab.id === tabId));
    setActiveTabId(tabId);
  }, []);

  const closeRight = useCallback((tabId: string) => {
    setTabs((prev) => {
      const index = prev.findIndex((tab) => tab.id === tabId);
      return index < 0 ? prev : prev.slice(0, index + 1);
    });
  }, []);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-(--bg-app)">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabClick={setActiveTabId}
        onTabClose={closeTab}
        onCloseOthers={closeOthers}
        onCloseRight={closeRight}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab?.type === 'settings' && <Settings />}
      </div>
    </div>
  );
};

export default AppTabs;
