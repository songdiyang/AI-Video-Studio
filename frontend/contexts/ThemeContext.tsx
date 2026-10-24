import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { getNightLightEnabled, onNightLightChanged } from '../services/localApi';

export type ThemeType = 'dark' | 'light' | 'high-contrast' | 'night-light';

type ResolvedTheme = 'dark' | 'light' | 'high-contrast';

const STORAGE_KEY = 'nanostory-theme';
/** 最近一次夜间模式解析结果（'1' = 深色），供 index.html 首屏内联脚本使用，避免闪烁 */
const NIGHT_LIGHT_CACHE_KEY = 'nanostory-night-light-dark';

// 读取已保存主题；旧值 'system'（跟随系统深浅偏好）迁移为 'night-light'（跟随夜间模式）
const readStoredTheme = (): ThemeType => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'high-contrast' || saved === 'night-light') return saved;
    if (saved === 'system') return 'night-light';
  } catch {}
  return 'dark';
};

// 夜间模式状态缓存：首屏用它与内联脚本保持一致，避免先深后浅的跳变
const readCachedNightLight = (): boolean | null => {
  try {
    const cached = localStorage.getItem(NIGHT_LIGHT_CACHE_KEY);
    if (cached === '1') return true;
    if (cached === '0') return false;
  } catch {}
  return null;
};

// 解析实际应用的主题；夜间模式状态未知时按深色兜底，拿到真实值后立即校正
const resolveTheme = (theme: ThemeType, nightLightEnabled: boolean | null): ResolvedTheme => {
  if (theme === 'night-light') {
    return nightLightEnabled === false ? 'light' : 'dark';
  }
  return theme;
};

// 将主题 class 同步到 <html>，返回实际生效的主题
const applyThemeClasses = (theme: ThemeType, nightLightEnabled: boolean | null): ResolvedTheme => {
  const root = document.documentElement;
  const actualTheme = resolveTheme(theme, nightLightEnabled);

  root.classList.remove('theme-dark', 'theme-light', 'theme-high-contrast');
  root.classList.add(`theme-${actualTheme}`);

  // HeroUI 需要 dark class；高对比度也基于深色
  if (actualTheme === 'light') {
    root.classList.remove('dark', 'high-contrast');
  } else {
    root.classList.add('dark');
    root.classList.toggle('high-contrast', actualTheme === 'high-contrast');
  }
  return actualTheme;
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => unknown;
};

/**
 * 执行主题切换：支持 View Transitions 时由浏览器拍一次整页快照做交叉淡化（合成层动画），
 * 不再对整棵 DOM 树挂 transition（见 index.css「主题切换过渡动画」）。
 * 不支持该 API 或用户偏好减少动效时直接切换。
 */
const commitThemeChange = (commit: () => void): void => {
  const doc = document as ViewTransitionDocument;
  if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) {
    commit();
    return;
  }
  try {
    doc.startViewTransition(commit);
  } catch {
    commit();
  }
};

interface ThemeContextType {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeType>(readStoredTheme);
  const [nightLightEnabled, setNightLightEnabled] = useState<boolean | null>(readCachedNightLight);

  // 主题与夜间模式状态只由本 Provider 改写，用 ref 供同步路径（View Transition 回调）读取最新值
  const themeRef = useRef<ThemeType>(theme);
  const nightLightRef = useRef<boolean | null>(nightLightEnabled);

  const setTheme = useCallback((t: ThemeType) => {
    if (themeRef.current === t) return;
    themeRef.current = t;
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}

    commitThemeChange(() => {
      // flushSync 保证快照拍摄前 class 已落到 <html>（回调返回即拍快照）
      flushSync(() => setThemeState(t));
      applyThemeClasses(t, nightLightRef.current);
    });
  }, []);

  // 跟随夜间模式：查询当前状态 + 订阅系统开关变化
  useEffect(() => {
    if (theme !== 'night-light') return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    getNightLightEnabled().then((enabled) => {
      if (disposed) return;
      nightLightRef.current = enabled;
      setNightLightEnabled(enabled);
    });

    onNightLightChanged((enabled) => {
      if (disposed) return;
      commitThemeChange(() => {
        flushSync(() => {
          nightLightRef.current = enabled;
          setNightLightEnabled(enabled);
        });
        applyThemeClasses(themeRef.current, enabled);
      });
    }).then((fn) => {
      unlisten = fn;
      if (disposed) fn();
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [theme]);

  // 首屏与状态变化后同步 class，并缓存夜间模式解析结果供下次首屏使用
  useEffect(() => {
    const actualTheme = applyThemeClasses(theme, nightLightEnabled);
    if (theme === 'night-light' && nightLightEnabled !== null) {
      try { localStorage.setItem(NIGHT_LIGHT_CACHE_KEY, actualTheme === 'dark' ? '1' : '0'); } catch {}
    }
  }, [theme, nightLightEnabled]);

  // 稳定 context 引用，避免父级重渲染时连带所有消费者重渲染
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;
