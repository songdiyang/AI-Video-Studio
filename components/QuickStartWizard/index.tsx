import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input, Textarea, Spinner, Button } from '@heroui/react';
import {
  X, Check,
  Film, Video, BookImage, BookOpen, Sparkles,
  Palette, Globe, ImagePlus, Upload
} from 'lucide-react';
import { ProjectType, PROJECT_TYPES } from '../../types/projectTypes';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { getAuthToken } from '../../services/auth';
import { Team, fetchTeams } from '../../services/collaboration';
import UpgradePrompt from '../UpgradePrompt';

interface QuickStartWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (projectId: number) => void;
}

type CreationType = ProjectType;

const CREATION_TYPES: { type: CreationType; icon: React.ElementType; color: string; desc: string }[] = [
  { type: 'comic_drama', icon: Film, color: PROJECT_TYPES.comic_drama.color, desc: '制作精彩的漫剧短片' },
  { type: 'short_video', icon: Video, color: PROJECT_TYPES.short_video.color, desc: '创作吸睛的短视频内容' },
  { type: 'manga', icon: BookImage, color: PROJECT_TYPES.manga.color, desc: '绘制独特的漫画作品' },
  { type: 'novel', icon: BookOpen, color: PROJECT_TYPES.novel.color, desc: '书写精彩的小说故事' },
];

