import React, { useState } from 'react';
import ImageFrames from './ImageFrames';
import ImagePreviewModal from './ImagePreviewModal';
import GenerateModal from './GenerateModal';

interface SceneImageGeneratorProps {
  sceneId: number;
  startFrame?: string;
  endFrame?: string;
  hasAction?: boolean;
  hasVideo?: boolean;
  sceneDescription: string;
  isGenerating: boolean;
  onGenerate: (prompt: string) => Promise<{ success: boolean; error?: string }>;
  onDeleteFrames?: () => void;
  onDeleteFirstFrame?: () => Promise<void>;
  onDeleteLastFrame?: () => Promise<void>;
}

const SceneImageGenerator: React.FC<SceneImageGeneratorProps> = ({
  sceneId,
  startFrame,
  endFrame,
  hasAction,
  hasVideo,
  sceneDescription,
  isGenerating,
  onGenerate,
  onDeleteFrames,
  onDeleteFirstFrame,
  onDeleteLastFrame
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string>('');
  const [prompt, setPrompt] = useState(sceneDescription);
  const [error, setError] = useState<string | null>(null);

  const hasImages = !!(startFrame || endFrame);

  const handleOpenGenerateModal = () => {
    setPrompt(sceneDescription);
    setError(null);
    setIsOpen(true);
  };

  const handleQuickGenerate = async () => {
    if (isGenerating) return;
    setError(null);
    const result = await onGenerate(sceneDescription);
    
    if (!result.success) {
      setError(result.error || '生成失败');
    }
  };

  const handleGenerate = async () => {
    setError(null);
    const result = await onGenerate(prompt);
    
    if (!result.success) {
      setError(result.error || '生成失败');
    } else {
      setIsOpen(false);
    }
  };

  const openPreview = (imageUrl: string) => {
    setPreviewImage(imageUrl);
    setIsPreviewOpen(true);
  };

  return (
    <>
      <ImageFrames
        startFrame={startFrame}
        endFrame={endFrame}
        hasAction={hasAction}
        hasVideo={hasVideo}
        isGenerating={isGenerating}
        hasImages={hasImages}
        onQuickGenerate={handleQuickGenerate}
        onOpenGenerateModal={handleOpenGenerateModal}
        onPreview={openPreview}
        onDeleteFrames={onDeleteFrames}
        onDeleteFirstFrame={onDeleteFirstFrame}
        onDeleteLastFrame={onDeleteLastFrame}
        error={error}
      />

      <ImagePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        imageUrl={previewImage}
      />

      <GenerateModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        prompt={prompt}
        onPromptChange={setPrompt}
        hasImages={hasImages}
        startFrame={startFrame}
        endFrame={endFrame}
        isGenerating={isGenerating}
        error={error}
        onGenerate={handleGenerate}
      />
    </>
  );
};

export default SceneImageGenerator;
