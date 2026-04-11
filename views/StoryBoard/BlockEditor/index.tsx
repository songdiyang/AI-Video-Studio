/**
 * 积木编程编辑器主入口
 * 对话框式分镜描述编辑器
 */

import React from 'react';
import DialogEditor from './DialogEditor';
import { BlockEditorProps } from './types/blockTypes';

const BlockEditor: React.FC<BlockEditorProps> = ({
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
}) => {
  // 将积木块转换为提示词文本
  const initialPrompt = initialBlocks
    .map(block => {
      if (block.type === 'text') {
        return (block.data as { text: string }).text;
      }
      return '';
    })
    .filter(Boolean)
    .join('');

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
    />
  );
};

export default BlockEditor;
