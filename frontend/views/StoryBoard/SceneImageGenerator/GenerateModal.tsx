import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Textarea } from '@heroui/react';
import { Wand2 } from 'lucide-react';

interface GenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  hasImages: boolean;
  startFrame?: string;
  endFrame?: string;
  isGenerating: boolean;
  error: string | null;
  onGenerate: () => void;
}

const GenerateModal: React.FC<GenerateModalProps> = ({
  isOpen,
  onClose,
  prompt,
  onPromptChange,
  hasImages,
  startFrame,
  endFrame,
  isGenerating,
  error,
  onGenerate
}) => {
  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onClose}
      size="2xl"
      classNames={{
        base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl shadow-black/40",
        header: "border-b border-slate-700/50",
        body: "py-6",
        footer: "border-t border-slate-700/50"
      }}
    >
      <ModalContent>
        {(onCloseModal) => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-blue-400" />
              <span className="text-slate-100 font-bold">
                {hasImages ? '重新生成首尾帧' : '生成首尾帧'}
              </span>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-slate-300 mb-2 block">
                    画面描述提示词
                  </label>
                  <Textarea
                    value={prompt}
                    onValueChange={onPromptChange}
                    placeholder="描述你想要生成的画面..."
                    minRows={6}
                    classNames={{
                      input: "bg-transparent text-slate-100",
                      inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50"
                    }}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    将根据描述自动生成首帧和尾帧两张图片
                  </p>
                </div>

                {hasImages && (
                  <div>
                    <label className="text-sm font-semibold text-slate-300 mb-2 block">
                      当前首尾帧
                    </label>
                    <div className="flex gap-4">
                      {startFrame && (
                        <div className="flex-1">
                          <p className="text-xs text-slate-500 mb-1">首帧</p>
                          <img src={startFrame} alt="首帧" className="w-full h-32 object-cover rounded-lg" />
                        </div>
                      )}
                      {endFrame && (
                        <div className="flex-1">
                          <p className="text-xs text-slate-500 mb-1">尾帧</p>
                          <img src={endFrame} alt="尾帧" className="w-full h-32 object-cover rounded-lg" />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                    {error}
                  </div>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button 
                variant="light" 
                onPress={onCloseModal}
                className="font-semibold text-slate-400"
              >
                取消
              </Button>
              <Button 
                className="bg-gradient-to-r from-blue-500 to-violet-600 text-white font-bold shadow-lg shadow-blue-500/20"
                onPress={onGenerate}
                isLoading={isGenerating}
                startContent={!isGenerating && <Wand2 className="w-4 h-4" />}
              >
                {isGenerating ? '生成中...' : hasImages ? '重新生成' : '开始生成'}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default GenerateModal;
