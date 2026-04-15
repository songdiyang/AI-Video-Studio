import { useState } from 'react';
import { useDisclosure } from '@heroui/react';
import { getAuthToken } from '../../../services/auth';
import { fetchReferenceImages } from '../../../services/assets';
import { ResourceItem } from './types';

/** URL 缓存破坏：追加时间戳参数，强制浏览器加载最新图片 */
function bustCache(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${Date.now()}`;
}

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
  const [useReferenceImages, setUseReferenceImages] = useState(true);
  const [referenceImageCount, setReferenceImageCount] = useState(0);
  const { isOpen: isViewsModalOpen, onOpen: openViewsModal, onOpenChange: onViewsModalChange } = useDisclosure();
  const { isOpen: isPreviewModalOpen, onOpen: openPreviewModal, onOpenChange: onPreviewModalChange } = useDisclosure();

  const handleGenerateViews = async (
    charName: string,
    imageModel: string,
    textModel: string,
    aspectRatio: string,
    characterId?: number,
    mode?: 'style' | 'views' | 'all'
  ) => {
    // 如果是从角色卡片点击进来（没有 imageModel），先从数据库获取三视图数据
    if (!imageModel && !textModel && characterId) {
      try {
        const token = getAuthToken();
        
        // 并行获取角色数据和参考图数据
        const [characterRes, referenceImages] = await Promise.all([
          fetch(`/api/characters/${characterId}`, {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
          }),
          fetchReferenceImages('character', characterId, true).catch(() => [])
        ]);

        if (characterRes.ok) {
          const character = await characterRes.json();
          console.log('[Generate Views] 角色数据:', character);
          
          // 设置角色数据，包含三视图 URL
          setSelectedResource({
            name: charName,
            frontViewUrl: bustCache(character.front_view_url),
            sideViewUrl: bustCache(character.side_view_url),
            backViewUrl: bustCache(character.back_view_url),
            characterSheetUrl: bustCache(character.character_sheet_url),
            generationStatus: character.generation_status
          });
          
          // 设置参考图使用状态
          setUseReferenceImages(character.use_reference_images !== false);
          setReferenceImageCount(referenceImages.length);
        } else {
          // 获取失败，只设置名称
          setSelectedResource({ name: charName });
          setUseReferenceImages(true);
          setReferenceImageCount(0);
        }
      } catch (error) {
        console.error('[Generate Views] 获取角色数据失败:', error);
        setSelectedResource({ name: charName });
        setUseReferenceImages(true);
        setReferenceImageCount(0);
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
          // 根据模式设置 regenerateOnly
          ...(mode === 'style'
            ? { regenerateOnly: ['front'] }          // 风格图：只生成正面
            : mode === 'views'
            ? { regenerateOnly: ['side', 'back'] }   // 三视图：生成侧面+背面
            : (selectedResource ? (() => {           // 全部：智能检测
                const missing: string[] = [];
                if (!selectedResource.frontViewUrl) missing.push('front');
                if (!selectedResource.sideViewUrl) missing.push('side');
                if (!selectedResource.backViewUrl) missing.push('back');
                if (missing.length === 0) return { regenerateOnly: ['front', 'side', 'back'] };
                if (missing.length < 3) return { regenerateOnly: missing };
                return {};
              })() : {})
          )
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
      
      const modeLabel = mode === 'style' ? '风格图' : mode === 'views' ? '侧面/背面' : '三视图';
      onSuccess?.(`${modeLabel}生成已启动（工作流 ID: ${data.jobId}），请稍后刷新查看`);
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
    useReferenceImages,
    referenceImageCount,
    handleGenerateViews,
    handlePreview,
    closeViewsModal,
    closePreviewModal
  };
};
