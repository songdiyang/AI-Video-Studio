import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Button, Input, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Chip, Spinner } from '@heroui/react';
import { FolderOpen, Plus, Edit, Trash2, Search, BookOpen, Clock, Palette, Sparkles, ImagePlus } from 'lucide-react';
import { motion } from 'framer-motion';
import { Project, fetchProjects, createProject, updateProject, deleteProject } from '../services/projects';
import { ProjectType } from '../types/projectTypes';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { getAuthToken } from '../services/auth';
import { useLanguage } from '../contexts/LanguageContext';
import { useVirtualList } from '../hooks/useVirtualList';
import QuickStartWizard from '../components/QuickStartWizard';

// 虚拟列表启用阈值
const VIRTUAL_LIST_THRESHOLD = 20;
// 固定卡片高度
const CARD_HEIGHT = 240;

const LAST_PROJECT_KEY = 'nanostory_last_project_id';

const Projects: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  
  // 虚拟列表容器 ref 和高度状态
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);
  
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);
  
  const [editProjectType, setEditProjectType] = useState<ProjectType>('comic_drama');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    cover_url: '',
    status: 'draft' as 'draft' | 'in_progress' | 'completed',
    visualStyle: '',
    visualStylePrompt: '',
    storyStyle: '',
    storyConstraints: '',
    // 漫画专属
    mangaLayout: '' as '' | 'page' | 'strip' | 'free',
    mangaPanelStyle: '',
    // 短视频专属
    videoDuration: '' as '' | '15' | '30' | '60' | '180',
    videoAspect: '' as '' | '9:16' | '16:9' | '1:1',
    videoStyle: '',
    // 小说专属
    novelGenre: '',
    novelWritingStyle: '',
    novelChapterLength: '',
    novelTarget: ''
  });
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(false);

  // 视觉风格预设（键名用于内部标识，翻译后的显示名称从 t 获取）
  const VISUAL_STYLE_PRESETS: Record<string, { prompt: string; labelKey: keyof typeof t.projects.presets }> = {
    'animeJapanese': { prompt: 'anime style, cel shading, vibrant colors, clean lines, manga aesthetic, Japanese animation', labelKey: 'animeJapanese' },
    'realisticFilm': { prompt: 'photorealistic, cinematic lighting, film grain, realistic proportions, movie still, natural colors', labelKey: 'realisticFilm' },
    'render3D': { prompt: '3D render, Pixar style, soft lighting, subsurface scattering, smooth shading, CGI quality', labelKey: 'render3D' },
    'watercolor': { prompt: 'watercolor illustration, soft edges, pastel colors, storybook style, hand-painted texture', labelKey: 'watercolor' },
    'cyberpunk': { prompt: 'cyberpunk, neon lights, dark atmosphere, futuristic, high contrast, sci-fi aesthetic', labelKey: 'cyberpunk' },
    'americanComic': { prompt: 'American comic style, bold outlines, dynamic shading, superhero aesthetic, vivid colors', labelKey: 'americanComic' },
    'pixelArt': { prompt: 'pixel art style, retro game aesthetic, 16-bit, clean pixels, nostalgic', labelKey: 'pixelArt' },
    'chineseInk': { prompt: 'Chinese ink painting style, traditional brush strokes, elegant, minimalist, oriental aesthetic', labelKey: 'chineseInk' }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // 监听容器高度变化
  useEffect(() => {
    const container = listContainerRef.current;
    if (!container) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // 使用 contentRect 获取内容区域高度
        const height = entry.contentRect.height;
        if (height > 0) {
          setContainerHeight(height);
        }
      }
    });
    
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await fetchProjects();
      setProjects(data);
    } catch (error) {
      console.error('加载工程失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    // 使用统一的快速开始向导创建项目
    setShowQuickStart(true);
  };

  const handleEdit = (project: Project) => {
    setEditMode(true);
    setCurrentId(project.id);
    setEditProjectType(project.type || 'comic_drama');
    let settings: any = {};
    try {
      settings = project.settings_json ? JSON.parse(project.settings_json) : {};
    } catch { settings = {}; }
    setFormData({
      name: project.name,
      description: project.description,
      cover_url: project.cover_url,
      status: project.status,
      visualStyle: settings.visualStyle || '',
      visualStylePrompt: settings.visualStylePrompt || '',
      storyStyle: settings.storyStyle || '',
      storyConstraints: settings.storyConstraints || '',
      mangaLayout: settings.mangaLayout || '',
      mangaPanelStyle: settings.mangaPanelStyle || '',
      videoDuration: settings.videoDuration || '',
      videoAspect: settings.videoAspect || '',
      videoStyle: settings.videoStyle || '',
      novelGenre: settings.novelGenre || '',
      novelWritingStyle: settings.novelWritingStyle || '',
      novelChapterLength: settings.novelChapterLength || '',
      novelTarget: settings.novelTarget || ''
    });
    onOpen();
  };

  const handleSave = async () => {
    try {
      const { visualStyle, visualStylePrompt, storyStyle, storyConstraints,
        mangaLayout, mangaPanelStyle, videoDuration, videoAspect, videoStyle,
        novelGenre, novelWritingStyle, novelChapterLength, novelTarget, ...rest } = formData;
      const settingsObj: any = {};
      if (visualStyle) settingsObj.visualStyle = visualStyle;
      if (visualStylePrompt) settingsObj.visualStylePrompt = visualStylePrompt;
      if (storyStyle) settingsObj.storyStyle = storyStyle;
      if (storyConstraints) settingsObj.storyConstraints = storyConstraints;
      // 漫画专属
      if (mangaLayout) settingsObj.mangaLayout = mangaLayout;
      if (mangaPanelStyle) settingsObj.mangaPanelStyle = mangaPanelStyle;
      // 短视频专属
      if (videoDuration) settingsObj.videoDuration = videoDuration;
      if (videoAspect) settingsObj.videoAspect = videoAspect;
      if (videoStyle) settingsObj.videoStyle = videoStyle;
      // 小说专属
      if (novelGenre) settingsObj.novelGenre = novelGenre;
      if (novelWritingStyle) settingsObj.novelWritingStyle = novelWritingStyle;
      if (novelChapterLength) settingsObj.novelChapterLength = novelChapterLength;
      if (novelTarget) settingsObj.novelTarget = novelTarget;
      const saveData = { ...rest, type: editProjectType, settings_json: JSON.stringify(settingsObj) };
      if (editMode && currentId) {
        await updateProject(currentId, saveData);
      } else {
        await createProject(saveData);
      }
      await loadProjects();
      onOpenChange();
    } catch (error: any) {
      console.error('保存工程失败:', error);
      showToast(t.projects.saveFailed, 'error');
    }
  };

  const handleSelectVisualStyle = (styleKey: string) => {
    if (formData.visualStyle === styleKey) {
      setFormData({ ...formData, visualStyle: '', visualStylePrompt: '' });
    } else {
      setFormData({
        ...formData,
        visualStyle: styleKey,
        visualStylePrompt: VISUAL_STYLE_PRESETS[styleKey]?.prompt || ''
      });
    }
  };

  // AI 智能推荐项目设置
  const handleAiSuggest = async () => {
    if (!formData.name && !formData.description) {
      showToast(t.projects.aiSuggestHint, 'warning');
      return;
    }

    setAiSuggesting(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/projects/suggest-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'AI推荐失败');
      }

      const data = await res.json();
      const { suggestions } = data;

      // 应用AI推荐
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

  // AI 生成封面图片
  const handleGenerateCover = async () => {
    if (!formData.name && !formData.description) {
      showToast(t.projects.aiCoverHint, 'warning');
      return;
    }

    setCoverGenerating(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/projects/generate-cover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          visualStylePrompt: formData.visualStylePrompt
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'AI封面生成失败');
      }

      const data = await res.json();
      setFormData(prev => ({ ...prev, cover_url: data.cover_url }));
      showToast(t.projects.aiCoverSuccess, 'success');
    } catch (error: any) {
      console.error('AI封面生成失败:', error);
      showToast(t.projects.aiCoverFailed, 'error');
    } finally {
      setCoverGenerating(false);
    }
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: t.projects.deleteConfirmTitle,
      message: t.projects.deleteConfirmMessage,
      type: 'danger',
      confirmText: t.common.delete
    });
    if (!confirmed) return;
    
    try {
      await deleteProject(id);
      await loadProjects();
    } catch (error: any) {
      console.error('删除工程失败:', error);
      showToast(t.projects.deleteFailed, 'error');
    }
  };

  const handleEnterProject = (project: Project) => {
    localStorage.setItem(LAST_PROJECT_KEY, project.id.toString());
    navigate('/');
  };

  // 快速开始向导完成后
  const handleQuickStartComplete = (projectId: number) => {
    setShowQuickStart(false);
    localStorage.setItem(LAST_PROJECT_KEY, projectId.toString());
    navigate('/');
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 判断是否启用虚拟列表
  const useVirtual = filteredProjects.length > VIRTUAL_LIST_THRESHOLD;
  
  // 虚拟列表 hook（仅当启用时生效）
  const { virtualItems, containerProps, wrapperProps } = useVirtualList({
    itemCount: filteredProjects.length,
    itemHeight: CARD_HEIGHT,
    containerHeight,
    overscan: 3,
  });

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

  // 获取项目类型标签
  const getProjectTypeLabel = (type: string) => {
    switch (type) {
      case 'comic_drama': return '漫剧';
      case 'manga': return '漫画';
      case 'short_video': return '短视频';
      case 'novel': return '小说';
      default: return type;
    }
  };

  // 获取项目类型颜色
  const getProjectTypeColor = (type: string) => {
    switch (type) {
      case 'comic_drama': return 'bg-violet-500/20 text-violet-600 dark:text-violet-300 border border-violet-400/30';
      case 'manga': return 'bg-orange-500/20 text-orange-600 dark:text-orange-300 border border-orange-400/30';
      case 'short_video': return 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border border-cyan-400/30';
      case 'novel': return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-400/30';
      default: return 'bg-slate-500/20 text-slate-600 dark:text-slate-300 border border-slate-400/30';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN');
  };

  return (
    <div className="h-full bg-[var(--bg-app)] overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/30 to-[var(--accent-dark)]/30 rounded-xl blur-lg opacity-60" />
              <div className="relative p-2.5 bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-dark)]/30 rounded-xl border border-[var(--accent)]/30">
                <FolderOpen className="w-6 h-6 text-[var(--accent)]" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold pro-title">{t.projects.title}</h1>
              <p className="text-sm text-[var(--text-muted)]">{t.projects.subtitle}</p>
            </div>
          </div>
          <Button
            className="pro-btn-primary"
            startContent={<Plus className="w-4 h-4" />}
            onPress={handleAdd}
          >
            {t.projects.createBtn}
          </Button>
        </div>

        {/* 搜索 */}
        <Input
          placeholder={t.projects.searchPlaceholder}
          value={searchQuery}
          onValueChange={setSearchQuery}
          startContent={<Search className="w-4 h-4 text-[var(--text-muted)]" />}
          classNames={{
            input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
            inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40 shadow-sm"
          }}
        />

        {/* 工程列表 */}
        {loading ? (
          <div className="text-center py-12 text-[var(--text-muted)]">{t.common.loading}</div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto bg-[var(--bg-card)] rounded-full flex items-center justify-center mb-4 border border-[var(--border-color)]">
              <FolderOpen className="w-10 h-10 text-[var(--text-muted)]" />
            </div>
            <p className="text-[var(--text-secondary)] font-medium">{t.projects.emptyTitle}</p>
            <p className="text-[var(--text-muted)] text-sm mt-1">{t.projects.emptyDesc}</p>
          </div>
        ) : useVirtual ? (
          /* 虚拟列表模式（项目数 > 20） */
          <div 
            ref={listContainerRef}
            className="flex-1"
            style={{ minHeight: 400, height: 'calc(100vh - 280px)' }}
          >
            <div 
              {...containerProps}
              className="rounded-lg"
              style={{ ...containerProps.style, height: containerHeight }}
            >
              <div {...wrapperProps}>
                {virtualItems.map(({ index, offsetTop }) => {
                  const project = filteredProjects[index];
                  return (
                    <div
                      key={project.id}
                      style={{
                        position: 'absolute',
                        top: offsetTop,
                        left: 0,
                        right: 0,
                        height: CARD_HEIGHT,
                        padding: '8px 0',
                      }}
                    >
                      <Card 
                        className="pro-card cursor-pointer group h-full"
                        onDoubleClick={() => handleEnterProject(project)}
                      >
                        <CardBody className="p-0 h-full flex flex-col">
                          {/* 封面区域 */}
                          <div 
                            className="h-28 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-input)] relative overflow-hidden rounded-t-2xl flex-shrink-0"
                            onDoubleClick={() => handleEnterProject(project)}
                          >
                            {project.cover_url ? (
                              <img src={project.cover_url} alt={project.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <BookOpen className="w-10 h-10 text-[var(--accent)]/30" />
                              </div>
                            )}
                            {/* 操作按钮 */}
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="sm"
                                isIconOnly
                                className="bg-[var(--bg-elevated)] backdrop-blur-sm hover:bg-[var(--bg-card)] shadow-lg border border-[var(--border-color)] cursor-pointer"
                                onPress={() => handleEdit(project)}
                              >
                                <Edit className="w-4 h-4 text-[var(--text-primary)]" />
                              </Button>
                              <Button
                                size="sm"
                                isIconOnly
                                className="bg-[var(--bg-elevated)] backdrop-blur-sm hover:bg-red-500/20 shadow-lg border border-[var(--border-color)] cursor-pointer"
                                onPress={() => handleDelete(project.id)}
                              >
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </Button>
                            </div>
                          </div>
                          
                          {/* 信息区域 */}
                          <div className="p-3 flex-1 flex flex-col justify-between">
                            <div className="space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="text-base font-semibold text-[var(--text-primary)] line-clamp-1">{project.name}</h3>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Chip size="sm" className={getProjectTypeColor(project.type)}>
                                    {getProjectTypeLabel(project.type)}
                                  </Chip>
                                  <Chip size="sm" className={getStatusColor(project.status)}>
                                    {getStatusText(project.status)}
                                  </Chip>
                                </div>
                              </div>
                              <p className="text-xs text-[var(--text-muted)] line-clamp-2">
                                {project.description || t.projects.noDescription}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] pt-1 border-t border-[var(--border-color)]">
                              <Clock className="w-3 h-3" />
                              <span>{t.projects.updatedAt} {formatDate(project.updated_at)}</span>
                            </div>
                          </div>
                        </CardBody>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* 常规网格模式（项目数 <= 20） */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project) => (
              <Card 
                key={project.id} 
                className="pro-card cursor-pointer group"
                onDoubleClick={() => handleEnterProject(project)}
              >
                <CardBody className="p-0">
                  {/* 封面区域 */}
                  <div 
                    className="h-32 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-input)] relative overflow-hidden rounded-t-2xl"
                    onDoubleClick={() => handleEnterProject(project)}
                  >
                    {project.cover_url ? (
                      <img src={project.cover_url} alt={project.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="w-12 h-12 text-[var(--accent)]/30" />
                      </div>
                    )}
                    {/* 操作按钮 */}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        isIconOnly
                        className="bg-[var(--bg-elevated)] backdrop-blur-sm hover:bg-[var(--bg-card)] shadow-lg border border-[var(--border-color)] cursor-pointer"
                        onPress={() => handleEdit(project)}
                      >
                        <Edit className="w-4 h-4 text-[var(--text-primary)]" />
                      </Button>
                      <Button
                        size="sm"
                        isIconOnly
                        className="bg-[var(--bg-elevated)] backdrop-blur-sm hover:bg-red-500/20 shadow-lg border border-[var(--border-color)] cursor-pointer"
                        onPress={() => handleDelete(project.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* 信息区域 */}
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-lg font-semibold text-[var(--text-primary)] line-clamp-1">{project.name}</h3>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Chip size="sm" className={getProjectTypeColor(project.type)}>
                          {getProjectTypeLabel(project.type)}
                        </Chip>
                        <Chip size="sm" className={getStatusColor(project.status)}>
                          {getStatusText(project.status)}
                        </Chip>
                      </div>
                    </div>
                    <p className="text-sm text-[var(--text-muted)] line-clamp-2 min-h-[40px]">
                      {project.description || t.projects.noDescription}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border-color)]">
                      <Clock className="w-3 h-3" />
                      <span>{t.projects.updatedAt} {formatDate(project.updated_at)}</span>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {/* 编辑/新增对话框 */}
        <Modal
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          size="lg"
          classNames={{
            backdrop: 'bg-black/60 backdrop-blur-sm',
            base: 'bg-[var(--bg-elevated)] border border-[var(--border-color)] shadow-2xl',
            header: 'border-b border-[var(--border-color)]',
            body: 'py-6',
            footer: 'border-t border-[var(--border-color)]',
            closeButton: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/10'
          }}
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="text-[var(--text-primary)] font-bold">
                  {editMode ? t.projects.editTitle : t.projects.createTitle}
                </ModalHeader>
                <ModalBody className="space-y-4">
                  <Input
                    label={t.projects.nameLabel}
                    placeholder={t.projects.namePlaceholder}
                    value={formData.name}
                    onValueChange={(val) => setFormData({ ...formData, name: val })}
                    classNames={{
                      input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                      label: "text-[var(--text-secondary)] font-medium",
                      inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
                    }}
                  />
                  
                  <Textarea
                    label={t.projects.descLabel}
                    placeholder={t.projects.descPlaceholder}
                    value={formData.description}
                    onValueChange={(val) => setFormData({ ...formData, description: val })}
                    minRows={3}
                    classNames={{
                      input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                      label: "text-[var(--text-secondary)] font-medium",
                      inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
                    }}
                  />

                  {/* AI 智能推荐按钮 */}
                  <Button
                    className="w-full bg-gradient-to-r from-violet-500/20 to-purple-500/20 border border-violet-500/30 text-violet-300 font-medium hover:from-violet-500/30 hover:to-purple-500/30 transition-all cursor-pointer"
                    startContent={aiSuggesting ? <Spinner size="sm" color="secondary" /> : <Sparkles className="w-4 h-4" />}
                    onPress={handleAiSuggest}
                    isDisabled={aiSuggesting}
                  >
                    {aiSuggesting ? t.projects.aiSuggesting : t.projects.aiSuggestBtn}
                  </Button>

                  {/* 工程状态 */}
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] font-medium mb-2 block">{t.projects.statusLabel}</label>
                    <div className="flex gap-2">
                      {(['draft', 'in_progress', 'completed'] as const).map((status) => (
                        <button
                          key={status}
                          onClick={() => setFormData({ ...formData, status })}
                          className={`px-4 py-2 rounded-lg border transition-all cursor-pointer ${
                            formData.status === status
                              ? getStatusColor(status)
                              : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:border-[var(--border-color)]'
                          }`}
                        >
                          {getStatusText(status)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Input
                        label={t.projects.coverLabel}
                        placeholder={t.projects.coverPlaceholder}
                        value={formData.cover_url}
                        onValueChange={(val) => setFormData({ ...formData, cover_url: val })}
                        classNames={{
                          input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                          label: "text-[var(--text-secondary)] font-medium",
                          inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
                        }}
                      />
                    </div>
                    <Button
                      className="min-w-[130px] bg-gradient-to-r from-violet-500/20 to-pink-500/20 border border-violet-500/30 text-violet-300 font-medium hover:from-violet-500/30 hover:to-pink-500/30 transition-all cursor-pointer"
                      startContent={coverGenerating ? <Spinner size="sm" color="secondary" /> : <ImagePlus className="w-4 h-4" />}
                      onPress={handleGenerateCover}
                      isDisabled={coverGenerating}
                      size="lg"
                    >
                      {coverGenerating ? t.projects.aiGeneratingCover : t.projects.aiGenerateCover}
                    </Button>
                  </div>
                  {formData.cover_url && (
                    <div className="rounded-lg overflow-hidden border border-[var(--border-color)] bg-[var(--bg-input)]">
                      <img
                        src={formData.cover_url}
                        alt="cover preview"
                        className="w-full h-40 object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}

                  {/* 视觉风格选择 - 小说类型不需要 */}
                  {editProjectType !== 'novel' && (
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] font-medium mb-2 flex items-center gap-1.5">
                      <Palette className="w-4 h-4 text-[var(--accent)]" />
                      {t.projects.visualStyleLabel}
                      <span className="text-xs text-[var(--text-muted)] font-normal">{t.projects.visualStyleHint}</span>
                    </label>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {Object.entries(VISUAL_STYLE_PRESETS).map(([styleKey, { labelKey }]) => (
                        <button
                          key={styleKey}
                          onClick={() => handleSelectVisualStyle(styleKey)}
                          className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                            formData.visualStyle === styleKey
                              ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)]'
                              : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5'
                          }`}
                        >
                          {t.projects.presets[labelKey]}
                        </button>
                      ))}
                    </div>
                    {formData.visualStyle && (
                      <p className="text-xs text-[var(--text-muted)] mt-1.5 truncate" title={formData.visualStylePrompt}>
                        Prompt: {formData.visualStylePrompt}
                      </p>
                    )}
                    <Input
                      size="sm"
                      placeholder={t.projects.visualStylePromptPlaceholder}
                      value={formData.visualStylePrompt}
                      onValueChange={(val) => setFormData({ ...formData, visualStylePrompt: val })}
                      className="mt-2"
                      classNames={{
                        input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-xs",
                        inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 h-8 min-h-8"
                      }}
                    />
                  </div>
                  )}

                  {/* ====== 漫剧专属字段 ====== */}
                  {(editProjectType === 'comic_drama') && (
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label={t.projects.storyStyleLabel}
                      placeholder={t.projects.storyStylePlaceholder}
                      value={formData.storyStyle}
                      onValueChange={(val) => setFormData({ ...formData, storyStyle: val })}
                      classNames={{
                        input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                        label: "text-[var(--text-secondary)] font-medium",
                        inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
                      }}
                    />
                    <Input
                      label={t.projects.storyConstraintsLabel}
                      placeholder={t.projects.storyConstraintsPlaceholder}
                      value={formData.storyConstraints}
                      onValueChange={(val) => setFormData({ ...formData, storyConstraints: val })}
                      classNames={{
                        input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                        label: "text-[var(--text-secondary)] font-medium",
                        inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
                      }}
                    />
                  </div>
                  )}

                  {/* ====== 漫画专属字段 ====== */}
                  {(editProjectType === 'manga') && (
                  <>
                    <div>
                      <label className="text-sm text-[var(--text-secondary)] font-medium mb-2 block">{t.projects.mangaLayoutLabel}</label>
                      <div className="flex gap-2">
                        {([['page', t.projects.mangaLayoutPage], ['strip', t.projects.mangaLayoutStrip], ['free', t.projects.mangaLayoutFree]] as const).map(([key, label]) => (
                          <button
                            key={key}
                            onClick={() => setFormData({ ...formData, mangaLayout: formData.mangaLayout === key ? '' : key as any })}
                            className={`px-4 py-2 rounded-lg border transition-all cursor-pointer ${
                              formData.mangaLayout === key
                                ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)]'
                                : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:border-[var(--accent)]/30'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label={t.projects.mangaPanelStyleLabel}
                        placeholder={t.projects.mangaPanelStylePlaceholder}
                        value={formData.mangaPanelStyle}
                        onValueChange={(val) => setFormData({ ...formData, mangaPanelStyle: val })}
                        classNames={{
                          input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                          label: "text-[var(--text-secondary)] font-medium",
                          inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
                        }}
                      />
                      <Input
                        label={t.projects.storyStyleLabel}
                        placeholder={t.projects.storyStylePlaceholder}
                        value={formData.storyStyle}
                        onValueChange={(val) => setFormData({ ...formData, storyStyle: val })}
                        classNames={{
                          input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                          label: "text-[var(--text-secondary)] font-medium",
                          inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
                        }}
                      />
                    </div>
                  </>
                  )}

                  {/* ====== 短视频专属字段 ====== */}
                  {(editProjectType === 'short_video') && (
                  <>
                    <div>
                      <label className="text-sm text-[var(--text-secondary)] font-medium mb-2 block">{t.projects.videoDurationLabel}</label>
                      <div className="flex gap-2">
                        {([['15', t.projects.videoDuration15], ['30', t.projects.videoDuration30], ['60', t.projects.videoDuration60], ['180', t.projects.videoDuration180]] as const).map(([key, label]) => (
                          <button
                            key={key}
                            onClick={() => setFormData({ ...formData, videoDuration: formData.videoDuration === key ? '' : key as any })}
                            className={`px-4 py-2 rounded-lg border transition-all cursor-pointer ${
                              formData.videoDuration === key
                                ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)]'
                                : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:border-[var(--accent)]/30'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm text-[var(--text-secondary)] font-medium mb-2 block">{t.projects.videoAspectLabel}</label>
                      <div className="flex gap-2">
                        {([['9:16', t.projects.videoAspect916], ['16:9', t.projects.videoAspect169], ['1:1', t.projects.videoAspect11]] as const).map(([key, label]) => (
                          <button
                            key={key}
                            onClick={() => setFormData({ ...formData, videoAspect: formData.videoAspect === key ? '' : key as any })}
                            className={`px-4 py-2 rounded-lg border transition-all cursor-pointer ${
                              formData.videoAspect === key
                                ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)]'
                                : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:border-[var(--accent)]/30'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label={t.projects.videoStyleLabel}
                        placeholder={t.projects.videoStylePlaceholder}
                        value={formData.videoStyle}
                        onValueChange={(val) => setFormData({ ...formData, videoStyle: val })}
                        classNames={{
                          input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                          label: "text-[var(--text-secondary)] font-medium",
                          inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
                        }}
                      />
                      <Input
                        label={t.projects.storyStyleLabel}
                        placeholder={t.projects.storyStylePlaceholder}
                        value={formData.storyStyle}
                        onValueChange={(val) => setFormData({ ...formData, storyStyle: val })}
                        classNames={{
                          input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                          label: "text-[var(--text-secondary)] font-medium",
                          inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
                        }}
                      />
                    </div>
                  </>
                  )}

                  {/* ====== 小说专属字段 ====== */}
                  {(editProjectType === 'novel') && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label={t.projects.novelGenreLabel}
                        placeholder={t.projects.novelGenrePlaceholder}
                        value={formData.novelGenre}
                        onValueChange={(val) => setFormData({ ...formData, novelGenre: val })}
                        classNames={{
                          input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                          label: "text-[var(--text-secondary)] font-medium",
                          inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
                        }}
                      />
                      <Input
                        label={t.projects.novelWritingStyleLabel}
                        placeholder={t.projects.novelWritingStylePlaceholder}
                        value={formData.novelWritingStyle}
                        onValueChange={(val) => setFormData({ ...formData, novelWritingStyle: val })}
                        classNames={{
                          input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                          label: "text-[var(--text-secondary)] font-medium",
                          inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label={t.projects.novelChapterLengthLabel}
                        placeholder={t.projects.novelChapterLengthPlaceholder}
                        value={formData.novelChapterLength}
                        onValueChange={(val) => setFormData({ ...formData, novelChapterLength: val })}
                        classNames={{
                          input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                          label: "text-[var(--text-secondary)] font-medium",
                          inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
                        }}
                      />
                      <Input
                        label={t.projects.novelTargetLabel}
                        placeholder={t.projects.novelTargetPlaceholder}
                        value={formData.novelTarget}
                        onValueChange={(val) => setFormData({ ...formData, novelTarget: val })}
                        classNames={{
                          input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                          label: "text-[var(--text-secondary)] font-medium",
                          inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
                        }}
                      />
                    </div>
                  </>
                  )}
                </ModalBody>
                <ModalFooter className="gap-2">
                  <Button variant="flat" onPress={onClose} className="bg-white/5 text-[var(--text-secondary)] font-semibold hover:bg-white/10 border border-white/10 cursor-pointer">
                    {t.common.cancel}
                  </Button>
                  <Button className="pro-btn-primary" onPress={handleSave}>
                    {t.common.save}
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

        {/* 快速开始向导 */}
        <QuickStartWizard
          isOpen={showQuickStart}
          onClose={() => setShowQuickStart(false)}
          onComplete={handleQuickStartComplete}
        />
      </div>
    </div>
  );
};

export default Projects;
