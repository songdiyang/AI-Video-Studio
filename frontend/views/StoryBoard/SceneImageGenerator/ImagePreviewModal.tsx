import React from 'react';
import { Modal, ModalContent, ModalBody, ModalFooter, Button } from '@heroui/react';
import { Download } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ isOpen, onClose, imageUrl }) => {
  const { showToast } = useToast();

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `frame_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('下载失败:', error);
      showToast('下载失败，请重试', 'error');
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onClose}
      size="4xl"
      classNames={{
        base: "bg-black/95",
        closeButton: "text-white hover:bg-white/20"
      }}
    >
      <ModalContent>
        {(onCloseModal) => (
          <>
            <ModalBody className="p-4">
              {imageUrl && (
                <img 
                  src={imageUrl} 
                  alt="预览大图" 
                  className="w-full h-auto max-h-[80vh] object-contain rounded-lg" 
                />
              )}
            </ModalBody>
            <ModalFooter className="border-t border-white/10">
              <Button
                variant="light"
                onPress={onCloseModal}
                className="text-white font-semibold"
              >
                关闭
              </Button>
              <Button
                className="bg-gradient-to-r from-blue-500 to-violet-600 text-white font-semibold"
                startContent={<Download className="w-4 h-4" />}
                onPress={handleDownload}
              >
                下载图片
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default ImagePreviewModal;
