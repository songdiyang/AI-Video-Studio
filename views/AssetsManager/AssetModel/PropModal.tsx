/**
 * 道具编辑弹窗 - 增强版
 * 
 * 功能：
 * 1. 基础信息编辑
 * 2. 样式配置（材质、颜色等）
 * 3. AI 图片生成
 * 4. 参考图管理
 */
import React, { useState, useEffect } from 'react';
import { 
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, 
  Button, Input, Textarea, Divider, Tabs, Tab, Chip,
  Select, SelectItem, Spinner
} from '@heroui/react';
import { Image as ImageIcon, Wand2, Settings, Palette, RefreshCw } from 'lucide-react';
import ReferenceImageManager from './ReferenceImageManager';
import PropStyleConfigPanel, { PropStyleConfig } from './PropStyleConfig';
import { getAuthToken } from '../../../services/auth';
import { useAIModels } from '../../../hooks/useAIModels';

interface PropModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  editMode: boolean;
  formData: any;
  setFormData: (data: any) => void;
  onSave: () => void;
}

const PropModal: React.FC<PropModalProps> = ({
  isOpen,
  onOpenChange,
  editMode,
  formData,
  setFormData,
  onSave
}) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'style' | 'generate'>('basic');
  const [styleConfig, setStyleConfig] = useState<PropStyleConfig>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>('idle');
  const [selectedImageModel, setSelectedImageModel] = useState<string>('');
  const [selectedTextModel, setSelectedTextModel] = useState<string>('');
  
  // 获取可用的 AI 模型
  const { models, loading: modelsLoading } = useAIModels(null);
  const imageModels = models.filter(m => m.type === 'image');
  const textModels = models.filter(m => m.type === 'text');

  // 初始化样式配置
  useEffect(() => {
    if (formData.style_config) {
      try {
        const config = typeof formData.style_config === 'string' 
          ? JSON.parse(formData.style_config) 
          : formData.style_config;
        setStyleConfig(config);
      } catch {
        setStyleConfig({});
      }
    } else {
      setStyleConfig({});
    }
    
    // 初始化生成状态
    if (formData.generation_status) {
      setGenerationStatus(formData.generation_status);
    }
  }, [formData]);

  // 设置默认模型
  useEffect(() => {
    if (imageModels.length > 0 && !selectedImageModel) {
      setSelectedImageModel(imageModels[0].name);
    }
    if (textModels.length > 0 && !selectedTextModel) {
      setSelectedTextModel(textModels[0].name);
    }
  }, [imageModels, textModels]);

  // 保存时同步样式配置
  const handleSave = () => {
    setFormData({ ...formData, style_config: styleConfig });
    onSave();
  };

  // 生成道具图片
  const handleGenerate = async () => {
    if (!formData.id) {
      alert('请先保存道具后再生成图片');
      return;
    }

    if (!selectedImageModel) {
      alert('请选择图像生成模型');
      return;
    }

    setIsGenerating(true);
    setGenerationStatus('generating');

    try {
      const token = getAuthToken();
      const response = await fetch(`/api/props/${formData.id}/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          imageModel: selectedImageModel,
          textModel: selectedTextModel,
          styleConfig
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || '启动生成失败');
      }

      // 开始轮询状态
      pollGenerationStatus();
    } catch (error: any) {
      console.error('生成失败:', error);
      setGenerationStatus('failed');
      alert('生成失败: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // 轮询生成状态
  const pollGenerationStatus = async () => {
    if (!formData.id) return;

    const token = getAuthToken();
    let attempts = 0;
    const maxAttempts = 60; // 最多轮询60次（约3分钟）

    const poll = async () => {
      try {
        const response = await fetch(`/api/props/${formData.id}/generation-status`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          setGenerationStatus(data.status);

          if (data.status === 'completed' && data.imageUrl) {
            setFormData({ ...formData, image_url: data.imageUrl, generation_status: 'completed' });
            return; // 完成，停止轮询
          }

          if (data.status === 'failed') {
            return; // 失败，停止轮询
          }
        }

        attempts++;
        if (attempts < maxAttempts && generationStatus === 'generating') {
          setTimeout(poll, 3000); // 每3秒轮询一次
        }
      } catch (error) {
        console.error('轮询状态失败:', error);
      }
    };

    poll();
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="4xl"
      scrollBehavior="inside"
      classNames={{
        base: "bg-content1 border border-divider",
        header: "border-b border-divider",
        body: "py-4"
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-3">
              <span className="font-bold">{editMode ? '编辑' : '新建'}道具</span>
              {editMode && formData.generation_status && (
                <Chip
                  size="sm"
                  color={
                    generationStatus === 'completed' ? 'success' :
                    generationStatus === 'generating' ? 'warning' :
                    generationStatus === 'failed' ? 'danger' : 'default'
                  }
                  variant="flat"
                >
                  {generationStatus === 'completed' ? '已生成' :
                   generationStatus === 'generating' ? '生成中' :
                   generationStatus === 'failed' ? '生成失败' : '未生成'}
                </Chip>
              )}
            </ModalHeader>

            <ModalBody>
              <Tabs
                selectedKey={activeTab}
                onSelectionChange={(key) => setActiveTab(key as any)}
                variant="underlined"
                classNames={{
                  tabList: 'gap-4',
                  cursor: 'bg-primary',
                  tab: 'px-0 h-10',
                }}
              >
                <Tab
                  key="basic"
                  title={
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      <span>基础信息</span>
                    </div>
                  }
                />
                <Tab
                  key="style"
                  title={
                    <div className="flex items-center gap-2">
                      <Palette className="w-4 h-4" />
                      <span>样式配置</span>
                    </div>
                  }
                />
                <Tab
                  key="generate"
                  title={
                    <div className="flex items-center gap-2">
                      <Wand2 className="w-4 h-4" />
                      <span>AI 生成</span>
                    </div>
                  }
                  isDisabled={!editMode}
                />
              </Tabs>

              <div className="mt-4 min-h-[400px]">
                {/* 基础信息 */}
                {activeTab === 'basic' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <Input
                        label="名称"
                        placeholder="输入道具名称"
                        value={formData.name}
                        onValueChange={(val) => setFormData({ ...formData, name: val })}
                        classNames={{
                          inputWrapper: 'bg-content2 border-divider',
                        }}
                      />
                      
                      <Textarea
                        label="描述"
                        placeholder="输入详细描述"
                        value={formData.description}
                        onValueChange={(val) => setFormData({ ...formData, description: val })}
                        minRows={3}
                        classNames={{
                          inputWrapper: 'bg-content2 border-divider',
                        }}
                      />

                      <Input
                        label="道具分类"
                        placeholder="如：武器、工具、装饰品等"
                        value={formData.category}
                        onValueChange={(val) => setFormData({ ...formData, category: val })}
                        classNames={{
                          inputWrapper: 'bg-content2 border-divider',
                        }}
                      />

                      <Input
                        label="图片URL"
                        placeholder="图片地址（选填，可通过AI生成）"
                        value={formData.image_url}
                        onValueChange={(val) => setFormData({ ...formData, image_url: val })}
                        classNames={{
                          inputWrapper: 'bg-content2 border-divider',
                        }}
                      />

                      <Input
                        label="标签"
                        placeholder="多个标签用逗号分隔"
                        value={formData.tags}
                        onValueChange={(val) => setFormData({ ...formData, tags: val })}
                        classNames={{
                          inputWrapper: 'bg-content2 border-divider',
                        }}
                      />
                    </div>

                    <div className="space-y-4">
                      <label className="text-sm font-medium flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4" />
                        参考图
                      </label>
                      {editMode && formData.id ? (
                        <ReferenceImageManager
                          assetType="prop"
                          assetId={formData.id}
                        />
                      ) : (
                        <div className="text-center py-8 bg-content2 rounded-lg border border-divider">
                          <ImageIcon className="w-10 h-10 mx-auto mb-2 text-foreground-400" />
                          <p className="text-sm text-foreground-400">保存道具后可管理参考图</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 样式配置 */}
                {activeTab === 'style' && (
                  <PropStyleConfigPanel
                    value={styleConfig}
                    onChange={setStyleConfig}
                  />
                )}

                {/* AI 生成 */}
                {activeTab === 'generate' && editMode && (
                  <div className="space-y-6">
                    {/* 当前图片预览 */}
                    <div className="flex gap-6">
                      <div className="flex-1">
                        <label className="text-sm font-medium mb-2 block">当前道具图片</label>
                        <div className="aspect-square bg-content2 rounded-lg border border-divider overflow-hidden">
                          {formData.image_url ? (
                            <img
                              src={formData.image_url}
                              alt={formData.name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="text-center text-foreground-400">
                                <ImageIcon className="w-12 h-12 mx-auto mb-2" />
                                <p className="text-sm">暂无图片</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 space-y-4">
                        <label className="text-sm font-medium mb-2 block">生成设置</label>
                        
                        <Select
                          label="图像生成模型"
                          size="sm"
                          selectedKeys={selectedImageModel ? [selectedImageModel] : []}
                          onSelectionChange={(keys) => {
                            const selected = Array.from(keys)[0] as string;
                            if (selected) setSelectedImageModel(selected);
                          }}
                          isLoading={modelsLoading}
                          classNames={{
                            trigger: 'bg-content2 border-divider',
                            popoverContent: 'bg-content1',
                          }}
                        >
                          {imageModels.map((model) => (
                            <SelectItem key={model.name} textValue={model.name}>
                              {model.name}
                            </SelectItem>
                          ))}
                        </Select>

                        <Select
                          label="文本生成模型（用于生成提示词）"
                          size="sm"
                          selectedKeys={selectedTextModel ? [selectedTextModel] : []}
                          onSelectionChange={(keys) => {
                            const selected = Array.from(keys)[0] as string;
                            if (selected) setSelectedTextModel(selected);
                          }}
                          isLoading={modelsLoading}
                          classNames={{
                            trigger: 'bg-content2 border-divider',
                            popoverContent: 'bg-content1',
                          }}
                        >
                          {textModels.map((model) => (
                            <SelectItem key={model.name} textValue={model.name}>
                              {model.name}
                            </SelectItem>
                          ))}
                        </Select>

                        <Divider className="my-4" />

                        <div className="bg-content2/50 rounded-lg p-3 border border-divider">
                          <p className="text-xs text-foreground-500 mb-2">样式配置预览</p>
                          <div className="flex flex-wrap gap-1">
                            {styleConfig.material && (
                              <Chip size="sm" variant="flat">材质: {styleConfig.material}</Chip>
                            )}
                            {styleConfig.primaryColor && (
                              <Chip size="sm" variant="flat">颜色: {styleConfig.primaryColor}</Chip>
                            )}
                            {styleConfig.style && (
                              <Chip size="sm" variant="flat">风格: {styleConfig.style}</Chip>
                            )}
                            {styleConfig.condition && (
                              <Chip size="sm" variant="flat">状态: {styleConfig.condition}</Chip>
                            )}
                            {!styleConfig.material && !styleConfig.primaryColor && !styleConfig.style && (
                              <span className="text-xs text-foreground-400">未配置样式，将使用默认设置</span>
                            )}
                          </div>
                        </div>

                        <Button
                          color="primary"
                          className="w-full"
                          startContent={
                            isGenerating || generationStatus === 'generating' ? (
                              <Spinner size="sm" color="current" />
                            ) : (
                              <Wand2 className="w-4 h-4" />
                            )
                          }
                          isDisabled={isGenerating || generationStatus === 'generating' || !selectedImageModel}
                          onPress={handleGenerate}
                        >
                          {generationStatus === 'generating' ? '生成中...' : 
                           formData.image_url ? '重新生成图片' : '生成道具图片'}
                        </Button>

                        {generationStatus === 'failed' && (
                          <p className="text-xs text-danger text-center">
                            生成失败，请重试
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ModalBody>

            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                取消
              </Button>
              <Button color="primary" onPress={handleSave}>
                保存
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default PropModal;
