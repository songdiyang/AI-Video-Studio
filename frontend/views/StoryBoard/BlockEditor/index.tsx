/** 积木编辑器兼容入口；底部面板与独立入口共用 DialogEditor 业务。 */
import React from 'react';
import DialogEditor, { type DialogEditorProps } from './DialogEditor';
import type { BlockEditorProps } from './types/blockTypes';

type Props = BlockEditorProps & Pick<DialogEditorProps,
  'textModel' | 'onTextModelChange' | 'multimodalModel' | 'onMultimodalModelChange' |
  'panel' | 'onRegisterEditor' | 'onStatusChange'>;

const BlockEditor: React.FC<Props> = ({
  initialBlocks = [], initialConnections, onChange, onSave, characters = [], scenes,
  basePrompt, ...props
}) => {
  const text = initialBlocks.map(block => block.type === 'text' ? (block.data as { text: string }).text : '').join('');
  // 独立入口保留原先的基础描述回退；面板字段由明确的 fields 提供。
  const initialPrompt = props.panel ? text : text.trim() || basePrompt || '';
  const state = (prompt: string, isDirty: boolean) => ({
    blocks: [], connections: [], selectedBlockId: null, draggedBlockId: null,
    generatedPrompt: prompt, isDirty,
  });
  return (
    <DialogEditor
      {...props}
      basePrompt={basePrompt}
      initialPrompt={initialPrompt}
      sceneCharacters={characters}
      onChange={prompt => onChange?.(state(prompt, true))}
      onSave={async prompt => onSave ? (await onSave(state(prompt, false))) !== false : false}
    />
  );
};
export default BlockEditor;
