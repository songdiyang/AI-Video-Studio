import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input, Textarea, Spinner } from '@heroui/react';
import { 
  X, ChevronLeft, ChevronRight, Check, 
  Film, Video, BookImage, BookOpen, Sparkles, Rocket, FileText
} from 'lucide-react';
import { ProjectType, PROJECT_TYPES } from '../../types/projectTypes';
import { useLanguage } from '../../contexts/LanguageContext';
import { getAuthToken } from '../../services/auth';

interface QuickStartWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (projectId: number) => void;
}

interface Template {
  id: number;
  name: string;
  thumbnail?: string;
  used_count?: number;
}

// 使用新的项目类型定义
type CreationType = ProjectType;

// 图标映射
const ICON_MAP: Record<string, React.ElementType> = {
  Film,
  Video,
  BookImage,
  BookOpen,
};

// 创作类型配置，使用新的项目类型定义
const CREATION_TYPES: { type: CreationType; icon: React.ElementType; color: string; desc: string }[] = [
  { type: 'comic_drama', icon: Film, color: PROJECT_TYPES.comic_drama.color, desc: '制作精彩的漫剧短片' },
  { type: 'short_video', icon: Video, color: PROJECT_TYPES.short_video.color, desc: '创作吸睛的短视频内容' },
  { type: 'manga', icon: BookImage, color: PROJECT_TYPES.manga.color, desc: '绘制独特的漫画作品' },
  { type: 'novel', icon: BookOpen, color: PROJECT_TYPES.novel.color, desc: '书写精彩的小说故事' },
];

// 步骤名称配置
const STEP_NAMES = ['类型', '模板', '信息', '完成'];

