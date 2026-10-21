import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import zhCN from '../locales/zh-CN';
import enUS from '../locales/en-US';
import type { Translations } from '../locales/zh-CN';

// 支持基础语言 + 扩展注册的任意语言
export type LanguageType = 'zh-CN' | 'en-US' | (string & {});

const STORAGE_KEY = 'nanostory-language';

const baseTranslations: Record<string, Translations> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

// 浏览器语言检测
const detectBrowserLanguage = (): LanguageType => {
  if (typeof window === 'undefined') return 'zh-CN';
  const lang = navigator.language || '';
  if (lang.startsWith('zh')) return 'zh-CN';
  if (lang.startsWith('en')) return 'en-US';
  return 'zh-CN';
};

export interface LanguageOption {
  code: string;
  name: string;
}

interface LanguageContextType {
  language: LanguageType;
  setLanguage: (lang: LanguageType) => void;
  t: Translations;
  availableLanguages: LanguageOption[];
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageType>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return saved;
    } catch {}
    return detectBrowserLanguage();
  });

  // 扩展注册的语言翻译
  const [extraTranslations, setExtraTranslations] = useState<Record<string, Partial<Translations>>>({});
  // 扩展注册的语言列表
  const [extraLanguages, setExtraLanguages] = useState<LanguageOption[]>([]);

  const setLanguage = useCallback((lang: LanguageType) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {}
  }, []);

  // 监听扩展语言注册事件
  useEffect(() => {
    const handleRegister = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { code, name, translations } = customEvent.detail || {};
      console.log('[LanguageContext] Register event:', code, name);
      if (code && translations) {
        setExtraTranslations(prev => ({ ...prev, [code]: translations }));
        setExtraLanguages(prev => {
          if (prev.find(l => l.code === code)) return prev;
          return [...prev, { code, name: name || code }];
        });
      }
    };

    const handleUnregister = (event: Event) => {
      const customEvent = event as CustomEvent;
      const code = customEvent.detail;
      console.log('[LanguageContext] Unregister event:', code, 'current extraLanguages:', extraLanguages);
      if (code) {
        setExtraTranslations(prev => {
          const next = { ...prev };
          delete next[code];
          return next;
        });
        setExtraLanguages(prev => {
          const next = prev.filter(l => l.code !== code);
          console.log('[LanguageContext] Updated extraLanguages:', next);
          return next;
        });
      }
    };

    window.addEventListener('language:register' as any, handleRegister);
    window.addEventListener('language:unregister' as any, handleUnregister);
    return () => {
      window.removeEventListener('language:register' as any, handleRegister);
      window.removeEventListener('language:unregister' as any, handleUnregister);
    };
  }, []);

  // 更新 html lang 属性
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // 合并翻译：基础翻译 + 扩展翻译
  const t = useMemo(() => {
    const base = baseTranslations[language] || baseTranslations['zh-CN'];
    const extra = extraTranslations[language];
    if (!extra) return base;
    // 浅合并扩展翻译到基础翻译
    return mergeTranslations(base, extra);
  }, [language, extraTranslations]);

  const availableLanguages = useMemo<LanguageOption[]>(() => {
    const base: LanguageOption[] = [
      { code: 'zh-CN', name: '中文' },
      { code: 'en-US', name: 'English' },
    ];
    return [...base, ...extraLanguages];
  }, [extraLanguages]);

  const value = useMemo(() => ({ language, setLanguage, t, availableLanguages }), [language, setLanguage, t, availableLanguages]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

function mergeTranslations(base: Translations, extra: Partial<Translations>): Translations {
  const result = { ...base } as any;
  for (const key of Object.keys(extra)) {
    if (typeof extra[key as keyof Translations] === 'object' && typeof result[key] === 'object') {
      result[key] = { ...result[key], ...extra[key as keyof Translations] };
    } else {
      result[key] = extra[key as keyof Translations];
    }
  }
  return result as Translations;
}

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export default LanguageContext;
