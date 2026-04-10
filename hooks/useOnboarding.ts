import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'nanostory-onboarding-complete';

export interface OnboardingStep {
  target: string;        // CSS 选择器，定位目标元素
  title: string;         // 步骤标题
  description: string;   // 步骤描述
  placement: 'top' | 'bottom' | 'left' | 'right';
}

export function useOnboarding(steps: OnboardingStep[], disabled: boolean = false) {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  
  // 检查是否首次访问（localStorage中无完成标记）
  const isComplete = (): boolean => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  };
  
  // 自动启动（首次访问时）
  useEffect(() => {
    if (disabled) return;
    if (!isComplete()) {
      // 延迟启动，等待页面渲染完成
      const timer = setTimeout(() => setIsActive(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [disabled]);
  
  const completeOnboarding = useCallback(() => {
    setIsActive(false);
    setCurrentStepIndex(0);
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
  }, []);
  
  const nextStep = useCallback(() => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      // 完成引导
      completeOnboarding();
    }
  }, [currentStepIndex, steps.length, completeOnboarding]);
  
  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [currentStepIndex]);
  
  const skip = useCallback(() => {
    completeOnboarding();
  }, [completeOnboarding]);
  
  const resetOnboarding = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setCurrentStepIndex(0);
    setIsActive(true);
  }, []);
  
  const currentStep = steps[currentStepIndex] || null;
  
  return {
    isActive,
    currentStep,
    currentStepIndex,
    totalSteps: steps.length,
    nextStep,
    prevStep,
    skip,
    resetOnboarding,
  };
}
