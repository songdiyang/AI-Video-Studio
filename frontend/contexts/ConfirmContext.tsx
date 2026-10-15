import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Checkbox } from "@heroui/react";
import { AlertTriangle } from 'lucide-react';

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

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Modal 
        isOpen={isOpen} 
        onOpenChange={(open) => !open && handleCancel()}
        size="sm"
        classNames={{
          backdrop: 'bg-black/60 backdrop-blur-sm',
          base: 'bg-[var(--bg-card,#fff)] border border-[var(--border-color,#e5e7eb)] shadow-2xl',
          header: 'border-b border-[var(--border-color,#e5e7eb)]',
          body: 'py-6',
          footer: 'border-t border-[var(--border-color,#e5e7eb)]',
          closeButton: 'text-[var(--text-secondary,#6b7280)] hover:text-[var(--text-primary,#111827)] hover:bg-black/5'
        }}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex items-center gap-3">
                <div className={`
                  w-10 h-10 rounded-xl flex items-center justify-center
                  ${options?.type === 'danger' ? 'bg-red-500/15 text-red-500' : ''}
                  ${options?.type === 'warning' ? 'bg-amber-500/15 text-amber-500' : ''}
                  ${options?.type === 'info' ? 'bg-cyan-500/15 text-cyan-500' : ''}
                `}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <span className="text-[var(--text-primary,#111827)] font-bold text-lg">
                  {options?.title || '确认操作'}
                </span>
              </ModalHeader>
              <ModalBody>
                <p className="text-[var(--text-secondary,#4b5563)] whitespace-pre-wrap leading-relaxed">
                  {options?.message}
                </p>
                {options?.checkbox && (
                  <div className="mt-4">
                    <Checkbox
                      isSelected={checkboxChecked}
                      onValueChange={setCheckboxChecked}
                      size="sm"
                      classNames={{
                        label: 'text-sm text-[var(--text-secondary,#4b5563)]',
                      }}
                    >
                      {options.checkbox.label}
                    </Checkbox>
                  </div>
                )}
              </ModalBody>
              <ModalFooter className="gap-2">
                <Button 
                  variant="flat" 
                  className="bg-black/5 text-[var(--text-secondary,#4b5563)] hover:bg-black/10 border border-[var(--border-color,#e5e7eb)] cursor-pointer"
                  onPress={handleCancel}
                >
                  {options?.cancelText || '取消'}
                </Button>
                <Button 
                  className={`
                    font-semibold cursor-pointer transition-all
                    ${options?.type === 'danger' 
                      ? 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50' 
                      : options?.type === 'warning'
                        ? 'bg-gradient-to-br from-amber-500 to-yellow-600 text-white shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50'
                        : 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50'
                    }
                  `}
                  onPress={handleConfirm}
                  isDisabled={!!options?.checkbox && !checkboxChecked}
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
