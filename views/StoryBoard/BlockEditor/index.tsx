/**
 * 积木编程编辑器主入口
 * 可视化分镜描述编辑器
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@heroui/react';
import { Save, Trash2, Wand2 } from 'lucide-react';
import { Block, BlockConnection, BlockEditorProps, BlockEditorState, ProjectCharacter, ProjectScene } from './types/blockTypes';
import { generatePromptText } from './utils/promptBuilder';
import { useToast } from '../../../contexts/ToastContext';
import BlockPalette from './components/BlockPalette';
import BlockCanvas from './components/BlockCanvas';
import PromptPreview from './components/PromptPreview';

const BlockEditor: React.FC<BlockEditorProps> = ({
  storyboardId,
  initialBlocks = [],
  initialConnections = [],
  onChange,
  onSave,
  projectId,
  characters = [],
  scenes = [],
  availableFrames,
}) => {
  const { showToast } = useToast();

  // 编辑器状态
  const [state, setState] = useState<BlockEditorState>({
    blocks: initialBlocks,
    connections: initialConnections,
    selectedBlockId: null,
    draggedBlockId: null,
    generatedPrompt: '',
    isDirty: false,
  });

  // 加载项目资源
  const [projectCharacters, setProjectCharacters] = useState<ProjectCharacter[]>(characters);
  const [projectScenes, setProjectScenes] = useState<ProjectScene[]>(scenes);

  // 当积木变化时生成提示词
  useEffect(() => {
    const prompt = generatePromptText(state.blocks);
    setState((prev) => ({
      ...prev,
      generatedPrompt: prompt,
      isDirty: true,
    }));
    onChange?.({ ...state, generatedPrompt: prompt });
  }, [state.blocks]);

  // 处理积木变化
  const handleBlocksChange = useCallback((blocks: Block[]) => {
    setState((prev) => ({ ...prev, blocks, isDirty: true }));
  }, []);

  // 选择积木
  const handleSelectBlock = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, selectedBlockId: id }));
  }, []);

  // 删除积木
  const handleDeleteBlock = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== id),
      selectedBlockId: prev.selectedBlockId === id ? null : prev.selectedBlockId,
      isDirty: true,
    }));
  }, []);

  // 清空画布
  const handleClear = useCallback(() => {
    setState((prev) => ({
      ...prev,
      blocks: [],
      connections: [],
      selectedBlockId: null,
      generatedPrompt: '',
      isDirty: true,
    }));
    showToast('画布已清空', 'info');
  }, [showToast]);

  // 保存
  const handleSave = useCallback(async () => {
    try {
      // 构建保存数据
      const saveData = {
        storyboardId,
        blocks: state.blocks,
        connections: state.connections,
        generatedPrompt: state.generatedPrompt,
      };

      // 调用保存回调
      await onSave?.(state);

      setState((prev) => ({ ...prev, isDirty: false }));
      showToast('分镜描述已保存', 'success');
    } catch (error) {
      showToast('保存失败', 'error');
      console.error('[BlockEditor] Save error:', error);
    }
  }, [storyboardId, state, onSave, showToast]);

  // 应用提示词到分镜
  const handleApplyPrompt = useCallback(() => {
    if (!state.generatedPrompt) {
      showToast('请先生成分镜描述', 'warning');
      return;
    }

    // 触发保存并应用
    handleSave();
  }, [state.generatedPrompt, handleSave, showToast]);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-body)] rounded-lg border border-[var(--border-color)] overflow-hidden">
      {/* 头部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-[var(--accent)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            可视化分镜编辑器
          </h2>
          {state.isDirty && (
            <span className="text-xs text-[var(--text-muted)]">(未保存)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="flat"
            className="bg-[var(--bg-input)] text-[var(--text-secondary)]"
            startContent={<Trash2 className="w-3.5 h-3.5" />}
            onPress={handleClear}
            isDisabled={state.blocks.length === 0}
          >
            清空
          </Button>
          <Button
            size="sm"
            className="pro-btn-primary"
            startContent={<Save className="w-3.5 h-3.5" />}
            onPress={handleSave}
            isDisabled={!state.isDirty || state.blocks.length === 0}
          >
            保存
          </Button>
        </div>
      </div>

      {/* 主编辑区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧积木面板 */}
        <BlockPalette
          onDragStart={(type) => {
            setState((prev) => ({ ...prev, draggedBlockId: type }));
          }}
        />

        {/* 中央画布区域 */}
        <div className="flex flex-1 flex-col">
          {/* 可拖拽的首尾帧缩略图栏 */}
          {availableFrames && (availableFrames.startFrame || availableFrames.endFrame) && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
              <span className="text-xs text-[var(--text-muted)]">拖拽参考:</span>
              {availableFrames.startFrame && (
                <div
                  className="relative w-12 h-8 rounded overflow-hidden cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-[var(--accent)]/50 transition-all"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify({
                      type: 'reference-image',
                      imageUrl: availableFrames.startFrame,
                      source: 'frame',
                      frameType: 'start'
                    }));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  title="拖拽首帧到画布"
                >
                  <img
                    src={availableFrames.startFrame}
                    alt="首帧"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center text-white bg-black/50">首帧</span>
                </div>
              )}
              {availableFrames.endFrame && (
                <div
                  className="relative w-12 h-8 rounded overflow-hidden cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-[var(--accent)]/50 transition-all"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify({
                      type: 'reference-image',
                      imageUrl: availableFrames.endFrame,
                      source: 'frame',
                      frameType: 'end'
                    }));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  title="拖拽尾帧到画布"
                >
                  <img
                    src={availableFrames.endFrame}
                    alt="尾帧"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center text-white bg-black/50">尾帧</span>
                </div>
              )}
            </div>
          )}

          {/* 中央画布 */}
          <BlockCanvas
            blocks={state.blocks}
            selectedBlockId={state.selectedBlockId}
            characters={projectCharacters}
            scenes={projectScenes}
            onBlocksChange={handleBlocksChange}
            onSelectBlock={handleSelectBlock}
            onDeleteBlock={handleDeleteBlock}
          />
        </div>
      </div>

      {/* 底部提示词预览 */}
      <PromptPreview
        prompt={state.generatedPrompt}
        onRegenerate={() => {
          // 重新生成提示词（基于当前积木状态）
          const prompt = generatePromptText(state.blocks);
          setState((prev) => ({ ...prev, generatedPrompt: prompt }));
        }}
      />
    </div>
  );
};

export default BlockEditor;
