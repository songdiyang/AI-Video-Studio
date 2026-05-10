import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings as SettingsIcon, Moon, Sun, Eye, Check, Send, 
  Palette, MessageSquare, Info, ChevronRight, Sparkles, Monitor, Globe, RotateCcw, Maximize, Minimize, HardDrive, Trash2, Shield, EyeOff, Eye as EyeIcon, Bot, Coins
} from 'lucide-react';
import { useTheme, ThemeType } from '../../contexts/ThemeContext';
import { useLanguage, LanguageType } from '../../contexts/LanguageContext';
import { getAuthToken } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import { getCacheStats, clearMediaCache, formatCacheSize, isCacheSupported } from '../../services/mediaCache';

type FeedbackType = 'bug' | 'feature' | 'improvement' | 'other';

interface ThemePreset {
  key: ThemeType;
  nameKey: 'dark' | 'light' | 'highContrast' | 'system';
  icon: React.ReactNode;
  preview: {
    bg: string;
    nav: string;
    card: string;
    text: string;
    accent: string;
    border: string;
  };
}

const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'dark',
    nameKey: 'dark',
    icon: <Moon className="w-5 h-5" />,
    preview: {
      bg: '#111113',
      nav: '#16161a',
      card: '#222226',
      text: '#d4d4dc',
      accent: '#4e8ef7',
      border: '#32323a',
    },
  },
  {
    key: 'light',
    nameKey: 'light',
    icon: <Sun className="w-5 h-5" />,
    preview: {
      bg: '#f8fafc',
      nav: '#ffffff',
      card: '#f1f5f9',
      text: '#1e293b',
      accent: '#4f46e5',
      border: '#cbd5e1',
    },
  },
  {
    key: 'high-contrast',
    nameKey: 'highContrast',
    icon: <Eye className="w-5 h-5" />,
    preview: {
      bg: '#000000',
      nav: '#0a0a0a',
      card: '#111111',
      text: '#ffffff',
      accent: '#79b8ff',
      border: '#555555',
    },
  },
  {
    key: 'system' as ThemeType,
    nameKey: 'system',
    icon: <Monitor className="w-5 h-5" />,
    preview: {
      // 使用半深半浅的预览色
      bg: '#1a1a2e',
      nav: '#f8fafc', 
      card: '#1e293b',
      text: '#e2e8f0',
      accent: '#6366f1',
      border: '#334155',
    },
  },
];

