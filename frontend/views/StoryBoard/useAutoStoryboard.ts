import { useState } from 'react';
import { useStoryboardGeneration, GenerationProgress } from './hooks/useStoryboardGeneration';
import { StoryboardScene } from './useSceneManager';
import { getAuthToken } from '../../services/auth';
import { GenerateMode } from './AutoStoryboardModal';

interface UseAutoStoryboardOptions {
  scriptId: number | null;
  projectId: number | null;
  isActive: boolean; // 是否在分镜页面
  hasExistingScenes: boolean;
  textModel: string;
  onScenesGenerated: (scenes: StoryboardScene[]) => void;
  onError?: (message: string) => void;
  loadStoryboards?: (scriptId: number) => Promise<void>; // 增量加载回调
  useSceneMode?: boolean; // 是否使用按场景生成模式
  /** 弱绑定参考剧本正文（仅作为 AI 生成 prompt 的补充上下文） */
  referenceScriptContent?: string | null;
  /** 弱绑定参考剧本标题 */
  referenceScriptTitle?: string | null;
}

export function useAutoStoryboard({
  scriptId,
  projectId,
  isActive,
  hasExistingScenes,
  textModel,
  onScenesGenerated,
  onError,
  loadStoryboards,
  useSceneMode = true,
  referenceScriptContent,
  referenceScriptTitle
}: UseAutoStoryboardOptions) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // 不再提醒（预留，目前仅本地 state，不持久化）
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // 使用分镜生成 hook
  const { isGenerating, startGeneration, progress, job } = useStoryboardGeneration({
    scriptId,
    projectId,
    isActive,
    onComplete: async () => {
      // 工作流完成后，优先使用增量加载，避免整页刷新
      if (loadStoryboards && scriptId) {
        await loadStoryboards(scriptId);
      } else {
        // 回退：刷新页面
        window.location.reload();
      }
    }
  });

  // 抽出公共的启动参数（参考剧本 + 标题）
  const buildReferenceOptions = () => ({
    referenceScriptContent: referenceScriptContent || undefined,
    referenceScriptTitle: referenceScriptTitle || undefined
  });

  // 点击自动分镜按钮
  const handleAutoGenerateClick = () => {
    if (!scriptId) {
      onError?.('智能分镜需要绑定剧本作为参考');
      return;
    }
    if (!textModel) {
      onError?.('请先点击右上角「AI 模型」按钮选择文本模型');
      return;
    }

    if (!hasExistingScenes) {
      // 无现有分镜，直接生成（skip 语义对空分镜等价于 overwrite，不影响）
      startGeneration(textModel, useSceneMode, false, {
        conflictStrategy: 'skip',
        ...buildReferenceOptions()
      });
      return;
    }

    // 有现有分镜，弹出确认弹窗让用户选择
    setShowConfirmModal(true);
  };

  // 清理旧数据后启动生成（完全覆盖模式）
  const cleanAndGenerate = async () => {
    if (!scriptId) return;
    try {
      const token = getAuthToken();
      const res = await fetch('/api/storyboards/clean-before-regenerate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ scriptId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || '清理失败');

      console.log('[AutoStoryboard] 清理完成:', data);
      if (data.deletedStoryboards > 0 || data.deletedCharacters > 0 || data.deletedScenes > 0) {
        console.log(`[AutoStoryboard] 已删除: ${data.deletedStoryboards} 个分镜, ${data.deletedCharacters} 个角色, ${data.deletedScenes} 个场景`);
      }
    } catch (err: any) {
      console.error('[AutoStoryboard] 清理失败:', err);
      onError?.('清理旧数据失败: ' + err.message);
      return;
    }
    startGeneration(textModel, useSceneMode, false, {
      conflictStrategy: 'overwrite',
      ...buildReferenceOptions()
    });
  };

  // 确认弹窗回调 - 根据模式执行
  const handleConfirmGenerate = (mode: GenerateMode) => {
    setShowConfirmModal(false);
    if (mode === 'overwrite') {
      cleanAndGenerate();
      return;
    }
    // skip / smart 都走追加模式 + 对应去重策略
    startGeneration(textModel, useSceneMode, true, {
      conflictStrategy: mode,
      appendMode: true,
      ...buildReferenceOptions()
    });
  };

  return {
    isGenerating,
    showConfirmModal,
    setShowConfirmModal,
    handleAutoGenerateClick,
    handleConfirmGenerate,
    dontShowAgain,
    setDontShowAgain,
    progress,
    job
  };
}

