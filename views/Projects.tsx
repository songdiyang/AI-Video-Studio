import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Button, Input, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Chip, Spinner } from '@heroui/react';
import { FolderOpen, Plus, Edit, Trash2, Search, BookOpen, Clock, Palette, Sparkles, ImagePlus, Globe, Upload } from 'lucide-react';
import { motion } from 'framer-motion';
import { Project, fetchProjects, createProject, updateProject, deleteProject } from '../services/projects';
import { Team, fetchTeams } from '../services/collaboration';
import { ProjectType } from '../types/projectTypes';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useWorkbench } from '../contexts/WorkbenchContext';
import { getAuthToken } from '../services/auth';
import { useLanguage } from '../contexts/LanguageContext';
import { useVirtualList } from '../hooks/useVirtualList';
import QuickStartWizard from '../components/QuickStartWizard';
import UpgradePrompt from '../components/UpgradePrompt';

// 虚拟列表启用阈值
const VIRTUAL_LIST_THRESHOLD = 20;
// 固定卡片高度
const CARD_HEIGHT = 240;

const LAST_PROJECT_KEY = 'nanostory_last_project_id';

const Projects: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { setCurrentProject } = useWorkbench();
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
    _coverFile: null as File | null,
    status: 'draft' as 'draft' | 'in_progress' | 'completed',
    team_id: null as number | null,
    visualStyle: '',
    visualStylePrompt: '',
    storyStyle: '',
    storyConstraints: '',
    // 漫画专属
    mangaLayout: '' as '' | 'page' | 'strip' | 'free',
    mangaPanelStyle: '',
    // 漫剧专属 - 画面参数
    imageAspectRatio: '',
    imageResolution: '',
    videoAspectRatio: '',
    videoResolution: '',
    // 短视频专属
    videoDuration: '' as '' | '15' | '30' | '60' | '180',
    videoAspect: '' as '' | '9:16' | '16:9' | '1:1',
    videoStyle: '',
    // 小说专属
    novelGenre: '',
    novelWritingStyle: '',
    novelChapterLength: '',
    novelTarget: '',
    // AI 输出语言
    outputLanguage: 'en' as string
  });
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [showQuickStart, setShowQuickStart] = useState(false);
  
  // 团队选择
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<number | ''>('');

  // 升级提示状态
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeData, setUpgradeData] = useState<{
    currentPlan: { name: string; displayName: string; level: number };
    currentUsage: { current: number; max: number };
    nextPlan?: { name: string; displayName: string; maxProjects: number | string; price?: { monthly: number; yearly: number; firstMonth?: number } };
  } | null>(null);

  // 视觉风格预设（键名用于内部标识，翻译后的显示名称从 t 获取）
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

  useEffect(() => {
    loadProjects();
    loadUserTeams();
  }, []);

  // 加载用户团队列表
  const loadUserTeams = async () => {
    try {
      setLoadingTeams(true);
      const { teams } = await fetchTeams();
      setUserTeams(teams);
    } catch (error) {
      console.error('加载团队失败:', error);
    } finally {
      setLoadingTeams(false);
    }
  };

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
      _coverFile: null,
      status: project.status,
      team_id: project.team_id || null,
      visualStyle: settings.visualStyle || '',
      visualStylePrompt: settings.visualStylePrompt || '',
      storyStyle: settings.storyStyle || '',
      storyConstraints: settings.storyConstraints || '',
      mangaLayout: settings.mangaLayout || '',
      mangaPanelStyle: settings.mangaPanelStyle || '',
      imageAspectRatio: settings.imageAspectRatio || '',
      imageResolution: settings.imageResolution || '',
      videoAspectRatio: settings.videoAspectRatio || '',
      videoResolution: settings.videoResolution || '',
      videoDuration: settings.videoDuration || '',
      videoAspect: settings.videoAspect || '',
      videoStyle: settings.videoStyle || '',
      novelGenre: settings.novelGenre || '',
      novelWritingStyle: settings.novelWritingStyle || '',
      novelChapterLength: settings.novelChapterLength || '',
      novelTarget: settings.novelTarget || '',
      outputLanguage: settings.outputLanguage || 'en'
    });
    onOpen();
  };

  const handleSave = async () => {
    try {
      const { visualStyle, visualStylePrompt, storyStyle, storyConstraints,
        mangaLayout, mangaPanelStyle, imageAspectRatio, imageResolution,
        videoAspectRatio, videoResolution, videoDuration, videoAspect, videoStyle,
        novelGenre, novelWritingStyle, novelChapterLength, novelTarget, outputLanguage, _coverFile, ...rest } = formData;
      const settingsObj: any = {};
      if (visualStyle) settingsObj.visualStyle = visualStyle;
      if (visualStylePrompt) settingsObj.visualStylePrompt = visualStylePrompt;
      if (storyStyle) settingsObj.storyStyle = storyStyle;
      if (storyConstraints) settingsObj.storyConstraints = storyConstraints;
      // 漫画专属
      if (mangaLayout) settingsObj.mangaLayout = mangaLayout;
      if (mangaPanelStyle) settingsObj.mangaPanelStyle = mangaPanelStyle;
      // 漫剧专属 - 画面参数
      if (imageAspectRatio) settingsObj.imageAspectRatio = imageAspectRatio;
      if (imageResolution) settingsObj.imageResolution = imageResolution;
      if (videoAspectRatio) settingsObj.videoAspectRatio = videoAspectRatio;
      if (videoResolution) settingsObj.videoResolution = videoResolution;
      // 短视频专属
      if (videoDuration) settingsObj.videoDuration = videoDuration;
      if (videoAspect) settingsObj.videoAspect = videoAspect;
      if (videoStyle) settingsObj.videoStyle = videoStyle;
      // 小说专属
      if (novelGenre) settingsObj.novelGenre = novelGenre;
      if (novelWritingStyle) settingsObj.novelWritingStyle = novelWritingStyle;
      if (novelChapterLength) settingsObj.novelChapterLength = novelChapterLength;
      if (novelTarget) settingsObj.novelTarget = novelTarget;
      // AI 输出语言
      if (outputLanguage) settingsObj.outputLanguage = outputLanguage;
      const saveData: any = { ...rest, type: editProjectType, settings_json: JSON.stringify(settingsObj) };
      // 只在创建项目时设置 team_id
      if (!editMode) {
        saveData.team_id = selectedTeamId || null;
      }
      if (editMode && currentId) {
        await updateProject(currentId, saveData);
      } else {
        const newProject = await createProject(saveData);
        // 新建项目后，如果有待上传的封面文件，立即上传
        if (newProject?.id && formData._coverFile) {
          try {
            const token = getAuthToken();
            const fd = new FormData();
            fd.append('cover', formData._coverFile);
            await fetch(`/api/projects/${newProject.id}/cover`, {
              method: 'POST',
              headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
              body: fd
            });
            setFormData(prev => ({ ...prev, _coverFile: null }));
          } catch (e) {
            console.warn('[Cover] 新建项目封面上传失败:', e);
          }
        }
      }
      await loadProjects();
      onOpenChange();
    } catch (error: any) {
      console.error('保存工程失败:', error);
      // 项目数量达到上限时弹出升级提示
      if (error.code === 'PROJECT_LIMIT_REACHED' && error.data) {
        const { currentCount, maxCount, planName, planDisplayName, planLevel, upgrade } = error.data;
        setUpgradeData({
          currentPlan: { name: planName, displayName: planDisplayName, level: planLevel },
          currentUsage: { current: currentCount, max: maxCount },
          nextPlan: upgrade?.available ? upgrade.nextPlan : undefined
        });
        setShowUpgrade(true);
        onOpenChange(); // 关闭创建弹窗
      } else {
        showToast(error.message || t.projects.saveFailed, 'error');
      }
    }
  };

  const handleSelectVisualStyle = (styleKey: string) => {
    if (formData.visualStyle === styleKey) {
      setFormData({ ...formData, visualStyle: '', visualStylePrompt: '' });
    } else if (styleKey === 'custom') {
      setFormData({
        ...formData,
        visualStyle: 'custom',
        visualStylePrompt: ''
      });
      setTimeout(() => {
        const el = document.getElementById('visual-style-custom-input');
        if (el) {
          const input = el.tagName === 'INPUT' ? el : el.querySelector('input');
          if (input) (input as HTMLInputElement).focus();
        }
      }, 100);
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
          visualStylePrompt: formData.visualStylePrompt,
          storyStyle: formData.storyStyle,
          storyConstraints: formData.storyConstraints
        })
      });
  
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'AI 封面生成失败');
      }
  
      const data = await res.json();
      setFormData(prev => ({ ...prev, cover_url: data.cover_url }));

      // 编辑模式下自动将封面持久化到数据库
      if (editMode && currentId && data.cover_url) {
        try {
          await updateProject(currentId, { cover_url: data.cover_url });
          await loadProjects();
        } catch (e) {
          console.warn('[Cover] 自动保存封面失败，将在手动保存时一并提交:', e);
        }
      }

      showToast(t.projects.aiCoverSuccess, 'success');
    } catch (error: any) {
      console.error('AI 封面生成失败:', error);
      showToast(t.projects.aiCoverFailed, 'error');
    } finally {
      setCoverGenerating(false);
    }
  };

  // 本地上传封面图片
  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 前端验证文件类型
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showToast('仅支持 PNG/JPG/WebP 格式', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('图片大小不能超过 10MB', 'error');
      return;
    }

    // 编辑模式且有项目 ID 时直接上传到服务器
    if (editMode && currentId) {
      setCoverUploading(true);
      try {
        const token = getAuthToken();
        const formDataUpload = new FormData();
        formDataUpload.append('cover', file);
        const res = await fetch(`/api/projects/${currentId}/cover`, {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: formDataUpload
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || '封面上传失败');
        }

        const data = await res.json();
        setFormData(prev => ({ ...prev, cover_url: data.coverUrl }));
        await loadProjects();
        showToast('封面上传成功', 'success');
      } catch (error: any) {
        console.error('封面上传失败:', error);
        showToast(error.message || '封面上传失败', 'error');
      } finally {
        setCoverUploading(false);
        // 清空 input 以允许重复选择同一文件
        if (coverInputRef.current) coverInputRef.current.value = '';
      }
    } else {
      // 新建模式：用 URL.createObjectURL 预览，保存 File 对象待提交时上传
      const previewUrl = URL.createObjectURL(file);
      setFormData(prev => ({ ...prev, cover_url: previewUrl, _coverFile: file as any }));
      showToast('封面已选择，保存项目时将自动上传', 'success');
    }
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: t.projects.deleteConfirmTitle,
      message: t.projects.deleteConfirmMessage + '\n\n此操作不可逆，删除后数据将永久丢失。',
      type: 'danger',
      confirmText: t.common.delete,
      checkbox: {
        label: '我理解删除操作不可逆转'
      }
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
    // 同时更新 WorkbenchContext 中的当前项目，确保工作台能正确加载
    setCurrentProject(project);
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
    <div className="h-full bg-(--bg-app) overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-linear-to-br from-(--accent)/30 to-(--accent-dark)/30 rounded-xl blur-lg opacity-60" />
              <div className="relative p-2.5 bg-linear-to-br from-(--accent)/20 to-(--accent-dark)/30 rounded-xl border border-(--accent)/30">
                <FolderOpen className="w-6 h-6 text-(--accent)" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold pro-title">{t.projects.title}</h1>
              <p className="text-sm text-(--text-muted)">{t.projects.subtitle}</p>
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
          startContent={<Search className="w-4 h-4 text-(--text-muted)" />}
          classNames={{
            input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
            inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/40 shadow-sm"
          }}
        />

        {/* 工程列表 */}
        {loading ? (
          <div className="text-center py-12 text-(--text-muted)">{t.common.loading}</div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto bg-(--bg-card) rounded-full flex items-center justify-center mb-4 border border-(--border-color)">
              <FolderOpen className="w-10 h-10 text-(--text-muted)" />
            </div>
            <p className="text-(--text-secondary) font-medium">{t.projects.emptyTitle}</p>
            <p className="text-(--text-muted) text-sm mt-1">{t.projects.emptyDesc}</p>
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
                            className="h-28 bg-linear-to-br from-(--bg-card) to-(--bg-input) relative overflow-hidden rounded-t-2xl shrink-0"
                            onDoubleClick={() => handleEnterProject(project)}
                          >
                            {project.cover_url ? (
                              <img src={project.cover_url} alt={project.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <BookOpen className="w-10 h-10 text-(--accent)/30" />
                              </div>
                            )}
                            {/* 操作按钮 */}
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="sm"
                                isIconOnly
                                className="bg-(--bg-elevated) backdrop-blur-sm hover:bg-(--bg-card) shadow-lg border border-(--border-color) cursor-pointer"
                                onPress={() => handleEdit(project)}
                              >
                                <Edit className="w-4 h-4 text-(--text-primary)" />
                              </Button>
                              <Button
                                size="sm"
                                isIconOnly
                                className="bg-(--bg-elevated) backdrop-blur-sm hover:bg-red-500/20 shadow-lg border border-(--border-color) cursor-pointer"
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
                                <h3 className="text-base font-semibold text-(--text-primary) line-clamp-1">{project.name}</h3>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Chip size="sm" className={getProjectTypeColor(project.type)}>
                                    {getProjectTypeLabel(project.type)}
                                  </Chip>
                                  <Chip size="sm" className={getStatusColor(project.status)}>
                                    {getStatusText(project.status)}
                                  </Chip>
                                </div>
                              </div>
                              <p className="text-xs text-(--text-muted) line-clamp-2">
                                {project.description || t.projects.noDescription}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-(--text-muted) pt-1 border-t border-(--border-color)">
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
                    className="h-32 bg-linear-to-br from-(--bg-card) to-(--bg-input) relative overflow-hidden rounded-t-2xl"
                    onDoubleClick={() => handleEnterProject(project)}
                  >
                    {project.cover_url ? (
                      <img src={project.cover_url} alt={project.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="w-12 h-12 text-(--accent)/30" />
                      </div>
                    )}
                    {/* 操作按钮 */}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        isIconOnly
                        className="bg-(--bg-elevated) backdrop-blur-sm hover:bg-(--bg-card) shadow-lg border border-(--border-color) cursor-pointer"
                        onPress={() => handleEdit(project)}
                      >
                        <Edit className="w-4 h-4 text-(--text-primary)" />
                      </Button>
                      <Button
                        size="sm"
                        isIconOnly
                        className="bg-(--bg-elevated) backdrop-blur-sm hover:bg-red-500/20 shadow-lg border border-(--border-color) cursor-pointer"
                        onPress={() => handleDelete(project.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* 信息区域 */}
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-lg font-semibold text-(--text-primary) line-clamp-1">{project.name}</h3>
                      <div className="flex items-center gap-1 shrink-0">
                        <Chip size="sm" className={getProjectTypeColor(project.type)}>
                          {getProjectTypeLabel(project.type)}
                        </Chip>
                        <Chip size="sm" className={getStatusColor(project.status)}>
                          {getStatusText(project.status)}
                        </Chip>
                      </div>
                    </div>
                    <p className="text-sm text-(--text-muted) line-clamp-2 min-h-10">
                      {project.description || t.projects.noDescription}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-(--text-muted) pt-2 border-t border-(--border-color)">
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
          size="2xl"
          classNames={{
            backdrop: 'bg-black/60 backdrop-blur-sm',
            base: 'bg-(--bg-elevated) border border-(--border-color) shadow-2xl',
            header: 'border-b border-(--border-color)',
            body: 'py-4 px-5',
            footer: 'border-t border-(--border-color)',
            closeButton: 'text-(--text-secondary) hover:text-(--text-primary) hover:bg-white/10'
          }}
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="text-(--text-primary) font-bold">
                  {editMode ? `${formData.name || t.projects.editTitle} - 设置` : t.projects.createTitle}
                </ModalHeader>
                <ModalBody>
                  <div className="flex gap-5 min-h-0">
                    {/* 左栏 - 封面与视觉风格（约38.2%黄金比例） */}
                    <div className="w-[38.2%] shrink-0 flex flex-col gap-4">
                      {/* 封面图片 */}
                      <div>
                        <label className="text-sm text-(--text-secondary) font-medium mb-2 block">{t.projects.coverLabel}</label>
                        {formData.cover_url ? (
                          <div className="rounded-xl overflow-hidden border border-(--border-color) bg-(--bg-input) relative group aspect-[16/10]">
                            <img
                              src={formData.cover_url}
                              alt="cover preview"
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <button
                              onClick={() => setFormData(prev => ({ ...prev, cover_url: '' }))}
                              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-(--border-color) bg-(--bg-input)/50 flex items-center justify-center aspect-[16/10]">
                            <div className="text-center text-(--text-muted)">
                              <ImagePlus className="w-8 h-8 mx-auto mb-1 opacity-40" />
                              <p className="text-xs">暂无封面</p>
                            </div>
                          </div>
                        )}
                        <input
                          ref={coverInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={handleUploadCover}
                        />
                        <div className="flex gap-2 mt-2">
                          <Button
                            className="flex-1 bg-(--bg-input) border border-(--border-color) text-(--text-secondary) hover:border-(--accent)/30 hover:bg-(--accent)/5 font-medium transition-all cursor-pointer text-sm h-9"
                            startContent={coverUploading ? <Spinner size="sm" /> : <Upload className="w-3.5 h-3.5" />}
                            onPress={() => coverInputRef.current?.click()}
                            isDisabled={coverUploading}
                          >
                            {coverUploading ? '上传中...' : '上传图片'}
                          </Button>
                          <Button
                            className="flex-1 bg-linear-to-r from-violet-500/20 to-pink-500/20 border border-violet-500/30 text-violet-600 dark:text-violet-300 font-medium hover:from-violet-500/30 hover:to-pink-500/30 transition-all cursor-pointer text-sm h-9"
                            startContent={coverGenerating ? <Spinner size="sm" color="secondary" /> : <Sparkles className="w-3.5 h-3.5" />}
                            onPress={handleGenerateCover}
                            isDisabled={coverGenerating}
                          >
                            {coverGenerating ? t.projects.aiGeneratingCover : 'AI生成'}
                          </Button>
                        </div>
                      </div>

                      {/* 视觉风格选择 - 小说类型不需要 */}
                      {editProjectType !== 'novel' && (
                      <div>
                        <label className="text-sm text-(--text-secondary) font-medium mb-2 flex items-center gap-1.5">
                          <Palette className="w-4 h-4 text-(--accent)" />
                          {t.projects.visualStyleLabel}
                          <span className="text-xs text-(--text-muted) font-normal">{t.projects.visualStyleHint}</span>
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {Object.entries(VISUAL_STYLE_PRESETS).map(([styleKey, { labelKey }]) => (
                            <button
                              key={styleKey}
                              onClick={() => handleSelectVisualStyle(styleKey)}
                              className={`px-2 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                                formData.visualStyle === styleKey
                                  ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_10px_var(--accent-glow)]'
                                  : 'border-(--border-color) bg-(--bg-input) text-(--text-secondary) hover:border-(--accent)/30 hover:bg-(--accent)/5'
                              }`}
                            >
                              {t.projects.presets[labelKey]}
                            </button>
                          ))}
                        </div>
                        {formData.visualStyle && (
                          <p className="text-xs text-(--text-muted) mt-1.5 truncate" title={formData.visualStylePrompt}>
                            Prompt: {formData.visualStylePrompt}
                          </p>
                        )}
                        <Input
                          id="visual-style-custom-input"
                          size="sm"
                          placeholder={t.projects.visualStylePromptPlaceholder}
                          value={formData.visualStylePrompt}
                          onValueChange={(val) => setFormData({ ...formData, visualStylePrompt: val })}
                          className="mt-1.5"
                          classNames={{
                            input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted) text-xs",
                            inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 h-8 min-h-8"
                          }}
                        />
                      </div>
                      )}
                    </div>

                    {/* 右栏 - 项目设置（约61.8%黄金比例） */}
                    <div className="flex-1 flex flex-col gap-3.5 overflow-y-auto max-h-[70vh] pr-1">
                      <Input
                        label={t.projects.nameLabel}
                        placeholder={t.projects.namePlaceholder}
                        value={formData.name}
                        onValueChange={(val) => setFormData({ ...formData, name: val })}
                        classNames={{
                          input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
                          label: "text-(--text-secondary) font-medium",
                          inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/40"
                        }}
                      />
                      
                      <Textarea
                        label={t.projects.descLabel}
                        placeholder={t.projects.descPlaceholder}
                        value={formData.description}
                        onValueChange={(val) => setFormData({ ...formData, description: val })}
                        minRows={2}
                        classNames={{
                          input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
                          label: "text-(--text-secondary) font-medium",
                          inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/40"
                        }}
                      />

                      {/* AI 智能推荐按钮 */}
                      <Button
                        className="w-full bg-linear-to-r from-violet-500/20 to-purple-500/20 border border-violet-500/30 text-violet-600 dark:text-violet-300 font-medium hover:from-violet-500/30 hover:to-purple-500/30 transition-all cursor-pointer text-sm h-9"
                        startContent={aiSuggesting ? <Spinner size="sm" color="secondary" /> : <Sparkles className="w-3.5 h-3.5" />}
                        onPress={handleAiSuggest}
                        isDisabled={aiSuggesting}
                      >
                        {aiSuggesting ? t.projects.aiSuggesting : t.projects.aiSuggestBtn}
                      </Button>

                      {/* 团队选择器 */}
                      {!editMode && userTeams.length > 0 && (
                        <div>
                          <label className="text-sm text-(--text-secondary) font-medium mb-2 block">所属团队</label>
                          <select
                            value={selectedTeamId}
                            onChange={(e) => setSelectedTeamId(e.target.value ? Number(e.target.value) : '')}
                            className="w-full px-3 py-2 rounded-lg bg-(--bg-input) border border-(--border-color) text-(--text-primary) focus:outline-none focus:border-(--accent)/40"
                          >
                            <option value="">个人项目</option>
                            {userTeams.map(team => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* 工程状态 */}
                      <div>
                        <label className="text-sm text-(--text-secondary) font-medium mb-2 block">{t.projects.statusLabel}</label>
                        <div className="flex gap-2">
                          {(['draft', 'in_progress', 'completed'] as const).map((status) => (
                            <button
                              key={status}
                              onClick={() => setFormData({ ...formData, status })}
                              className={`px-4 py-2 rounded-lg border transition-all cursor-pointer ${
                                formData.status === status
                                  ? getStatusColor(status)
                                  : 'border-(--border-color) bg-(--bg-input) text-(--text-muted) hover:border-(--border-color)'
                              }`}
                            >
                              {getStatusText(status)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* AI 输出语言选择 */}
                      <div>
                        <label className="text-sm text-(--text-secondary) font-medium mb-2 flex items-center gap-1.5">
                          <Globe className="w-4 h-4 text-(--accent)" />
                          {t.projects.outputLanguageLabel}
                          <span className="text-xs text-(--text-muted) font-normal">{t.projects.outputLanguageHint}</span>
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {Object.entries(t.projects.outputLanguages).map(([code, name]) => (
                            <button
                              key={code}
                              onClick={() => setFormData({ ...formData, outputLanguage: code })}
                              className={`px-2 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                                formData.outputLanguage === code
                                  ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_10px_var(--accent-glow)]'
                                  : 'border-(--border-color) bg-(--bg-input) text-(--text-secondary) hover:border-(--accent)/30 hover:bg-(--accent)/5'
                              }`}
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* ====== 漫剧专属字段 ====== */}
                      {(editProjectType === 'comic_drama') && (
                      <>
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label={t.projects.storyStyleLabel}
                          placeholder={t.projects.storyStylePlaceholder}
                          value={formData.storyStyle}
                          onValueChange={(val) => setFormData({ ...formData, storyStyle: val })}
                          classNames={{
                            input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
                            label: "text-(--text-secondary) font-medium",
                            inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/40"
                          }}
                        />
                        <Input
                          label={t.projects.storyConstraintsLabel}
                          placeholder={t.projects.storyConstraintsPlaceholder}
                          value={formData.storyConstraints}
                          onValueChange={(val) => setFormData({ ...formData, storyConstraints: val })}
                          classNames={{
                            input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
                            label: "text-(--text-secondary) font-medium",
                            inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/40"
                          }}
                        />
                      </div>

                      {/* 画面参数设置 */}
                      <div className="space-y-2.5 p-3 rounded-lg border border-(--border-color) bg-(--bg-input)/50">
                        <p className="text-sm font-medium text-(--text-secondary)">画面参数（项目级锁定，分镜制作中不可更改）</p>
                        <div>
                          <label className="text-xs text-(--text-muted) mb-1.5 block">图片画面比例</label>
                          <div className="flex flex-wrap gap-1.5">
                            {['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'].map((ratio) => (
                              <button
                                key={ratio}
                                onClick={() => setFormData({ ...formData, imageAspectRatio: formData.imageAspectRatio === ratio ? '' : ratio })}
                                className={`px-3 py-1 rounded-md border text-xs transition-all cursor-pointer ${
                                  formData.imageAspectRatio === ratio
                                    ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_8px_var(--accent-glow)]'
                                    : 'border-(--border-color) bg-(--bg-input) text-(--text-muted) hover:border-(--accent)/30'
                                }`}
                              >
                                {ratio}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-(--text-muted) mb-1.5 block">图片分辨率</label>
                          <div className="flex flex-wrap gap-1.5">
                            {['720p', '1080p', '2K', '4K'].map((res) => (
                              <button
                                key={res}
                                onClick={() => setFormData({ ...formData, imageResolution: formData.imageResolution === res ? '' : res })}
                                className={`px-3 py-1 rounded-md border text-xs transition-all cursor-pointer ${
                                  formData.imageResolution === res
                                    ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_8px_var(--accent-glow)]'
                                    : 'border-(--border-color) bg-(--bg-input) text-(--text-muted) hover:border-(--accent)/30'
                                }`}
                              >
                                {res}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-(--text-muted) mb-1.5 block">视频画面比例</label>
                          <div className="flex flex-wrap gap-1.5">
                            {['16:9', '9:16', '1:1'].map((ratio) => (
                              <button
                                key={ratio}
                                onClick={() => setFormData({ ...formData, videoAspectRatio: formData.videoAspectRatio === ratio ? '' : ratio })}
                                className={`px-3 py-1 rounded-md border text-xs transition-all cursor-pointer ${
                                  formData.videoAspectRatio === ratio
                                    ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_8px_var(--accent-glow)]'
                                    : 'border-(--border-color) bg-(--bg-input) text-(--text-muted) hover:border-(--accent)/30'
                                }`}
                              >
                                {ratio}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-(--text-muted) mb-1.5 block">视频分辨率</label>
                          <div className="flex flex-wrap gap-1.5">
                            {['480p', '720p', '1080p'].map((res) => (
                              <button
                                key={res}
                                onClick={() => setFormData({ ...formData, videoResolution: formData.videoResolution === res ? '' : res })}
                                className={`px-3 py-1 rounded-md border text-xs transition-all cursor-pointer ${
                                  formData.videoResolution === res
                                    ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_8px_var(--accent-glow)]'
                                    : 'border-(--border-color) bg-(--bg-input) text-(--text-muted) hover:border-(--accent)/30'
                                }`}
                              >
                                {res}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      </>
                      )}

                      {/* ====== 漫画专属字段 ====== */}
                      {(editProjectType === 'manga') && (
                      <>
                        <div>
                          <label className="text-sm text-(--text-secondary) font-medium mb-2 block">{t.projects.mangaLayoutLabel}</label>
                          <div className="flex gap-2">
                            {([['page', t.projects.mangaLayoutPage], ['strip', t.projects.mangaLayoutStrip], ['free', t.projects.mangaLayoutFree]] as const).map(([key, label]) => (
                              <button
                                key={key}
                                onClick={() => setFormData({ ...formData, mangaLayout: formData.mangaLayout === key ? '' : key as any })}
                                className={`px-4 py-2 rounded-lg border transition-all cursor-pointer ${
                                  formData.mangaLayout === key
                                    ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_10px_var(--accent-glow)]'
                                    : 'border-(--border-color) bg-(--bg-input) text-(--text-muted) hover:border-(--accent)/30'
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
                              input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
                              label: "text-(--text-secondary) font-medium",
                              inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/40"
                            }}
                          />
                          <Input
                            label={t.projects.storyStyleLabel}
                            placeholder={t.projects.storyStylePlaceholder}
                            value={formData.storyStyle}
                            onValueChange={(val) => setFormData({ ...formData, storyStyle: val })}
                            classNames={{
                              input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
                              label: "text-(--text-secondary) font-medium",
                              inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/40"
                            }}
                          />
                        </div>
                      </>
                      )}

                      {/* ====== 短视频专属字段 ====== */}
                      {(editProjectType === 'short_video') && (
                      <>
                        <div>
                          <label className="text-sm text-(--text-secondary) font-medium mb-2 block">{t.projects.videoDurationLabel}</label>
                          <div className="flex gap-2">
                            {([['15', t.projects.videoDuration15], ['30', t.projects.videoDuration30], ['60', t.projects.videoDuration60], ['180', t.projects.videoDuration180]] as const).map(([key, label]) => (
                              <button
                                key={key}
                                onClick={() => setFormData({ ...formData, videoDuration: formData.videoDuration === key ? '' : key as any })}
                                className={`px-4 py-2 rounded-lg border transition-all cursor-pointer ${
                                  formData.videoDuration === key
                                    ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_10px_var(--accent-glow)]'
                                    : 'border-(--border-color) bg-(--bg-input) text-(--text-muted) hover:border-(--accent)/30'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-sm text-(--text-secondary) font-medium mb-2 block">{t.projects.videoAspectLabel}</label>
                          <div className="flex gap-2">
                            {([['9:16', t.projects.videoAspect916], ['16:9', t.projects.videoAspect169], ['1:1', t.projects.videoAspect11]] as const).map(([key, label]) => (
                              <button
                                key={key}
                                onClick={() => setFormData({ ...formData, videoAspect: formData.videoAspect === key ? '' : key as any })}
                                className={`px-4 py-2 rounded-lg border transition-all cursor-pointer ${
                                  formData.videoAspect === key
                                    ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_10px_var(--accent-glow)]'
                                    : 'border-(--border-color) bg-(--bg-input) text-(--text-muted) hover:border-(--accent)/30'
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
                              input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
                              label: "text-(--text-secondary) font-medium",
                              inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/40"
                            }}
                          />
                          <Input
                            label={t.projects.storyStyleLabel}
                            placeholder={t.projects.storyStylePlaceholder}
                            value={formData.storyStyle}
                            onValueChange={(val) => setFormData({ ...formData, storyStyle: val })}
                            classNames={{
                              input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
                              label: "text-(--text-secondary) font-medium",
                              inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/40"
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
                              input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
                              label: "text-(--text-secondary) font-medium",
                              inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/40"
                            }}
                          />
                          <Input
                            label={t.projects.novelWritingStyleLabel}
                            placeholder={t.projects.novelWritingStylePlaceholder}
                            value={formData.novelWritingStyle}
                            onValueChange={(val) => setFormData({ ...formData, novelWritingStyle: val })}
                            classNames={{
                              input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
                              label: "text-(--text-secondary) font-medium",
                              inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/40"
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
                              input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
                              label: "text-(--text-secondary) font-medium",
                              inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/40"
                            }}
                          />
                          <Input
                            label={t.projects.novelTargetLabel}
                            placeholder={t.projects.novelTargetPlaceholder}
                            value={formData.novelTarget}
                            onValueChange={(val) => setFormData({ ...formData, novelTarget: val })}
                            classNames={{
                              input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
                              label: "text-(--text-secondary) font-medium",
                              inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/40"
                            }}
                          />
                        </div>
                      </>
                      )}
                    </div>
                  </div>
                </ModalBody>
                <ModalFooter className="gap-2">
                  <Button variant="flat" onPress={onClose} className="bg-white/5 text-(--text-secondary) font-semibold hover:bg-white/10 border border-white/10 cursor-pointer">
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

        {/* 升级提示弹窗 */}
        {upgradeData && (
          <UpgradePrompt
            isOpen={showUpgrade}
            onClose={() => setShowUpgrade(false)}
            limitType="project"
            currentPlan={upgradeData.currentPlan}
            currentUsage={upgradeData.currentUsage}
            nextPlan={upgradeData.nextPlan}
          />
        )}
      </div>
    </div>
  );
};

export default Projects;
