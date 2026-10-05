import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Moon, Sun, Eye, Send, ChevronDown, 
  Palette, MessageSquare, Info, ChevronRight, Sparkles, Monitor, Globe, RotateCcw, SlidersHorizontal, Shield, EyeOff, Eye as EyeIcon,
  Cpu, Database, BarChart3, Users, Gauge, AlertTriangle, Megaphone, ClipboardList, BookOpen, Key
} from 'lucide-react';
import { useTheme, ThemeType } from '../../contexts/ThemeContext';
import { useLanguage, LanguageType } from '../../contexts/LanguageContext';
import { getAuthToken, getUserRole, getAuthUser } from '../../services/auth';
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
  { id: 'security', icon: <Shield className="w-4 h-4" /> },
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

  // 左侧资料块：从 JWT 声明中取邮箱/角色
  const authUser = getAuthUser();
  const userDisplayName = authUser?.email?.split('@')[0] || 'User';
  const userEmail = authUser?.email || '—';
  const userInitial = (userDisplayName.charAt(0) || 'U').toUpperCase();

  // 反馈功能状态
  const [type, setType] = useState<FeedbackType>('feature');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
          <p className="text-xs mt-2 max-w-sm" style={{ color: 'var(--text-muted)' }}>
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
      <div className="space-y-8 max-w-lg">
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
            <p className="text-xs mt-2 max-w-sm" style={{ color: 'var(--text-muted)' }}>
              {activeOption.desc}
            </p>
          )}
        </div>
      </div>
    );
  };

  // 渲染通用设置区域（外观 + 语言整合）
  const renderGeneralSection = () => (
    <div className="space-y-8">
      {renderAppearanceSection()}
      {renderLanguageSection()}
    </div>
  );

  // 渲染当前激活的区域
  const renderActiveSection = () => {
    switch (activeSection) {
      case 'general': return renderGeneralSection();
      case 'ai_models': return <AIModelSettings />; // 新增：AI 模型密钥配置
      case 'security': return renderSecuritySection();
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
          className="lg:w-64 shrink-0 p-4 lg:p-5 border-b lg:border-b-0 lg:border-r"
          style={{ borderColor: 'var(--border-color)' }}
        >
          {/* 用户资料块 */}
          <div
            className="flex items-center gap-3 px-1 pb-4 mb-3"
            style={{ borderBottom: '1px solid var(--border-color)' }}
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-base font-semibold shrink-0"
              style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
            >
              {userInitial}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {userDisplayName}
                </span>
                {isAdmin && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                    style={{ backgroundColor: 'rgba(34,197,94,0.16)', color: '#22c55e' }}
                  >
                    {userRole}
                  </span>
                )}
              </div>
              <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {userEmail}
              </div>
            </div>
          </div>

          {/* 纯文字导航（无图标，选中项描边高亮） */}
          <nav className="flex lg:flex-col gap-1 flex-wrap">
            {SETTING_SECTIONS.filter(section => !section.isAdmin || isAdmin).map(section => {
              const active = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className="text-left rounded-lg px-3 py-2 text-sm transition-all w-full"
                  style={{
                    backgroundColor: active ? 'var(--accent-primary)14' : 'transparent',
                    border: `1px solid ${active ? 'var(--accent-primary)' : 'transparent'}`,
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {getSectionTitle(section.id)}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* 右侧内容 */}
        <main className="flex-1 min-w-0 p-6 lg:p-8">
          {/* 区域头部：大标题 + 描述 */}
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
