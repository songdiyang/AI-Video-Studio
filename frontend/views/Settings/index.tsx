import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Moon, Sun, Eye, Send, ChevronDown, 
  Palette, MessageSquare, Info, ChevronRight, Sparkles, Monitor, Globe, RotateCcw, SlidersHorizontal,
  Cpu, Database, BarChart3, Users, Gauge, AlertTriangle, Megaphone, ClipboardList, BookOpen, Key
} from 'lucide-react';
import { useTheme, ThemeType } from '../../contexts/ThemeContext';
import { useLanguage, LanguageType } from '../../contexts/LanguageContext';
import { getAuthToken, getUserRole } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import AIModelSettings from './AIModelSettings';

// 导入管理后台功能组件
const AIModels = React.lazy(() => import('../admin/AIModels'));
const ModelProviders = React.lazy(() => import('../admin/ModelProviders'));
const ModelStatsDashboard = React.lazy(() => import('../admin/ModelStatsDashboard'));
const UserManagement = React.lazy(() => import('../admin/UserManagement'));
const RateLimitManagement = React.lazy(() => import('../admin/RateLimitManagement'));
const SiteSettings = React.lazy(() => import('../admin/SiteSettings'));
const FeedbackManagement = React.lazy(() => import('../admin/FeedbackManagement'));
const ErrorMonitor = React.lazy(() => import('../admin/ErrorMonitor'));
const AnnouncementManagement = React.lazy(() => import('../admin/AnnouncementManagement'));
const AdminLog = React.lazy(() => import('../admin/AdminLog'));
const RAGStatus = React.lazy(() => import('../admin/RAGStatus'));

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

// 设置分组配置
interface SettingSection {
  id: string;
  icon: React.ReactNode;
  isAdmin?: boolean; // 标记是否为管理员功能
}

const SETTING_SECTIONS: SettingSection[] = [
  { id: 'general', icon: <SlidersHorizontal className="w-4 h-4" /> },
  { id: 'ai_models', icon: <Key className="w-4 h-4" /> }, // 新增：AI 模型密钥配置
  { id: 'feedback', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'about', icon: <Info className="w-4 h-4" /> },
  // 管理员功能（从管理后台迁移）
  { id: 'admin_ai_models', icon: <Cpu className="w-4 h-4" />, isAdmin: true },
  { id: 'admin_model_providers', icon: <Database className="w-4 h-4" />, isAdmin: true },
  { id: 'admin_model_stats', icon: <BarChart3 className="w-4 h-4" />, isAdmin: true },
  { id: 'admin_users', icon: <Users className="w-4 h-4" />, isAdmin: true },
  { id: 'admin_rate_limits', icon: <Gauge className="w-4 h-4" />, isAdmin: true },
  { id: 'admin_site_settings', icon: <Globe className="w-4 h-4" />, isAdmin: true },
  { id: 'admin_feedback', icon: <MessageSquare className="w-4 h-4" />, isAdmin: true },
  { id: 'admin_error_monitor', icon: <AlertTriangle className="w-4 h-4" />, isAdmin: true },
  { id: 'admin_announcements', icon: <Megaphone className="w-4 h-4" />, isAdmin: true },
  { id: 'admin_logs', icon: <ClipboardList className="w-4 h-4" />, isAdmin: true },
  { id: 'admin_rag_status', icon: <BookOpen className="w-4 h-4" />, isAdmin: true },
];

