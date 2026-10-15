import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export type ThemeType = 'dark' | 'light' | 'high-contrast' | 'system';

// 检测系统主题偏好
const getSystemTheme = (): 'dark' | 'light' => {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

// 解析实际应用的主题
const resolveTheme = (theme: ThemeType): 'dark' | 'light' | 'high-contrast' => {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
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

const STORAGE_KEY = 'nanostory-theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeType>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light' || saved === 'high-contrast' || saved === 'system') return saved;
    } catch {}
    return 'dark';
  });

  const transitionTimeoutRef = useRef<number | null>(null);

  const setTheme = useCallback((t: ThemeType) => {
    // 添加过渡动画 class
    document.documentElement.classList.add('theme-transitioning');
    
    // 清除之前的 timeout
    if (transitionTimeoutRef.current !== null) {
      clearTimeout(transitionTimeoutRef.current);
    }
    
    // 350ms 后移除过渡 class
    transitionTimeoutRef.current = window.setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
      transitionTimeoutRef.current = null;
    }, 350);

    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
  }, []);

  // 清理 timeout ref
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current !== null) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  // 将主题 class 同步到 <html>
  useEffect(() => {
    const root = document.documentElement;
    // 管理后台激活时不修改根主题，避免影响管理端
    if (root.dataset.adminMode === 'true') return;
    const actualTheme = resolveTheme(theme);
    
    root.classList.remove('theme-dark', 'theme-light', 'theme-high-contrast');
    root.classList.add(`theme-${actualTheme}`);

    // HeroUI 需要 dark class；高对比度也基于深色
    if (actualTheme === 'dark' || actualTheme === 'high-contrast') {
      root.classList.add('dark');
      // HeroUI 高对比度主题需要额外 class
      if (actualTheme === 'high-contrast') {
        root.classList.add('high-contrast');
      } else {
        root.classList.remove('high-contrast');
      }
    } else {
      root.classList.remove('dark', 'high-contrast');
    }
  }, [theme]);

  // 监听系统主题变化（仅当 theme === 'system' 时）
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      const root = document.documentElement;
      // 管理后台激活时不修改根主题
      if (root.dataset.adminMode === 'true') return;
      const actualTheme = getSystemTheme();
      
      // 添加过渡动画 class
      root.classList.add('theme-transitioning');
      
      root.classList.remove('theme-dark', 'theme-light', 'theme-high-contrast');
      root.classList.add(`theme-${actualTheme}`);

      // HeroUI 需要 dark class
      if (actualTheme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      
      // 350ms 后移除过渡 class
      setTimeout(() => {
        root.classList.remove('theme-transitioning');
      }, 350);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;