const QuickStartWizard: React.FC<QuickStartWizardProps> = ({ isOpen, onClose, onComplete }) => {
  const { t } = useLanguage();
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);
  
  // Step 1: 创作类型
  const [selectedType, setSelectedType] = useState<CreationType | null>(null);
  
  // Step 2: 模板
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<number | 'scratch'>('scratch');
  
  // Step 3: 项目信息
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  
  // Step 4: 创建中
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [newProjectId, setNewProjectId] = useState<number | null>(null);

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setSelectedType(null);
      setTemplates([]);
      setSelectedTemplate('scratch');
      setProjectName('');
      setProjectDesc('');
      setCreating(false);
      setCreated(false);
      setNewProjectId(null);
    }
  }, [isOpen]);

  // 加载模板
  const loadTemplates = useCallback(async (category: string) => {
    setLoadingTemplates(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/templates?category=${category}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      } else {
        setTemplates([]);
      }
    } catch {
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  // 当选择类型后加载模板
  useEffect(() => {
    if (selectedType && currentStep === 1) {
      loadTemplates(selectedType);
    }
  }, [selectedType, currentStep, loadTemplates]);

  // 创建项目
  const createProject = async () => {
    if (!projectName.trim()) return;
    
    setCreating(true);
    try {
      const token = getAuthToken();
      
      // 如果选择模板，使用模板创建接口
      if (selectedTemplate !== 'scratch') {
        const res = await fetch(`/api/templates/${selectedTemplate}/use`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        
        if (res.ok) {
          const data = await res.json();
          const pid = data.projectId || data.id;
          setNewProjectId(pid);
          setCreated(true);
          // 创建成功后自动关闭向导并跳转
          setTimeout(() => onComplete(pid), 800);
        }
      } else {
        // 从零开始创建项目
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            name: projectName.trim(),
            description: projectDesc.trim(),
            type: selectedType,
          }),
        });
        
        if (res.ok) {
          const data = await res.json();
          const pid = data.id || data.project?.id;
          setNewProjectId(pid);
          setCreated(true);
          // 创建成功后自动关闭向导并跳转
          setTimeout(() => onComplete(pid), 800);
        }
      }
    } catch (err) {
      console.error('[CreateProject]', err);
    } finally {
      setCreating(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 0 && !selectedType) return;
    if (currentStep === 2 && !projectName.trim()) return;
    
    if (currentStep === 3) {
      if (created && newProjectId) {
        onComplete(newProjectId);
      } else if (!creating && !created) {
        createProject();
      }
      return;
    }
    
    setDirection(1);
    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  const handlePrev = () => {
    if (currentStep === 0) return;
    setDirection(-1);
    setCurrentStep(prev => prev - 1);
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 0: return !!selectedType;
      case 1: return true;
      case 2: return !!projectName.trim();
      case 3: return !creating; // 第3步：只要不在创建中就可以点击
      default: return false;
    }
  };

  const stepVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 100 : -100,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -100 : 100,
      opacity: 0,
    }),
  };

  // ESC 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
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

        {/* 主容器 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative w-full max-w-2xl mx-4 rounded-2xl overflow-hidden shadow-2xl"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-color)',
          }}
        >
          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg z-10 transition-colors hover:bg-white/10"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>

          {/* 进度条 - 增强版 */}
          <div className="px-8 pt-6 pb-2">
            <div className="flex items-center">
              {[0, 1, 2, 3].map((step) => (
                <React.Fragment key={step}>
                  <div className="flex flex-col items-center">
                    <motion.div
                      initial={false}
                      animate={{
                        scale: step === currentStep ? 1.1 : 1,
                        boxShadow: step === currentStep ? '0 0 20px var(--accent-glow)' : 'none'
                      }}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                        step < currentStep
                          ? 'bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] text-white shadow-lg'
                          : step === currentStep
                          ? 'bg-[var(--accent)]/20 text-[var(--accent)] border-2 border-[var(--accent)] ring-4 ring-[var(--accent)]/20'
                          : 'bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-color)]'
                      }`}
                    >
                      {step < currentStep ? <Check className="w-5 h-5" /> : step + 1}
                    </motion.div>
                    <span className={`text-xs mt-1.5 font-medium transition-colors ${
                      step <= currentStep ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                    }`}>
                      {STEP_NAMES[step]}
                    </span>
                  </div>
                  {step < 3 && (
                    <div className="flex-1 mx-2 relative h-0.5">
                      <div className="absolute inset-0 bg-[var(--border-color)] rounded-full" />
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: step < currentStep ? '100%' : '0%' }}
                        transition={{ duration: 0.3 }}
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] rounded-full"
                      />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* 标题 - 紧凑版 */}
          <div className="px-8 pt-4 pb-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center shadow-lg">
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {currentStep === 0 ? (t.quickStart?.step1Title || '选择创作类型') :
                   currentStep === 1 ? (t.quickStart?.step2Title || '选择模板') :
                   currentStep === 2 ? (t.quickStart?.step3Title || '项目信息') :
                   (t.quickStart?.step4Title || '开始创作！')}
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {currentStep === 0 ? (t.quickStart?.step1Desc || '选择您想创作的内容类型') :
                   currentStep === 1 ? (t.quickStart?.step2Desc || '从模板开始或从零创建') :
                   currentStep === 2 ? (t.quickStart?.step3Desc || '为您的作品起个名字') :
                   (t.quickStart?.step4Desc || '一切准备就绪')}
                </p>
              </div>
            </div>
          </div>

          {/* 步骤内容 */}
          <div className="px-8 py-4 min-h-[300px]">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentStep}
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                {/* Step 1: 选择创作类型 */}
                {currentStep === 0 && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      {CREATION_TYPES.map(({ type, icon: Icon, color, desc }) => (
                        <motion.button
                          key={type}
                          whileHover={{ scale: 1.02, y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setSelectedType(type)}
                          className={`relative p-5 rounded-2xl border-2 transition-all text-left group ${
                            selectedType === type
                              ? 'border-[var(--accent)] bg-gradient-to-br from-[var(--accent)]/15 to-[var(--accent)]/5 shadow-lg shadow-[var(--accent)]/10'
                              : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent)]/40 hover:shadow-md'
                          }`}
                        >
                          {/* 背景装饰 */}
                          <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl transition-opacity ${
                            selectedType === type ? 'opacity-30' : 'opacity-0 group-hover:opacity-15'
                          }`} style={{ background: `linear-gradient(135deg, var(--accent), transparent)` }} />
                          
                          <div className="relative flex items-start gap-4">
                            <div className={`flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg transition-transform group-hover:scale-105`}>
                              <Icon className="w-7 h-7 text-white" />
                            </div>
                            <div className="flex-1 min-w-0 pt-1">
                              <p className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                                {t.quickStart?.types?.[type] || type}
                              </p>
                              <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                                {desc}
                              </p>
                            </div>
                          </div>
                          
                          {/* 选中标记 */}
                          {selectedType === type && (
                            <motion.div
                              layoutId="type-check"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute top-3 right-3 w-6 h-6 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center shadow-lg"
                            >
                              <Check className="w-3.5 h-3.5 text-white" />
                            </motion.div>
                          )}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 2: 选择模板 */}
                {currentStep === 1 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {t.quickStart?.step2Title || '选择模板'}
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {t.quickStart?.step2Desc || '从模板开始或从零创建'}
                    </p>
                    
                    {loadingTemplates ? (
                      <div className="flex items-center justify-center py-12">
                        <Spinner size="lg" color="primary" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-3 pt-4 max-h-[200px] overflow-y-auto">
                        {/* 从零开始选项 */}
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setSelectedTemplate('scratch')}
                          className={`p-4 rounded-xl border-2 transition-all ${
                            selectedTemplate === 'scratch'
                              ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                              : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50'
                          }`}
                        >
                          <div className="w-10 h-10 mx-auto rounded-lg bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center mb-2">
                            <FileText className="w-5 h-5 text-white" />
                          </div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {t.quickStart?.fromScratch || '从零开始'}
                          </p>
                        </motion.button>

                        {/* 模板列表 */}
                        {templates.map((template) => (
                          <motion.button
                            key={template.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setSelectedTemplate(template.id)}
                            className={`p-4 rounded-xl border-2 transition-all ${
                              selectedTemplate === template.id
                                ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                                : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50'
                            }`}
                          >
                            {template.thumbnail ? (
                              <img
                                src={template.thumbnail}
                                alt={template.name}
                                className="w-10 h-10 mx-auto rounded-lg object-cover mb-2"
                              />
                            ) : (
                              <div className="w-10 h-10 mx-auto rounded-lg bg-[var(--bg-input)] flex items-center justify-center mb-2">
                                <Sparkles className="w-5 h-5 text-[var(--accent)]" />
                              </div>
                            )}
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                              {template.name}
                            </p>
                            {template.used_count !== undefined && (
                              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                {template.used_count} 次使用
                              </p>
                            )}
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3: 项目信息 */}
                {currentStep === 2 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {t.quickStart?.step3Title || '项目信息'}
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {t.quickStart?.step3Desc || '为您的作品起个名字'}
                    </p>
                    <div className="space-y-4 pt-4">
                      <Input
                        label={t.quickStart?.projectName || '项目名称'}
                        placeholder={t.projects?.namePlaceholder || '输入项目名称'}
                        value={projectName}
                        onValueChange={setProjectName}
                        isRequired
                        classNames={{
                          input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                          label: "text-[var(--text-secondary)] font-medium",
                          inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
                        }}
                      />
                      <Textarea
                        label={t.quickStart?.projectDesc || '项目描述'}
                        placeholder={t.projects?.descPlaceholder || '描述你的项目内容...'}
                        value={projectDesc}
                        onValueChange={setProjectDesc}
                        minRows={3}
                        classNames={{
                          input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                          label: "text-[var(--text-secondary)] font-medium",
                          inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Step 4: 完成 */}
                {currentStep === 3 && (
                  <div className="flex flex-col items-center justify-center py-8">
                    {creating ? (
                      <>
                        <Spinner size="lg" color="primary" />
                        <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                          {t.common?.loading || '加载中...'}
                        </p>
                      </>
                    ) : created ? (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-center"
                      >
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.1 }}
                          className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-4"
                        >
                          <Check className="w-10 h-10 text-white" />
                        </motion.div>
                        <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                          {t.quickStart?.step4Title || '开始创作！'}
                        </h3>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          {t.quickStart?.step4Desc || '一切准备就绪'}
                        </p>
                      </motion.div>
                    ) : (
                      <div className="text-center">
                        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center mb-4 opacity-50">
                          <Rocket className="w-10 h-10 text-white" />
                        </div>
                        <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                          {t.quickStart?.step4Title || '开始创作！'}
                        </h3>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          {t.quickStart?.step4Desc || '一切准备就绪'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 底部按钮 */}
          <div 
            className="px-8 py-4 flex items-center justify-between border-t"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
          >
            <button
              onClick={handlePrev}
              disabled={currentStep === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                currentStep === 0
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-white/10'
              }`}
              style={{ color: 'var(--text-secondary)' }}
            >
              <ChevronLeft className="w-4 h-4" />
              {t.onboarding?.prev || '上一步'}
            </button>

            <button
              onClick={handleNext}
              disabled={!canGoNext() || (currentStep === 3 && creating)}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${
                canGoNext() && !(currentStep === 3 && creating)
                  ? 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] text-white shadow-lg hover:shadow-[var(--accent-glow)]'
                  : 'bg-[var(--bg-input)] text-[var(--text-muted)] cursor-not-allowed'
              }`}
            >
              {currentStep === 3 ? (
                created ? (
                  <>
                    {t.quickStart?.quickCreate || '快速创作'}
                    <Rocket className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    {t.quickStart?.createProject || '创建项目'}
                    <Sparkles className="w-4 h-4" />
                  </>
                )
              ) : (
                <>
                  {t.onboarding?.next || '下一步'}
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default QuickStartWizard;