const Settings: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { showToast } = useToast();
  const [activeSection, setActiveSection] = useState('general');
  
  // 获取用户角色，判断是否为管理员
  const userRole = getUserRole();
  const isAdmin = userRole === 'admin' || userRole === 'ops';

  // 反馈功能状态
  const [type, setType] = useState<FeedbackType>('feature');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
  const renderAppearanceSection = () => {
    const activePreset = THEME_PRESETS.find((p) => p.key === theme) ?? THEME_PRESETS[0];
    return (
      <div className="space-y-6">
        {/* 主题选择：下拉条切换，不展示预览样式 */}
        <div>
          <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-primary)' }}>
            {t.settings.appearance.title}
          </h3>
          <div className="relative max-w-sm">
            <select
              value={theme}
              onChange={(e) => {
                const preset = THEME_PRESETS.find((p) => p.key === e.target.value);
                if (!preset) return;
                setTheme(preset.key);
                showToast(`${t.settings.appearance.switchedTo}${getThemeName(preset.nameKey)}`, 'success');
              }}
              className="w-full appearance-none rounded-xl px-4 py-3 pr-10 text-sm outline-none transition-colors cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
              }}
            >
              {THEME_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {getThemeName(preset.nameKey)}
                </option>
              ))}
            </select>
            <ChevronDown
              className="w-4 h-4 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}
            />
          </div>
          <p className="text-xs mt-1.5 max-w-sm" style={{ color: 'var(--text-secondary)' }}>
            {getThemeDesc(activePreset.nameKey)}
          </p>
        </div>

      </div>
    );
  };

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

  // 渲染关于区域
  const renderAboutSection = () => (
    <div className="space-y-5">
      {/* 应用信息卡片 */}
      <div 
        className="rounded-2xl p-6"
        style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
      >
        {/* Logo 和标题 */}
        <div className="flex items-center gap-4 mb-6">
          <div 
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
          >
            🥟
          </div>
          <div>
            <h3 className="font-bold text-xl" style={{ color: 'var(--text-primary)' }}>
              {t.settings.about.appName}
            </h3>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {t.settings.about.appSubtitle}
            </p>
          </div>
        </div>

        {/* 版本信息 - 网格布局 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-card)' }}>
            <span className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>{t.settings.about.version}</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>1.0.0-alpha</span>
          </div>
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-card)' }}>
            <span className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>构建日期</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>2025.10</span>
          </div>
        </div>

        {/* 技术栈标签 */}
        <div className="mt-5 pt-5 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <span className="text-xs block mb-3" style={{ color: 'var(--text-muted)' }}>技术栈</span>
          <div className="flex flex-wrap gap-2">
            {['React 19', 'TypeScript', 'Tauri', 'Vite', 'Tailwind CSS'].map((tech) => (
              <span 
                key={tech}
                className="px-2.5 py-1 rounded-md text-xs font-medium"
                style={{ 
                  backgroundColor: 'var(--accent-primary)', 
                  color: 'white',
                  opacity: 0.9
                }}
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 即将推出 */}
      <div 
        className="rounded-2xl p-6"
        style={{ backgroundColor: 'var(--bg-input)', border: '1px dashed var(--border-color)' }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t.settings.about.comingSoon}</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>更多创作工具正在开发中</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'comicWorkbench', label: '漫画工作台', icon: '📖' },
            { key: 'novelWorkbench', label: '小说工作台', icon: '📝' },
            { key: 'shortVideoWorkbench', label: '短视频工作台', icon: '🎬' },
            { key: 'musicWorkbench', label: '音乐工作台', icon: '🎵' },
          ].map((item) => (
            <div 
              key={item.key}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors"
              style={{ 
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-secondary)',
              }}
            >
              <span className="text-base">{item.icon}</span>
              <span>{(t.settings.about as any)[item.key] || item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 操作按钮组 */}
      <div className="flex gap-3">
        <button
          onClick={() => window.dispatchEvent(new Event('reset-onboarding'))}
          className="flex-1 py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 interactive-press hover:scale-[1.02]"
          style={{
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
          }}
        >
          <RotateCcw className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          {t.onboarding?.replayButton || '重新播放新手引导'}
        </button>
        <button
          onClick={() => window.open('https://github.com', '_blank')}
          className="px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 interactive-press hover:scale-[1.02]"
          style={{
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
          }}
          title="访问官网"
        >
          <Globe className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
        </button>
      </div>

      {/* 版权信息 */}
      <div className="text-center pt-2">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          © 2025 子墨视频Studio. 保留所有权利.
        </p>
      </div>
    </div>
  );

  // 渲染语言设置区域
  const renderLanguageSection = () => {
    const activeOption = languageOptions.find((o) => o.id === language) ?? languageOptions[0];
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-primary)' }}>
            {t.settings.language.title}
          </h3>
          <div className="relative max-w-sm">
            <select
              value={language}
              onChange={(e) => {
                const option = languageOptions.find((o) => o.id === (e.target.value as LanguageType));
                if (!option) return;
                setLanguage(option.id);
              }}
              className="w-full appearance-none rounded-xl px-4 py-3 pr-10 text-sm outline-none transition-colors cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
              }}
            >
              {languageOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <ChevronDown
              className="w-4 h-4 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}
            />
          </div>
          {activeOption?.desc && (
            <p className="text-xs mt-1.5 max-w-sm" style={{ color: 'var(--text-secondary)' }}>
              {activeOption.desc}
            </p>
          )}
        </div>
      </div>
    );
  };

  // 渲染通用设置区域（外观 + 语言整合）
  const renderGeneralSection = () => (
    <div className="max-w-2xl">
      <div
        className="rounded-xl border p-5 lg:p-6 space-y-6"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
      >
        {renderAppearanceSection()}
        <div className="h-px" style={{ backgroundColor: 'var(--border-color)' }} />
        {renderLanguageSection()}
      </div>
    </div>
  );

  // 渲染当前激活的区域
  const renderActiveSection = () => {
    switch (activeSection) {
      case 'general': return renderGeneralSection();
      case 'ai_models': return <AIModelSettings />; // 新增：AI 模型密钥配置
      case 'feedback': return renderFeedbackSection();
      case 'about': return renderAboutSection();
      // 管理员功能（从管理后台迁移）
      case 'admin_ai_models': return <React.Suspense fallback={<div>加载中...</div>}><AIModels /></React.Suspense>;
      case 'admin_model_providers': return <React.Suspense fallback={<div>加载中...</div>}><ModelProviders /></React.Suspense>;
      case 'admin_model_stats': return <React.Suspense fallback={<div>加载中...</div>}><ModelStatsDashboard /></React.Suspense>;
      case 'admin_users': return <React.Suspense fallback={<div>加载中...</div>}><UserManagement /></React.Suspense>;
      case 'admin_rate_limits': return <React.Suspense fallback={<div>加载中...</div>}><RateLimitManagement /></React.Suspense>;
      case 'admin_site_settings': return <React.Suspense fallback={<div>加载中...</div>}><SiteSettings /></React.Suspense>;
      case 'admin_feedback': return <React.Suspense fallback={<div>加载中...</div>}><FeedbackManagement /></React.Suspense>;
      case 'admin_error_monitor': return <React.Suspense fallback={<div>加载中...</div>}><ErrorMonitor /></React.Suspense>;
      case 'admin_announcements': return <React.Suspense fallback={<div>加载中...</div>}><AnnouncementManagement /></React.Suspense>;
      case 'admin_logs': return <React.Suspense fallback={<div>加载中...</div>}><AdminLog /></React.Suspense>;
      case 'admin_rag_status': return <React.Suspense fallback={<div>加载中...</div>}><RAGStatus /></React.Suspense>;
      default: return renderAppearanceSection();
    }
  };

  const currentSection = SETTING_SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>
      <div className="flex flex-col lg:flex-row min-h-full">
        {/* 左侧导航 */}
        <aside
          className="lg:w-44 shrink-0 p-4 lg:p-5 border-b lg:border-b-0 lg:border-r"
          style={{ borderColor: 'var(--border-color)' }}
        >
          {/* 导航：「通用」为主标签，其余用分隔线归组（选中态为文字高亮 + 左侧短竖线） */}
          <nav className="flex lg:flex-col gap-1 flex-wrap">
            {(() => {
              const visible = SETTING_SECTIONS.filter(section => !section.isAdmin || isAdmin);
              const renderButton = (section: SettingSection) => {
                const active = activeSection === section.id;
                const label = getSectionTitle(section.id);
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    title={label}
                    className="relative text-left rounded-md pl-4 pr-3 py-2 text-sm transition-all w-full truncate"
                    style={{
                      backgroundColor: active ? 'var(--accent)1f' : 'transparent',
                      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {active && (
                      <span
                        className="absolute left-1 top-1/2 -translate-y-1/2 h-4 w-1 rounded-full"
                        style={{ backgroundColor: 'var(--accent)' }}
                      />
                    )}
                    <span className="hover:text-[var(--text-primary)] transition-colors">{label}</span>
                  </button>
                );
              };
              const general = visible.find(s => s.id === 'general');
              const rest = visible.filter(s => s.id !== 'general');
              return (
                <>
                  {general && renderButton(general)}
                  {rest.length > 0 && (
                    <>
                      <div className="hidden lg:block my-2 mx-2 h-px" style={{ backgroundColor: 'var(--border-color)' }} />
                      {rest.map(renderButton)}
                    </>
                  )}
                </>
              );
            })()}
          </nav>
        </aside>

        {/* 右侧内容 */}
        <main className="flex-1 min-w-0 p-6 lg:p-8">
          {/* 区域头部：大标题 + 描述（ai_models 页自带「模型」标题，不重复渲染） */}
          {activeSection !== 'ai_models' && (
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {currentSection && getSectionTitle(currentSection.id)}
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  {currentSection && getSectionDesc(currentSection.id)}
                </p>
              </div>
            </div>
          )}

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
        </main>
      </div>
    </div>
  );
};

export default Settings;
