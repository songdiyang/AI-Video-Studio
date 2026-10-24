import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Moon, MoonStar, Sun, Eye, Mail, ChevronDown, Check,
  Palette, MessageSquare, Info, ChevronRight, Sparkles, Monitor, Globe, RotateCcw, SlidersHorizontal, FileArchive,
  Cpu, Database, BarChart3, Users, Gauge, AlertTriangle, Megaphone, ClipboardList, BookOpen, Key, Film, FolderInput, Clapperboard, Type,
  Image as ImageIcon, Brain, Eraser
} from 'lucide-react';
import { useTheme, ThemeType } from '../../contexts/ThemeContext';
import { useLanguage, LanguageType } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useWorkbench } from '../../contexts/WorkbenchContext';
import AIModelSettings from './AIModelSettings';
import { getPreferredVideoFormat, setPreferredVideoFormat } from '../../services/localAI';
import {
  loadMemoryFlags,
  saveMemoryFlags,
  listMemories,
  purgeLowMemories,
  clampInjectMax,
  AGENT_MEMORY_CHANGED,
  type MemoryFlags,
} from '../../services/agentMemory';
import {
  loadProjectGenerationSettings,
  saveProjectGenerationSettings,
  findArtStylePreset,
  ART_STYLE_PRESETS,
  PROJECT_SETTINGS_CHANGED,
  clearTempArtStyle,
  type ProjectGenerationSettings,
} from '../../services/projectSettings';
import {
  getProjectsRootOverride,
  setProjectsRootOverride,
  getDefaultProjectsRoot,
  selectDirectory,
  registerJzpAssociation,
} from '../../services/localApi';

// 用户反馈邮递收件箱（不在应用内入库，仅唤起系统邮件客户端发送）
const FEEDBACK_EMAIL = 'songdiyang@aetherstudio.cn';

