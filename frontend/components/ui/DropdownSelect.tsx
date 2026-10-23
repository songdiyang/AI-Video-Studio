/**
 * 主题化下拉选择器：替代原生 select 的系统级弹层。
 *
 * 触发器保持输入框外观，弹层 portal 到 body 并按触发器实测定位，
 * 避免被底部编辑面板的滚动容器裁切；贴底时自动向上翻转。
 */
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface DropdownSelectProps {
  /** 无障碍名称与悬停提示 */
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** 触发器附加样式（高度、宽度等由调用方按场景控制） */
  className?: string;
}

const MENU_GAP = 4;
const MENU_EDGE = 8;
const MENU_MIN_WIDTH = 160;
const MENU_MAX_HEIGHT = 224;

const isEnabled = (option?: DropdownOption) => !!option && !option.disabled;

const DropdownSelect: React.FC<DropdownSelectProps> = ({
  label, value, options, onChange, placeholder, disabled = false, className = '',
}) => {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedIndex = options.findIndex(option => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const triggerLabel = selected?.label ?? (value || placeholder || '');

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, MENU_MIN_WIDTH);
    const height = menuRef.current?.offsetHeight ?? 0;
    const left = Math.max(MENU_EDGE, Math.min(rect.left, window.innerWidth - MENU_EDGE - width));
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = height > 0 && spaceBelow < height + MENU_GAP + MENU_EDGE && rect.top > height + MENU_GAP + MENU_EDGE;
    const top = flipUp ? rect.top - MENU_GAP - height : rect.bottom + MENU_GAP;
    setPosition({ left, top, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
    // 首帧尚未量到弹层高度，下一帧再校正一次翻转位置
    const frame = requestAnimationFrame(updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, close]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const openMenu = () => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 && isEnabled(options[selectedIndex]) ? selectedIndex : options.findIndex(isEnabled));
    setOpen(true);
  };

  const moveActive = (direction: 1 | -1) => {
    if (!options.length) return;
    let next = activeIndex;
    for (let step = 0; step < options.length; step++) {
      next = (next + direction + options.length) % options.length;
      if (isEnabled(options[next])) {
        setActiveIndex(next);
        return;
      }
    }
  };

  const commit = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    close();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(options.findIndex(isEnabled));
        break;
      case 'End': {
        event.preventDefault();
        let last = options.length - 1;
        while (last >= 0 && !isEnabled(options[last])) last--;
        if (last >= 0) setActiveIndex(last);
        break;
      }
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(activeIndex);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        close();
        break;
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={handleKeyDown}
        aria-label={label}
        title={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-activedescendant={open && activeIndex >= 0 ? `${menuId}-${activeIndex}` : undefined}
        className={`flex items-center justify-between gap-1.5 w-full min-w-0 px-2.5 rounded-md border bg-(--bg-input) text-(--text-primary) text-left outline-none transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
          open
            ? 'border-(--accent)/60 ring-1 ring-(--accent)/15'
            : 'border-(--border-color) hover:border-(--text-muted)/40'
        } ${className || 'h-[30px] text-xs'}`}
      >
        <span className={`truncate ${triggerLabel ? '' : 'text-(--text-muted)'}`}>{triggerLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-(--text-muted) transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="listbox"
          aria-label={label}
          className="fixed z-[120] py-1 rounded-lg border border-(--border-color) bg-(--bg-card) shadow-2xl overflow-y-auto"
          style={{
            left: position?.left ?? -9999,
            top: position?.top ?? -9999,
            width: position?.width ?? MENU_MIN_WIDTH,
            maxHeight: MENU_MAX_HEIGHT,
            visibility: position ? 'visible' : 'hidden',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--scrollbar-thumb) transparent',
          }}
        >
          {options.length === 0 ? (
            <div className="px-2.5 py-2 text-[11px] text-(--text-muted)">暂无选项</div>
          ) : options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <button
                key={option.value}
                id={`${menuId}-${index}`}
                data-index={index}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onMouseEnter={() => isEnabled(option) && setActiveIndex(index)}
                onClick={() => commit(index)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-[7px] text-left text-[11.5px] transition-colors ${
                  !isEnabled(option)
                    ? 'opacity-40 cursor-not-allowed text-(--text-muted)'
                    : isSelected
                      ? 'bg-(--accent)/12 text-(--accent) font-medium'
                      : isActive
                        ? 'bg-(--bg-card-hover) text-(--text-primary)'
                        : 'text-(--text-secondary)'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
};

export default DropdownSelect;