const QuickStartWizard: React.FC<QuickStartWizardProps> = ({ isOpen, onClose, onComplete }) => {
  const { t } = useLanguage();
  const { showToast } = useToast();

  // 创作类型
  const [selectedType, setSelectedType] = useState<CreationType>('comic_drama');

  // 项目信息 & 设置
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [formData, setFormData] = useState({
    cover_url: '',
    _coverFile: null as File | null,
    status: 'draft' as 'draft' | 'in_progress' | 'completed',
    visualStyle: '',
    visualStylePrompt: '',
    storyStyle: '',
    storyConstraints: '',
    mangaLayout: '' as '' | 'page' | 'strip' | 'free',
    mangaPanelStyle: '',
    imageAspectRatio: '',
    imageResolution: '',
    videoAspectRatio: '',
    videoResolution: '',
    videoDuration: '' as '' | '15' | '30' | '60' | '180',
    videoAspect: '' as '' | '9:16' | '16:9' | '1:1',
    videoStyle: '',
    novelGenre: '',
    novelWritingStyle: '',
    novelChapterLength: '',
    novelTarget: '',
    outputLanguage: 'en' as string
  });

  // 团队
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | ''>('');

  // UI 状态
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // 创建状态
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // 升级提示
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeData, setUpgradeData] = useState<{
    currentPlan: { name: string; displayName: string; level: number };
    currentUsage: { current: number; max: number };
    nextPlan?: { name: string; displayName: string; maxProjects: number | string; price?: any };
  } | null>(null);

  // 视觉风格预设
  const VISUAL_STYLE_PRESETS: Record<string, { prompt: string; labelKey: keyof typeof t.projects.presets }> = {
    'animeJapanese': { prompt: '动漫风格, 赛璐珞上色, 鲜艳色彩, 干净线条, 漫画美学, 日式动画', labelKey: 'animeJapanese' },
    'realisticFilm': { prompt: '照片写实, 电影级打光, 胶片质感, 真实比例, 电影剧照, 自然色调', labelKey: 'realisticFilm' },
    'render3D': { prompt: '3D渲染, 皮克斯风格, 柔和光照, 次表面散射, 平滑着色, CG品质', labelKey: 'render3D' },
    'watercolor': { prompt: '水彩插画, 柔和边缘, 粉彩色调, 绘本风格, 手绘纹理', labelKey: 'watercolor' },
    'cyberpunk': { prompt: '赛博朋克, 霓虹灯光, 暗黑氛围, 未来科幻, 高对比度, 科幻美学', labelKey: 'cyberpunk' },
    'americanComic': { prompt: '美式漫画风格, 粗犷描边, 动感明暗, 超级英雄美学, 鲜明色彩', labelKey: 'americanComic' },
    'pixelArt': { prompt: '像素画风格, 复古游戏美学, 16位像素, 干净像素点, 怀旧风', labelKey: 'pixelArt' },
    'chineseInk': { prompt: '中国水墨画风格, 传统笔触, 典雅, 留白极简, 东方美学', labelKey: 'chineseInk' },
    'heavenBlessing': { prompt: '中国仙侠奇幻风格, 古代天宫殿堂, 飘逸丝绸汉服, 金红色调点缀, 神圣光晕, 水墨云雾背景, 空灵光效, 精致发饰, 柔美面部特征, 天界氛围, 中国传统神话美学', labelKey: 'heavenBlessing' },
    'shoujoManga': { prompt: '日本少女漫画风格, 大而闪亮的星光瞳孔, 精致美少女特征, 柔粉淡紫色调, 花卉网点背景, 浪漫氛围, 飘逸秀发配缎带, 装饰性闪光特效, 柔和腮红, 梦幻柔焦光效', labelKey: 'shoujoManga' },
    'otomeGame': { prompt: '乙女游戏CG插画风格, 浪漫视觉小说美学, 优雅美少年角色, 柔和渐变上色, 温暖黄昏光照, 闪光花瓣粒子特效, 精致维多利亚风服装设计, 情感丰富的眼部表现, 华丽室内背景, 柔和色彩和谐', labelKey: 'otomeGame' },
    'japaneseOtome': { prompt: '日式乙女游戏风格, 高品质动漫CG渲染, 精致美少年角色, 樱花与季节性元素, 温柔暖色调, 精细校服或传统服饰设计, 柔和环境光, 视觉小说构图, 细腻手绘线条, 含蓄情感表达', labelKey: 'japaneseOtome' },
    'chineseDonghua': { prompt: '现代中国动画风格, 动感电影级构图, 都市奇幻场景, 融合中国元素的现代角色设计, 鲜艳饱和色彩, 戏剧性动作光效, 流畅发丝与服装渲染, 大胆对比阴影, 史诗级大气透视, 高能量视觉冲击', labelKey: 'chineseDonghua' },
    'custom': { prompt: '', labelKey: 'custom' }
  };

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setSelectedType('comic_drama');
      setProjectName('');
      setProjectDesc('');
      setFormData({
        cover_url: '', _coverFile: null, status: 'draft',
        visualStyle: '', visualStylePrompt: '', storyStyle: '', storyConstraints: '',
        mangaLayout: '', mangaPanelStyle: '',
        imageAspectRatio: '', imageResolution: '', videoAspectRatio: '', videoResolution: '',
        videoDuration: '', videoAspect: '', videoStyle: '',
        novelGenre: '', novelWritingStyle: '', novelChapterLength: '', novelTarget: '',
        outputLanguage: 'en'
      });
      setSelectedTeamId('');
      setCreating(false);
      setCreateError(null);
      loadTeams();
    }
  }, [isOpen]);

  const loadTeams = useCallback(async () => {
    try {
      const { teams } = await fetchTeams();
      setUserTeams(teams);
    } catch (error) {
      console.error('加载团队失败:', error);
    }
  }, []);

  // ==================== 表单处理函数 ====================

  const handleSelectVisualStyle = (styleKey: string) => {
    if (formData.visualStyle === styleKey) {
      setFormData(prev => ({ ...prev, visualStyle: '', visualStylePrompt: '' }));
    } else if (styleKey === 'custom') {
      setFormData(prev => ({ ...prev, visualStyle: 'custom', visualStylePrompt: '' }));
    } else {
      setFormData(prev => ({
        ...prev,
        visualStyle: styleKey,
        visualStylePrompt: VISUAL_STYLE_PRESETS[styleKey]?.prompt || ''
      }));
    }
  };

  const handleAiSuggest = async () => {
    if (!projectName && !projectDesc) {
      showToast(t.projects.aiSuggestHint, 'warning');
      return;
    }
    setAiSuggesting(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/projects/suggest-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: projectName, description: projectDesc })
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.message || 'AI推荐失败'); }
      const data = await res.json();
      const { suggestions } = data;
      setFormData(prev => ({
        ...prev,
        visualStyle: suggestions.visualStyle || prev.visualStyle,
        visualStylePrompt: suggestions.visualStylePrompt || prev.visualStylePrompt,
        storyStyle: suggestions.storyStyle || prev.storyStyle,
        storyConstraints: suggestions.storyConstraints || prev.storyConstraints
      }));
    } catch (error: any) {
      console.error('AI推荐失败:', error);
      showToast(t.projects.aiRecommendFailed, 'error');
    } finally {
      setAiSuggesting(false);
    }
  };

  const handleGenerateCover = async () => {
    if (!projectName && !projectDesc) {
      showToast(t.projects.aiCoverHint, 'warning');
      return;
    }
    setCoverGenerating(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/projects/generate-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          name: projectName, description: projectDesc,
          visualStylePrompt: formData.visualStylePrompt,
          storyStyle: formData.storyStyle, storyConstraints: formData.storyConstraints
        })
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.message || 'AI 封面生成失败'); }
      const data = await res.json();
      setFormData(prev => ({ ...prev, cover_url: data.cover_url }));
      showToast(t.projects.aiCoverSuccess, 'success');
    } catch (error: any) {
      console.error('AI 封面生成失败:', error);
      showToast(t.projects.aiCoverFailed, 'error');
    } finally {
      setCoverGenerating(false);
    }
  };

  const handleUploadCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) { showToast('仅支持 PNG/JPG/WebP 格式', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { showToast('图片大小不能超过 10MB', 'error'); return; }
    const previewUrl = URL.createObjectURL(file);
    setFormData(prev => ({ ...prev, cover_url: previewUrl, _coverFile: file }));
    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  // ==================== 创建项目 ====================

  const handleCreateProject = async () => {
    if (!projectName.trim() || !selectedType) return;
    setCreating(true);
    setCreateError(null);
    try {
      const token = getAuthToken();
      const settingsObj: any = {};
      const { visualStyle, visualStylePrompt, storyStyle, storyConstraints,
        mangaLayout, mangaPanelStyle, imageAspectRatio, imageResolution,
        videoAspectRatio, videoResolution, videoDuration, videoAspect, videoStyle,
        novelGenre, novelWritingStyle, novelChapterLength, novelTarget, outputLanguage } = formData;
      if (visualStyle) settingsObj.visualStyle = visualStyle;
      if (visualStylePrompt) settingsObj.visualStylePrompt = visualStylePrompt;
      if (storyStyle) settingsObj.storyStyle = storyStyle;
      if (storyConstraints) settingsObj.storyConstraints = storyConstraints;
      if (mangaLayout) settingsObj.mangaLayout = mangaLayout;
      if (mangaPanelStyle) settingsObj.mangaPanelStyle = mangaPanelStyle;
      if (imageAspectRatio) settingsObj.imageAspectRatio = imageAspectRatio;
      if (imageResolution) settingsObj.imageResolution = imageResolution;
      if (videoAspectRatio) settingsObj.videoAspectRatio = videoAspectRatio;
      if (videoResolution) settingsObj.videoResolution = videoResolution;
      if (videoDuration) settingsObj.videoDuration = videoDuration;
      if (videoAspect) settingsObj.videoAspect = videoAspect;
      if (videoStyle) settingsObj.videoStyle = videoStyle;
      if (novelGenre) settingsObj.novelGenre = novelGenre;
      if (novelWritingStyle) settingsObj.novelWritingStyle = novelWritingStyle;
      if (novelChapterLength) settingsObj.novelChapterLength = novelChapterLength;
      if (novelTarget) settingsObj.novelTarget = novelTarget;
      if (outputLanguage) settingsObj.outputLanguage = outputLanguage;

      const saveData = {
        name: projectName.trim(),
        description: projectDesc.trim(),
        type: selectedType,
        status: formData.status,
        team_id: selectedTeamId || null,
        cover_url: formData._coverFile ? '' : formData.cover_url,
        settings_json: JSON.stringify(settingsObj),
      };

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(saveData),
      });

      if (res.ok) {
        const data = await res.json();
        const pid = data.id || data.project?.id;
        if (pid && formData._coverFile) {
          try {
            const fd = new FormData();
            fd.append('cover', formData._coverFile);
            await fetch(`/api/projects/${pid}/cover`, {
              method: 'POST',
              headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
              body: fd,
            });
          } catch (e) {
            console.warn('[Cover] 新建项目封面上传失败:', e);
          }
        }
        onComplete(pid);
      } else {
        const errData = await res.json();
        handleCreateError(errData);
      }
    } catch (err) {
      console.error('[CreateProject]', err);
      setCreateError('创建项目失败，请稍后重试');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateError = (errData: any) => {
    if (errData.code === 'PROJECT_LIMIT_REACHED' && errData.data) {
      const { currentCount, maxCount, planName, planDisplayName, planLevel, upgrade } = errData.data;
      setUpgradeData({
        currentPlan: { name: planName, displayName: planDisplayName, level: planLevel },
        currentUsage: { current: currentCount, max: maxCount },
        nextPlan: upgrade?.available ? upgrade.nextPlan : undefined
      });
      setShowUpgrade(true);
      onClose();
    } else {
      setCreateError(errData.message || '创建项目失败');
    }
  };

  // ==================== 辅助函数 ====================

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-slate-500/20 text-slate-600 dark:text-slate-300 border border-slate-400/30';
      case 'in_progress': return 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-400/30';
      case 'completed': return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-400/30';
      default: return 'bg-slate-500/20 text-slate-600 dark:text-slate-300 border border-slate-400/30';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft': return t.projects.statusDraft;
      case 'in_progress': return t.projects.statusInProgress;
      case 'completed': return t.projects.statusCompleted;
      default: return t.projects.statusDraft;
    }
  };

  // ESC 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 通用 Input classNames
  const inputCls = {
    input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
    label: "text-[var(--text-secondary)] font-medium",
    inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
  };

  // 选中按钮样式
  const pillActive = 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)]';
  const pillInactive = 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5';

  return (
    <>
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[500] flex items-center justify-center"
      >
        {/* 背景遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* IDEA 风格主容器 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative mx-4 w-full max-w-[920px] rounded-xl overflow-hidden shadow-2xl flex flex-col"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-color)',
            maxHeight: 'min(85vh, 720px)',
          }}
        >
          {/* ===== 标题栏 ===== */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t.quickStart?.createProject || '新建项目'}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-md transition-colors hover:bg-white/10" style={{ color: 'var(--text-muted)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ===== 主体: 左侧边栏 + 右侧内容 ===== */}
          <div className="flex flex-1 min-h-0">
            {/* 左侧边栏 - 项目类型 */}
            <div className="w-[200px] shrink-0 border-r py-2 flex flex-col" style={{ borderColor: 'var(--border-color)', backgroundColor: 'color-mix(in srgb, var(--bg-card) 60%, var(--bg-base))' }}>
              <div className="px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {t.quickStart?.step1Title || '创作类型'}
                </span>
              </div>
              <div className="flex-1 px-2 space-y-0.5">
                {CREATION_TYPES.map(({ type, icon: Icon, color }) => {
                  const isSelected = selectedType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer group ${
                        isSelected
                          ? 'bg-[var(--accent)]/12 text-[var(--accent)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${color} flex items-center justify-center shrink-0 transition-transform ${isSelected ? 'scale-105' : 'group-hover:scale-105'}`}>
                        <Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className={`text-sm ${isSelected ? 'font-semibold' : 'font-medium'}`}>
                        {t.quickStart?.types?.[type] || type}
                      </span>
                      {isSelected && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 左侧底部: 团队选择 */}
              {userTeams.length > 0 && (
                <div className="px-3 pt-2 mt-auto border-t" style={{ borderColor: 'var(--border-color)' }}>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>所属团队</label>
                  <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-2 py-1.5 rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs focus:outline-none focus:border-[var(--accent)]/40">
                    <option value="">个人项目</option>
                    {userTeams.map(team => (<option key={team.id} value={team.id}>{team.name}</option>))}
                  </select>
                </div>
              )}
            </div>

            {/* 右侧内容 - 可滚动 */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="p-5 space-y-5">
                {/* 基本信息区 */}
                <div className="space-y-3">
                  <Input
                    label={t.projects.nameLabel}
                    placeholder={t.projects.namePlaceholder}
                    value={projectName}
                    onValueChange={setProjectName}
                    isRequired
                    classNames={inputCls}
                    autoFocus
                  />
                  <Textarea
                    label={t.projects.descLabel}
                    placeholder={t.projects.descPlaceholder}
                    value={projectDesc}
                    onValueChange={setProjectDesc}
                    minRows={2}
                    maxRows={3}
                    classNames={inputCls}
                  />
                  {/* AI 智能推荐 */}
                  <Button
                    className="w-full bg-linear-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 text-violet-600 dark:text-violet-300 font-medium hover:from-violet-500/20 hover:to-purple-500/20 transition-all cursor-pointer text-xs h-8"
                    startContent={aiSuggesting ? <Spinner size="sm" color="secondary" /> : <Sparkles className="w-3 h-3" />}
                    onPress={handleAiSuggest}
                    isDisabled={aiSuggesting}
                  >
                    {aiSuggesting ? t.projects.aiSuggesting : t.projects.aiSuggestBtn}
                  </Button>
                </div>

                {/* 分割线 */}
                <div className="h-px" style={{ backgroundColor: 'var(--border-color)' }} />

                {/* 封面 & 视觉风格 - 双栏 */}
                <div className="flex gap-5">
                  {/* 封面 */}
                  <div className="w-[200px] shrink-0">
                    <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>
                      {t.projects.coverLabel}
                    </label>
                    {formData.cover_url ? (
                      <div className="rounded-lg overflow-hidden border border-[var(--border-color)] bg-[var(--bg-input)] relative group aspect-[4/3]">
                        <img src={formData.cover_url} alt="cover" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <button onClick={() => setFormData(prev => ({ ...prev, cover_url: '', _coverFile: null }))}
                          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[10px]">×</button>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--bg-input)]/30 flex items-center justify-center aspect-[4/3]">
                        <div className="text-center text-[var(--text-muted)]">
                          <ImagePlus className="w-6 h-6 mx-auto mb-1 opacity-30" />
                          <p className="text-[10px]">暂无封面</p>
                        </div>
                      </div>
                    )}
                    <input ref={coverInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleUploadCover} />
                    <div className="flex gap-1.5 mt-2">
                      <Button size="sm"
                        className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)]/30 font-medium cursor-pointer text-[11px] h-7 min-w-0"
                        startContent={coverUploading ? <Spinner size="sm" /> : <Upload className="w-3 h-3" />}
                        onPress={() => coverInputRef.current?.click()} isDisabled={coverUploading}>
                        {coverUploading ? '...' : '上传'}
                      </Button>
                      <Button size="sm"
                        className="flex-1 bg-linear-to-r from-violet-500/15 to-pink-500/15 border border-violet-500/25 text-violet-600 dark:text-violet-300 font-medium hover:from-violet-500/25 hover:to-pink-500/25 cursor-pointer text-[11px] h-7 min-w-0"
                        startContent={coverGenerating ? <Spinner size="sm" color="secondary" /> : <Sparkles className="w-3 h-3" />}
                        onPress={handleGenerateCover} isDisabled={coverGenerating}>
                        {coverGenerating ? '...' : 'AI生成'}
                      </Button>
                    </div>
                  </div>

                  {/* 视觉风格 / 小说类型设置 */}
                  <div className="flex-1 min-w-0">
                    {selectedType !== 'novel' ? (
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                          <Palette className="w-3.5 h-3.5 text-[var(--accent)]" />
                          {t.projects.visualStyleLabel}
                        </label>
                        <div className="grid grid-cols-3 gap-1">
                          {Object.entries(VISUAL_STYLE_PRESETS).map(([styleKey, { labelKey }]) => (
                            <button key={styleKey} onClick={() => handleSelectVisualStyle(styleKey)}
                              className={`px-2 py-1 rounded-md border text-[11px] font-medium transition-all cursor-pointer truncate ${
                                formData.visualStyle === styleKey ? pillActive : pillInactive
                              }`}>
                              {t.projects.presets[labelKey]}
                            </button>
                          ))}
                        </div>
                        <Input size="sm"
                          placeholder={t.projects.visualStylePromptPlaceholder}
                          value={formData.visualStylePrompt}
                          onValueChange={(val) => setFormData(prev => ({ ...prev, visualStylePrompt: val }))}
                          className="mt-2"
                          classNames={{ input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-xs", inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 h-7 min-h-7" }}
                        />
                      </div>
                    ) : (
                      /* 小说: 类型与写作风格 */
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <Input size="sm" label={t.projects.novelGenreLabel} placeholder={t.projects.novelGenrePlaceholder}
                            value={formData.novelGenre} onValueChange={(val) => setFormData(prev => ({ ...prev, novelGenre: val }))} classNames={inputCls} />
                          <Input size="sm" label={t.projects.novelWritingStyleLabel} placeholder={t.projects.novelWritingStylePlaceholder}
                            value={formData.novelWritingStyle} onValueChange={(val) => setFormData(prev => ({ ...prev, novelWritingStyle: val }))} classNames={inputCls} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Input size="sm" label={t.projects.novelChapterLengthLabel} placeholder={t.projects.novelChapterLengthPlaceholder}
                            value={formData.novelChapterLength} onValueChange={(val) => setFormData(prev => ({ ...prev, novelChapterLength: val }))} classNames={inputCls} />
                          <Input size="sm" label={t.projects.novelTargetLabel} placeholder={t.projects.novelTargetPlaceholder}
                            value={formData.novelTarget} onValueChange={(val) => setFormData(prev => ({ ...prev, novelTarget: val }))} classNames={inputCls} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 分割线 */}
                <div className="h-px" style={{ backgroundColor: 'var(--border-color)' }} />

                {/* 类型专属设置 */}
                {selectedType === 'comic_drama' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Input size="sm" label={t.projects.storyStyleLabel} placeholder={t.projects.storyStylePlaceholder}
                        value={formData.storyStyle} onValueChange={(val) => setFormData(prev => ({ ...prev, storyStyle: val }))} classNames={inputCls} />
                      <Input size="sm" label={t.projects.storyConstraintsLabel} placeholder={t.projects.storyConstraintsPlaceholder}
                        value={formData.storyConstraints} onValueChange={(val) => setFormData(prev => ({ ...prev, storyConstraints: val }))} classNames={inputCls} />
                    </div>
                    <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)]/30 space-y-2.5">
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>画面参数</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div>
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-muted)' }}>图片比例</label>
                          <div className="flex flex-wrap gap-1">
                            {['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'].map((r) => (
                              <button key={r} onClick={() => setFormData(prev => ({ ...prev, imageAspectRatio: prev.imageAspectRatio === r ? '' : r }))}
                                className={`px-2 py-0.5 rounded border text-[11px] transition-all cursor-pointer ${formData.imageAspectRatio === r ? pillActive : pillInactive}`}>{r}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-muted)' }}>图片分辨率</label>
                          <div className="flex flex-wrap gap-1">
                            {['720p', '1080p', '2K', '4K'].map((r) => (
                              <button key={r} onClick={() => setFormData(prev => ({ ...prev, imageResolution: prev.imageResolution === r ? '' : r }))}
                                className={`px-2 py-0.5 rounded border text-[11px] transition-all cursor-pointer ${formData.imageResolution === r ? pillActive : pillInactive}`}>{r}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-muted)' }}>视频比例</label>
                          <div className="flex flex-wrap gap-1">
                            {['16:9', '9:16', '1:1'].map((r) => (
                              <button key={r} onClick={() => setFormData(prev => ({ ...prev, videoAspectRatio: prev.videoAspectRatio === r ? '' : r }))}
                                className={`px-2 py-0.5 rounded border text-[11px] transition-all cursor-pointer ${formData.videoAspectRatio === r ? pillActive : pillInactive}`}>{r}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-muted)' }}>视频分辨率</label>
                          <div className="flex flex-wrap gap-1">
                            {['480p', '720p', '1080p'].map((r) => (
                              <button key={r} onClick={() => setFormData(prev => ({ ...prev, videoResolution: prev.videoResolution === r ? '' : r }))}
                                className={`px-2 py-0.5 rounded border text-[11px] transition-all cursor-pointer ${formData.videoResolution === r ? pillActive : pillInactive}`}>{r}</button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedType === 'manga' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t.projects.mangaLayoutLabel}</label>
                      <div className="flex gap-1.5">
                        {([['page', t.projects.mangaLayoutPage], ['strip', t.projects.mangaLayoutStrip], ['free', t.projects.mangaLayoutFree]] as const).map(([key, label]) => (
                          <button key={key} onClick={() => setFormData(prev => ({ ...prev, mangaLayout: prev.mangaLayout === key ? '' : key as any }))}
                            className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-all cursor-pointer ${formData.mangaLayout === key ? pillActive : pillInactive}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input size="sm" label={t.projects.mangaPanelStyleLabel} placeholder={t.projects.mangaPanelStylePlaceholder}
                        value={formData.mangaPanelStyle} onValueChange={(val) => setFormData(prev => ({ ...prev, mangaPanelStyle: val }))} classNames={inputCls} />
                      <Input size="sm" label={t.projects.storyStyleLabel} placeholder={t.projects.storyStylePlaceholder}
                        value={formData.storyStyle} onValueChange={(val) => setFormData(prev => ({ ...prev, storyStyle: val }))} classNames={inputCls} />
                    </div>
                  </div>
                )}

                {selectedType === 'short_video' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t.projects.videoDurationLabel}</label>
                        <div className="flex flex-wrap gap-1.5">
                          {([['15', t.projects.videoDuration15], ['30', t.projects.videoDuration30], ['60', t.projects.videoDuration60], ['180', t.projects.videoDuration180]] as const).map(([key, label]) => (
                            <button key={key} onClick={() => setFormData(prev => ({ ...prev, videoDuration: prev.videoDuration === key ? '' : key as any }))}
                              className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-all cursor-pointer ${formData.videoDuration === key ? pillActive : pillInactive}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t.projects.videoAspectLabel}</label>
                        <div className="flex gap-1.5">
                          {([['9:16', t.projects.videoAspect916], ['16:9', t.projects.videoAspect169], ['1:1', t.projects.videoAspect11]] as const).map(([key, label]) => (
                            <button key={key} onClick={() => setFormData(prev => ({ ...prev, videoAspect: prev.videoAspect === key ? '' : key as any }))}
                              className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-all cursor-pointer ${formData.videoAspect === key ? pillActive : pillInactive}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input size="sm" label={t.projects.videoStyleLabel} placeholder={t.projects.videoStylePlaceholder}
                        value={formData.videoStyle} onValueChange={(val) => setFormData(prev => ({ ...prev, videoStyle: val }))} classNames={inputCls} />
                      <Input size="sm" label={t.projects.storyStyleLabel} placeholder={t.projects.storyStylePlaceholder}
                        value={formData.storyStyle} onValueChange={(val) => setFormData(prev => ({ ...prev, storyStyle: val }))} classNames={inputCls} />
                    </div>
                  </div>
                )}

                {/* 通用高级设置：状态 & 语言 */}
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t.projects.statusLabel}</label>
                    <div className="flex gap-1.5">
                      {(['draft', 'in_progress', 'completed'] as const).map((status) => (
                        <button key={status} onClick={() => setFormData(prev => ({ ...prev, status }))}
                          className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-all cursor-pointer ${
                            formData.status === status ? getStatusColor(status) : pillInactive
                          }`}>
                          {getStatusText(status)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <Globe className="w-3.5 h-3.5 text-[var(--accent)]" />
                      {t.projects.outputLanguageLabel}
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(t.projects.outputLanguages).map(([code, name]) => (
                        <button key={code} onClick={() => setFormData(prev => ({ ...prev, outputLanguage: code }))}
                          className={`px-2 py-1 rounded-md border text-[11px] font-medium transition-all cursor-pointer ${
                            formData.outputLanguage === code ? pillActive : pillInactive
                          }`}>
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 错误提示 */}
                {createError && (
                  <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs">{createError}</div>
                )}
              </div>
            </div>
          </div>

          {/* ===== 底部按钮栏 ===== */}
          <div className="flex items-center justify-end gap-2.5 px-5 py-3 border-t" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-md text-sm font-medium transition-all hover:bg-[var(--bg-input)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t.common?.cancel || '取消'}
            </button>
            <button
              onClick={handleCreateProject}
              disabled={!projectName.trim() || creating}
              className={`flex items-center gap-1.5 px-5 py-1.5 rounded-md text-sm font-medium transition-all ${
                projectName.trim() && !creating
                  ? 'bg-[var(--accent)] text-white hover:brightness-110 shadow-sm'
                  : 'bg-[var(--bg-input)] text-[var(--text-muted)] cursor-not-allowed'
              }`}
            >
              {creating ? (
                <><Spinner size="sm" color="current" /> 创建中...</>
              ) : (
                t.quickStart?.createProject || '创建项目'
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>

    {/* 升级提示弹窗 */}
    {upgradeData && (
      <UpgradePrompt isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} limitType="project"
        currentPlan={upgradeData.currentPlan} currentUsage={upgradeData.currentUsage} nextPlan={upgradeData.nextPlan} />
    )}
    </>
  );
};

export default QuickStartWizard;