interface ThemePreset {
  key: ThemeType;
  nameKey: 'dark' | 'light' | 'highContrast' | 'nightLight';
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
    key: 'night-light',
    nameKey: 'nightLight',
    icon: <MoonStar className="w-5 h-5" />,
    preview: {
      // 夜间模式开关决定深/浅，预览用半深半浅示意
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
  { id: 'project', icon: <Clapperboard className="w-4 h-4" /> }, // 工程设置：当前工程的画面生成参数
  { id: 'memory', icon: <Brain className="w-4 h-4" /> }, // 记忆：AI 助手的学习与注入设置
  { id: 'feedback', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'about', icon: <Info className="w-4 h-4" /> },
];

// 自定义下拉选择器（深色主题，替代原生 select 的 OS 默认弹层）
interface SelectOption { value: string; label: string; }
const SettingsSelect: React.FC<{
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}> = ({ value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm outline-none transition-colors cursor-pointer hover:border-[var(--accent-primary)] bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)]"
      >
        <span className="truncate">{selected?.label ?? ''}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform duration-200 text-[var(--text-muted)] ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 z-30 mt-1.5 py-1 rounded-xl border shadow-2xl max-h-64 overflow-y-auto bg-[var(--bg-card)] border-[var(--border-color)]"
            style={{ transformOrigin: 'top center' }}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <li key={opt.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-left transition-colors hover:bg-[var(--bg-input)] ${isSelected ? 'text-[var(--accent-primary)] font-medium' : 'text-[var(--text-primary)]'}`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

// 自定义开关（与 SettingsSelect 同一套视觉语言）
const SettingsToggle: React.FC<{
  on: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
}> = ({ on, onChange, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={ariaLabel}
    onClick={() => onChange(!on)}
    className="relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer"
    style={{ backgroundColor: on ? 'var(--accent-primary)' : 'var(--bg-input)', border: `1px solid ${on ? 'var(--accent-primary)' : 'var(--border-color)'}` }}
  >
    <span
      className="absolute top-0.5 rounded-full transition-transform"
      style={{
        width: 18,
        height: 18,
        transform: `translateX(${on ? 20 : 2}px)`,
        backgroundColor: on ? '#fff' : 'var(--text-muted)',
      }}
    />
  </button>
);

const Settings: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { currentProject } = useWorkbench();
  
  // 从 localStorage 读取初始 section（用于从其他页面跳转时指定 section）
  const initialSection = localStorage.getItem('settings_active_section') || 'general';
  const [activeSection, setActiveSection] = useState(initialSection);

  // 视频输出格式偏好（localStorage 持久化，默认 mp4）
  const [videoFormat, setVideoFormat] = useState<string>(() => getPreferredVideoFormat());

  // 工程默认保存位置（localStorage 持久化；空表示沿用系统默认）
  const [projectsRoot, setProjectsRoot] = useState<string>(() => getProjectsRootOverride());
  const [associatingJzp, setAssociatingJzp] = useState(false);
  const [systemProjectsRoot, setSystemProjectsRoot] = useState<string>('');
  useEffect(() => {
    getDefaultProjectsRoot().then(setSystemProjectsRoot).catch(() => {});
  }, []);

  // 智能体记忆设置：全局开关 + 注入上限 + 记忆条数概况
  const [memoryFlags, setMemoryFlags] = useState<MemoryFlags>(() => loadMemoryFlags());
  const [memoryCounts, setMemoryCounts] = useState<{ user: number; project: number } | null>(null);
  const refreshMemoryCounts = React.useCallback(async () => {
    try {
      const list = await listMemories(currentProject?.id);
      setMemoryCounts({
        user: list.filter((m) => m.scope === 'user').length,
        project: list.filter((m) => m.scope === 'project').length,
      });
    } catch {
      setMemoryCounts(null);
    }
  }, [currentProject?.id]);
  React.useEffect(() => { void refreshMemoryCounts(); }, [refreshMemoryCounts]);
  React.useEffect(() => {
    // AI 助手侧的记忆增删/开关变化同步到这里（含 MemoryPanel 的修改）
    const onChanged = () => {
      setMemoryFlags(loadMemoryFlags());
      void refreshMemoryCounts();
    };
    window.addEventListener(AGENT_MEMORY_CHANGED, onChanged);
    return () => window.removeEventListener(AGENT_MEMORY_CHANGED, onChanged);
  }, [refreshMemoryCounts]);
  
  // 清除 localStorage 中的 section（只使用一次）
  React.useEffect(() => {
    if (initialSection !== 'general') {
      localStorage.removeItem('settings_active_section');
    }
  }, [initialSection]);
  
  // 本地单人应用：默认拥有全部权限
  const isAdmin = true;

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

  // 反馈邮递：唤起系统邮件客户端发送至固定收件箱
  const handleSendEmail = () => {
    const mailto = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('【用户反馈】')}`;
    try {
      const a = document.createElement('a');
      a.href = mailto;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      showToast(t.settings.feedback.networkError, 'error');
    }
  };

  /** 关联 .jzp 文件类型（Windows），关联后可直接双击工程包打开 */
  const handleAssociateJzp = async () => {
    if (associatingJzp) return;
    setAssociatingJzp(true);
    try {
      const exe = await registerJzpAssociation();
      showToast(t.settings.about.associateJzpSuccess.replace('{path}', exe), 'success');
    } catch (err: any) {
      showToast(err?.message || t.settings.about.associateJzpFailed, 'error');
    } finally {
      setAssociatingJzp(false);
    }
  };

  // 渲染外观设置区域
  const renderAppearanceSection = () => {
    const activePreset = THEME_PRESETS.find((p) => p.key === theme) ?? THEME_PRESETS[0];
    return (
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6">
        <div className="min-w-0">
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {t.settings.appearance.title}
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {getThemeDesc(activePreset.nameKey)}
          </p>
        </div>
        <div className="w-full sm:w-56 shrink-0">
          <SettingsSelect
            value={theme}
            options={THEME_PRESETS.map((p) => ({ value: p.key, label: getThemeName(p.nameKey) }))}
            onChange={(v) => {
              const preset = THEME_PRESETS.find((p) => p.key === v);
              if (!preset) return;
              setTheme(preset.key);
            }}
          />
        </div>
      </div>
    );
  };

