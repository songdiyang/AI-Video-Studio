import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Checkbox } from "@heroui/react";
import { AlertTriangle, Info, Trash2, type LucideIcon } from 'lucide-react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  /** 可选的确认复选框配置，勾选后确认按钮才可用 */
  checkbox?: {
    label: string;
  };
}

/**
 * 三类确认的视觉语义：图标、主色、确认按钮底色在此一次性配齐。
 * 之前三种类型共用一个三角警告图标，“删除”和“只是告知”看起来是同一件事；
 * 颜色也写死在 tailwind 色板上，与全局 --danger/--warning/--accent 不同源，切主题时不跟着变。
 */
const TYPE_VISUAL: Record<'danger' | 'warning' | 'info', { icon: LucideIcon; tint: string; solid: string }> = {
  danger: {
    icon: Trash2,
    tint: 'bg-[var(--danger,#ef4444)]/12 text-[var(--danger,#ef4444)]',
    solid: 'bg-[var(--danger,#ef4444)] hover:bg-[var(--danger,#ef4444)]/90 text-white',
  },
  warning: {
    icon: AlertTriangle,
    tint: 'bg-[var(--warning,#f59e0b)]/14 text-[var(--warning,#f59e0b)]',
    solid: 'bg-[var(--warning,#f59e0b)] hover:bg-[var(--warning,#f59e0b)]/90 text-white',
  },
  info: {
    icon: Info,
    tint: 'bg-[var(--accent,#2563eb)]/14 text-[var(--accent,#2563eb)]',
    solid: 'bg-[var(--accent,#2563eb)] hover:bg-[var(--accent,#2563eb)]/90 text-white',
  },
};

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
};

interface ConfirmProviderProps {
  children: ReactNode;
}

export const ConfirmProvider: React.FC<ConfirmProviderProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions(opts);
      setResolveRef(() => resolve);
      setCheckboxChecked(false);
      setIsOpen(true);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef?.(true);
    setIsOpen(false);
    setOptions(null);
    setResolveRef(null);
  }, [resolveRef]);

  const handleCancel = useCallback(() => {
    resolveRef?.(false);
    setIsOpen(false);
    setOptions(null);
    setResolveRef(null);
  }, [resolveRef]);

  const type = options?.type ?? 'info';
  const visual = TYPE_VISUAL[type];
  const Icon = visual.icon;
  const confirmDisabled = !!options?.checkbox && !checkboxChecked;

  // HeroUI Modal 打开后会把焦点放在对话框容器上，Button 的 autoFocus 会被它的焦点管理覆盖（实测），
  // 所以这里显式把焦点交给「取消」：在危险弹窗里顺手按回车不该直接执行删除。
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => cancelRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [isOpen]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Modal 
        isOpen={isOpen} 
        onOpenChange={(open) => !open && handleCancel()}
        size="sm"
        classNames={{
          // 只保留底部一条细分隔线：之前 header/footer 各一条粗线 + 过大的 body 内边距，
          // 把一个小确认框撑成了「三段蛋糕」，在编辑器里显得笨重。
          backdrop: 'bg-black/50 backdrop-blur-[2px]',
          base: 'bg-[var(--bg-popover,#fff)] border border-[var(--border-color,#e5e7eb)] rounded-xl shadow-[0_20px_50px_-16px_rgba(0,0,0,0.55)]',
          header: 'px-5 pt-4 pb-0 gap-2.5 items-center border-none',
          body: 'px-5 pt-2.5 pb-4 gap-0',
          footer: 'px-4 py-3 gap-2 items-center border-t border-[var(--border-subtle,#e5e7eb)] bg-[var(--bg-input,#f9fafb)]/60',
          closeButton: 'top-2.5 right-2.5 w-7 h-7 text-[var(--text-muted,#6b7280)] hover:text-[var(--text-primary,#111827)] hover:bg-[var(--bg-card-hover,#f3f4f6)]'
        }}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader>
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${visual.tint}`}>
                  <Icon className="w-4 h-4" strokeWidth={2.2} />
                </span>
                <span className="text-[15px] font-semibold leading-6 text-[var(--text-primary,#111827)]">
                  {options?.title || '确认操作'}
                </span>
              </ModalHeader>
              <ModalBody>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--text-secondary,#4b5563)]">
                  {options?.message}
                </p>
                {options?.checkbox && (
                  <div className="mt-3 rounded-lg border border-[var(--border-subtle,#e5e7eb)] bg-[var(--bg-input,#f9fafb)] px-3 py-2">
                    <Checkbox
                      isSelected={checkboxChecked}
                      onValueChange={setCheckboxChecked}
                      size="sm"
                      color={type === 'danger' ? 'danger' : type === 'warning' ? 'warning' : 'primary'}
                      classNames={{
                        base: 'min-h-0',
                        // 选中态色块跟全局功能色同源（详见 index.css 的 .confirm-check-* 说明）。
                        // 色块在 wrapper 插槽上：这个版本的 Checkbox 没有 control 插槽，写 control 会被静默丢掉
                        wrapper:
                          type === 'danger' ? 'confirm-check-danger' : type === 'warning' ? 'confirm-check-warning' : '',
                        label: 'text-xs text-[var(--text-secondary,#4b5563)]',
                      }}
                    >
                      {options.checkbox.label}
                    </Checkbox>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button
                  size="sm"
                  radius="md"
                  ref={cancelRef}
                  onPress={handleCancel}
                  className="min-w-[76px] font-normal cursor-pointer bg-[var(--bg-card-hover,#f3f4f6)] border border-[var(--border-color,#e5e7eb)] text-[var(--text-secondary,#4b5563)] hover:bg-[var(--bg-card-hover,#f3f4f6)]/70"
                >
                  {options?.cancelText || '取消'}
                </Button>
                <Button
                  size="sm"
                  radius="md"
                  onPress={handleConfirm}
                  isDisabled={confirmDisabled}
                  className={
                    confirmDisabled
                      ? 'min-w-[76px] font-medium cursor-not-allowed opacity-45 bg-[var(--text-muted,#9ca3af)] text-white'
                      : `min-w-[76px] font-medium cursor-pointer transition-colors ${visual.solid}`
                  }
                >
                  {options?.confirmText || '确定'}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </ConfirmContext.Provider>
  );
};
