import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Spinner } from '@heroui/react';
import { Play, Film, X, Download } from 'lucide-react';
import { StoryboardScene } from '../useSceneManager';
import { useToast } from '../../../contexts/ToastContext';
import { useConfirm } from '../../../contexts/ConfirmContext';

interface VideoPreviewModalProps {
  scene: StoryboardScene;
  index: number;
  isGeneratingVideo: boolean;
  onGenerateVideo: () => void;
  onDeleteVideo?: () => void;
  showVideoPreview: boolean;
  setShowVideoPreview: (show: boolean) => void;
  isModal?: boolean;
}

const VideoPreviewModal: React.FC<VideoPreviewModalProps> = ({
  scene,
  index,
  isGeneratingVideo,
  onGenerateVideo,
  onDeleteVideo,
  showVideoPreview,
  setShowVideoPreview,
  isModal = false
}) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const handleDownload = async () => {
    if (!scene.videoUrl) return;
    try {
      const response = await fetch(scene.videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `video_scene_${index + 1}_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('下载失败:', error);
      showToast('下载失败，请重试', 'error');
    }
  };

  if (isModal) {
    return (
      <Modal 
        isOpen={showVideoPreview} 
        onOpenChange={setShowVideoPreview}
        size="2xl"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2 text-slate-100">
                <Play className="w-5 h-5 text-blue-400" />
                视频预览 - 分镜 {index + 1}
              </ModalHeader>
              <ModalBody>
                {scene.videoUrl ? (
                  <video 
                    src={scene.videoUrl}
                    controls
                    autoPlay
                    className="w-full rounded-lg"
                    style={{ maxHeight: '60vh' }}
                  />
                ) : (
                  <div className="text-center py-10 text-slate-500">
                    暂无视频
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  关闭
                </Button>
                <Button
                  className="bg-gradient-to-r from-blue-500 to-violet-600 text-white font-semibold"
                  startContent={<Download className="w-4 h-4" />}
                  onPress={handleDownload}
                  isDisabled={!scene.videoUrl}
                >
                  下载视频
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    );
  }

  return (
    <div className="w-40 h-24 rounded-xl flex-shrink-0 relative overflow-hidden group border-2 border-orange-300 bg-black">
      <video 
        src={scene.videoUrl}
        className="w-full h-full object-cover cursor-pointer"
        onClick={() => setShowVideoPreview(true)}
        muted
        loop
        autoPlay
        playsInline
      />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2">
        <button
          onClick={() => setShowVideoPreview(true)}
          className="p-2 bg-white/90 rounded-full hover:bg-white transition-colors"
          title="预览视频"
        >
          <Play className="w-4 h-4 text-slate-700" />
        </button>
        <button
          onClick={handleDownload}
          className="p-2 bg-blue-500/90 rounded-full hover:bg-blue-500 transition-colors"
          title="下载视频"
        >
          <Download className="w-4 h-4 text-white" />
        </button>
        <button
          onClick={onGenerateVideo}
          disabled={isGeneratingVideo}
          className="p-2 bg-orange-500/90 rounded-full hover:bg-orange-500 transition-colors disabled:opacity-50"
          title="重新生成视频"
        >
          {isGeneratingVideo ? (
            <Spinner size="sm" color="white" />
          ) : (
            <Film className="w-4 h-4 text-white" />
          )}
        </button>
      </div>
      <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded font-bold">
        视频
      </div>
      {onDeleteVideo && (
        <button
          onClick={async (e) => {
            e.stopPropagation();
            const confirmed = await confirm({
              title: '删除视频',
              message: '确定要删除该分镜的视频吗？视频文件将从存储桶中永久删除，此操作不可撤销。',
              type: 'danger',
              confirmText: '删除视频'
            });
            if (confirmed) {
              onDeleteVideo();
            }
          }}
          className="absolute top-1 right-1 p-0.5 bg-red-500/80 rounded-full hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
          title="删除视频"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      )}
    </div>
  );
};

export default VideoPreviewModal;