  // 渲染反馈区域：不再收集表单，直接提醒用户发送邮件
  const renderFeedbackSection = () => (
    <div
      className="rounded-2xl p-6"
      style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
    >
      <h3 className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <MessageSquare className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
        {t.settings.feedback.title}
      </h3>
      <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {t.settings.feedback.emailIntro}
      </p>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <a
          href={`mailto:${FEEDBACK_EMAIL}`}
          className="text-sm font-medium underline break-all"
          style={{ color: 'var(--accent-primary)' }}
        >
          {FEEDBACK_EMAIL}
        </a>
        <button
          onClick={handleSendEmail}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shrink-0"
          style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
        >
          <Mail className="w-4 h-4" />
          {t.settings.feedback.sendEmail}
        </button>
      </div>
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
          {/* 与桌面应用（Tauri）打包图标保持一致 */}
          <img
            src="/icon.png"
            alt={t.settings.about.appName}
            className="w-16 h-16 rounded-2xl object-cover shadow-lg shrink-0"
            draggable={false}
          />
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
            <span className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>{t.settings.about.buildDate}</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>2025.10</span>
          </div>
        </div>

        {/* 技术栈标签 */}
        <div className="mt-5 pt-5 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <span className="text-xs block mb-3" style={{ color: 'var(--text-muted)' }}>{t.settings.about.techStack}</span>
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

      {/* 操作按钮组 */}
      <div className="flex gap-3">
        <button
          onClick={() => { void handleAssociateJzp(); }}
          disabled={associatingJzp}
          className="flex-1 py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 interactive-press hover:scale-[1.02] disabled:opacity-60"
          style={{
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
          }}
        >
          <FileArchive className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          {t.settings.about.associateJzp}
        </button>
        <button
          onClick={() => window.open('https://github.com', '_blank')}
          className="px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 interactive-press hover:scale-[1.02]"
          style={{
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
          }}
          title={t.settings.about.visitWebsite}
        >
          <Globe className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
        </button>
      </div>

      {/* 版权信息 */}
      <div className="text-center pt-2">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t.settings.about.copyright}
        </p>
      </div>
    </div>
  );

  // 渲染语言设置区域
  const renderLanguageSection = () => {
    const activeOption = languageOptions.find((o) => o.id === language) ?? languageOptions[0];
    return (
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6">
        <div className="min-w-0">
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {t.settings.language.title}
          </h3>
          {activeOption?.desc && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {activeOption.desc}
            </p>
          )}
        </div>
        <div className="w-full sm:w-56 shrink-0">
          <SettingsSelect
            value={language}
            options={languageOptions.map((o) => ({ value: o.id, label: o.name }))}
            onChange={(v) => {
              const option = languageOptions.find((o) => o.id === (v as LanguageType));
              if (!option) return;
              setLanguage(option.id);
            }}
          />
        </div>
      </div>
    );
  };

  // 渲染视频输出格式区域（软件设置：默认 mp4，可切 mov；不支持的模型生成时自动降级）
  const renderVideoFormatSection = () => {
    const formatOptions = [
      { id: 'mp4', name: 'MP4', desc: t.settings.videoFormat.mp4Desc },
      { id: 'mov', name: 'MOV', desc: t.settings.videoFormat.movDesc },
    ];
    const activeOption = formatOptions.find((o) => o.id === videoFormat) ?? formatOptions[0];
    return (
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6">
        <div className="min-w-0">
          <h3 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Film className="w-4 h-4" />
            {t.settings.videoFormat.title}
          </h3>
          {activeOption?.desc && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {activeOption.desc}
            </p>
          )}
        </div>
        <div className="w-full sm:w-56 shrink-0">
          <SettingsSelect
            value={videoFormat}
            options={formatOptions.map((o) => ({ value: o.id, label: o.name }))}
            onChange={(v) => {
              setVideoFormat(v);
              setPreferredVideoFormat(v);
              showToast(`${t.settings.videoFormat.changedToast} ${v.toUpperCase()}`, 'success');
            }}
          />
        </div>
      </div>
    );
  };

  // 渲染工程默认保存位置区域（新建工程的落盘目录，桌面端可自定义）
  const renderProjectsLocationSection = () => {
    const effective = projectsRoot || systemProjectsRoot;
    const isCustom = !!projectsRoot;
    return (
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <FolderInput className="w-4 h-4" />
            {t.settings.projectsLocation.title}
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t.settings.projectsLocation.desc}
          </p>
          <div className="mt-2 flex items-center gap-2 min-w-0">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded shrink-0 border"
              style={{
                color: isCustom ? 'var(--accent)' : 'var(--text-muted)',
                borderColor: isCustom ? 'var(--accent)' : 'var(--border-color)',
              }}
            >
              {isCustom ? t.settings.projectsLocation.customTag : t.settings.projectsLocation.defaultTag}
            </span>
            <span
              className="text-xs truncate flex-1 min-w-0"
              title={effective}
              style={{ color: 'var(--text-primary)' }}
            >
              {effective || '…'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={async () => {
              const dir = await selectDirectory(t.settings.projectsLocation.choose);
              if (dir) {
                setProjectsRootOverride(dir);
                setProjectsRoot(dir);
                showToast(t.settings.projectsLocation.chooseToast, 'success');
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <FolderInput className="w-3.5 h-3.5" />
            {t.settings.projectsLocation.choose}
          </button>
          {isCustom && (
            <button
              type="button"
              onClick={() => {
                setProjectsRootOverride('');
                setProjectsRoot('');
                showToast(t.settings.projectsLocation.resetToast, 'success');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t.settings.projectsLocation.reset}
            </button>
          )}
        </div>
      </div>
    );
  };

  // ===== 工程设置：当前工程的图片/视频分辨率与画面比例（存工程 data/project_settings.json）=====
  const [projectGenSettings, setProjectGenSettings] = useState<ProjectGenerationSettings>({});
  useEffect(() => {
    let cancelled = false;
    if (!currentProject?.id) { setProjectGenSettings({}); return; }
    loadProjectGenerationSettings(currentProject.id).then((s) => {
      if (!cancelled) setProjectGenSettings(s);
    });
    return () => { cancelled = true; };
  }, [currentProject?.id]);

  // 智能体可能在对话里锁定/更换美术风格，这里跟随事件刷新，避免页面显示旧值
  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ projectId?: number; settings?: ProjectGenerationSettings }>).detail;
      if (!currentProject?.id || detail?.projectId !== currentProject.id) return;
      setProjectGenSettings(detail.settings || {});
    };
    window.addEventListener(PROJECT_SETTINGS_CHANGED, onChanged);
    return () => window.removeEventListener(PROJECT_SETTINGS_CHANGED, onChanged);
  }, [currentProject?.id]);

  const handleProjectSettingChange = async (key: keyof ProjectGenerationSettings, value: string) => {
    if (!currentProject?.id) return;
    const next = { ...projectGenSettings, [key]: value };
    setProjectGenSettings(next);
    try {
      await saveProjectGenerationSettings(currentProject.id, next);
      showToast(t.settings.projectSettings.savedToast, 'success');
    } catch (e: any) {
      showToast(e?.message || t.settings.projectSettings.saveFailedToast, 'error');
    }
  };

  // 风格限定可能同时改两个字段（预设 + 提示词），用补丁式保存
  const [artStyleDraft, setArtStyleDraft] = useState('');
  useEffect(() => {
    setArtStyleDraft(projectGenSettings.artStylePrompt || '');
  }, [projectGenSettings.artStylePrompt]);

  const handleProjectSettingsPatch = async (patch: Partial<ProjectGenerationSettings>) => {
    if (!currentProject?.id) return;
    const next = { ...projectGenSettings, ...patch };
    setProjectGenSettings(next);
    try {
      await saveProjectGenerationSettings(currentProject.id, next);
      showToast(t.settings.projectSettings.savedToast, 'success');
    } catch (e: any) {
      showToast(e?.message || t.settings.projectSettings.saveFailedToast, 'error');
    }
  };

  // 渲染记忆设置区域：全局开关 + 注入上限 + 记忆概况与清理
  const renderMemorySection = () => {
    const ms = t.settings.memory;
    const injectOptions = [5, 10, 20, 30, 50].map((n) => ({ value: String(n), label: `${n} ${ms.unit}` }));
    const purge = async () => {
      const ok = await confirm({
        title: ms.purgeConfirmTitle,
        message: ms.purgeConfirmMessage,
        confirmText: ms.purge,
        cancelText: ms.purgeCancel,
        type: 'warning',
      });
      if (!ok) return;
      const n = await purgeLowMemories(currentProject?.id);
      showToast(
        n > 0 ? ms.purgeDone.replace('{n}', String(n)) : ms.purgeNone,
        n > 0 ? 'success' : 'info'
      );
    };
    const row = (
      key: string,
      icon: React.ReactNode,
      title: string,
      desc: string,
      control: React.ReactNode
    ) => (
      <React.Fragment key={key}>
        <div className="h-px" style={{ backgroundColor: 'var(--border-color)' }} />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-6">
          <div className="min-w-0">
            <h3 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              {icon}
              {title}
            </h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{desc}</p>
          </div>
          <div className="w-full sm:w-40 shrink-0 flex sm:justify-end">{control}</div>
        </div>
      </React.Fragment>
    );
    /** 记忆条数小方块：标签在上、数字在下 */
    const statTile = (label: string, value: string) => (
      <div
        className="flex-1 rounded-xl px-3.5 py-2.5 min-w-0"
        style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
      >
        <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-lg font-semibold leading-6 mt-0.5" style={{ color: 'var(--text-primary)' }}>{value}</p>
      </div>
    );
    return (
      <div className="max-w-2xl space-y-5">
        <div
          className="rounded-xl border p-5 lg:p-6"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
        >
          {row('autoLearn', <Sparkles className="w-4 h-4" />, ms.autoLearn, ms.autoLearnDesc, (
            <SettingsToggle
              on={memoryFlags.autoLearn}
              ariaLabel={ms.autoLearn}
              onChange={(v) => setMemoryFlags(saveMemoryFlags({ autoLearn: v }))}
            />
          ))}
          {row('retrieval', <BookOpen className="w-4 h-4" />, ms.retrieval, ms.retrievalDesc, (
            <SettingsToggle
              on={memoryFlags.retrieval}
              ariaLabel={ms.retrieval}
              onChange={(v) => setMemoryFlags(saveMemoryFlags({ retrieval: v }))}
            />
          ))}
          {row('injectMax', <Database className="w-4 h-4" />, ms.injectMax, ms.injectMaxDesc, (
            <SettingsSelect
              value={String(memoryFlags.injectMax)}
              options={injectOptions}
              onChange={(v) => setMemoryFlags(saveMemoryFlags({ injectMax: clampInjectMax(v) }))}
            />
          ))}
        </div>

        {/* 记忆概况 + 维护 */}
        <div
          className="rounded-xl border p-5 lg:p-6 space-y-4"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
        >
          <div className="flex items-center gap-4">
            {statTile(ms.statsUser, memoryCounts ? `${memoryCounts.user} ${ms.unit}` : '—')}
            {statTile(
              currentProject?.id ? ms.statsProject : ms.statsProjectInactive,
              currentProject?.id ? (memoryCounts ? `${memoryCounts.project} ${ms.unit}` : '—') : ms.noProject
            )}
          </div>
          <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>{ms.manageHint}</span>
          </p>
          <div className="h-px" style={{ backgroundColor: 'var(--border-color)' }} />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-6">
            <div className="min-w-0">
              <h3 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Eraser className="w-4 h-4" />
                {ms.purge}
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{ms.purgeDesc}</p>
            </div>
            <button
              type="button"
              onClick={() => void purge()}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-colors shrink-0 hover:bg-red-500/10"
              style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.4)' }}
            >
              {ms.purgeAction}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 渲染工程设置区域（未打开工程时展示空状态）
  const renderProjectSection = () => {
    const ps = t.settings.projectSettings;
    if (!currentProject?.id) {
      return (
        <div className="max-w-2xl">
          <div
            className="rounded-xl border p-8 flex flex-col items-center text-center gap-2"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
          >
            <Clapperboard className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{ps.noProjectTitle}</p>
            <p className="text-xs max-w-xs" style={{ color: 'var(--text-muted)' }}>{ps.noProjectHint}</p>
          </div>
        </div>
      );
    }
    const autoOption = { value: '', label: ps.auto };
    const rows: Array<{
      key: keyof ProjectGenerationSettings;
      icon: React.ReactNode;
      label: string;
      options: SelectOption[];
    }> = [
      {
        key: 'imageAspectRatio', icon: <ImageIcon className="w-4 h-4" />,
        label: ps.imageAspectRatio,
        options: [autoOption, ...['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'].map((r) => ({ value: r, label: r }))],
      },
      {
        key: 'imageResolution', icon: <ImageIcon className="w-4 h-4" />,
        label: ps.imageResolution,
        options: [autoOption, ...['720p', '1080p', '2K', '4K'].map((r) => ({ value: r, label: r }))],
      },
      {
        key: 'videoAspectRatio', icon: <Film className="w-4 h-4" />,
        label: ps.videoAspectRatio,
        options: [autoOption, ...['16:9', '9:16', '1:1', '4:3', '3:4'].map((r) => ({ value: r, label: r }))],
      },
      {
        key: 'videoResolution', icon: <Film className="w-4 h-4" />,
        label: ps.videoResolution,
        options: [autoOption, ...['480p', '720p', '1080p'].map((r) => ({ value: r, label: r }))],
      },
      {
        key: 'artStyle', icon: <Palette className="w-4 h-4" />,
        label: ps.artStyle,
        options: ART_STYLE_PRESETS.map((preset) => ({
          value: preset.key,
          label: preset.key === ''
            ? ps.artStyleNone
            : preset.key === 'custom'
              ? ps.artStyleCustom
              : ((ps.artStyleOptions as Record<string, string>)[preset.key] ?? preset.label),
        })),
      },
    ];
    return (
      <div className="max-w-2xl">
        <div
          className="rounded-xl border p-5 lg:p-6 space-y-4"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
        >
          {/* 当前工程标识 */}
          <div className="flex items-center gap-2 min-w-0">
            <Clapperboard className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-primary)' }} />
            <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{currentProject.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded border shrink-0" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-color)' }}>
              {ps.currentProjectTag}
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{ps.desc}</p>
          {rows.map((row, i) => (
            <React.Fragment key={row.key}>
              {i > 0 && <div className="h-px" style={{ backgroundColor: 'var(--border-color)' }} />}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-6">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    {row.icon}
                    {row.label}
                  </h3>
                </div>
                <div className="w-full sm:w-56 shrink-0">
                  <SettingsSelect
                    value={projectGenSettings[row.key] || ''}
                    options={row.options}
                    onChange={(v) => {
                      if (row.key === 'artStyle') {
                        // 选预设时同步覆盖风格限定描述，用户可再手动微调
                        const preset = findArtStylePreset(v);
                        void handleProjectSettingsPatch({ artStyle: v, artStylePrompt: preset?.prompt ?? '' });
                        return;
                      }
                      void handleProjectSettingChange(row.key, v);
                    }}
                  />
                </div>
              </div>
            </React.Fragment>
          ))}

          {/* 美术风格限定：追加到该工程所有图片/视频生成提示词 */}
          <div className="h-px" style={{ backgroundColor: 'var(--border-color)' }} />
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-6">
            <div className="min-w-0">
              <h3 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Type className="w-4 h-4" />
                {ps.artStylePrompt}
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{ps.artStylePromptHint}</p>
            </div>
            <div className="w-full sm:w-56 shrink-0">
              <textarea
                value={artStyleDraft}
                onChange={(e) => setArtStyleDraft(e.target.value)}
                onBlur={() => {
                  const next = artStyleDraft.trim();
                  if ((projectGenSettings.artStylePrompt || '') !== next) {
                    void handleProjectSettingsPatch({ artStylePrompt: next });
                  }
                }}
                rows={3}
                maxLength={300}
                placeholder={ps.artStylePromptPlaceholder}
                className="w-full text-xs rounded-lg px-3 py-2 resize-none bg-(--bg-input) border border-(--border-color) text-(--text-primary) focus:outline-none focus:border-(--accent)"
              />
            </div>
          </div>

          {/* 临时风格覆盖：用户临时意图优先于工程限定，由 AI 对话或手动触发 */}
          <div className="h-px" style={{ backgroundColor: 'var(--border-color)' }} />
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-6">
            <div className="min-w-0">
              <h3 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Sparkles className="w-4 h-4" />
                {ps.tempStyleTitle}
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{ps.tempStyleHint}</p>
            </div>
            <div className="w-full sm:w-56 shrink-0">
              {projectGenSettings.tempArtStylePrompt?.trim() ? (
                <div className="rounded-lg border border-(--accent)/30 bg-(--accent)/5 px-3 py-2 space-y-1.5">
                  <p className="text-xs leading-5" style={{ color: 'var(--text-primary)' }}>
                    {projectGenSettings.tempArtStylePrompt.trim()}
                  </p>
                  {projectGenSettings.tempArtStyleNote?.trim() && (
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {ps.tempStyleSource}{projectGenSettings.tempArtStyleNote.trim()}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentProject?.id) return;
                      void clearTempArtStyle(currentProject.id).then(() =>
                        showToast(ps.tempStyleCleared, 'success')
                      );
                    }}
                    className="text-[11px] font-medium cursor-pointer hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    {ps.tempStyleClear}
                  </button>
                </div>
              ) : (
                <p className="text-xs px-1 py-2" style={{ color: 'var(--text-muted)' }}>{ps.tempStyleEmpty}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 渲染通用设置区域（外观 + 语言整合）
  const renderGeneralSection = () => (
    <div className="max-w-2xl">
      <div
        className="rounded-xl border p-5 lg:p-6 space-y-4"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
      >
        {renderAppearanceSection()}
        <div className="h-px" style={{ backgroundColor: 'var(--border-color)' }} />
        {renderLanguageSection()}
        <div className="h-px" style={{ backgroundColor: 'var(--border-color)' }} />
        {renderVideoFormatSection()}
        <div className="h-px" style={{ backgroundColor: 'var(--border-color)' }} />
        {renderProjectsLocationSection()}
      </div>
    </div>
  );

  // 渲染当前激活的区域
  const renderActiveSection = () => {
    switch (activeSection) {
      case 'general': return renderGeneralSection();
      case 'ai_models': return <AIModelSettings />; // 新增：AI 模型密钥配置
      case 'project': return renderProjectSection(); // 工程设置：画面生成参数
      case 'memory': return renderMemorySection(); // 记忆：学习与注入设置
      case 'feedback': return renderFeedbackSection();
      case 'about': return renderAboutSection();
      default: return renderAppearanceSection();
    }
  };

  const currentSection = SETTING_SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>
      <div className="flex flex-col lg:flex-row min-h-full">
        {/* 左侧导航 */}
        <aside
          className="lg:w-36 shrink-0 p-4 lg:p-4 border-b lg:border-b-0 lg:border-r"
          style={{ borderColor: 'var(--border-color)' }}
        >
          {/* 导航：所有分区同级排列（选中态为文字高亮 + 左侧短竖线） */}
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
              return visible.map(renderButton);
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
