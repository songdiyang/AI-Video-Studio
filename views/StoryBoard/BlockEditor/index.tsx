/**
 * 积木编程编辑器主入口
 * 对话框式分镜描述编辑器
 */

import React from 'react';
import DialogEditor from './DialogEditor';
import { BlockEditorProps } from './types/blockTypes';

const BlockEditor: React.FC<BlockEditorProps & {
  textModel?: string;
  onTextModelChange?: (model: string) => void;
}> = ({
  storyboardId,
  initialBlocks = [],
  onChange,
  onSave,
  projectId,
  characters = [],
  scenes = [],
  availableFrames,
  scriptId,
  dialogue,
  dialogues,
  onUpdateDialogues,
  voiceover,
  onUpdateVoiceover,
  negativePrompt,
  onUpdateNegativePrompt,
  promptMode = 'image',
  basePrompt,
  models,
  imageModel,
  videoModel,
  onImageModelChange,
  onVideoModelChange,
  onGenerateImage,
  onGenerateVideo,
  hasAction,
  imageFrameTab,
  textModel,
  onTextModelChange,
}) => {
  // 将积木块转换为提示词文本，若为空则使用 basePrompt（分镜描述）作为 fallback
  const initialPrompt = initialBlocks
    .map(block => {
      if (block.type === 'text') {
        return (block.data as { text: string }).text;
      }
      return '';
    })
    .filter(Boolean)
    .join('')
    .trim() || basePrompt || '';

  const handleChange = (prompt: string) => {
    onChange?.({
      blocks: [],
      connections: [],
      selectedBlockId: null,
      draggedBlockId: null,
      generatedPrompt: prompt,
      isDirty: true,
    });
  };

  const handleSave = async (prompt: string): Promise<boolean> => {
    if (onSave) {
      const result = await onSave({
        blocks: [],
        connections: [],
        selectedBlockId: null,
        draggedBlockId: null,
        generatedPrompt: prompt,
        isDirty: false,
      });
      return result ?? true;
    }
    return true;
  };

  return (
    <DialogEditor
      storyboardId={storyboardId}
      initialPrompt={initialPrompt}
      onChange={handleChange}
      onSave={handleSave}
      projectId={projectId}
      scriptId={scriptId}
      availableFrames={availableFrames}
      dialogue={dialogue}
      dialogues={dialogues}
      sceneCharacters={characters}
      onUpdateDialogues={onUpdateDialogues}
      voiceover={voiceover}
      onUpdateVoiceover={onUpdateVoiceover}
      negativePrompt={negativePrompt}
      onUpdateNegativePrompt={onUpdateNegativePrompt}
      promptMode={promptMode}
      basePrompt={basePrompt}
      models={models}
      imageModel={imageModel}
      videoModel={videoModel}
      onImageModelChange={onImageModelChange}
      onVideoModelChange={onVideoModelChange}
      onGenerateImage={onGenerateImage}
      onGenerateVideo={onGenerateVideo}
      hasAction={hasAction}
      imageFrameTab={imageFrameTab}
      textModel={textModel}
      onTextModelChange={onTextModelChange}
    />
  );
};

export default BlockEditor;
