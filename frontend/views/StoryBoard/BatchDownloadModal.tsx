import React, { useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Progress } from '@heroui/react';
import { Download, Image, Video } from 'lucide-react';
import { StoryboardScene } from './useSceneManager';
import { batchDownloadMedia, DownloadType } from './utils/batchDownload';
import { useToast } from '../../contexts/ToastContext';

interface BatchDownloadModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  scenes: StoryboardScene[];
}

const BatchDownloadModal: React.FC<BatchDownloadModalProps> = ({
  isOpen,
  onOpenChange,
  scenes
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const { showToast } = useToast();

  // 统计可下载的媒体数量
  const imageCount = scenes.reduce((count, scene) => {
    let c = count;
    if (scene.startFrame) c++;
    if (scene.endFrame && scene.hasAction) c++;
    return c;
  }, 0);

  const videoCount = scenes.filter(s => s.videoUrl).length;

  const handleDownload = async (type: DownloadType) => {
    setIsDownloading(true);
    setProgress(0);
    setTotal(0);

    try {
      await batchDownloadMedia(scenes, type, (current, total) => {
        setProgress(current);
        setTotal(total);
      });
      showToast(`成功下载${type === 'images' ? '图片' : '视频'}！`, 'success');
      onOpenChange(false);
    } catch (error: any) {
      console.error('批量下载失败:', error);
      showToast(error.message || '下载失败，请重试', 'error');
    } finally {
      setIsDownloading(false);
      setProgress(0);
      setTotal(0);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
      classNames={{
        base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50"
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="text-slate-100 flex items-center gap-2">
              <Download className="w-5 h-5 text-blue-400" />
              批量下载
            </ModalHeader>
            <ModalBody>
              {isDownloading ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-300">
                    正在下载并打包... ({progress}/{total})
                  </p>
                  <Progress
                    value={(progress / total) * 100}
                    className="w-full"
                    color="primary"
                    aria-label="下载进度"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-300">
                    选择要下载的内容类型：
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      className="h-24 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 hover:from-blue-500/30 hover:to-cyan-500/30"
                      onPress={() => handleDownload('images')}
                      isDisabled={imageCount === 0 || isDownloading}
                    >
                      <Image className="w-8 h-8 text-blue-400" />
                      <div className="text-center">
                        <div className="text-sm font-semibold text-slate-100">下载图片</div>
                        <div className="text-xs text-slate-400">{imageCount} 张</div>
                      </div>
                    </Button>
                    <Button
                      className="h-24 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 hover:from-purple-500/30 hover:to-pink-500/30"
                      onPress={() => handleDownload('videos')}
                      isDisabled={videoCount === 0 || isDownloading}
                    >
                      <Video className="w-8 h-8 text-purple-400" />
                      <div className="text-center">
                        <div className="text-sm font-semibold text-slate-100">下载视频</div>
                        <div className="text-xs text-slate-400">{videoCount} 个</div>
                      </div>
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    文件将被打包成ZIP格式下载到您的浏览器
                  </p>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button
                variant="flat"
                onPress={onClose}
                className="bg-slate-800/80 text-slate-300"
                isDisabled={isDownloading}
              >
                {isDownloading ? '下载中...' : '关闭'}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default BatchDownloadModal;
