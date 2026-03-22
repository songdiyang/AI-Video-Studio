import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import zhCN from '../locales/zh-CN';
import enUS from '../locales/en-US';
import type { Translations } from '../locales/zh-CN';

export type LanguageType = 'zh-CN' | 'en-US';

const STORAGE_KEY = 'nanostory-language';

const translations: Record<LanguageType, Translations> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

// 浏览器语言检测
const detectBrowserLanguage = (): LanguageType => {
  if (typeof window === 'undefined') return 'zh-CN';
  const lang = navigator.language || '';
  return lang.startsWith('zh') ? 'zh-CN' : 'en-US';
};

interface LanguageContextType {
  language: LanguageType;
  setLanguage: (lang: LanguageType) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageType>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'zh-CN' || saved === 'en-US') return saved;
    } catch {}
    return detectBrowserLanguage();
  });

  const setLanguage = useCallback((lang: LanguageType) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {}
  }, []);

  // 更新 html lang 属性
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useMemo(() => translations[language], [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export default LanguageContext;
