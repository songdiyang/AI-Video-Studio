import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { OnboardingStep } from '../../hooks/useOnboarding';

interface OnboardingOverlayProps {
  isActive: boolean;
  currentStep: OnboardingStep | null;
  currentStepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8; // 高亮区域额外内边距
const ARROW_SIZE = 8;

const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({
  isActive,
  currentStep,
  currentStepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}) => {
  const { t } = useLanguage();
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [bubblePosition, setBubblePosition] = useState({ top: 0, left: 0 });
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // 计算目标元素位置
  const calculateTargetRect = useCallback(() => {
    if (!currentStep?.target) return null;
    
    const element = document.querySelector(currentStep.target);
    if (!element) return null;
    
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top - PADDING,
      left: rect.left - PADDING,
      width: rect.width + PADDING * 2,
      height: rect.height + PADDING * 2,
    };
  }, [currentStep]);

  // 计算气泡位置
  const calculateBubblePosition = useCallback((rect: TargetRect | null, placement: OnboardingStep['placement']) => {
    if (!rect || !bubbleRef.current) return { top: 0, left: 0 };
    
    const bubbleRect = bubbleRef.current.getBoundingClientRect();
    const gap = 16; // 气泡与目标的间距
    
    let top = 0;
    let left = 0;
    
    switch (placement) {
      case 'right':
        top = rect.top + rect.height / 2 - bubbleRect.height / 2;
        left = rect.left + rect.width + gap;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - bubbleRect.height / 2;
        left = rect.left - bubbleRect.width - gap;
        break;
      case 'top':
        top = rect.top - bubbleRect.height - gap;
        left = rect.left + rect.width / 2 - bubbleRect.width / 2;
        break;
      case 'bottom':
        top = rect.top + rect.height + gap;
        left = rect.left + rect.width / 2 - bubbleRect.width / 2;
        break;
    }
    
    // 边界检测
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (left < 16) left = 16;
    if (left + bubbleRect.width > viewportWidth - 16) {
      left = viewportWidth - bubbleRect.width - 16;
    }
    if (top < 16) top = 16;
    if (top + bubbleRect.height > viewportHeight - 16) {
      top = viewportHeight - bubbleRect.height - 16;
    }
    
    return { top, left };
  }, []);

  // 监听目标元素位置变化
  useEffect(() => {
    if (!isActive || !currentStep) return;

    const updatePositions = () => {
      const rect = calculateTargetRect();
      setTargetRect(rect);
      if (rect && bubbleRef.current) {
        const pos = calculateBubblePosition(rect, currentStep.placement);
        setBubblePosition(pos);
      }
    };

    // 初始计算
    setIsAnimating(true);
    const initTimer = setTimeout(() => {
      updatePositions();
      setIsAnimating(false);
    }, 50);

    // 监听窗口变化
    window.addEventListener('resize', updatePositions);
    window.addEventListener('scroll', updatePositions, true);

    // ResizeObserver 监听目标元素
    const target = currentStep.target;
    const element = target ? document.querySelector(target) : null;
    let resizeObserver: ResizeObserver | null = null;
    if (element) {
      resizeObserver = new ResizeObserver(updatePositions);
      resizeObserver.observe(element);
    }

    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('resize', updatePositions);
      window.removeEventListener('scroll', updatePositions, true);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [isActive, currentStep, calculateTargetRect, calculateBubblePosition]);

  // 步骤切换时重新计算
  useEffect(() => {
    if (!isActive || !currentStep) return;
    
    setIsAnimating(true);
    const timer = setTimeout(() => {
      const rect = calculateTargetRect();
      setTargetRect(rect);
      if (rect && bubbleRef.current) {
        const pos = calculateBubblePosition(rect, currentStep.placement);
        setBubblePosition(pos);
      }
      setIsAnimating(false);
    }, 100);
    
    return () => clearTimeout(timer);
  }, [currentStepIndex, isActive, currentStep, calculateTargetRect, calculateBubblePosition]);

  // ESC 键跳过
  useEffect(() => {
    if (!isActive) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        onNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onPrev();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onSkip, onNext, onPrev]);

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;
  // 无 target 的步骤（欢迎/结束）居中展示，不挖孔、不带箭头
  const isCentered = !currentStep?.target;

  // 获取箭头样式
  const getArrowStyle = () => {
    if (!currentStep || !targetRect) return {};
    
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      width: 0,
      height: 0,
      borderStyle: 'solid',
    };
    
    switch (currentStep.placement) {
      case 'right':
        return {
          ...baseStyle,
          left: -ARROW_SIZE,
          top: '50%',
          transform: 'translateY(-50%)',
          borderWidth: `${ARROW_SIZE}px ${ARROW_SIZE}px ${ARROW_SIZE}px 0`,
          borderColor: 'transparent var(--bg-card) transparent transparent',
        };
      case 'left':
        return {
          ...baseStyle,
          right: -ARROW_SIZE,
          top: '50%',
          transform: 'translateY(-50%)',
          borderWidth: `${ARROW_SIZE}px 0 ${ARROW_SIZE}px ${ARROW_SIZE}px`,
          borderColor: 'transparent transparent transparent var(--bg-card)',
        };
      case 'top':
        return {
          ...baseStyle,
          bottom: -ARROW_SIZE,
          left: '50%',
          transform: 'translateX(-50%)',
          borderWidth: `${ARROW_SIZE}px ${ARROW_SIZE}px 0 ${ARROW_SIZE}px`,
          borderColor: 'var(--bg-card) transparent transparent transparent',
        };
      case 'bottom':
        return {
          ...baseStyle,
          top: -ARROW_SIZE,
          left: '50%',
          transform: 'translateX(-50%)',
          borderWidth: `0 ${ARROW_SIZE}px ${ARROW_SIZE}px ${ARROW_SIZE}px`,
          borderColor: 'transparent transparent var(--bg-card) transparent',
        };
      default:
        return baseStyle;
    }
  };

