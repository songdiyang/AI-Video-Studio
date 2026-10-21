/**
 * 批量资源生成 Hook
 * 封装批量角色三视图生成和批量场景图片生成的通用逻辑
 * 供 StoryBoard 和 SimpleStoryBoard 复用
 */

import { useState, useCallback } from 'react';
import { getAuthToken } from '../../../services/auth';
import { useToast } from '../../../contexts/ToastContext';
import { useWorkflowRecovery } from './useWorkflowRecovery';

interface UseBatchResourceGenerationOptions {
  projectId: number | null;
  scriptId: number | null;
  imageModel: string;
  textModel: string;
  imageAspectRatio: string;
  imageResolution?: string;
  /** 角色生成完成后回调（如刷新角色列表） */
  onCharactersComplete?: () => void;
  /** 场景生成完成后回调（如刷新场景列表） */
  onScenesComplete?: () => void;
}

export function useBatchResourceGeneration({
  projectId,
  scriptId,
  imageModel,
  textModel,
  imageAspectRatio,
  imageResolution,
  onCharactersComplete,
  onScenesComplete,
}: UseBatchResourceGenerationOptions) {
  const [isSubmittingCharacterBatch, setIsSubmittingCharacterBatch] = useState(false);
  const [isSubmittingSceneBatch, setIsSubmittingSceneBatch] = useState(false);
  const { showToast } = useToast();

  const characterBatchRecovery = useWorkflowRecovery({
    projectId,
    workflowTypes: ['character_views_generation'],
    isActive: true,
    logPrefix: '[BatchResourceCharacter]',
  });

  const sceneBatchRecovery = useWorkflowRecovery({
    projectId,
    workflowTypes: ['scene_image_generation'],
    isActive: true,
    logPrefix: '[BatchResourceScene]',
  });

  /** 批量生成角色三视图 */
  const handleBatchCharacterGeneration = useCallback(async () => {
    if (isSubmittingCharacterBatch || characterBatchRecovery.isGenerating) {
      showToast('角色批量生成任务正在进行中', 'warning');
      return;
    }
    if (!projectId) {
      showToast('请先选择项目', 'warning');
      return;
    }
    if (!imageModel) {
      showToast('请先选择图像模型', 'warning');
      return;
    }
    if (!imageAspectRatio) {
      showToast('当前图片模型未配置可用长宽比', 'warning');
      return;
    }

    try {
      setIsSubmittingCharacterBatch(true);
      showToast('正在启动角色批量生成...', 'info');

      const token = getAuthToken();
      const charRes = await fetch(`/api/characters/project/${projectId}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });

      if (!charRes.ok) throw new Error('获取角色数据失败');

      const result = await charRes.json();
      const characters = result.characters || [];

      if (characters.length === 0) {
        showToast('没有找到角色数据', 'warning');
        return;
      }

      let startedCount = 0;
      let recoveredCount = 0;
      let failedCount = 0;

      for (const character of characters) {
        try {
          const response = await fetch(`/api/characters/${character.id}/generate-views`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              imageModel,
              textModel,
              style: '',
              aspectRatio: imageAspectRatio,
              resolution: imageResolution || undefined,
            }),
          });

          const data = await response.json().catch(() => ({}));
          if (response.ok) {
            startedCount += 1;
          } else if (response.status === 409 && data.jobId) {
            recoveredCount += 1;
          } else {
            failedCount += 1;
            console.error(`生成角色 ${character.name} 图片失败:`, data.message || response.statusText);
          }
        } catch (err) {
          failedCount += 1;
          console.error(`生成角色 ${character.name} 图片失败:`, err);
        }
      }

      await characterBatchRecovery.checkAndResume();
      onCharactersComplete?.();

      if (failedCount > 0) {
        console.error('角色批量生成存在失败项:', {
          total: characters.length,
          startedCount,
          recoveredCount,
          failedCount,
        });
      }
    } catch (error: any) {
      showToast('角色批量生成失败，请稍后重试', 'error');
      console.error('角色批量生成失败:', error);
    } finally {
      setIsSubmittingCharacterBatch(false);
    }
  }, [projectId, imageModel, textModel, imageAspectRatio, imageResolution, isSubmittingCharacterBatch, characterBatchRecovery, showToast, onCharactersComplete]);

  /** 批量生成场景图片 */
  const handleBatchSceneGeneration = useCallback(async () => {
    if (isSubmittingSceneBatch || sceneBatchRecovery.isGenerating) {
      showToast('场景批量生成任务正在进行中', 'warning');
      return;
    }
    if (!projectId) {
      showToast('请先选择项目', 'warning');
      return;
    }
    if (!imageModel) {
      showToast('请先选择图像模型', 'warning');
      return;
    }
    if (!imageAspectRatio) {
      showToast('当前图片模型未配置可用长宽比', 'warning');
      return;
    }

    try {
      setIsSubmittingSceneBatch(true);
      showToast('正在启动场景批量生成...', 'info');

      const token = getAuthToken();
      const sceneRes = await fetch(
        `/api/scenes/project/${projectId}${scriptId ? `?scriptId=${scriptId}` : ''}`,
        { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
      );

      if (!sceneRes.ok) throw new Error('获取场景数据失败');

      const result = await sceneRes.json();
      const scenesData = result.scenes || [];

      if (scenesData.length === 0) {
        showToast('没有找到场景数据', 'warning');
        return;
      }

      let startedCount = 0;
      let recoveredCount = 0;
      let failedCount = 0;

      for (const scene of scenesData) {
        try {
          const response = await fetch(`/api/scenes/${scene.id}/generate-image`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              imageModel,
              textModel,
              aspectRatio: imageAspectRatio,
              resolution: imageResolution || undefined,
            }),
          });

          const data = await response.json().catch(() => ({}));
          if (response.ok) {
            startedCount += 1;
          } else if (response.status === 409 && data.jobId) {
            recoveredCount += 1;
          } else {
            failedCount += 1;
            console.error(`生成场景 ${scene.name} 图片失败:`, data.message || response.statusText);
          }
        } catch (err) {
          failedCount += 1;
          console.error(`生成场景 ${scene.name} 图片失败:`, err);
        }
      }

      await sceneBatchRecovery.checkAndResume();
      onScenesComplete?.();

      if (failedCount > 0) {
        console.error('场景批量生成存在失败项:', {
          total: scenesData.length,
          startedCount,
          recoveredCount,
          failedCount,
        });
      }
    } catch (error: any) {
      showToast('场景批量生成失败，请稍后重试', 'error');
      console.error('场景批量生成失败:', error);
    } finally {
      setIsSubmittingSceneBatch(false);
    }
  }, [projectId, scriptId, imageModel, textModel, imageAspectRatio, imageResolution, isSubmittingSceneBatch, sceneBatchRecovery, showToast, onScenesComplete]);

  return {
    // 角色批量
    handleBatchCharacterGeneration,
    isSubmittingCharacterBatch,
    isCharacterBatchGenerating: characterBatchRecovery.isGenerating,
    // 场景批量
    handleBatchSceneGeneration,
    isSubmittingSceneBatch,
    isSceneBatchGenerating: sceneBatchRecovery.isGenerating,
    // recovery 实例（供 useWorkflowTargetMonitor 使用）
    characterBatchRecovery,
    sceneBatchRecovery,
  };
}