const ThemePreviewMini: React.FC<{ preset: ThemePreset; isActive: boolean }> = ({ preset, isActive }) => {
  const p = preset.preview;
  
  // system 主题特殊分屏预览
  if (preset.key === 'system') {
    const lightColors = { bg: '#f8fafc', nav: '#ffffff', card: '#f1f5f9', text: '#1e293b', accent: '#4f46e5', border: '#cbd5e1' };
    const darkColors = { bg: '#0a0a0f', nav: '#0f172a', card: '#1e293b', text: '#e2e8f0', accent: '#6366f1', border: '#334155' };
    
    return (
      <div
        className="w-full aspect-16/10 rounded-lg overflow-hidden relative border-2 transition-all"
        style={{
          borderColor: isActive ? p.accent : p.border,
          boxShadow: isActive ? `0 0 16px ${p.accent}44` : 'none',
        }}
      >
        {/* 左半部分 - 浅色 */}
        <div className="absolute inset-0 w-1/2" style={{ backgroundColor: lightColors.bg }}>
          <div
            className="h-[14%] flex items-center px-2 gap-1"
            style={{ backgroundColor: lightColors.nav, borderBottom: `1px solid ${lightColors.border}` }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: lightColors.accent }} />
            <div className="w-5 h-1 rounded-full" style={{ backgroundColor: lightColors.text, opacity: 0.5 }} />
          </div>
          <div className="p-1.5 flex gap-1 h-[86%]">
            <div className="w-[30%] rounded p-0.5 space-y-0.5" style={{ backgroundColor: lightColors.card }}>
              <div className="h-1 rounded-full w-3/4" style={{ backgroundColor: lightColors.text, opacity: 0.4 }} />
              <div className="h-1 rounded-full w-full" style={{ backgroundColor: lightColors.accent, opacity: 0.5 }} />
            </div>
            <div className="flex-1 rounded p-1 space-y-1" style={{ backgroundColor: lightColors.card }}>
              <div className="h-1.5 rounded-full w-1/2" style={{ backgroundColor: lightColors.text, opacity: 0.5 }} />
              <div className="h-4 rounded" style={{ backgroundColor: lightColors.bg }} />
            </div>
          </div>
        </div>
        
        {/* 右半部分 - 深色 */}
        <div className="absolute inset-0 left-1/2 w-1/2" style={{ backgroundColor: darkColors.bg }}>
          <div
            className="h-[14%] flex items-center px-2 gap-1"
            style={{ backgroundColor: darkColors.nav, borderBottom: `1px solid ${darkColors.border}` }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: darkColors.accent }} />
            <div className="w-5 h-1 rounded-full" style={{ backgroundColor: darkColors.text, opacity: 0.5 }} />
          </div>
          <div className="p-1.5 flex gap-1 h-[86%]">
            <div className="w-[30%] rounded p-0.5 space-y-0.5" style={{ backgroundColor: darkColors.card }}>
              <div className="h-1 rounded-full w-3/4" style={{ backgroundColor: darkColors.text, opacity: 0.4 }} />
              <div className="h-1 rounded-full w-full" style={{ backgroundColor: darkColors.accent, opacity: 0.5 }} />
            </div>
            <div className="flex-1 rounded p-1 space-y-1" style={{ backgroundColor: darkColors.card }}>
              <div className="h-1.5 rounded-full w-1/2" style={{ backgroundColor: darkColors.text, opacity: 0.5 }} />
              <div className="h-4 rounded" style={{ backgroundColor: darkColors.bg }} />
            </div>
          </div>
        </div>
        
        {/* 中间分割线 */}
        <div 
          className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 z-10"
          style={{ background: `linear-gradient(180deg, ${lightColors.border} 0%, ${darkColors.border} 100%)` }}
        />

        {/* Active indicator */}
        {isActive && (
          <div
            className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center z-20"
            style={{ backgroundColor: p.accent }}
          >
            <Check className="w-3 h-3" style={{ color: '#fff' }} />
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div
      className="w-full aspect-[16/10] rounded-lg overflow-hidden relative border-2 transition-all"
      style={{
        backgroundColor: p.bg,
        borderColor: isActive ? p.accent : p.border,
        boxShadow: isActive ? `0 0 16px ${p.accent}44` : 'none',
      }}
    >
      {/* Mini nav */}
      <div
        className="h-[14%] flex items-center px-3 gap-1.5"
        style={{ backgroundColor: p.nav, borderBottom: `1px solid ${p.border}` }}
      >
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.accent }} />
        <div className="w-8 h-1.5 rounded-full" style={{ backgroundColor: p.text, opacity: 0.5 }} />
        <div className="ml-auto flex gap-1">
          <div className="w-6 h-1.5 rounded" style={{ backgroundColor: p.text, opacity: 0.2 }} />
          <div className="w-6 h-1.5 rounded" style={{ backgroundColor: p.text, opacity: 0.2 }} />
        </div>
      </div>
      {/* Mini body */}
      <div className="p-2 flex gap-1.5 h-[86%]">
        {/* Sidebar */}
        <div className="w-[25%] rounded-md p-1 space-y-1" style={{ backgroundColor: p.card }}>
          <div className="h-1.5 rounded-full w-3/4" style={{ backgroundColor: p.text, opacity: 0.4 }} />
          <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: p.accent, opacity: 0.5 }} />
          <div className="h-1.5 rounded-full w-2/3" style={{ backgroundColor: p.text, opacity: 0.2 }} />
        </div>
        {/* Main content */}
        <div className="flex-1 rounded-md p-1.5 space-y-1.5" style={{ backgroundColor: p.card }}>
          <div className="h-2 rounded-full w-1/2" style={{ backgroundColor: p.text, opacity: 0.5 }} />
          <div className="flex gap-1">
            <div className="flex-1 h-6 rounded" style={{ backgroundColor: p.bg }} />
            <div className="flex-1 h-6 rounded" style={{ backgroundColor: p.bg }} />
          </div>
          <div className="h-1.5 rounded-full w-3/4" style={{ backgroundColor: p.text, opacity: 0.2 }} />
          <div className="h-1.5 rounded-full w-1/2" style={{ backgroundColor: p.text, opacity: 0.15 }} />
        </div>
      </div>

      {/* Active indicator */}
      {isActive && (
        <div
          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ backgroundColor: p.accent }}
        >
          <Check className="w-3 h-3" style={{ color: p.bg }} />
        </div>
      )}
    </div>
  );
};

// 设置分组配置
interface SettingSection {
  id: string;
  icon: React.ReactNode;
}

