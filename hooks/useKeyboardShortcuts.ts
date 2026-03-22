import { useEffect, useCallback, useRef } from 'react';

export interface ShortcutConfig {
  /** 按键，如 'f', '1', 'Delete', 'Escape', 'ArrowUp' 等 */
  key: string;
  /** 是否需要 Ctrl 键 */
  ctrl?: boolean;
  /** 是否需要 Shift 键 */
  shift?: boolean;
  /** 是否需要 Alt 键 */
  alt?: boolean;
  /** 执行的动作 */
  action: () => void;
  /** 中文描述，用于帮助面板 */
  description: string;
  /** 作用域：'global', 'storyboard', 'script', 'assets' 等 */
  scope?: string;
}

/**
 * 快捷键系统 Hook
 * @param shortcuts 快捷键配置数组
 * @param enabled 是否启用快捷键
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutConfig[],
  enabled: boolean = true
) {
  // 使用 ref 存储最新的 shortcuts，避免重复注册事件
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handler = useCallback((e: KeyboardEvent) => {
    // 忽略在输入框中的按键
    const target = e.target as HTMLElement;
    const tagName = target.tagName.toUpperCase();
    
    // 在输入元素中不触发快捷键（除了 Escape 键）
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) && e.key !== 'Escape') {
      return;
    }
    
    // 可编辑内容中也不触发（除了 Escape 键）
    if (target.isContentEditable && e.key !== 'Escape') {
      return;
    }

    const currentShortcuts = shortcutsRef.current;
    
    for (const shortcut of currentShortcuts) {
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase() ||
                       e.code.toLowerCase() === shortcut.key.toLowerCase() ||
                       // 支持数字键的特殊处理 (Digit1, Digit2 等)
                       (e.code === `Digit${shortcut.key}`) ||
                       // 支持箭头键
                       (shortcut.key === 'ArrowUp' && e.key === 'ArrowUp') ||
                       (shortcut.key === 'ArrowDown' && e.key === 'ArrowDown') ||
                       (shortcut.key === 'ArrowLeft' && e.key === 'ArrowLeft') ||
                       (shortcut.key === 'ArrowRight' && e.key === 'ArrowRight');
      
      const ctrlMatch = !!e.ctrlKey === !!shortcut.ctrl || !!e.metaKey === !!shortcut.ctrl;
      const shiftMatch = !!e.shiftKey === !!shortcut.shift;
      const altMatch = !!e.altKey === !!shortcut.alt;
      
      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        e.preventDefault();
        e.stopPropagation();
        shortcut.action();
        return;
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [enabled, handler]);
}

/**
 * 格式化快捷键显示文本
 * @param shortcut 快捷键配置
 * @returns 格式化后的快捷键文本，如 "Ctrl+1" 或 "Delete"
 */
export function formatShortcutKey(shortcut: Pick<ShortcutConfig, 'key' | 'ctrl' | 'shift' | 'alt'>): string {
  const parts: string[] = [];
  
  if (shortcut.ctrl) {
    // macOS 使用 ⌘，Windows/Linux 使用 Ctrl
    const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    parts.push(isMac ? '⌘' : 'Ctrl');
  }
  
  if (shortcut.alt) {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    parts.push(isMac ? '⌥' : 'Alt');
  }
  
  if (shortcut.shift) {
    parts.push('Shift');
  }
  
  // 格式化按键名称
  let keyName = shortcut.key;
  const keyNameMap: Record<string, string> = {
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'Delete': 'Del',
    'Escape': 'Esc',
    'Enter': '↵',
    'Backspace': '⌫',
    'Tab': 'Tab',
    ' ': 'Space',
  };
  
  if (keyNameMap[keyName]) {
    keyName = keyNameMap[keyName];
  } else if (keyName.length === 1) {
    keyName = keyName.toUpperCase();
  }
  
  parts.push(keyName);
  
  return parts.join('+');
}

/**
 * 按作用域分组快捷键
 * @param shortcuts 快捷键配置数组
 * @returns 按作用域分组的快捷键 Map
 */
export function groupShortcutsByScope(shortcuts: ShortcutConfig[]): Map<string, ShortcutConfig[]> {
  const groups = new Map<string, ShortcutConfig[]>();
  
  for (const shortcut of shortcuts) {
    const scope = shortcut.scope || 'global';
    if (!groups.has(scope)) {
      groups.set(scope, []);
    }
    groups.get(scope)!.push(shortcut);
  }
  
  return groups;
}

