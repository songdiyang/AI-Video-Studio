/**
 * 预览编辑插件
 * 原 PreviewEditor 组件的插件化包装
 */

import React, { useCallback } from 'react';
import PreviewEditor from '../../../../components/PreviewEditor';
import { useStoryboardContext } from '../../core/StoryboardContext';

const PreviewEditorPlugin: React.FC = () => {
  const {
    scenes,
    selectedScene,
    setSelectedScene,
    state,
    sceneActions,
    generationActions,
    tasks,
    setState,
    handleEpisodeSelect,
  } = useStoryboardContext();

  const selectedSceneData = scenes.find(s => s.id === selectedScene);

  // 标签页跨集点击时切换集数
  const handleEpisodeChangeFromTab = useCallback((episodeNumber: number) => {
    const script = state.scripts.find(s => s.episode_number === episodeNumber);
    if (script) {
      handleEpisodeSelect(script);
    }
  }, [state.scripts, handleEpisodeSelect]);

  return (
    <PreviewEditor
      scenes={scenes}
      selectedScene={selectedScene}
      onSelectScene={setSelectedScene}
      scriptId={state.currentScriptId}
      episodeNumber={state.currentEpisode}
      onEpisodeChange={handleEpisodeChangeFromTab}
      scenePreviewProps={{
        projectId: state.currentProjectId,
        scriptId: state.currentScriptId,
        onUpdateDescription: async (desc) => {
          if (selectedScene) return await sceneActions.updateDescription(selectedScene, desc);
          return false;
        },
        onUpdateBaseDescription: async (desc) => {
          if (selectedScene) return await sceneActions.updateBaseDescription(selectedScene, desc);
          return false;
        },
        onUpdateVideoPrompt: async (prompt) => {
          if (selectedScene) return await sceneActions.updateVideoPrompt(selectedScene, prompt);
          return false;
        },
        onUpdateFirstFramePrompt: async (prompt) => {
          if (selectedScene) return await sceneActions.updateFirstFramePrompt(selectedScene, prompt);
          return false;
        },
        onUpdateLastFramePrompt: async (prompt) => {
          if (selectedScene) return await sceneActions.updateLastFramePrompt(selectedScene, prompt);
          return false;
        },
        onUpdateDialogues: async (dialogues) => {
          if (selectedScene) return await sceneActions.updateDialogues(selectedScene, dialogues);
          return false;
        },
        onUpdateVoiceover: async (voiceover) => {
          if (selectedScene) return await sceneActions.updateVoiceover(selectedScene, voiceover);
          return false;
        },
        onUpdateCharactersAndLocation: async (characters, location, characterIds, sceneId) => {
          if (selectedScene) return await sceneActions.updateCharactersAndLocation(selectedScene, characters, location, characterIds, sceneId);
          return false;
        },
        projectCharacters: state.projectCharacters,
        projectScenes: state.projectScenes,
        projectProps: state.projectProps,
        onUpdateProps: async (props) => {
          if (selectedScene) return await sceneActions.updateProps(selectedScene, props);
          return false;
        },
        onGenerateImage: generationActions.generateImage,
        onGenerateVideo: generationActions.generateVideo,
        onGenerateWithCamera: generationActions.generateWithCamera,
        onGenerateWithPaint: generationActions.generateWithPaint,
        onGenerateWithSketch: generationActions.generateWithSketch,
        onGenerateHdRepair: generationActions.generateHdRepair,
        onUpdateScene: async (updates) => {
          if (selectedScene) {
            await sceneActions.updateScene(selectedScene, updates);
            return true;
          }
          return false;
        },
        onUpdateDuration: (duration) => {
          if (selectedScene) return sceneActions.updateDuration(selectedScene, duration);
          return Promise.resolve(false);
        },
        imageTask: selectedScene ? tasks[`img_${selectedScene}`] : undefined,
        videoTask: selectedScene ? tasks[`vid_${selectedScene}`] : undefined,
        models: state.models,
        imageModel: state.currentImageModel,
        videoModel: state.currentVideoModel,
        onImageModelChange: (model: string) => setState('currentImageModel', model),
        onVideoModelChange: (model: string) => setState('currentVideoModel', model),
        hideDirectorSpace: true,
      }}
      directorSpaceProps={{
        projectId: state.currentProjectId,
        scriptId: state.currentScriptId,
        onUpdateDescription: async (desc) => {
          if (selectedScene) return await sceneActions.updateDescription(selectedScene, desc);
          return false;
        },
        onUpdateBaseDescription: async (desc) => {
          if (selectedScene) return await sceneActions.updateBaseDescription(selectedScene, desc);
          return false;
        },
        onUpdateVideoPrompt: async (prompt) => {
          if (selectedScene) return await sceneActions.updateVideoPrompt(selectedScene, prompt);
          return false;
        },
        onUpdateFirstFramePrompt: async (prompt) => {
          if (selectedScene) return await sceneActions.updateFirstFramePrompt(selectedScene, prompt);
          return false;
        },
        onUpdateLastFramePrompt: async (prompt) => {
          if (selectedScene) return await sceneActions.updateLastFramePrompt(selectedScene, prompt);
          return false;
        },
        onUpdateDialogues: async (dialogues) => {
          if (selectedScene) return await sceneActions.updateDialogues(selectedScene, dialogues);
          return false;
        },
        onUpdateVoiceover: async (voiceover) => {
          if (selectedScene) return await sceneActions.updateVoiceover(selectedScene, voiceover);
          return false;
        },
        onGenerateImage: generationActions.generateImage,
        models: state.models,
        imageModel: state.currentImageModel,
        onImageModelChange: (model: string) => setState('currentImageModel', model),
        multimodalModel: state.currentMultimodalModel,
        onMultimodalModelChange: (model: string) => setState('currentMultimodalModel', model),
        // 传递项目资源数据，避免 DirectorSpace 重复加载
        projectCharacters: state.projectCharacters,
        projectScenes: state.projectScenes,
        projectProps: state.projectProps,
      }}
    />
  );
};

export default PreviewEditorPlugin;
