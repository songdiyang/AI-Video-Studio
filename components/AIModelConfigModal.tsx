/**
 * AI 模型配置弹窗
 * 
 * 全局统一管理所有类型的 AI 模型选择。
 * 按分类（TEXT / IMAGE / VIDEO / AUDIO / MULTIMODAL）展示选择器。
 */

import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import { Bot } from 'lucide-react';
import AIModelSelector, { AIModel } from './AIModelSelector';
import { AIModelSelection } from '../hooks/useAIModels';

interface ModelCategory {
  key: keyof AIModelSelection;
  label: string;
  filterType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'MULTIMODAL';
  placeholder: string;
}

const MODEL_CATEGORIES: ModelCategory[] = [
  { key: 'text',  label: '文本模型',  filterType: 'TEXT',  placeholder: '用于剧本生成、场景分析、角色提取等' },
  { key: 'image', label: '图片模型',  filterType: 'IMAGE', placeholder: '用于图片生成、场景图、角色三视图等' },
  { key: 'video', label: '视频模型',  filterType: 'VIDEO', placeholder: '用于分镜视频生成' },
  { key: 'audio', label: '音频模型',  filterType: 'AUDIO', placeholder: '用于配音、音效生成' },
  { key: 'multimodal', label: '多模态模型', filterType: 'MULTIMODAL', placeholder: '用于图像理解、视频理解、文档理解、AI辅助对话' },
];

interface AIModelConfigModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  models: AIModel[];
  selected: AIModelSelection;
  onSelect: (type: keyof AIModelSelection, modelName: string) => void;
}

const AIModelConfigModal: React.FC<AIModelConfigModalProps> = ({
  isOpen,
  onOpenChange,
  models,
  selected,
  onSelect
}) => {
  // 只显示有可用模型的分类
  const availableCategories = MODEL_CATEGORIES.filter(cat => {
    return models.some(m => (m.type || '').toUpperCase() === cat.filterType);
  });

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg">
      <ModalContent className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50">
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2 text-slate-100 border-b border-slate-700/50">
              <Bot className="w-5 h-5 text-blue-400" />
              AI 模型配置
            </ModalHeader>
            <ModalBody className="space-y-4">
              <p className="text-sm text-slate-400">
                选择生成模型，系统会在不同流程中自动调用对应接口（图生文 / 文生图）。
              </p>
              {availableCategories.map(cat => (
                <AIModelSelector
                  key={cat.key}
                  label={cat.label}
                  placeholder={cat.placeholder}
                  models={models}
                  selectedModel={selected[cat.key]}
                  onModelChange={(name) => onSelect(cat.key, name)}
                  filterType={cat.filterType}
                  size="sm"
                />
              ))}
              {availableCategories.length === 0 && (
                <p className="text-center text-slate-500 py-4">暂无可用模型，请先在管理后台配置</p>
              )}
            </ModalBody>
            <ModalFooter className="border-t border-slate-700/50">
              <Button
                className="bg-linear-to-r from-blue-500 to-violet-600 text-white font-semibold shadow-lg shadow-blue-500/20"
                onPress={onClose}
              >
                确定
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default AIModelConfigModal;
