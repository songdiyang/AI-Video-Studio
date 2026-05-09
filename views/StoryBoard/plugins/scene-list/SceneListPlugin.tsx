/**
 * 分镜列表插件
 * 原 SceneList 组件的插件化包装
 */

import React from 'react';
import SceneList from '../../SceneList';
import { useStoryboardContext } from '../../core/StoryboardContext';

const SceneListPlugin: React.FC = () => {
  const {
    scenes,
    selectedScene,
    setSelectedScene,
    isLoading,
    sceneActions,
    generationActions,
    state,
    setState,
    tasks,
  } = useStoryboardContext();

  return (
    <SceneList
      scenes={scenes}
      selectedScene={selectedScene}
      projectId={state.currentProjectId}
      scriptId={state.currentScriptId}
      onSelectScene={setSelectedScene}
      onAddScene={sceneActions.addScene}
      onInsertScene={sceneActions.insertScene}
      onDeleteScene={sceneActions.deleteScene}
      onMoveScene={sceneActions.moveScene}
      onUpdateDescription={sceneActions.updateDescription}
      onReorderScenes={sceneActions.reorderScenes}
      onGenerateImage={generationActions.generateImage}
      onGenerateVideo={generationActions.generateVideo}
      onUpdateScene={async (id, updates) => {
        await sceneActions.updateScene(id, updates);
      }}
      tasks={tasks}
      onBatchGenerate={(overwrite) => generationActions.handleBatchFrameGeneration(overwrite)}
      isBatchGenerating={state.isBatchFrameSubmitting}
      batchProgress={0}
      onBatchGenerateVideo={(overwrite) => generationActions.handleBatchVideoGeneration(overwrite)}
      isBatchGeneratingVideo={state.isBatchVideoSubmitting}
      batchVideoProgress={0}
      isLoading={isLoading}
      onBatchDownload={() => setState('showBatchDownloadModal', true)}
      onPlayAnimatic={() => {
        const event = new CustomEvent('openAnimaticTab', {
          detail: { scriptId: state.currentScriptId }
        });
        window.dispatchEvent(event);
      }}
    />
  );
};

export default SceneListPlugin;
