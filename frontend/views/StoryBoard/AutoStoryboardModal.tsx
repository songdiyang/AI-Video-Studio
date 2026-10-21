import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import { AlertTriangle, ListPlus, SkipForward, RefreshCw } from 'lucide-react';

/**
 * 生成模式 = 后端 conflictStrategy：
 * - skip:      追加到现有分镜，角色/影棚遇同名一律跳过，仅新增不重复
 * - smart:     追加到现有分镜，角色/影棚遇同名仅补空白字段（保留已有内容，补全缺失）
 * - overwrite: 删除当前所有分镜及仅本集关联的孤立角色/影棚，重新生成并完全覆盖
 */
export type GenerateMode = 'skip' | 'smart' | 'overwrite';

interface AutoStoryboardModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (mode: GenerateMode) => void;
  /** 预留：不再提醒（目前未持久化，保留以便未来接入） */
  dontShowAgain?: boolean;
  onDontShowAgainChange?: (v: boolean) => void;
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
            transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
          },
          exit: {
            y: 8,
            opacity: 0,
            scale: 0.98,
            transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
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
              智能拆分将生成分镜和影棚
            </ModalHeader>
            <ModalBody className="space-y-3">
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-sm text-amber-300">
                  <span className="font-semibold">⚠️ 注意：</span>此操作将AI分析剧本，同时生成：<br/>
                  • 分镜镜头序列<br/>
                  • 影棚（环境+建筑+天气/时间）<br/>
                  • 角色信息与影棚状态
                </p>
              </div>
              {/* 跳过同名（追加） */}
              <button
                onClick={() => { onClose(); onConfirm('skip'); }}
                className="w-full text-left p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <SkipForward className="w-5 h-5 text-emerald-400" />
                  </div>
                  <span className="text-base font-semibold text-emerald-400 group-hover:text-emerald-300">跳过同名（推荐）</span>
                </div>
                <p className="text-sm text-slate-400 ml-12">
                  保留现有分镜和影棚，仅追加新生成的内容。同名角色/影棚一律跳过，已有资料不会被改动。
                </p>
              </button>

              {/* 智能补全空白 */}
              <button
                onClick={() => { onClose(); onConfirm('smart'); }}
                className="w-full text-left p-4 rounded-xl border border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/10 transition-colors group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-sky-500/20 flex items-center justify-center">
                    <ListPlus className="w-5 h-5 text-sky-400" />
                  </div>
                  <span className="text-base font-semibold text-sky-400 group-hover:text-sky-300">智能补全空白</span>
                </div>
                <p className="text-sm text-slate-400 ml-12">
                  保留现有分镜和影棚并追加新生成。遇同名角色/影棚只补全 <span className="text-sky-300">空白字段</span>，已填写的字段不会被覆盖。
                </p>
              </button>

              {/* 完全覆盖 */}
              <button
                onClick={() => { onClose(); onConfirm('overwrite'); }}
                className="w-full text-left p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 transition-colors group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-rose-500/20 flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-rose-400" />
                  </div>
                  <span className="text-base font-semibold text-rose-400 group-hover:text-rose-300">完全覆盖</span>
                </div>
                <p className="text-sm text-slate-400 ml-12">
                  <span className="text-rose-400 font-medium">删除当前所有分镜和影棚组件</span>及仅本集关联的孤立角色/影棚，重新生成。同名角色/影棚将被新内容覆盖。跨集共享资源不受影响。
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
