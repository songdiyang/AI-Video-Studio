/**
 * VSCode 式应用菜单栏
 * ──────────────────────────────────────────────────────────────
 * 顶部通栏左侧的「文件 / 编辑 / 查看 / 转到 / 帮助」菜单，
 * 点击展开下拉，菜单项带快捷键提示，适配 AI 视频编辑器实际功能。
 *
 * 菜单项尽量复用项目现有能力：
 *  - 文件：新建工程 / 打开工程 / 最近工程 / 保存（本地工程落盘）
 *  - 编辑：撤销 / 重做 / 剪切 / 复制 / 粘贴（走浏览器原生 execCommand 兜底）
 *  - 查看：左侧栏 / AI 助手 / 底部面板 / 全屏 / 主题切换
 *  - 转到：工作台 / 我的工程 / 团队 / 设置 / 命令面板
 *  - 帮助：快捷键 / 关于
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Check } from 'lucide-react';

/** 单个菜单项 */
export interface AppMenuItem {
  /** 文本标签；传入 '-' 表示分隔线 */
  label: string;
  /** 快捷键提示文本（右侧灰色显示） */
  shortcut?: string;
  /** 点击动作 */
  action?: () => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否显示勾选（用于开关类） */
  checked?: boolean;
  /** 子菜单（暂不支持，预留） */
  submenu?: AppMenuItem[];
}

export interface AppMenu {
  id: string;
  label: string;
  items: AppMenuItem[];
}

interface AppMenuBarProps {
  menus: AppMenu[];
}

const AppMenuBar: React.FC<AppMenuBarProps> = ({ menus }) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openMenu]);

  // Esc 关闭
  useEffect(() => {
    if (!openMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openMenu]);

  const handleItemClick = useCallback((item: AppMenuItem) => {
    if (item.disabled) return;
    setOpenMenu(null);
    item.action?.();
  }, []);

  return (
    <div ref={barRef} data-tauri-drag-region className="flex items-center" role="menubar">
      {menus.map((menu) => {
        const isOpen = openMenu === menu.id;
        return (
          <div key={menu.id} className="relative">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="true"
              aria-expanded={isOpen}
              onClick={() => setOpenMenu(isOpen ? null : menu.id)}
              onMouseEnter={() => { if (openMenu) setOpenMenu(menu.id); }}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                isOpen
                  ? 'bg-white/10 text-(--text-primary)'
                  : 'text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5'
              }`}
            >
              {menu.label}
            </button>

            {isOpen && (
              <div
                role="menu"
                className="absolute top-full left-0 mt-0.5 min-w-[240px] py-1 rounded-md border border-(--border-color) shadow-2xl z-[9999]"
                style={{ backgroundColor: 'var(--bg-app)' }}
              >
                {menu.items.map((item, idx) =>
                  item.label === '-' ? (
                    <div key={`sep-${idx}`} className="my-1 h-px bg-(--border-color)" />
                  ) : (
                    <button
                      key={`${menu.id}-${idx}`}
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => handleItemClick(item)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                        item.disabled
                          ? 'text-(--text-muted) opacity-50 cursor-not-allowed'
                          : 'text-(--text-primary) hover:bg-(--accent) hover:text-white'
                      }`}
                    >
                      {/* 勾选标记位 */}
                      <span className="w-4 shrink-0 flex items-center justify-center">
                        {item.checked && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.shortcut && (
                        <span className={`shrink-0 text-[11px] ${item.disabled ? '' : 'opacity-60'}`}>
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AppMenuBar;
