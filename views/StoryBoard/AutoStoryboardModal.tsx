import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import { AlertTriangle, ListPlus, RefreshCw } from 'lucide-react';

export type GenerateMode = 'overwrite' | 'append';

interface AutoStoryboardModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (mode: GenerateMode) => void;
}

const AutoStoryboardModal: React.FC<AutoStoryboardModalProps> = ({
  isOpen,
  onOpenChange,
  onConfirm
}) => {
  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onOpenChange} 
      size="md"
      motionProps={{
        variants: {
          enter: {
            y: 0,
            opacity: 1,
            scale: 1,
            transition: {
              duration: 0.2,
              ease: [0.4, 0, 0.2, 1],
            },
          },
          exit: {
            y: 8,
            opacity: 0,
            scale: 0.98,
            transition: {
              duration: 0.15,
              ease: [0.4, 0, 1, 1],
            },
          },
        },
      }}
      classNames={{
        base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl shadow-black/40",
        header: "border-b border-slate-700/50",
        footer: "border-t border-slate-700/50",
        backdrop: "bg-black/60 backdrop-blur-sm"
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              当前已有分镜，请选择生成方式
            </ModalHeader>
            <ModalBody className="space-y-4">
              {/* 追加模式 */}
              <button
                onClick={() => { onClose(); onConfirm('append'); }}
                className="w-full text-left p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <ListPlus className="w-5 h-5 text-emerald-400" />
                  </div>
                  <span className="text-base font-semibold text-emerald-400 group-hover:text-emerald-300">追加到现有分镜</span>
                </div>
                <p className="text-sm text-slate-400 ml-12">
                  保留当前分镜，AI 生成的分镜追加到末尾。同名场景/角色自动跳过，仅新增不重复的内容。
                </p>
              </button>

              {/* 覆盖模式 */}
              <button
                onClick={() => { onClose(); onConfirm('overwrite'); }}
                className="w-full text-left p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 transition-colors group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-rose-500/20 flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-rose-400" />
                  </div>
                  <span className="text-base font-semibold text-rose-400 group-hover:text-rose-300">覆盖当前分镜</span>
                </div>
                <p className="text-sm text-slate-400 ml-12">
                  <span className="text-rose-400 font-medium">删除当前所有分镜</span>及仅本集关联的孤立角色/场景，重新生成。跨集共享资源不受影响。
                </p>
              </button>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} className="text-slate-400">
                取消
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default AutoStoryboardModal;
