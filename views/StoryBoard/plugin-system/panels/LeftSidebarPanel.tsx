/**
 * LeftSidebarPanel - 左侧边栏面板
 * 渲染所有 position: 'left' 的插件，提供 tab 切换
 */

import React from 'react';
import { usePluginContext } from '../PluginContext';
import * as Icons from 'lucide-react';

export const LeftSidebarPanel: React.FC = () => {
  const { api, panelState, setPanelState, plugins } = usePluginContext();

  const leftPlugins = plugins
    .filter(p => p.position === 'left')
    .sort((a, b) => a.priority - b.priority);

  const activePlugin = leftPlugins.find(p => p.id === panelState.activeLeftPlugin);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-app)]">
      {/* Tab 切换栏 */}
      <div
        className="flex items-center gap-0.5 px-2 py-1.5 border-b shrink-0"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
      >
        {leftPlugins.map(plugin => {
          const IconComponent = (Icons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[plugin.icon] || Icons.Box;
          const isActive = panelState.activeLeftPlugin === plugin.id;
          return (
            <button
              key={plugin.id}
              onClick={() => {
                setPanelState(prev => ({
                  ...prev,
                  activeLeftPlugin: isActive ? null : plugin.id,
                  leftOpen: !isActive || !prev.leftOpen,
                }));
              }}
              className={`flex-1 px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1 ${
                isActive
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
              style={isActive ? { backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)' } : {}}
              title={plugin.name}
            >
              <IconComponent size={14} />
              <span className="hidden lg:inline">{plugin.name}</span>
            </button>
          );
        })}
      </div>

      {/* 插件内容区域 */}
      <div className="flex-1 overflow-hidden relative">
        {leftPlugins.map(plugin => {
          const isActive = panelState.activeLeftPlugin === plugin.id;
          return (
            <div
              key={plugin.id}
              className={`absolute inset-0 transition-opacity duration-200 ${
                isActive ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
            >
              <plugin.component
                instanceId={plugin.id}
                isActive={isActive}
                isOpen={panelState.leftOpen}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
