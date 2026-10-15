import React, { useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import { Upload } from 'lucide-react';
import JsonTextarea from './JsonTextarea';
import ErrorDisplay from './ErrorDisplay';
import ImportInstructions from './ImportInstructions';
import { parseAndFixJSON } from './jsonParser';

interface ImportStoryboardModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (scenes: any[]) => void;
}

const ImportStoryboardModal: React.FC<ImportStoryboardModalProps> = ({
  isOpen,
  onOpenChange,
  onImport
}) => {
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleImport = () => {
    setError('');
    setIsProcessing(true);

    try {
      if (!jsonText.trim()) {
        throw new Error('请粘贴 JSON 内容');
      }

      const scenes = parseAndFixJSON(jsonText);

      if (!Array.isArray(scenes)) {
        throw new Error('JSON 必须是一个数组');
      }

      if (scenes.length === 0) {
        throw new Error('分镜数组不能为空');
      }

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        if (!scene.description && !scene.prompt_template) {
          throw new Error(`第 ${i + 1} 个分镜缺少 description 字段`);
        }
      }

      console.log('[ImportStoryboard] 成功解析', scenes.length, '个分镜');
      
      onImport(scenes);
      onOpenChange(false);
      setJsonText('');
      
    } catch (err: any) {
      console.error('[ImportStoryboard] 解析失败:', err);
      setError(err.message || '解析失败，请检查 JSON 格式');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setJsonText('');
    setError('');
    onOpenChange(false);
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onOpenChange}
      size="3xl"
      scrollBehavior="inside"
      classNames={{
        base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50",
        header: "border-b border-slate-700/50",
        footer: "border-t border-slate-700/50"
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2 text-slate-100">
              <Upload className="w-5 h-5" />
              从 JSON 导入分镜
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <ImportInstructions />
                <JsonTextarea value={jsonText} onChange={setJsonText} />
                <ErrorDisplay error={error} />
                <ImportInstructions showTips />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={handleClose}>
                取消
              </Button>
              <Button
                color="primary"
                onPress={handleImport}
                isLoading={isProcessing}
                isDisabled={!jsonText.trim()}
              >
                导入分镜
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default ImportStoryboardModal;