  // 卡片主体（居中与锚定两种形态共用）
  const renderCard = (centered: boolean) => (
    <div
      className="relative rounded-2xl shadow-2xl overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* 箭头（仅锚定步骤） */}
      {!centered && <div style={getArrowStyle()} />}

      {/* 头部 */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-1">
        <div
          className="p-2 rounded-xl shrink-0"
          style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 16%, transparent)' }}
        >
          <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        </div>
        <h3
          className="flex-1 font-semibold text-[15px] leading-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {currentStep?.title}
        </h3>
        <button
          onClick={onSkip}
          className="p-1.5 -mr-1 rounded-lg transition-colors hover:bg-white/10 shrink-0"
          style={{ color: 'var(--text-muted)' }}
          aria-label={t.onboarding?.skip || '跳过'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 内容 */}
      <div className="px-5 py-3">
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          {currentStep?.description}
        </p>
      </div>

      {/* 底部控制区 */}
      <div
        className="px-5 py-3.5 flex items-center justify-between gap-3 border-t"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-app)' }}
      >
        {/* 进度指示器 */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, index) => (
              <div
                key={index}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: index === currentStepIndex ? 18 : 6,
                  backgroundColor: index === currentStepIndex ? 'var(--accent)' : 'var(--text-muted)',
                  opacity: index === currentStepIndex ? 1 : 0.35,
                }}
              />
            ))}
          </div>
          <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {currentStepIndex + 1} / {totalSteps}
          </span>
        </div>

        {/* 控制按钮 */}
        <div className="flex items-center gap-2">
          {!isFirstStep && (
            <button
              onClick={onPrev}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10"
              style={{ color: 'var(--text-secondary)' }}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              {t.onboarding?.prev || '上一步'}
            </button>
          )}
          <button
            onClick={onNext}
            className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
            style={{ backgroundColor: 'var(--accent)', color: 'white' }}
          >
            {isLastStep ? (t.onboarding?.finish || '开始使用') : (t.onboarding?.next || '下一步')}
            {!isLastStep && <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {isActive && currentStep && (
        <>
          {/* SVG 遮罩层（居中步骤 targetRect 为 null → 整屏变暗不挖孔） */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[400] pointer-events-auto"
            onClick={isCentered ? undefined : onSkip}
          >
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <mask id="spotlight-mask">
                  <rect x="0" y="0" width="100%" height="100%" fill="white" />
                  {targetRect && (
                    <motion.rect
                      initial={{ opacity: 0 }}
                      animate={{
                        x: targetRect.left,
                        y: targetRect.top,
                        width: targetRect.width,
                        height: targetRect.height,
                        opacity: 1,
                      }}
                      transition={{ duration: 0.4, ease: 'easeInOut' }}
                      rx="12"
                      ry="12"
                      fill="black"
                    />
                  )}
                </mask>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              <rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                fill="rgba(0,0,0,0.72)"
                mask="url(#spotlight-mask)"
              />

              {targetRect && (
                <motion.rect
                  initial={{ opacity: 0 }}
                  animate={{
                    x: targetRect.left,
                    y: targetRect.top,
                    width: targetRect.width,
                    height: targetRect.height,
                    opacity: 1,
                  }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                  rx="12"
                  ry="12"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  filter="url(#glow)"
                  className="pointer-events-none"
                />
              )}
            </svg>
          </motion.div>

          {/* 引导卡片 */}
          <AnimatePresence mode="wait">
            {isCentered ? (
              <motion.div
                key={`center-${currentStepIndex}`}
                initial={{ opacity: 0, scale: 0.94, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 10 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="fixed inset-0 z-[401] flex items-center justify-center p-4 pointer-events-none"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="pointer-events-auto w-full max-w-md">
                  {renderCard(true)}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={`tip-${currentStepIndex}`}
                ref={bubbleRef}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{
                  opacity: isAnimating ? 0 : 1,
                  scale: isAnimating ? 0.9 : 1,
                  top: bubblePosition.top,
                  left: bubblePosition.left,
                }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="fixed z-[401] w-80 pointer-events-auto"
                style={{ top: bubblePosition.top, left: bubblePosition.left }}
                onClick={(e) => e.stopPropagation()}
              >
                {renderCard(false)}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
};

export default OnboardingOverlay;
