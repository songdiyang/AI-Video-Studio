import React from 'react';
import { TabType } from './types';

interface TabButtonsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TabButtons: React.FC<TabButtonsProps> = ({ activeTab, onTabChange }) => {
  const tabs: { key: TabType; label: string }[] = [
    { key: 'characters', label: '角色' },
    { key: 'locations', label: '影棚' },
    { key: 'props', label: '道具' }
  ];

  return (
    <div className="flex gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
            activeTab === tab.key
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export default TabButtons;
