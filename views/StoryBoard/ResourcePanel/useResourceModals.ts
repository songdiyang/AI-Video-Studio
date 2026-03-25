import { useState } from 'react';
import { useDisclosure } from '@heroui/react';
import { getAuthToken } from '../../../services/auth';
import { ResourceItem } from './types';

interface UseResourceModalsOptions {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
  onJobAccepted?: () => void | Promise<void>;
}

export const useResourceModals = (options: UseResourceModalsOptions = {}) => {
  const { onSuccess, onError, onJobAccepted } = options;
  const [selectedResource, setSelectedResource] = useState<ResourceItem | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrompts, setGeneratedPrompts] = useState<any>(null);
  const { isOpen: isViewsModalOpen, onOpen: openViewsModal, onOpenChange: onViewsModalChange } = useDisclosure();
  const { isOpen: isPreviewModalOpen, onOpen: openPreviewModal, onOpenChange: onPreviewModalChange } = useDisclosure();

  const handleGenerateViews = async (
    charName: string,
    imageModel: string,
    textModel: string,
    aspectRatio: string,
    characterId?: number
  ) => {
    // 如果是从角色卡片点击进来（没有 imageModel），先从数据库获取三视图数据
    if (!imageModel && !textModel && characterId) {
      try {
        const token = getAuthToken();
        
        // 从数据库获取角色的三视图数据
        const res = await fetch(`/api/characters/${characterId}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });

        if (res.ok) {
          const character = await res.json();
          console.log('[Generate Views] 角色数据:', character);
          
          // 设置角色数据，包含三视图 URL
          setSelectedResource({
            name: charName,
            frontViewUrl: character.front_view_url,
            sideViewUrl: character.side_view_url,
            backViewUrl: character.back_view_url,
            characterSheetUrl: character.character_sheet_url,
            generationStatus: character.generation_status
          });
        } else {
          // 获取失败，只设置名称
          setSelectedResource({ name: charName });
        }
      } catch (error) {
        console.error('[Generate Views] 获取角色数据失败:', error);
        setSelectedResource({ name: charName });
      }
      
      setGeneratedPrompts(null);
      openViewsModal();
      return;
    }

    // 如果是从弹窗内点击生成按钮，验证模型并启动工作流
    if (!imageModel) {
      onError?.('请选择图片生成模型');
      return;
    }
    if (!aspectRatio) {
      onError?.('当前图片模型未配置可用长宽比');
      return;
    }

    if (!characterId) {
      onError?.('缺少角色 ID');
      return;
    }

    setIsGenerating(true);

    try {
      const token = getAuthToken();
      
      // 调用后端 API 启动三视图生成工作流
      const res = await fetch(`/api/characters/${characterId}/generate-views`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          style: '动漫风格',
          imageModel,
          textModel,
          aspectRatio,
          // 智能补全：检测缺失的视图，只生成缺失的
          ...(selectedResource ? (() => {
            const missing: string[] = [];
            if (!selectedResource.frontViewUrl) missing.push('front');
            if (!selectedResource.sideViewUrl) missing.push('side');
            if (!selectedResource.backViewUrl) missing.push('back');
            return missing.length > 0 && missing.length < 3 ? { regenerateOnly: missing } : {};
          })() : {})
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && data.jobId) {
          await onJobAccepted?.();
          onSuccess?.('已恢复该角色正在执行的三视图任务，请稍后刷新查看');
          closeViewsModal();
          return;
        }

        throw new Error(data.message || '生成失败');
      }

      console.log('[Generate Views] 工作流已启动:', data);
      await onJobAccepted?.();
      
      onSuccess?.(`三视图生成已启动（工作流 ID: ${data.jobId}），请稍后刷新查看`);
      setGeneratedPrompts({ status: 'generating', jobId: data.jobId });
      
      // 关闭弹窗
      closeViewsModal();
    } catch (error: any) {
      onError?.('生成失败: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreview = (resource: ResourceItem) => {
    setSelectedResource(resource);
    openPreviewModal();
  };

  const closeViewsModal = () => {
    onViewsModalChange();
  };

  const closePreviewModal = () => {
    onPreviewModalChange();
  };

  return {
    selectedResource,
    isGenerating,
    generatedPrompts,
    isViewsModalOpen,
    isPreviewModalOpen,
    handleGenerateViews,
    handlePreview,
    closeViewsModal,
    closePreviewModal
  };
};