// 预定义的全局快捷键配置（供 Layout 组件使用）
export const GLOBAL_SHORTCUTS_CONFIG = {
  NAVIGATE_WORKSPACE: { key: '1', ctrl: true, scope: 'global', description: '切换到创作工作台' },
  NAVIGATE_ASSETS: { key: '2', ctrl: true, scope: 'global', description: '切换到资产管理' },
  NAVIGATE_PROJECTS: { key: '3', ctrl: true, scope: 'global', description: '切换到我的工程' },
  NAVIGATE_SKETCH: { key: '4', ctrl: true, scope: 'global', description: '切换到草图绘制' },
  NAVIGATE_SETTINGS: { key: '5', ctrl: true, scope: 'global', description: '切换到设置' },
  SHOW_HELP: { key: '?', scope: 'global', description: '显示快捷键帮助' },
  COMMAND_PALETTE: { key: 'k', ctrl: true, scope: 'global', description: '打开命令面板' },
} as const;

// 预定义的分镜视图快捷键配置（供 StoryBoard 组件使用）
export const STORYBOARD_SHORTCUTS_CONFIG = {
  SELECT_PREV: { key: 'ArrowUp', scope: 'storyboard', description: '选择上一个分镜' },
  SELECT_NEXT: { key: 'ArrowDown', scope: 'storyboard', description: '选择下一个分镜' },
  DELETE_SCENE: { key: 'Delete', scope: 'storyboard', description: '删除选中的分镜' },
  NEW_SCENE: { key: 'n', scope: 'storyboard', description: '新增分镜' },
  REFRESH_LIST: { key: 'r', scope: 'storyboard', description: '刷新分镜列表' },
  DESELECT: { key: 'Escape', scope: 'storyboard', description: '取消选择' },
  // 新增快捷键
  MOVE_UP: { key: 'ArrowUp', shift: true, scope: 'storyboard', description: '上移选中的分镜' },
  MOVE_DOWN: { key: 'ArrowDown', shift: true, scope: 'storyboard', description: '下移选中的分镜' },
  LOCK_SCENE: { key: 'l', ctrl: true, scope: 'storyboard', description: '锁定/解锁选中的分镜' },
  GENERATE_IMAGE: { key: 'i', ctrl: true, scope: 'storyboard', description: '生成选中的分镜图片' },
  GENERATE_VIDEO: { key: 'v', ctrl: true, scope: 'storyboard', description: '生成选中的分镜视频' },
  DUPLICATE_SCENE: { key: 'd', ctrl: true, scope: 'storyboard', description: '复制选中的分镜' },
  SELECT_ALL: { key: 'a', ctrl: true, scope: 'storyboard', description: '全选分镜' },
} as const;

// 预定义的视频合成快捷键配置（供 VideoComposition 组件使用）
export const VIDEO_COMPOSITION_SHORTCUTS_CONFIG = {
  PLAY_PAUSE: { key: ' ', scope: 'video-composition', description: '播放/暂停' },
  PREV_CLIP: { key: 'ArrowLeft', scope: 'video-composition', description: '上一个片段' },
  NEXT_CLIP: { key: 'ArrowRight', scope: 'video-composition', description: '下一个片段' },
  DELETE_CLIP: { key: 'Delete', scope: 'video-composition', description: '删除选中的片段' },
  EXPORT_VIDEO: { key: 'e', ctrl: true, scope: 'video-composition', description: '导出视频' },
  CLEAR_TIMELINE: { key: 'Delete', ctrl: true, shift: true, scope: 'video-composition', description: '清空时间线' },
  ZOOM_IN: { key: '=', ctrl: true, scope: 'video-composition', description: '放大时间线' },
  ZOOM_OUT: { key: '-', ctrl: true, scope: 'video-composition', description: '缩小时间线' },
  RESET_ZOOM: { key: '0', ctrl: true, scope: 'video-composition', description: '重置缩放' },
  TOGGLE_PANEL: { key: 'p', scope: 'video-composition', description: '切换属性面板' },
  MUTE_TOGGLE: { key: 'm', scope: 'video-composition', description: '静音/取消静音' },
  FULLSCREEN: { key: 'f', scope: 'video-composition', description: '全屏预览' },
} as const;

// 预定义的 Animatic 预览快捷键配置（供 AnimaticPreview 组件使用）
// 注意：实际的 action 回调在 AnimaticPreview 组件内部通过 useEffect 直接监听键盘事件实现
// 这里的配置主要用于在快捷键帮助面板中展示
export const ANIMATIC_SHORTCUTS_CONFIG: ShortcutConfig[] = [
  { key: ' ', scope: 'animatic', description: '播放/暂停', action: () => {} },
  { key: 'ArrowLeft', scope: 'animatic', description: '上一个分镜', action: () => {} },
  { key: 'ArrowRight', scope: 'animatic', description: '下一个分镜', action: () => {} },
  { key: '[', scope: 'animatic', description: '减慢速度', action: () => {} },
  { key: ']', scope: 'animatic', description: '加快速度', action: () => {} },
  { key: 'f', scope: 'animatic', description: '全屏预览', action: () => {} },
  { key: 'm', scope: 'animatic', description: '静音/取消静音', action: () => {} },
  { key: 'Escape', scope: 'animatic', description: '关闭预览', action: () => {} },
];

export default useKeyboardShortcuts;
