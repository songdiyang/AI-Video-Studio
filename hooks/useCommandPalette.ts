import { useState, useCallback, useMemo, useEffect } from 'react';

export interface Command {
  id: string;
  title: string;
  category: 'navigation' | 'action' | 'settings';
  icon?: React.ReactNode;
  shortcut?: string;
  action: () => void;
  keywords?: string[];
}

interface UseCommandPaletteOptions {
  commands: Command[];
}

const RECENT_COMMANDS_KEY = 'nanostory-recent-commands';
const MAX_RECENT_COMMANDS = 5;

/**
 * 模糊匹配：检查 query 的字符是否按顺序出现在 target 中
 */
function fuzzyMatch(query: string, target: string): boolean {
  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();
  
  let queryIndex = 0;
  for (let i = 0; i < lowerTarget.length && queryIndex < lowerQuery.length; i++) {
    if (lowerTarget[i] === lowerQuery[queryIndex]) {
      queryIndex++;
    }
  }
  
  return queryIndex === lowerQuery.length;
}

/**
 * 命令面板 Hook
 */
export function useCommandPalette({ commands }: UseCommandPaletteOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentCommands, setRecentCommands] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_COMMANDS_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    return [];
  });

  // 根据 query 过滤命令
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      return commands;
    }
    
    return commands.filter((cmd) => {
      // 匹配 title
      if (fuzzyMatch(query, cmd.title)) {
        return true;
      }
      // 匹配 keywords
      if (cmd.keywords?.some((kw) => fuzzyMatch(query, kw))) {
        return true;
      }
      // 匹配 category
      if (fuzzyMatch(query, cmd.category)) {
        return true;
      }
      return false;
    });
  }, [commands, query]);

  // 获取最近使用的命令对象
  const recentCommandObjects = useMemo(() => {
    return recentCommands
      .map((id) => commands.find((cmd) => cmd.id === id))
      .filter((cmd): cmd is Command => !!cmd);
  }, [recentCommands, commands]);

  // 重置 selectedIndex 当 filteredCommands 变化时
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  // 打开面板
  const open = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  // 关闭面板
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  // 切换面板
  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  // 执行命令
  const executeCommand = useCallback((cmd: Command) => {
    // 执行命令
    cmd.action();
    
    // 记录到最近使用
    setRecentCommands((prev) => {
      const filtered = prev.filter((id) => id !== cmd.id);
      const updated = [cmd.id, ...filtered].slice(0, MAX_RECENT_COMMANDS);
      
      try {
        localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(updated));
      } catch {}
      
      return updated;
    });
    
    // 关闭面板
    close();
  }, [close]);

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => {
          const maxIndex = filteredCommands.length - 1;
          return prev < maxIndex ? prev + 1 : 0;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => {
          const maxIndex = filteredCommands.length - 1;
          return prev > 0 ? prev - 1 : maxIndex;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          executeCommand(filteredCommands[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  }, [filteredCommands, selectedIndex, executeCommand, close]);

  return {
    isOpen,
    query,
    setQuery,
    filteredCommands,
    selectedIndex,
    setSelectedIndex,
    recentCommands: recentCommandObjects,
    open,
    close,
    toggle,
    executeCommand,
    handleKeyDown,
  };
}

export default useCommandPalette;