const SETTING_SECTIONS: SettingSection[] = [
  { id: 'appearance', icon: <Palette className="w-4 h-4" /> },
  { id: 'language', icon: <Globe className="w-4 h-4" /> },
  { id: 'ai_assistant', icon: <Bot className="w-4 h-4" /> },
  { id: 'points', icon: <Coins className="w-4 h-4" /> },
  { id: 'storage', icon: <HardDrive className="w-4 h-4" /> },
  { id: 'security', icon: <Shield className="w-4 h-4" /> },
  { id: 'feedback', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'about', icon: <Info className="w-4 h-4" /> },
];

const Settings: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { showToast } = useToast();
  const [activeSection, setActiveSection] = useState('appearance');

  // AI 助手设置项
  const AI_SETTINGS_KEY = 'ai_assistant_settings_v1';
  const [aiIncludeContext, setAiIncludeContext] = useState(true);
  const [aiHistoryLimit, setAiHistoryLimit] = useState<number>(50);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AI_SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.includeContext === 'boolean') setAiIncludeContext(s.includeContext);
        if (typeof s.historyLimit === 'number') setAiHistoryLimit(s.historyLimit);
      }
    } catch { /* ignore */ }
  }, []);

  const saveAiSettings = useCallback((patch: Record<string, any>) => {
    try {
      const raw = localStorage.getItem(AI_SETTINGS_KEY);
      const prev = raw ? JSON.parse(raw) : {};
      const next = { ...prev, ...patch };
      localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  }, []);

  // 反馈功能状态
  const [type, setType] = useState<FeedbackType>('feature');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 缓存管理状态
  const [cacheStats, setCacheStats] = useState<{ count: number; size: number } | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [cacheLoading, setCacheLoading] = useState(false);

  // 安全设置状态
  const [passwordHint, setPasswordHint] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // 积分预警设置状态
  const [pointsThreshold, setPointsThreshold] = useState<string>('');
  const [pointsThresholdLoading, setPointsThresholdLoading] = useState(false);
  const [pointsThresholdSaving, setPointsThresholdSaving] = useState(false);

  // 加载缓存统计
  const loadCacheStats = useCallback(async () => {
    if (!isCacheSupported()) return;
    setCacheLoading(true);
    try {
      const stats = await getCacheStats();
      setCacheStats(stats);
    } catch {
      setCacheStats({ count: 0, size: 0 });
    } finally {
      setCacheLoading(false);
    }
  }, []);

  // 进入 storage 区域时加载统计
  useEffect(() => {
    if (activeSection === 'storage') {
      loadCacheStats();
    }
  }, [activeSection, loadCacheStats]);

  // 进入 security 区域时加载密码提示
  useEffect(() => {
    if (activeSection === 'security') {
      const fetchHint = async () => {
        try {
          const token = getAuthToken();
          if (!token) return;
          const res = await fetch('/api/auth/password-hint', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setPasswordHint(data.hint || '');
          }
        } catch { /* ignore */ }
      };
      fetchHint();
    }
  }, [activeSection]);

  // 进入 points 区域时加载积分预警阈值
  useEffect(() => {
    if (activeSection === 'points') {
      const fetchThreshold = async () => {
        setPointsThresholdLoading(true);
        try {
          const token = getAuthToken();
          if (!token) return;
          const res = await fetch('/api/users/points-warning-threshold', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setPointsThreshold(data.threshold !== null && data.threshold !== undefined ? String(data.threshold) : '');
          }
        } catch { /* ignore */ }
        finally {
          setPointsThresholdLoading(false);
        }
      };
      fetchThreshold();
    }
  }, [activeSection]);

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    // 初始化检查
    setIsFullscreen(!!document.fullscreenElement);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 切换全屏
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        showToast(t.settings.appearance.fullscreenEnabled, 'success');
      } else {
        await document.exitFullscreen();
        showToast(t.settings.appearance.fullscreenDisabled, 'success');
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  // 动态翻译数据
  const typeLabels: Record<FeedbackType, string> = {
    bug: t.settings.feedback.types.bug,
    feature: t.settings.feedback.types.feature,
    improvement: t.settings.feedback.types.improvement,
    other: t.settings.feedback.types.other,
  };

  const getThemeName = (nameKey: ThemePreset['nameKey']) => {
    return t.settings.appearance[nameKey];
  };

  const getThemeDesc = (nameKey: ThemePreset['nameKey']) => {
    return t.settings.appearance[`${nameKey}Desc` as keyof typeof t.settings.appearance];
  };

  const getSectionTitle = (id: string) => {
    return t.settings.sections[id as keyof typeof t.settings.sections] || id;
  };

  const getSectionDesc = (id: string) => {
    return t.settings.sections[`${id}Desc` as keyof typeof t.settings.sections] || '';
  };

  // 语言选项（动态：基础语言 + 扩展注册的语言）
  const { availableLanguages } = useLanguage();
  const languageOptions = availableLanguages.map(lang => {
    const isBase = lang.code === 'zh-CN' || lang.code === 'en-US';
    const desc = isBase
      ? (lang.code === 'zh-CN' ? t.settings.language.zhCNDesc : t.settings.language.enUSDesc)
      : '';
    return {
      id: lang.code as LanguageType,
      name: lang.name,
      desc,
      icon: lang.code === 'zh-CN' ? '中' : lang.code === 'en-US' ? 'En' : lang.name.slice(0, 2),
    };
  });

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ type, content: content.trim(), contact: contact.trim() || undefined })
      });
      if (res.ok) {
        showToast(t.settings.feedback.successMsg, 'success');
        setContent('');
        setContact('');
        setType('feature');
      } else {
        showToast(t.settings.feedback.errorMsg, 'error');
      }
    } catch {
      showToast(t.settings.feedback.networkError, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // 渲染外观设置区域
  const renderAppearanceSection = () => (
    <div className="space-y-6">
      {/* 主题选择 */}
      <div>
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-primary)' }}>
          {t.settings.appearance.title}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {THEME_PRESETS.map((preset) => {
            const isActive = theme === preset.key;
            const themeName = getThemeName(preset.nameKey);
            const themeDesc = getThemeDesc(preset.nameKey);
            return (
              <button
                key={preset.key}
                onClick={() => {
                  setTheme(preset.key);
                  showToast(`${t.settings.appearance.switchedTo}${themeName}`, 'success');
                }}
                className={`group relative rounded-2xl p-4 transition-all duration-200 hover:scale-[1.02] ${isActive ? 'animate-success-bounce' : ''}`}
                style={{
                  backgroundColor: isActive ? `${preset.preview.accent}12` : 'var(--bg-card-hover)',
                  border: `2px solid ${isActive ? preset.preview.accent : 'transparent'}`,
                  boxShadow: isActive ? `0 0 24px ${preset.preview.accent}20` : 'none',
                }}
              >
                {/* 预览图 */}
                <ThemePreviewMini preset={preset} isActive={isActive} />
                
                {/* 信息 */}
                <div className="mt-4 flex items-start gap-3">
                  <div 
                    className="p-2 rounded-xl shrink-0 transition-colors"
                    style={{ 
                      backgroundColor: isActive ? `${preset.preview.accent}20` : 'var(--bg-input)',
                      color: isActive ? preset.preview.accent : 'var(--text-secondary)'
                    }}
                  >
                    {preset.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                        {themeName}
                      </span>
                      {isActive && (
                        <span 
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: `${preset.preview.accent}25`, color: preset.preview.accent }}
                        >
                          {t.common.current}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {themeDesc}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 全屏显示 */}
      <div>
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-primary)' }}>
          {t.settings.appearance.fullscreen}
        </h3>
        <button
          onClick={toggleFullscreen}
          className="w-full rounded-2xl p-4 transition-all duration-200 hover:scale-[1.01] flex items-center gap-4"
          style={{
            backgroundColor: isFullscreen ? 'var(--accent-primary)12' : 'var(--bg-card-hover)',
            border: `2px solid ${isFullscreen ? 'var(--accent-primary)' : 'transparent'}`,
          }}
        >
          <div 
            className="p-3 rounded-xl shrink-0 transition-colors"
            style={{ 
              backgroundColor: isFullscreen ? 'var(--accent-primary)' : 'var(--bg-input)',
              color: isFullscreen ? 'white' : 'var(--text-secondary)'
            }}
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </div>
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                {isFullscreen ? t.settings.appearance.exitFullscreen : t.settings.appearance.enterFullscreen}
              </span>
              {isFullscreen && (
                <span 
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: 'var(--accent-primary)25', color: 'var(--accent-primary)' }}
                >
                  {t.common.current}
                </span>
              )}
            </div>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {t.settings.appearance.fullscreenDesc}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>
    </div>
  );

  // 渲染反馈区域
  const renderFeedbackSection = () => (
    <div className="space-y-6">
      {/* 反馈类型 */}
      <div>
        <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
          {t.settings.feedback.title}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.keys(typeLabels) as FeedbackType[]).map(feedbackType => (
            <button
              key={feedbackType}
              onClick={() => setType(feedbackType)}
              className="p-3 rounded-xl text-sm font-medium transition-all text-center"
              style={{
                backgroundColor: type === feedbackType ? 'var(--accent-primary)' : 'var(--bg-input)',
                color: type === feedbackType ? 'white' : 'var(--text-secondary)',
                border: `1px solid ${type === feedbackType ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              }}
            >
              {typeLabels[feedbackType]}
            </button>
          ))}
        </div>
      </div>

      {/* 反馈内容 */}
      <div>
        <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
          {t.settings.feedback.detailLabel}
        </h3>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={t.settings.feedback.detailPlaceholder}
          rows={5}
          maxLength={5000}
          className="w-full rounded-xl px-4 py-3 text-sm resize-none transition-all"
          style={{
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
          }}
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t.settings.feedback.detailHint}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {content.length}/5000
          </span>
        </div>
      </div>

      {/* 联系方式 */}
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          {t.settings.feedback.contactLabel}
          <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>({t.settings.feedback.contactOptional})</span>
        </h3>
        <input
          value={contact}
          onChange={e => setContact(e.target.value)}
          placeholder={t.settings.feedback.contactPlaceholder}
          className="w-full rounded-xl px-4 py-3 text-sm transition-all"
          style={{
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* 提交按钮 */}
      <button
        onClick={handleSubmit}
        disabled={!content.trim() || submitting}
        className="w-full py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: 'var(--accent-primary)',
          color: 'white',
        }}
      >
        <Send className="w-4 h-4" />
        {submitting ? t.settings.feedback.submitting : t.settings.feedback.submitBtn}
      </button>
    </div>
  );

  // 渲染安全设置区域
  const renderSecuritySection = () => {
    const sec = (t.settings as any).security || {};

    const handleSaveHint = async () => {
      setHintLoading(true);
      try {
        const token = getAuthToken();
        const res = await fetch('/api/auth/password-hint', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ hint: passwordHint.trim() || null })
        });
        if (res.ok) {
          showToast(sec.hintSaved || '密码提示已保存', 'success');
        } else {
          const data = await res.json().catch(() => ({}));
          showToast(data.message || sec.hintSaveFailed || '保存失败', 'error');
        }
      } catch {
        showToast(sec.networkError || '网络错误', 'error');
      } finally {
        setHintLoading(false);
      }
    };

    const handleChangePassword = async () => {
      if (newPassword !== confirmPassword) {
        showToast(sec.passwordMismatch || '两次输入的新密码不一致', 'error');
        return;
      }
      if (newPassword.length < 6) {
        showToast(sec.passwordTooShort || '新密码至少需要 6 个字符', 'error');
        return;
      }
      setPasswordLoading(true);
      try {
        const token = getAuthToken();
        const res = await fetch('/api/auth/change-password', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ oldPassword, newPassword })
        });
        if (res.ok) {
          showToast(sec.passwordChanged || '密码修改成功', 'success');
          setOldPassword('');
          setNewPassword('');
          setConfirmPassword('');
        } else {
          const data = await res.json().catch(() => ({}));
          showToast(data.message || sec.passwordChangeFailed || '密码修改失败', 'error');
        }
      } catch {
        showToast(sec.networkError || '网络错误', 'error');
      } finally {
        setPasswordLoading(false);
      }
    };

    const inputStyle = {
      backgroundColor: 'var(--bg-input)',
      border: '1px solid var(--border-color)',
      color: 'var(--text-primary)',
    };

    return (
      <div className="space-y-8">
        {/* 密码提示 */}
        <div>
          <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
            {sec.hintTitle || '密码提示'}
          </h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            {sec.hintDesc || '设置密码提示，帮助您回忆密码。请勿直接填写密码本身。'}
          </p>
          <div className="flex gap-3">
            <input
              value={passwordHint}
              onChange={e => setPasswordHint(e.target.value)}
              placeholder={sec.hintPlaceholder || '例如：我常用的密码组合'}
              maxLength={255}
              className="flex-1 rounded-xl px-4 py-3 text-sm transition-all"
              style={inputStyle}
            />
            <button
              onClick={handleSaveHint}
              disabled={hintLoading}
              className="px-6 py-3 rounded-xl font-medium text-sm transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
            >
              {hintLoading ? (sec.saving || '保存中...') : (sec.save || '保存')}
            </button>
          </div>
        </div>

        {/* 修改密码 */}
        <div>
          <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
            {sec.changePasswordTitle || '修改密码'}
          </h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            {sec.changePasswordDesc || '输入旧密码和新密码来修改您的登录密码。'}
          </p>
          <div className="space-y-3">
            {/* 旧密码 */}
            <div className="relative">
              <input
                type={showOldPassword ? 'text' : 'password'}
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                placeholder={sec.oldPasswordPlaceholder || '旧密码'}
                className="w-full rounded-xl px-4 py-3 pr-10 text-sm transition-all"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => setShowOldPassword(!showOldPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
              >
                {showOldPassword ? <EyeOff className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
            {/* 新密码 */}
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder={sec.newPasswordPlaceholder || '新密码'}
                className="w-full rounded-xl px-4 py-3 pr-10 text-sm transition-all"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
            {/* 确认新密码 */}
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder={sec.confirmPasswordPlaceholder || '确认新密码'}
                className="w-full rounded-xl px-4 py-3 pr-10 text-sm transition-all"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button
            onClick={handleChangePassword}
            disabled={!oldPassword || !newPassword || !confirmPassword || passwordLoading}
            className="w-full mt-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
          >
            {passwordLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
            {passwordLoading ? (sec.changing || '修改中...') : (sec.changePasswordBtn || '修改密码')}
          </button>
        </div>
      </div>
    );
  };

  // 渲染关于区域
  const renderAboutSection = () => (
    <div className="space-y-6">
      {/* 应用信息 */}
      <div 
        className="rounded-2xl p-6"
        style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center gap-4 mb-4">
          <div 
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
          >
            🥟
          </div>
          <div>
            <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
              {t.settings.about.appName}
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {t.settings.about.appSubtitle}
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t.settings.about.version}</span>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>1.0.0-alpha</span>
          </div>
        </div>
      </div>

      {/* 即将推出 */}
      <div 
        className="rounded-2xl p-6"
        style={{ backgroundColor: 'var(--bg-input)', border: '1px dashed var(--border-color)' }}
      >
        <div className="flex items-center gap-3 mb-3">
          <Sparkles className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
          <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>{t.settings.about.comingSoon}</h3>
        </div>
        <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <li className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            {(t.settings.about as any).comicWorkbench || '漫画工作台'}
          </li>
          <li className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            {(t.settings.about as any).novelWorkbench || '小说工作台'}
          </li>
          <li className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            {(t.settings.about as any).shortVideoWorkbench || '短视频工作台'}
          </li>
          <li className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            {(t.settings.about as any).musicWorkbench || '音乐工作台'}
          </li>
        </ul>
      </div>

      {/* 重新播放引导 */}
      <button
        onClick={() => window.dispatchEvent(new Event('reset-onboarding'))}
        className="w-full py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 interactive-press hover:scale-[1.02]"
        style={{
          backgroundColor: 'var(--bg-input)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-secondary)',
        }}
      >
        <RotateCcw className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
        {t.onboarding?.replayButton || '重新播放新手引导'}
      </button>
    </div>
  );

  // 渲染语言设置区域
  const renderLanguageSection = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-primary)' }}>
          {t.settings.language.title}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {languageOptions.map((option) => {
            const isActive = language === option.id;
            return (
              <button
                key={option.id}
                onClick={() => setLanguage(option.id)}
                className={`group relative rounded-2xl p-4 transition-all duration-200 hover:scale-[1.02] ${isActive ? 'animate-success-bounce' : ''}`}
                style={{
                  backgroundColor: isActive ? 'var(--accent-primary)12' : 'var(--bg-card-hover)',
                  border: `2px solid ${isActive ? 'var(--accent-primary)' : 'transparent'}`,
                  boxShadow: isActive ? '0 0 24px var(--accent-primary)20' : 'none',
                }}
              >
                <div className="flex items-start gap-4">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 transition-colors"
                    style={{ 
                      backgroundColor: isActive ? 'var(--accent-primary)' : 'var(--bg-input)',
                      color: isActive ? 'white' : 'var(--text-secondary)'
                    }}
                  >
                    {option.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                        {option.name}
                      </span>
                      {isActive && (
                        <span 
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: 'var(--accent-primary)25', color: 'var(--accent-primary)' }}
                        >
                          {t.common.current}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {option.desc}
                    </p>
                  </div>
                  {isActive && (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    >
                      <Check className="w-3 h-3" style={{ color: 'white' }} />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  // 渲染 AI 助手设置区域
  const renderAiAssistantSection = () => (
    <div className="space-y-6">
      {/* 注入项目上下文 */}
      <label
        className="flex items-start justify-between gap-4 p-4 rounded-xl cursor-pointer transition-colors"
        style={{ backgroundColor: 'var(--bg-body)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>注入项目上下文</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            开启后将角色、场景、剧本、分镜清单注入 AI 系统提示词。关闭可减少 token 消耗。
          </p>
        </div>
        <input
          type="checkbox"
          checked={aiIncludeContext}
          onChange={(e) => {
            setAiIncludeContext(e.target.checked);
            saveAiSettings({ includeContext: e.target.checked });
          }}
          className="mt-1 w-4 h-4"
          style={{ accentColor: 'var(--accent-primary)' }}
        />
      </label>

      {/* 历史消息上限 */}
      <div
        className="p-4 rounded-xl"
        style={{ backgroundColor: 'var(--bg-body)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>历史消息上限</span>
          <span className="text-xs font-mono" style={{ color: 'var(--accent-primary)' }}>{aiHistoryLimit === 0 ? '不限' : aiHistoryLimit}</span>
        </div>
        <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-muted)' }}>
          每次发送时最多携带多少条历史消息。越小越省 token，越大上下文越完整。
        </p>
        <div className="flex items-center gap-2">
          {[10, 20, 50, 100, 0].map((n) => (
            <button
              key={n}
              onClick={() => {
                setAiHistoryLimit(n);
                saveAiSettings({ historyLimit: n });
              }}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: aiHistoryLimit === n ? 'var(--accent-primary)' : 'var(--bg-card)',
                color: aiHistoryLimit === n ? 'white' : 'var(--text-muted)',
                border: `1px solid ${aiHistoryLimit === n ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              }}
            >
              {n === 0 ? '不限' : n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // 渲染存储管理区域
  const renderStorageSection = () => {
    const st = (t.settings as any).storage || {};
    const supported = isCacheSupported();

    const handleClearCache = async () => {
      setIsClearing(true);
      try {
        const success = await clearMediaCache();
        if (success) {
          showToast(st.clearSuccess || '缓存已清除', 'success');
          setCacheStats({ count: 0, size: 0 });
        } else {
          showToast(st.clearFailed || '清除缓存失败', 'error');
        }
      } catch {
        showToast(st.clearFailed || '清除缓存失败', 'error');
      } finally {
        setIsClearing(false);
      }
    };

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            {st.title || '本地缓存'}
          </h3>
          <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
            {st.description || '图片和视频会自动缓存到浏览器本地，加快下次打开速度。'}
          </p>

          {!supported ? (
            <div 
              className="rounded-xl p-4 text-center text-sm"
              style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}
            >
              {st.notSupported || '当前浏览器不支持本地缓存'}
            </div>
          ) : (
            <div className="space-y-4">
              {/* 缓存统计卡片 */}
              <div className="grid grid-cols-2 gap-4">
                <div 
                  className="rounded-xl p-4"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                      {st.cacheSize || '缓存大小'}
                    </span>
                  </div>
                  <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {cacheLoading 
                      ? (st.calculating || '计算中...')
                      : cacheStats 
                        ? formatCacheSize(cacheStats.size)
                        : '0 B'
                    }
                  </div>
                </div>
                <div 
                  className="rounded-xl p-4"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                      {st.cacheCount || '已缓存'}
                    </span>
                  </div>
                  <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {cacheLoading 
                      ? (st.calculating || '计算中...')
                      : cacheStats
                        ? `${cacheStats.count} ${st.cacheCountUnit || '个文件'}`
                        : `0 ${st.cacheCountUnit || '个文件'}`
                    }
                  </div>
                </div>
              </div>

              {/* 清除缓存按钮 */}
              <button
                onClick={handleClearCache}
                disabled={isClearing || (cacheStats?.count === 0 && !cacheLoading)}
                className="flex items-center gap-2 px-4 py-3 rounded-xl transition-all w-full justify-center font-medium text-sm"
                style={{
                  backgroundColor: isClearing ? 'var(--bg-input)' : 'rgba(239, 68, 68, 0.1)',
                  color: isClearing ? 'var(--text-muted)' : '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  cursor: (isClearing || (cacheStats?.count === 0 && !cacheLoading)) ? 'not-allowed' : 'pointer',
                  opacity: (cacheStats?.count === 0 && !cacheLoading) ? 0.5 : 1,
                }}
              >
                {isClearing ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                {isClearing ? (st.clearing || '清除中...') : (st.clearCache || '清除缓存')}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // 渲染积分预警设置区域
  const renderPointsSection = () => {
    const pt = (t.settings as any).points || {};

    const handleSaveThreshold = async () => {
      setPointsThresholdSaving(true);
      try {
        const token = getAuthToken();
        const trimmed = pointsThreshold.trim();
        const thresholdValue = trimmed === '' ? null : parseInt(trimmed, 10);

        if (thresholdValue !== null && (isNaN(thresholdValue) || thresholdValue < 0)) {
          showToast(pt.thresholdHint || '阈值必须是大于等于0的整数', 'error');
          return;
        }

        const res = await fetch('/api/users/points-warning-threshold', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ threshold: thresholdValue })
        });

        if (res.ok) {
          showToast(pt.saved || '预警设置已保存', 'success');
        } else {
          const data = await res.json().catch(() => ({}));
          showToast(data.message || pt.saveFailed || '保存失败', 'error');
        }
      } catch {
        showToast(pt.saveFailed || '保存失败', 'error');
      } finally {
        setPointsThresholdSaving(false);
      }
    };

    const inputStyle = {
      backgroundColor: 'var(--bg-input)',
      border: '1px solid var(--border-color)',
      color: 'var(--text-primary)',
    };

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            {pt.title || '积分余额预警'}
          </h3>
          <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
            {pt.description || '当您的积分余额低于设定阈值时，系统会自动发送站内信提醒您及时充值。'}
          </p>

          {pointsThresholdLoading ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              加载中...
            </div>
          ) : (
            <div className="space-y-4">
              {/* 阈值输入 */}
              <div
                className="p-4 rounded-xl"
                style={{ backgroundColor: 'var(--bg-body)', border: '1px solid var(--border-color)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {pt.thresholdLabel || '预警阈值'}
                  </span>
                  <span className="text-xs font-mono" style={{ color: 'var(--accent-primary)' }}>
                    {pointsThreshold.trim() === '' || parseInt(pointsThreshold) <= 0
                      ? (pt.disabled || '已关闭')
                      : `${parseInt(pointsThreshold)} 积分`}
                  </span>
                </div>
                <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-muted)' }}>
                  {pt.thresholdHint || '设置为 0 或留空表示关闭此功能'}
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    value={pointsThreshold}
                    onChange={e => setPointsThreshold(e.target.value)}
                    placeholder={pt.thresholdPlaceholder || '输入积分数量，例如：100'}
                    className="flex-1 rounded-xl px-4 py-3 text-sm transition-all"
                    style={inputStyle}
                  />
                  <button
                    onClick={handleSaveThreshold}
                    disabled={pointsThresholdSaving}
                    className="px-6 py-3 rounded-xl font-medium text-sm transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
                  >
                    {pointsThresholdSaving ? (pt.saving || '保存中...') : (pt.save || '保存')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // 渲染当前激活的区域
  const renderActiveSection = () => {
    switch (activeSection) {
      case 'appearance': return renderAppearanceSection();
      case 'language': return renderLanguageSection();
      case 'ai_assistant': return renderAiAssistantSection();
      case 'points': return renderPointsSection();
      case 'storage': return renderStorageSection();
      case 'security': return renderSecuritySection();
      case 'feedback': return renderFeedbackSection();
      case 'about': return renderAboutSection();
      default: return renderAppearanceSection();
    }
  };

  const currentSection = SETTING_SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* 页面标题 */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div 
              className="p-2.5 rounded-xl"
              style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
            >
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t.settings.title}</h1>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t.settings.subtitle}</p>
            </div>
          </div>
        </div>

        {/* 主内容区域 */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* 左侧导航 */}
          <div className="lg:w-56 shrink-0">
            <div 
              className="rounded-2xl p-2 lg:sticky lg:top-6"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
            >
              <nav className="flex lg:flex-col gap-1">
                {SETTING_SECTIONS.map(section => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all w-full"
                    style={{
                      backgroundColor: activeSection === section.id ? 'var(--accent-primary)' : 'transparent',
                      color: activeSection === section.id ? 'white' : 'var(--text-secondary)',
                    }}
                  >
                    <span className={activeSection === section.id ? 'opacity-100' : 'opacity-60'}>
                      {section.icon}
                    </span>
                    <div className="hidden lg:block">
                      <div className="text-sm font-medium">{getSectionTitle(section.id)}</div>
                      <div className="text-xs opacity-70">{getSectionDesc(section.id)}</div>
                    </div>
                    <span className="lg:hidden text-sm font-medium">{getSectionTitle(section.id)}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* 右侧内容 */}
          <div className="flex-1 min-w-0">
            <div 
              className="rounded-2xl p-6"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
            >
              {/* 区域标题 */}
              <div className="mb-6 pb-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {currentSection && getSectionTitle(currentSection.id)}
                </h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  {currentSection && getSectionDesc(currentSection.id)}
                </p>
              </div>
              
              {/* 区域内容 */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSection}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  {renderActiveSection()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
