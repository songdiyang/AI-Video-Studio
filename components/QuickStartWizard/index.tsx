import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input, Textarea, Spinner } from '@heroui/react';
import { 
  X, ChevronLeft, ChevronRight, Check, 
  Film, Video, BookImage, Sparkles, Rocket, FileText
} from 'lucide-react';
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

type CreationType = 'comic' | 'shortVideo' | 'manga';

const CREATION_TYPES: { type: CreationType; icon: React.ElementType; color: string }[] = [
  { type: 'comic', icon: Film, color: 'from-violet-500 to-purple-600' },
  { type: 'shortVideo', icon: Video, color: 'from-cyan-500 to-blue-600' },
  { type: 'manga', icon: BookImage, color: 'from-orange-500 to-red-600' },
];

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
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: projectName.trim(),
          description: projectDesc.trim(),
          type: selectedType === 'shortVideo' ? 'video' : 'comic',
          template_id: selectedTemplate !== 'scratch' ? selectedTemplate : undefined,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setNewProjectId(data.id || data.project?.id);
        setCreated(true);
      }
    } catch {
      // 静默失败
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
      case 3: return created;
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

          {/* 进度条 */}
          <div className="px-8 pt-6">
            <div className="flex items-center gap-2">
              {[0, 1, 2, 3].map((step) => (
                <React.Fragment key={step}>
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                      step < currentStep
                        ? 'bg-[var(--accent)] text-white'
                        : step === currentStep
                        ? 'bg-[var(--accent)]/20 text-[var(--accent)] border-2 border-[var(--accent)]'
                        : 'bg-[var(--bg-input)] text-[var(--text-muted)]'
                    }`}
                  >
                    {step < currentStep ? <Check className="w-4 h-4" /> : step + 1}
                  </div>
                  {step < 3 && (
                    <div
                      className={`flex-1 h-0.5 transition-colors ${
                        step < currentStep ? 'bg-[var(--accent)]' : 'bg-[var(--border-color)]'
                      }`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* 标题 */}
          <div className="px-8 pt-4 pb-2">
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {t.quickStart?.title || '快速开始'}
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {t.quickStart?.subtitle || '几步即可开始创作'}
            </p>
          </div>

          {/* 步骤内容 */}
          <div className="px-8 py-6 min-h-[320px]">
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
                  <div className="space-y-4">
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {t.quickStart?.step1Title || '选择创作类型'}
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {t.quickStart?.step1Desc || '选择您想创作的内容类型'}
                    </p>
                    <div className="grid grid-cols-3 gap-4 pt-4">
                      {CREATION_TYPES.map(({ type, icon: Icon, color }) => (
                        <motion.button
                          key={type}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setSelectedType(type)}
                          className={`relative p-6 rounded-xl border-2 transition-all ${
                            selectedType === type
                              ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                              : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50'
                          }`}
                        >
                          <div className={`w-12 h-12 mx-auto rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-3`}>
                            <Icon className="w-6 h-6 text-white" />
                          </div>
                          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                            {t.quickStart?.types?.[type] || type}
                          </p>
                          {selectedType === type && (
                            <motion.div
                              layoutId="type-check"
                              className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center"
                            >
                              <Check className="w-3 h-3 text-white" />
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
