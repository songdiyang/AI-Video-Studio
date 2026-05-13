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
    handleEpisodeSelect,
    handleStandaloneEpisodeChange,
    handleCreateNextEpisode,
  } = useStoryboardContext();

  return (
    <SceneList
      scenes={scenes}
      selectedScene={selectedScene}
      projectId={state.currentProjectId}
      scriptId={state.currentScriptId}
      scripts={state.scripts}
      currentEpisode={state.currentEpisode}
      currentScriptId={state.currentScriptId}
      projectName={state.currentProject?.name}
      onSelectScene={setSelectedScene}
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
      onEpisodeSelect={handleEpisodeSelect}
      onStandaloneEpisodeChange={handleStandaloneEpisodeChange}
      onCreateNextEpisode={handleCreateNextEpisode}
      onUpdateEpisodeTitle={async (scriptId, title) => {
        try {
          const { updateScriptTitle, fetchScripts } = await import('../../../../services/scripts');
          await updateScriptTitle(scriptId, title);
          const refreshed = await fetchScripts();
          // 触发重新渲染
          window.dispatchEvent(new CustomEvent('scriptsRefreshed', { detail: refreshed }));
        } catch (err: any) {
          console.error('更新标题失败:', err);
        }
      }}
    />
  );
};

export default SceneListPlugin;
