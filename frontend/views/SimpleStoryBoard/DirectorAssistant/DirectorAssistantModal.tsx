/**
 * 导演助手Modal组件 - 可视化参数设置
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Textarea,
  Tabs,
  Tab,
  Chip,
} from '@heroui/react';
import { Clapperboard, Eye, RotateCcw, Copy, Check } from 'lucide-react';
import DirectorParamSelector from './DirectorParamSelector';
import {
  DirectorParams,
  DEFAULT_DIRECTOR_PARAMS,
  directorParamsToText,
  directorParamsToPrompt,
} from './directorParams';

interface DirectorAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialParams?: DirectorParams;
  onSave: (params: DirectorParams) => void;
  sceneDescription?: string;
}

const DirectorAssistantModal: React.FC<DirectorAssistantModalProps> = ({
  isOpen,
  onClose,
  initialParams,
  onSave,
  sceneDescription,
}) => {
  const [params, setParams] = useState<DirectorParams>(initialParams || DEFAULT_DIRECTOR_PARAMS);
  const [activeTab, setActiveTab] = useState<'visual' | 'preview'>('visual');
  const [copied, setCopied] = useState(false);
  const [customNotes, setCustomNotes] = useState(initialParams?.customNotes || '');

  // 初始化
  useEffect(() => {
    if (isOpen) {
      const initParams = initialParams || DEFAULT_DIRECTOR_PARAMS;
      setParams(initParams);
      setCustomNotes(initParams.customNotes || '');
    }
  }, [isOpen, initialParams]);

  // 预览文本
  const previewText = useMemo(() => directorParamsToText({ ...params, customNotes }), [params, customNotes]);
  const promptText = useMemo(() => directorParamsToPrompt({ ...params, customNotes }), [params, customNotes]);

  // 复制到剪贴板
  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 重置为默认
  const handleReset = () => {
    setParams(DEFAULT_DIRECTOR_PARAMS);
    setCustomNotes('');
  };

  // 保存
  const handleSave = () => {
    onSave({ ...params, customNotes });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="3xl"
      scrollBehavior="inside"
      classNames={{
        base: 'bg-content1 border border-divider',
        header: 'border-b border-divider',
        body: 'py-4',
        footer: 'border-t border-divider',
      }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <Clapperboard className="w-5 h-5 text-amber-400" />
          <span>导演助手</span>
          {sceneDescription && (
            <Chip size="sm" variant="flat" className="ml-2 text-xs">
              {sceneDescription.length > 30 ? sceneDescription.slice(0, 30) + '...' : sceneDescription}
            </Chip>
          )}
        </ModalHeader>

        <ModalBody>
          <Tabs
            selectedKey={activeTab}
            onSelectionChange={(key) => setActiveTab(key as 'visual' | 'preview')}
            variant="underlined"
            classNames={{
              tabList: 'gap-4',
              cursor: 'bg-amber-500',
              tab: 'px-0 h-10',
              tabContent: 'group-data-[selected=true]:text-amber-400',
            }}
          >
            <Tab
              key="visual"
              title={
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  <span>参数设置</span>
                </div>
              }
            />
            <Tab
              key="preview"
              title={
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  <span>效果预览</span>
                </div>
              }
            />
          </Tabs>

          <div className="mt-4 min-h-[400px]">
            {activeTab === 'visual' && (
              <div className="flex flex-col gap-4">
                <DirectorParamSelector params={params} onChange={setParams} />
                
                {/* 自定义备注 */}
                <div className="bg-content2/50 rounded-lg p-3 border border-divider">
                  <label className="text-sm text-foreground-500 mb-2 block">导演备注（自定义补充）</label>
                  <Textarea
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    placeholder="添加任何额外的导演指导说明..."
                    minRows={2}
                    classNames={{
                      input: 'bg-content2 text-sm',
                      inputWrapper: 'bg-content2 border-divider',
                    }}
                  />
                </div>
              </div>
            )}

            {activeTab === 'preview' && (
              <div className="flex flex-col gap-4">
                {/* 中文预览 */}
                <div className="bg-content2 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-foreground">参数摘要（中文）</span>
                    <Button
                      size="sm"
                      variant="flat"
                      startContent={copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      onClick={() => handleCopy(previewText)}
                    >
                      {copied ? '已复制' : '复制'}
                    </Button>
                  </div>
                  <pre className="text-sm text-foreground whitespace-pre-wrap font-sans">{previewText}</pre>
                </div>

                {/* 英文提示词 */}
                <div className="bg-content2 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-foreground">生成提示词（英文）</span>
                    <Button
                      size="sm"
                      variant="flat"
                      startContent={copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      onClick={() => handleCopy(promptText)}
                    >
                      {copied ? '已复制' : '复制'}
                    </Button>
                  </div>
                  <pre className="text-sm text-amber-300 whitespace-pre-wrap font-mono">{promptText}</pre>
                </div>
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <Button
            variant="flat"
            startContent={<RotateCcw className="w-4 h-4" />}
            onClick={handleReset}
          >
            重置默认
          </Button>
          <div className="flex-1" />
          <Button variant="light" onClick={onClose}>
            取消
          </Button>
          <Button
            color="warning"
            onClick={handleSave}

          >
            保存参数
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default DirectorAssistantModal;
