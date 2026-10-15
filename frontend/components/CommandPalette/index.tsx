import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Command } from 'lucide-react';
import { useCommandPalette, Command as CommandType } from '../../hooks/useCommandPalette';
import { useLanguage } from '../../contexts/LanguageContext';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandType[];
}

// 按 category 分组命令
function groupCommandsByCategory(commands: CommandType[]): Map<string, CommandType[]> {
  const groups = new Map<string, CommandType[]>();
  
  for (const cmd of commands) {
    const category = cmd.category;
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category)!.push(cmd);
  }
  
  return groups;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, commands }) => {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  
  const {
    query,
    setQuery,
    filteredCommands,
    selectedIndex,
    setSelectedIndex,
    recentCommands,
    executeCommand,
    handleKeyDown,
  } = useCommandPalette({ commands });

  // 打开时聚焦输入框
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // 延迟聚焦，确保动画开始后再聚焦
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // 滚动选中项到可视区域
  useEffect(() => {
    if (listRef.current) {
      const selectedItem = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  // 分组显示的命令
  const groupedCommands = groupCommandsByCategory(filteredCommands);
  const showRecent = !query.trim() && recentCommands.length > 0;

  // 计算全局索引（用于键盘导航高亮）
  let globalIndex = 0;
  const getGlobalIndex = () => globalIndex++;

  // 分类名称映射
  const categoryNames: Record<string, string> = {
    navigation: t.commandPalette?.categories?.navigation || 'Navigation',
    action: t.commandPalette?.categories?.action || 'Actions',
    settings: t.commandPalette?.categories?.settings || 'Settings',
    recent: t.commandPalette?.categories?.recent || 'Recent',
  };

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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300]"
            onClick={onClose}
            aria-hidden="true"
          />
          
          {/* 命令面板 */}
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed top-[15%] left-1/2 -translate-x-1/2 z-[301] w-full max-w-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Command Palette"
            onKeyDown={handleKeyDown}
          >
            <div className="bg-[var(--bg-card)]/95 backdrop-blur-xl rounded-xl shadow-2xl border border-[var(--border-color)] overflow-hidden">
              {/* 搜索栏 */}
              <div className="flex items-center px-4 py-3 border-b border-[var(--border-color)]">
                <Search className="w-5 h-5 text-[var(--text-muted)] flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.commandPalette?.placeholder || 'Search commands...'}
                  className="flex-1 ml-3 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none text-sm"
                  autoComplete="off"
                  spellCheck={false}
                />
                <kbd className="px-2 py-1 text-xs font-mono text-[var(--text-muted)] bg-[var(--bg-app)] border border-[var(--border-color)] rounded">
                  Esc
                </kbd>
              </div>
              
              {/* 命令列表 */}
              <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
                {filteredCommands.length === 0 ? (
                  // 空状态
                  <div className="py-8 text-center">
                    <Command className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)] opacity-50" />
                    <p className="text-sm text-[var(--text-muted)]">
                      {t.commandPalette?.noResults || 'No matching commands found'}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* 最近使用 */}
                    {showRecent && (
                      <div className="mb-2">
                        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          {categoryNames.recent}
                        </div>
                        {recentCommands.map((cmd) => {
                          const idx = getGlobalIndex();
                          const isSelected = idx === selectedIndex;
                          return (
                            <CommandItem
                              key={`recent-${cmd.id}`}
                              command={cmd}
                              isSelected={isSelected}
                              dataIndex={idx}
                              onSelect={() => executeCommand(cmd)}
                              onHover={() => setSelectedIndex(idx)}
                            />
                          );
                        })}
                      </div>
                    )}
                    
                    {/* 按分类分组 */}
                    {Array.from(groupedCommands.entries()).map(([category, cmds]) => (
                      <div key={category} className="mb-2">
                        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          {categoryNames[category] || category}
                        </div>
                        {cmds.map((cmd) => {
                          const idx = showRecent 
                            ? recentCommands.length + filteredCommands.indexOf(cmd)
                            : filteredCommands.indexOf(cmd);
                          const isSelected = idx === selectedIndex;
                          return (
                            <CommandItem
                              key={cmd.id}
                              command={cmd}
                              isSelected={isSelected}
                              dataIndex={idx}
                              onSelect={() => executeCommand(cmd)}
                              onHover={() => setSelectedIndex(idx)}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </>
                )}
              </div>
              
              {/* 底部提示 */}
              <div className="px-4 py-2 border-t border-[var(--border-color)] bg-[var(--bg-app)]/30">
                <p className="text-xs text-[var(--text-muted)] text-center">
                  {t.commandPalette?.hint || 'Use ↑↓ to navigate, Enter to execute, Esc to close'}
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// 单个命令项组件
interface CommandItemProps {
  command: CommandType;
  isSelected: boolean;
  dataIndex: number;
  onSelect: () => void;
  onHover: () => void;
}

const CommandItem: React.FC<CommandItemProps> = ({
  command,
  isSelected,
  dataIndex,
  onSelect,
  onHover,
}) => {
  return (
    <button
      data-index={dataIndex}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors
        ${isSelected 
          ? 'bg-[var(--accent)]/15 text-[var(--text-primary)]' 
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
        }`}
    >
      {/* 图标 */}
      {command.icon && (
        <span className={`flex-shrink-0 ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
          {command.icon}
        </span>
      )}
      
      {/* 标题 */}
      <span className="flex-1 text-sm truncate">
        {command.title}
      </span>
      
      {/* 快捷键 */}
      {command.shortcut && (
        <kbd className="flex-shrink-0 px-2 py-0.5 text-xs font-mono text-[var(--text-muted)] bg-[var(--bg-app)] border border-[var(--border-color)] rounded">
          {command.shortcut}
        </kbd>
      )}
    </button>
  );
};

export default CommandPalette;
