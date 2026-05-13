import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Button, Input, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Chip, Spinner } from '@heroui/react';
import { FolderOpen, Plus, Edit, Trash2, Search, BookOpen, Clock, Palette, Sparkles, ImagePlus, Globe, Upload, Users, Crop } from 'lucide-react';
import { motion } from 'framer-motion';
import { Project, fetchProjects, createProject, updateProject, deleteProject, UserStylePreset, fetchMyStyles, createMyStyle, updateMyStyle, deleteMyStyle } from '../services/projects';
import { Team, fetchTeams } from '../services/collaboration';
import { ProjectType, VISUAL_STYLE_BY_CATEGORY, StyleCategory, BodyProportionRatio, BODY_PROPORTION_PRESETS, inferStyleCategory } from '../types/projectTypes';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useWorkbench } from '../contexts/WorkbenchContext';
import { getAuthToken } from '../services/auth';
import { useLanguage } from '../contexts/LanguageContext';
import { useVirtualList } from '../hooks/useVirtualList';
import { usePreview } from '../components/PreviewProvider';
import QuickStartWizard from '../components/QuickStartWizard';
import UpgradePrompt from '../components/UpgradePrompt';
import ImageCropperModal, { CropSelection } from '../components/ImageCropperModal';

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
  const { openPreview } = usePreview();
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
    styleCategory: '' as '' | StyleCategory,
    bodyProportionRatio: '' as '' | BodyProportionRatio,
    storyStyle: '',
    storyConstraints: '',
    // 拍摄视角
    narrativePerspective: '' as '' | 'first_person' | 'third_person',
    // 漫剧专属 - 画面参数
    imageAspectRatio: '',
    imageResolution: '',
    videoAspectRatio: '',
    videoResolution: '',
    // AI 输出语言
    outputLanguage: 'zh' as string
  });
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  // 封面裁剪相关
  const [cropperOpen, setCropperOpen] = useState(false);
  const [cropperSource, setCropperSource] = useState<string>('');
  const [showQuickStart, setShowQuickStart] = useState(false);
  
  // 我的风格
  const [myStyles, setMyStyles] = useState<UserStylePreset[]>([]);
  const myStylesDisclosure = useDisclosure();
  const [editingMyStyle, setEditingMyStyle] = useState<UserStylePreset | null>(null);
  const [myStyleForm, setMyStyleForm] = useState({ name: '', prompt: '', style_category: 'anime' as 'anime' | 'live_action' });
  
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
    'animeJapanese': { prompt: '动漫风格, 赛璘珞上色, 鲜艳色彩, 干净线条, 漫画美学, 日式动画', labelKey: 'animeJapanese' },
    'realisticFilm': { prompt: '照片写实, 电影级打光, 胶片质感, 真实比例, 电影剧照, 自然色调', labelKey: 'realisticFilm' },
    'render3D': { prompt: '3D渲染, 皮克斯风格, 柔和光照, 次表面散射, 平滑着色, CG品质', labelKey: 'render3D' },
    'pixar3D': { prompt: '3D渲染, 皮克斯动画风格, 圆润可爱角色造型, 柔和光照, 次表面散射, 大眼睛萌感, 鲜艳饱和色调, 毛发与布料细节质感, 美式家庭动画电影感', labelKey: 'pixar3D' },
    'disney3D': { prompt: '3D渲染, 迪士尼CG动画风格, 精致五官, 梦幻光影, 童话公主质感, 优雅身型, 光滑高光表面, 明亮鲜亮色调, 高品质迪士尼CG美学', labelKey: 'disney3D' },
    'chinese3D': { prompt: '3D渲染, 国漫CG风格, 东方美学, 水墨质感与CG融合, 仙侠飘逸氛围, 华丽东方特效, 中国神话元素, 古风服饰, 哪吒白蛇类国产动画质感', labelKey: 'chinese3D' },
    'anime3D': { prompt: '3D渲染, 日式赛璐珞3D风格, 二次元线条感, 动漫大眼睛, 平涂阴影, 2D化3D质感, 日本动画CG美学, 鬼灭之刃类风格', labelKey: 'anime3D' },
    'watercolor': { prompt: '水彩插画, 柔和边缘, 粉彩色调, 绘本风格, 手绘纹理', labelKey: 'watercolor' },
    'cyberpunk': { prompt: '赛博朋克, 霓虹灯光, 暗黑氛围, 未来科幻, 高对比度, 科幻美学', labelKey: 'cyberpunk' },
    'americanComic': { prompt: '美式漫画风格, 粗犷描边, 动感明暗, 超级英雄美学, 鲜明色彩', labelKey: 'americanComic' },
    'pixelArt': { prompt: '像素画风格, 复古游戏美学, 16位像素, 干净像素点, 怀旧风', labelKey: 'pixelArt' },
    'chineseInk': { prompt: '中国水墨画风格, 传统笔触, 典雅, 留白极简, 东方美学', labelKey: 'chineseInk' },
    'shoujoManga': { prompt: '日本少女漫画风格, 大而闪亮的星光瞳孔, 精致美少女特征, 柔粉淡紫色调, 花卉网点背景, 浪漫氛围, 飘逸秀发配缎带, 装饰性闪光特效, 柔和腹红, 梦幻柔焦光效', labelKey: 'shoujoManga' },
    'fashionPhoto': { prompt: '高端时尚大片, 精致灯光, 杂志封面品质, 人像摄影, 柔和散射光, 色彩协调', labelKey: 'fashionPhoto' },
    'documentary': { prompt: '纪实摄影, 自然光线, 真实场景, 新闻纪录片美学, 抓拍感, 真实光影', labelKey: 'documentary' },
    'cinematicDrama': { prompt: '电影色调, 宽银幕构图, 戏剧性光影, 胶片颗粒感, 质感电影画面, cinematic lighting', labelKey: 'cinematicDrama' },
    'custom': { prompt: '', labelKey: 'custom' }
  };

  useEffect(() => {
    loadProjects();
    loadUserTeams();
    loadMyStyles();
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

  // 加载用户自定义风格
  const loadMyStyles = async () => {
    try {
      const styles = await fetchMyStyles();
      setMyStyles(styles);
    } catch (error) {
      console.error('加载风格失败:', error);
    }
  };

  const openMyStyleModal = (style?: UserStylePreset) => {
    if (style) {
      setEditingMyStyle(style);
      setMyStyleForm({ name: style.name, prompt: style.prompt, style_category: style.style_category });
    } else {
      setEditingMyStyle(null);
      setMyStyleForm({ name: '', prompt: '', style_category: formData.styleCategory as 'anime' | 'live_action' || 'anime' });
    }
    myStylesDisclosure.onOpen();
  };

  const handleSaveMyStyle = async () => {
    if (!myStyleForm.name.trim() || !myStyleForm.prompt.trim()) {
      showToast(t.projects.myStylesNameLabel + ' 和 ' + t.projects.myStylesPromptLabel + ' 不能为空', 'warning');
      return;
    }
    try {
      if (editingMyStyle) {
        await updateMyStyle(editingMyStyle.id, { name: myStyleForm.name.trim(), prompt: myStyleForm.prompt.trim(), style_category: myStyleForm.style_category });
        showToast(t.projects.myStylesSaved, 'success');
      } else {
        await createMyStyle({ name: myStyleForm.name.trim(), prompt: myStyleForm.prompt.trim(), style_category: myStyleForm.style_category });
        showToast(t.projects.myStylesSaved, 'success');
      }
      myStylesDisclosure.onClose();
      loadMyStyles();
    } catch (error: any) {
      showToast(error.message || '操作失败', 'error');
    }
  };

  const handleDeleteMyStyle = async (style: UserStylePreset) => {
    const ok = await confirm({
      title: '删除确认',
      message: t.projects.myStylesDeleteConfirm.replace('{name}', style.name),
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger'
    });
    if (!ok) return;
    try {
      await deleteMyStyle(style.id);
      showToast(t.projects.myStylesDeleted, 'success');
      loadMyStyles();
      // 如果当前选中的是这个风格，清除选中
      if (formData.visualStyle === `myStyle_${style.id}`) {
        setFormData({ ...formData, visualStyle: '', visualStylePrompt: '' });
      }
    } catch (error: any) {
      showToast(error.message || '删除失败', 'error');
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
      styleCategory: settings.styleCategory || (settings.visualStyle ? inferStyleCategory(settings.visualStyle) : ''),
      bodyProportionRatio: settings.bodyProportionRatio || '',
      storyStyle: settings.storyStyle || '',
      storyConstraints: settings.storyConstraints || '',
      narrativePerspective: settings.narrativePerspective || '',
      imageAspectRatio: settings.imageAspectRatio || '',
      imageResolution: settings.imageResolution || '',
      videoAspectRatio: settings.videoAspectRatio || '',
      videoResolution: settings.videoResolution || '',
      outputLanguage: settings.outputLanguage || 'zh'
    });
    onOpen();
  };

  const handleSave = async () => {
    // 前置验证必填字段
    const missing: string[] = [];
    if (!formData.name?.trim()) missing.push('项目名称');
    if (!formData.styleCategory) missing.push('内容类型（真人/动漫）');
    if (!formData.visualStyle) missing.push('视觉风格');
    if (missing.length > 0) {
      showToast(`您还没有选择：${missing.join('、')}`, 'error');
      return;
    }
    try {
      const { visualStyle, visualStylePrompt, storyStyle, storyConstraints, narrativePerspective,
        styleCategory, bodyProportionRatio,
        imageAspectRatio, imageResolution,
        videoAspectRatio, videoResolution,
        outputLanguage, _coverFile, ...rest } = formData;
      const settingsObj: any = {};
      if (styleCategory) settingsObj.styleCategory = styleCategory;
      if (bodyProportionRatio) settingsObj.bodyProportionRatio = bodyProportionRatio;
      if (visualStyle) settingsObj.visualStyle = visualStyle;
      if (visualStylePrompt) settingsObj.visualStylePrompt = visualStylePrompt;
      if (storyStyle) settingsObj.storyStyle = storyStyle;
      if (storyConstraints) settingsObj.storyConstraints = storyConstraints;
      if (narrativePerspective) settingsObj.narrativePerspective = narrativePerspective;
      // 画面参数
      if (imageAspectRatio) settingsObj.imageAspectRatio = imageAspectRatio;
      if (imageResolution) settingsObj.imageResolution = imageResolution;
      if (videoAspectRatio) settingsObj.videoAspectRatio = videoAspectRatio;
      if (videoResolution) settingsObj.videoResolution = videoResolution;
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
    } else if (styleKey.startsWith('myStyle_')) {
      // 我的风格
      const styleId = parseInt(styleKey.replace('myStyle_', ''));
      const myStyle = myStyles.find(s => s.id === styleId);
      if (myStyle) {
        setFormData({
          ...formData,
          visualStyle: styleKey,
          visualStylePrompt: myStyle.prompt
        });
      }
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
          storyConstraints: formData.storyConstraints,
          bodyProportionRatio: formData.bodyProportionRatio || undefined
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

  // 打开裁剪器：基于当前封面
  const handleOpenCropper = () => {
    if (!formData.cover_url) {
      showToast('请先选择或生成封面', 'warning');
      return;
    }
    setCropperSource(formData.cover_url);
    setCropperOpen(true);
  };

  // 应用裁剪结果：将选取坐标传给后端，由后端从原图截取
  const handleCropped = async (selection: CropSelection) => {
    if (editMode && currentId) {
      setCoverUploading(true);
      try {
        const token = getAuthToken();
        const res = await fetch(`/api/projects/${currentId}/cover/crop`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            sourceUrl: formData.cover_url,
            crop: selection,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || '裁剪封面失败');
        }
        const data = await res.json();
        setFormData(prev => ({ ...prev, cover_url: data.coverUrl }));
        await loadProjects();
        showToast('裁剪完成，封面已更新', 'success');
      } catch (error: any) {
        console.error('裁剪封面失败:', error);
        showToast(error.message || '裁剪封面失败', 'error');
      } finally {
        setCoverUploading(false);
      }
    } else {
      // 新建模式：暂存裁剪坐标，保存项目时一并处理
      setFormData(prev => ({
        ...prev,
        _coverCrop: selection as any,
      }));
      showToast('已记录裁剪区域，保存项目时将自动应用', 'success');
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
  const handleQuickStartComplete = async (projectId: number) => {
    setShowQuickStart(false);
    localStorage.setItem(LAST_PROJECT_KEY, projectId.toString());
    await loadProjects();
    navigate('/');
  };

  const filteredProjects = (projects || []).filter(p => 
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
      default: return type;
    }
  };

  // 获取项目类型颜色
  const getProjectTypeColor = (type: string) => {
    switch (type) {
      case 'comic_drama': return 'bg-violet-500/20 text-violet-600 dark:text-violet-300 border border-violet-400/30';
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
                            className="h-40 bg-linear-to-br from-(--bg-card) to-(--bg-input) relative overflow-hidden rounded-t-2xl shrink-0"
                            onDoubleClick={() => handleEnterProject(project)}
                          >
                            {project.cover_url ? (
                              <>
                                <img
                                  src={project.cover_url}
                                  alt={project.name}
                                  loading="lazy"
                                  className="w-full h-full object-cover object-top"
                                />
                                {/* 底部渐变遮罩，让封面与标题区自然过渡 */}
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/20 to-transparent" />
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <BookOpen className="w-10 h-10 text-(--accent)/30" />
                              </div>
                            )}
                            {/* 操作按钮 */}
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {(!project.my_role || project.my_role !== 'viewer') && (
                                <Button
                                  size="sm"
                                  isIconOnly
                                  className="bg-(--bg-elevated) backdrop-blur-sm hover:bg-(--bg-card) shadow-lg border border-(--border-color) cursor-pointer"
                                  onPress={() => handleEdit(project)}
                                >
                                  <Edit className="w-4 h-4 text-(--text-primary)" />
                                </Button>
                              )}
                              {(!project.my_role || project.my_role === 'owner' || project.my_role === 'admin') && (
                                <Button
                                  size="sm"
                                  isIconOnly
                                  className="bg-(--bg-elevated) backdrop-blur-sm hover:bg-red-500/20 shadow-lg border border-(--border-color) cursor-pointer"
                                  onPress={() => handleDelete(project.id)}
                                >
                                  <Trash2 className="w-4 h-4 text-red-400" />
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          {/* 信息区域 */}
                          <div className="p-3 flex-1 flex flex-col justify-between">
                            <div className="space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="text-base font-semibold text-(--text-primary) line-clamp-1">{project.name}</h3>
                                <div className="flex items-center gap-1 shrink-0">
                                  {project.team_name && (
                                    <Chip size="sm" className="bg-blue-500/15 text-blue-600" startContent={<Users className="w-3 h-3" />}>
                                      {project.team_name}
                                    </Chip>
                                  )}
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
                    className="h-40 bg-linear-to-br from-(--bg-card) to-(--bg-input) relative overflow-hidden rounded-t-2xl"
                    onDoubleClick={() => handleEnterProject(project)}
                  >
                    {project.cover_url ? (
                      <>
                        <img
                          src={project.cover_url}
                          alt={project.name}
                          loading="lazy"
                          className="w-full h-full object-cover object-top"
                        />
                        {/* 底部渐变遮罩，让封面与标题区自然过渡 */}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/20 to-transparent" />
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="w-12 h-12 text-(--accent)/30" />
                      </div>
                    )}
                    {/* 操作按钮 */}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {(!project.my_role || project.my_role !== 'viewer') && (
                        <Button
                          size="sm"
                          isIconOnly
                          className="bg-(--bg-elevated) backdrop-blur-sm hover:bg-(--bg-card) shadow-lg border border-(--border-color) cursor-pointer"
                          onPress={() => handleEdit(project)}
                        >
                          <Edit className="w-4 h-4 text-(--text-primary)" />
                        </Button>
                      )}
                      {(!project.my_role || project.my_role === 'owner' || project.my_role === 'admin') && (
                        <Button
                          size="sm"
                          isIconOnly
                          className="bg-(--bg-elevated) backdrop-blur-sm hover:bg-red-500/20 shadow-lg border border-(--border-color) cursor-pointer"
                          onPress={() => handleDelete(project.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* 信息区域 */}
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-lg font-semibold text-(--text-primary) line-clamp-1">{project.name}</h3>
                      <div className="flex items-center gap-1 shrink-0">
                        {project.team_name && (
                          <Chip size="sm" className="bg-blue-500/15 text-blue-600" startContent={<Users className="w-3 h-3" />}>
                            {project.team_name}
                          </Chip>
                        )}
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
          size="5xl"
          classNames={{
            backdrop: 'bg-black/60 backdrop-blur-sm',
            base: 'bg-(--bg-elevated) border border-(--border-color) shadow-2xl max-h-[92vh]',
            header: 'border-b border-(--border-color)',
            body: 'py-4 px-5 overflow-hidden',
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
                  <div className="flex gap-5 min-h-0 max-h-[calc(92vh-130px)]">
                    {/* 左栏 - 封面与视觉风格 */}
                    <div className="w-[340px] shrink-0 flex flex-col gap-3 overflow-y-auto pr-1">
                      {/* 封面图片 */}
                      <div>
                        <label className="text-sm text-(--text-secondary) font-medium mb-2 block">{t.projects.coverLabel}</label>
                        {formData.cover_url ? (
                          <div className="rounded-xl overflow-hidden border border-(--border-color) bg-(--bg-input) relative group aspect-[16/9]">
                            <img
                              src={formData.cover_url}
                              alt="cover preview"
                              className="w-full h-full object-cover cursor-pointer"
                              onClick={() => openPreview([{ src: formData.cover_url }])}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOpenCropper(); }}
                              className="absolute top-2 left-2 px-2 h-6 rounded-md bg-black/55 text-white flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs hover:bg-black/70"
                              title="裁剪封面"
                            >
                              <Crop className="w-3 h-3" />
                              裁剪
                            </button>
                            <button
                              onClick={() => setFormData(prev => ({ ...prev, cover_url: '' }))}
                              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-(--border-color) bg-(--bg-input)/50 flex items-center justify-center aspect-[16/9]">
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
                        <div className="flex gap-2 mt-1.5">
                          <Button
                            className="flex-1 bg-(--bg-input) border border-(--border-color) text-(--text-secondary) hover:border-(--accent)/30 hover:bg-(--accent)/5 font-medium transition-all cursor-pointer text-xs h-8"
                            startContent={coverUploading ? <Spinner size="sm" /> : <Upload className="w-3 h-3" />}
                            onPress={() => coverInputRef.current?.click()}
                            isDisabled={coverUploading}
                          >
                            {coverUploading ? '上传中...' : '上传图片'}
                          </Button>
                          <Button
                            className="flex-1 bg-linear-to-r from-violet-500/20 to-pink-500/20 border border-violet-500/30 text-violet-600 dark:text-violet-300 font-medium hover:from-violet-500/30 hover:to-pink-500/30 transition-all cursor-pointer text-xs h-8"
                            startContent={coverGenerating ? <Spinner size="sm" color="secondary" /> : <Sparkles className="w-3 h-3" />}
                            onPress={handleGenerateCover}
                            isDisabled={coverGenerating}
                          >
                            {coverGenerating ? t.projects.aiGeneratingCover : 'AI生成'}
                          </Button>
                        </div>
                      </div>

                      {/* 视觉风格选择 */}
                      <div>
                        <label className="text-sm text-(--text-secondary) font-medium mb-2 flex items-center gap-1.5">
                          <Palette className="w-4 h-4 text-(--accent)" />
                          {t.projects.visualStyleLabel}
                          <span className="text-xs text-(--text-muted) font-normal">{t.projects.visualStyleHint}</span>
                        </label>

                        {/* 内容类型切换：真人 / 动漫 */}
                        <div className="flex gap-2 mb-2">
                          {(['live_action', 'anime'] as StyleCategory[]).map((cat) => (
                            <button
                              key={cat}
                              onClick={() => {
                                const newCategory = cat;
                                // 切换分类时，如果当前选中的风格不属于新分类，重置
                                const stylesInCategory = VISUAL_STYLE_BY_CATEGORY[newCategory];
                                const shouldResetStyle = formData.visualStyle && !stylesInCategory.includes(formData.visualStyle);
                                setFormData({
                                  ...formData,
                                  styleCategory: newCategory,
                                  ...(shouldResetStyle ? { visualStyle: '', visualStylePrompt: '' } : {}),
                                  // 切换到真人类时清空头身比例
                                  ...(newCategory === 'live_action' ? { bodyProportionRatio: '' as '' } : {}),
                                });
                              }}
                              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold transition-all cursor-pointer ${
                                formData.styleCategory === cat
                                  ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_10px_var(--accent-glow)]'
                                  : 'border-(--border-color) bg-(--bg-input) text-(--text-secondary) hover:border-(--accent)/30 hover:bg-(--accent)/5'
                              }`}
                            >
                              {cat === 'live_action' ? t.projects.categoryLiveAction : t.projects.categoryAnime}
                            </button>
                          ))}
                        </div>

                        {/* 按分类过滤的画风子选项 */}
                        <div className="grid grid-cols-3 gap-1.5">
                          {Object.entries(VISUAL_STYLE_PRESETS)
                            .filter(([styleKey]) => {
                              if (styleKey === 'custom') return false; // custom 单独处理
                              if (!formData.styleCategory) return true;
                              return VISUAL_STYLE_BY_CATEGORY[formData.styleCategory as StyleCategory]?.includes(styleKey);
                            })
                            .map(([styleKey, { labelKey }]) => (
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

                        {/* 我的风格 */}
                        {(() => {
                          const filteredMyStyles = (myStyles || []).filter(s => {
                            if (!formData.styleCategory) return true;
                            return s.style_category === formData.styleCategory;
                          });
                          return filteredMyStyles.length > 0 ? (
                            <>
                              <div className="flex items-center gap-2 mt-3 mb-1.5">
                                <div className="flex-1 h-px bg-(--border-color)" />
                                <span className="text-xs text-(--text-muted) font-medium">{t.projects.myStyles}</span>
                                <div className="flex-1 h-px bg-(--border-color)" />
                              </div>
                              <div className="grid grid-cols-3 gap-1.5">
                                {filteredMyStyles.map((style) => (
                                  <div key={style.id} className="relative group">
                                    <button
                                      onClick={() => handleSelectVisualStyle(`myStyle_${style.id}`)}
                                      className={`w-full px-2 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer text-left ${
                                        formData.visualStyle === `myStyle_${style.id}`
                                          ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_10px_var(--accent-glow)]'
                                          : 'border-(--border-color) bg-(--bg-input) text-(--text-secondary) hover:border-(--accent)/30 hover:bg-(--accent)/5'
                                      }`}
                                    >
                                      <div className="truncate">{style.name}</div>
                                    </button>
                                    <div className="absolute top-0.5 right-0.5 hidden group-hover:flex gap-0.5">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); openMyStyleModal(style); }}
                                        className="p-0.5 rounded bg-(--bg-card) border border-(--border-color) text-(--text-muted) hover:text-(--accent) hover:border-(--accent)/40 transition-all"
                                        title={t.projects.myStylesEdit}
                                      >
                                        <Edit className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteMyStyle(style); }}
                                        className="p-0.5 rounded bg-(--bg-card) border border-(--border-color) text-(--text-muted) hover:text-red-400 hover:border-red-400/40 transition-all"
                                        title="删除"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                <button
                                  onClick={() => openMyStyleModal()}
                                  className="px-2 py-1.5 rounded-lg border border-dashed border-(--border-color) text-xs text-(--text-muted) hover:border-(--accent)/40 hover:text-(--accent) transition-all cursor-pointer"
                                >
                                  {t.projects.myStylesAdd}
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="mt-3">
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className="flex-1 h-px bg-(--border-color)" />
                                <span className="text-xs text-(--text-muted) font-medium">{t.projects.myStyles}</span>
                                <div className="flex-1 h-px bg-(--border-color)" />
                              </div>
                              <button
                                onClick={() => openMyStyleModal()}
                                className="w-full px-2 py-1.5 rounded-lg border border-dashed border-(--border-color) text-xs text-(--text-muted) hover:border-(--accent)/40 hover:text-(--accent) transition-all cursor-pointer"
                              >
                                {t.projects.myStylesAdd}
                              </button>
                            </div>
                          );
                        })()}

                        {/* 自定义按钮 */}
                        <div className="mt-1.5">
                          <button
                            onClick={() => handleSelectVisualStyle('custom')}
                            className={`w-full px-2 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                              formData.visualStyle === 'custom'
                                ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_10px_var(--accent-glow)]'
                                : 'border-(--border-color) bg-(--bg-input) text-(--text-secondary) hover:border-(--accent)/30 hover:bg-(--accent)/5'
                            }`}
                          >
                            {t.projects.presets.custom}
                          </button>
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

                        {/* 头身比例选择器 - 仅动漫类显示 */}
                        {formData.styleCategory === 'anime' && (
                          <div className="mt-3">
                            <label className="text-xs text-(--text-secondary) font-medium mb-1.5 flex items-center gap-1">
                              {t.projects.bodyProportionLabel}
                              <span className="text-xs text-(--text-muted) font-normal">{t.projects.bodyProportionHint}</span>
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                              {(Object.keys(BODY_PROPORTION_PRESETS) as BodyProportionRatio[]).map((key) => {
                                const preset = BODY_PROPORTION_PRESETS[key];
                                return (
                                  <button
                                    key={key}
                                    onClick={() => setFormData({ ...formData, bodyProportionRatio: key })}
                                    className={`px-2 py-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                                      formData.bodyProportionRatio === key
                                        ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_10px_var(--accent-glow)]'
                                        : 'border-(--border-color) bg-(--bg-input) text-(--text-secondary) hover:border-(--accent)/30 hover:bg-(--accent)/5'
                                    }`}
                                  >
                                    <div className="text-xs font-semibold">{preset.name}</div>
                                    <div className="text-[10px] opacity-70 mt-0.5">{preset.description}</div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 右栏 - 项目设置 */}
                    <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1 min-h-0">
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
                        className="w-full bg-linear-to-r from-violet-500/20 to-purple-500/20 border border-violet-500/30 text-violet-600 dark:text-violet-300 font-medium hover:from-violet-500/30 hover:to-purple-500/30 transition-all cursor-pointer text-xs h-8"
                        startContent={aiSuggesting ? <Spinner size="sm" color="secondary" /> : <Sparkles className="w-3 h-3" />}
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
                        <label className="text-xs text-(--text-secondary) font-medium mb-1.5 block">{t.projects.statusLabel}</label>
                        <div className="flex gap-1.5">
                          {(['draft', 'in_progress', 'completed'] as const).map((status) => (
                            <button
                              key={status}
                              onClick={() => setFormData({ ...formData, status })}
                              className={`px-3 py-1 rounded-md border text-xs transition-all cursor-pointer ${
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
                        <label className="text-xs text-(--text-secondary) font-medium mb-1.5 flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-(--accent)" />
                          {t.projects.outputLanguageLabel}
                          <span className="text-[10px] text-(--text-muted) font-normal">{t.projects.outputLanguageHint}</span>
                        </label>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(t.projects.outputLanguages).map(([code, name]) => (
                            <button
                              key={code}
                              onClick={() => setFormData({ ...formData, outputLanguage: code })}
                              className={`px-2 py-1 rounded border text-[11px] font-medium transition-all cursor-pointer ${
                                formData.outputLanguage === code
                                  ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_6px_var(--accent-glow)]'
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

                      {/* 拍摄视角选择 */}
                      <div>
                        <label className="text-sm text-(--text-secondary) font-medium mb-1.5 flex items-center gap-1.5">
                          {t.projects.narrativePerspectiveLabel}
                          <span className="text-xs text-(--text-muted) font-normal">{t.projects.narrativePerspectiveHint}</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {([['first_person', t.projects.perspectiveFirstPerson, t.projects.perspectiveFirstPersonDesc], ['third_person', t.projects.perspectiveThirdPerson, t.projects.perspectiveThirdPersonDesc]] as const).map(([key, label, desc]) => (
                            <button
                              key={key}
                              onClick={() => setFormData({ ...formData, narrativePerspective: formData.narrativePerspective === key ? '' : key as any })}
                              className={`px-2.5 py-1.5 rounded-lg border text-xs transition-all cursor-pointer text-left ${
                                formData.narrativePerspective === key
                                  ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_10px_var(--accent-glow)]'
                                  : 'border-(--border-color) bg-(--bg-input) text-(--text-secondary) hover:border-(--accent)/30 hover:bg-(--accent)/5'
                              }`}
                            >
                              <span className="font-medium">{label}</span>
                              <span className="ml-1 opacity-70">{desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 画面参数设置 */}
                      <div className="space-y-2 p-2.5 rounded-lg border border-(--border-color) bg-(--bg-input)/50">
                        <p className="text-xs font-medium text-(--text-secondary)">画面参数（项目级锁定，分镜制作中不可更改）</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          <div>
                            <label className="text-xs text-(--text-muted) mb-1 block">图片画面比例</label>
                            <div className="flex flex-wrap gap-1">
                              {['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'].map((ratio) => (
                                <button
                                  key={ratio}
                                  onClick={() => setFormData({ ...formData, imageAspectRatio: formData.imageAspectRatio === ratio ? '' : ratio })}
                                  className={`px-2 py-0.5 rounded border text-[11px] transition-all cursor-pointer ${
                                    formData.imageAspectRatio === ratio
                                      ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_6px_var(--accent-glow)]'
                                      : 'border-(--border-color) bg-(--bg-input) text-(--text-muted) hover:border-(--accent)/30'
                                  }`}
                                >
                                  {ratio}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-(--text-muted) mb-1 block">图片分辨率</label>
                            <div className="flex flex-wrap gap-1">
                              {['720p', '1080p', '2K', '4K'].map((res) => (
                                <button
                                  key={res}
                                  onClick={() => setFormData({ ...formData, imageResolution: formData.imageResolution === res ? '' : res })}
                                  className={`px-2 py-0.5 rounded border text-[11px] transition-all cursor-pointer ${
                                    formData.imageResolution === res
                                      ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_6px_var(--accent-glow)]'
                                      : 'border-(--border-color) bg-(--bg-input) text-(--text-muted) hover:border-(--accent)/30'
                                  }`}
                                >
                                  {res}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-(--text-muted) mb-1 block">视频画面比例</label>
                            <div className="flex flex-wrap gap-1">
                              {['16:9', '9:16', '1:1'].map((ratio) => (
                                <button
                                  key={ratio}
                                  onClick={() => setFormData({ ...formData, videoAspectRatio: formData.videoAspectRatio === ratio ? '' : ratio })}
                                  className={`px-2 py-0.5 rounded border text-[11px] transition-all cursor-pointer ${
                                    formData.videoAspectRatio === ratio
                                      ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_6px_var(--accent-glow)]'
                                      : 'border-(--border-color) bg-(--bg-input) text-(--text-muted) hover:border-(--accent)/30'
                                  }`}
                                >
                                  {ratio}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-(--text-muted) mb-1 block">视频分辨率</label>
                            <div className="flex flex-wrap gap-1">
                              {['480p', '720p', '1080p'].map((res) => (
                                <button
                                  key={res}
                                  onClick={() => setFormData({ ...formData, videoResolution: formData.videoResolution === res ? '' : res })}
                                  className={`px-2 py-0.5 rounded border text-[11px] transition-all cursor-pointer ${
                                    formData.videoResolution === res
                                      ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_6px_var(--accent-glow)]'
                                      : 'border-(--border-color) bg-(--bg-input) text-(--text-muted) hover:border-(--accent)/30'
                                  }`}
                                >
                                  {res}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
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

        {/* 我的风格编辑弹窗 */}
        <Modal
          isOpen={myStylesDisclosure.isOpen}
          onOpenChange={myStylesDisclosure.onOpenChange}
          size="md"
          classNames={{
            backdrop: 'bg-black/60 backdrop-blur-sm',
            base: 'border border-(--border-color) shadow-2xl',
            header: 'border-b border-(--border-color)',
            footer: 'border-t border-(--border-color)',
            body: 'bg-transparent',
            closeButton: 'text-(--text-muted) hover:text-(--text-primary)',
          }}
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="text-(--text-primary) font-bold">
                  {editingMyStyle ? t.projects.myStylesEdit : t.projects.myStylesAdd}
                </ModalHeader>
                <ModalBody className="space-y-3">
                  <div>
                    <label className="text-xs text-(--text-secondary) font-medium mb-1 block">{t.projects.myStylesNameLabel}</label>
                    <Input
                      size="sm"
                      placeholder={t.projects.myStylesNamePlaceholder}
                      value={myStyleForm.name}
                      onValueChange={(val) => setMyStyleForm({ ...myStyleForm, name: val })}
                      classNames={{
                        input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted) text-xs",
                        inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 h-8 min-h-8"
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-(--text-secondary) font-medium mb-1 block">{t.projects.myStylesPromptLabel}</label>
                    <Textarea
                      size="sm"
                      placeholder={t.projects.myStylesPromptPlaceholder}
                      value={myStyleForm.prompt}
                      onValueChange={(val) => setMyStyleForm({ ...myStyleForm, prompt: val })}
                      minRows={3}
                      classNames={{
                        input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted) text-xs",
                        inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30"
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-(--text-secondary) font-medium mb-1 block">{t.projects.myStylesCategoryLabel}</label>
                    <div className="flex gap-2">
                      {(['anime', 'live_action'] as const).map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setMyStyleForm({ ...myStyleForm, style_category: cat })}
                          className={`flex-1 px-3 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                            myStyleForm.style_category === cat
                              ? 'bg-(--accent)/15 border-(--accent)/40 text-(--accent) shadow-[0_0_10px_var(--accent-glow)]'
                              : 'border-(--border-color) bg-(--bg-input) text-(--text-secondary) hover:border-(--accent)/30 hover:bg-(--accent)/5'
                          }`}
                        >
                          {cat === 'live_action' ? t.projects.categoryLiveAction : t.projects.categoryAnime}
                        </button>
                      ))}
                    </div>
                  </div>
                </ModalBody>
                <ModalFooter className="gap-2">
                  <Button variant="flat" onPress={onClose} className="bg-white/5 text-(--text-secondary) font-semibold hover:bg-white/10 border border-white/10 cursor-pointer">
                    {t.common.cancel}
                  </Button>
                  <Button className="pro-btn-primary" onPress={handleSaveMyStyle}>
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

        {/* 封面裁剪弹窗 */}
        <ImageCropperModal
          isOpen={cropperOpen}
          imageUrl={cropperSource}
          defaultAspect="16:9"
          onClose={() => setCropperOpen(false)}
          onCropped={handleCropped}
        />
      </div>
    </div>
  );
};

export default Projects;
