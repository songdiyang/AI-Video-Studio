/**
 * 预览编辑插件
 * 原 PreviewEditor 组件的插件化包装
 */

import React, { useCallback } from 'react';
import PreviewEditor from '../../../../components/PreviewEditor';
import { useStoryboardContext } from '../../core/StoryboardContext';
import { fetchScripts } from '../../../../services/scripts';
import { getAuthToken } from '../../../../services/auth';

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
    showToast,
  } = useStoryboardContext();

  const selectedSceneData = scenes.find(s => s.id === selectedScene);

  // 标签页跨集点击时切换集数
  const handleEpisodeChangeFromTab = useCallback((episodeNumber: number) => {
    const script = state.scripts.find(s => s.episode_number === episodeNumber);
    if (script) {
      handleEpisodeSelect(script);
    }
  }, [state.scripts, handleEpisodeSelect]);

  // 剧本生成成功回调
  const handleScriptGenerated = useCallback(async (payload: any) => {
    if (!payload) return;
    showToast('剧本生成成功！', 'success');

    try {
      // 1. 刷新剧本列表
      const refreshedScripts = await fetchScripts();
      const formattedScripts = refreshedScripts.map((s: any) => ({
        id: s.id,
        episode_number: s.episode_number || 1,
        title: s.title || `第${s.episode_number || 1}集`,
        status: s.status || 'completed',
      }));
      setState('scripts', formattedScripts);

      // 2. 确定目标集数
      const targetEpisode = payload.episodeNumber || payload.episode_number || 1;
      const targetProjectId = payload.projectId || state.currentProjectId;

      // 3. 如果生成的是当前项目+集数，刷新剧本内容（仅刷新大纲面板，不刷新整个工作台）
      if (targetProjectId && state.currentProjectId === targetProjectId) {
        const token = getAuthToken();
        const res = await fetch(`/api/scripts/project/${targetProjectId}/episode/${targetEpisode}`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        if (res.ok) {
          const data = await res.json();
          const script = data?.script;
          if (script) {
            // 直接更新剧本内容状态，触发大纲面板重新渲染
            setState('scriptContent', script.content || null);
            setState('scriptTitle', script.title || `第${targetEpisode}集`);
          }
        }

        // 4. 如果当前不在目标集数，切换到目标集数
        if (state.currentEpisode !== targetEpisode) {
          const targetScript = formattedScripts.find((s: any) => s.episode_number === targetEpisode);
          if (targetScript) {
            handleEpisodeSelect(targetScript);
          }
        }
      }
    } catch (err) {
      console.error('[PreviewEditorPlugin] 剧本生成后刷新失败:', err);
    }
  }, [showToast, setState, state.currentProjectId, state.currentEpisode, handleEpisodeSelect]);

  return (
    <PreviewEditor
      scenes={scenes}
      selectedScene={selectedScene}
      onSelectScene={setSelectedScene}
      scriptId={state.currentScriptId}
      episodeNumber={state.currentEpisode}
      onEpisodeChange={handleEpisodeChangeFromTab}
      projects={[]} // 当前项目已在上下文中，这里传空数组让 ScriptGenerateTab 使用 lockProjectId
      textModel={state.textModel}
      onTextModelChange={(model) => setState('textModel', model)}
      onScriptGenerated={handleScriptGenerated}
      projectId={state.currentProjectId}
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
