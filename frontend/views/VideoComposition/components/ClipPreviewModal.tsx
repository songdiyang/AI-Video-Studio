/**
 * 单个分镜视频预览弹窗
 * 从侧边栏点击片段时弹出
 */

import React, { useRef, useEffect } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, Button } from '@heroui/react';
import { Play, Film } from 'lucide-react';
import type { CompositionClip } from '../types';

interface ClipPreviewModalProps {
  clip: CompositionClip | null;
  isOpen: boolean;
  onClose: () => void;
}

const ClipPreviewModal: React.FC<ClipPreviewModalProps> = ({ clip, isOpen, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isOpen && videoRef.current && clip) {
      videoRef.current.src = clip.videoUrl;
      videoRef.current.load();
    }
  }, [isOpen, clip?.id]);

  if (!clip) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" classNames={{ backdrop: "bg-black/70" }}>
      <ModalContent>
        {(onModalClose) => (
          <>
            <ModalHeader className="flex items-center gap-2 text-sm">
              <Film className="w-4 h-4 text-blue-600" />
              <span>第 {clip.episodeNumber} 集 · 镜头 #{clip.order + 1}</span>
            </ModalHeader>
            <ModalBody className="pb-6">
              <div className="bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  className="w-full max-h-[60vh] object-contain"
                  controls
                  playsInline
                  autoPlay
                />
              </div>
              {(clip.description || clip.dialogue) && (
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  {clip.description || clip.dialogue}
                </p>
              )}
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default ClipPreviewModal;
