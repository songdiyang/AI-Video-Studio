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

  // 分镜保存/生成回调按目标 sceneId 绑定，避免 selectedScene 滞后写错对象
  const bindSceneAction = useCallback(<T extends unknown[]>(fn: ((sceneId: number, ...args: T) => Promise<boolean>) | undefined) =>
    fn ? (sceneId: number, ...args: T) => fn(sceneId, ...args) : undefined, []);
  const bindSceneAction0 = useCallback(<T extends unknown[]>(fn: ((sceneId: number, ...args: T) => Promise<boolean>) | undefined) =>
    fn ? (sceneId: number, ...args: T) => fn(sceneId, ...args) : undefined, []);

  // 剧本生成成功回调
  const handleScriptGenerated = useCallback(async (payload: any) => {
    if (!payload) return;
    showToast('剧本生成成功！', 'success');

    try {
      // 确定目标项目ID（优先用 payload 中的 projectId，回退到当前项目）
      const targetProjectId = payload.projectId || state.currentProjectId;
      const targetEpisode = payload.episodeNumber || payload.episode_number || 1;

      console.log('[PreviewEditorPlugin] 剧本生成成功，目标项目:', targetProjectId, '目标集数:', targetEpisode, '当前集数:', state.currentEpisode);
      console.log('[PreviewEditorPlugin] payload 内容长度:', payload.content?.length || 0, 'payload.scriptId:', payload.scriptId);

      // 1. 从项目级别接口刷新剧本列表（仅当前项目的剧本，保持集数绑定）
      const projectRes = await fetch(`/api/scripts/project/${targetProjectId}`);
      let formattedScripts: any[] = [];
      if (projectRes.ok) {
        const projectData = await projectRes.json();
        const projectScripts = projectData.scripts || [];
        formattedScripts = projectScripts.map((s: any) => ({
          id: s.id,
          episode_number: s.episode_number || 1,
          title: s.title || `第${s.episode_number || 1}集`,
          status: s.status || 'completed',
        }));
      } else {
        // 回退：如果项目接口失败，使用 payload 构造最小剧本列表
        formattedScripts = [{
          id: payload.scriptId,
          episode_number: targetEpisode,
          title: payload.title || `第${targetEpisode}集`,
          status: 'completed',
        }];
      }
      console.log('[PreviewEditorPlugin] 刷新后的剧本列表:', formattedScripts.map(s => ({ id: s.id, episode: s.episode_number })));
      setState('scripts', formattedScripts);

      // 剧本与分镜解耦为参考关系：生成剧本后仅刷新剧本列表（作为参考可用），
      // 不再自动切换集数或强制将剧本正文写入分镜当前编辑内容，避免不必要的强绑定。
    } catch (err) {
      console.error('[PreviewEditorPlugin] 剧本生成后刷新失败:', err);
    }
  }, [showToast, setState, state.currentProjectId]);

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
        onUpdateDescription: async (desc) => (selectedScene ? await sceneActions.updateDescription(selectedScene, desc) : false),
        onUpdateBaseDescription: async (desc) => (selectedScene ? await sceneActions.updateBaseDescription(selectedScene, desc) : false),
        onUpdateVideoPrompt: async (prompt) => (selectedScene ? await sceneActions.updateVideoPrompt(selectedScene, prompt) : false),
        onUpdateFirstFramePrompt: async (prompt) => (selectedScene ? await sceneActions.updateFirstFramePrompt(selectedScene, prompt) : false),
        onUpdateLastFramePrompt: async (prompt) => (selectedScene ? await sceneActions.updateLastFramePrompt(selectedScene, prompt) : false),
        onUpdateDialogues: async (dialogues) => (selectedScene ? await sceneActions.updateDialogues(selectedScene, dialogues) : false),
        onUpdateVoiceover: async (voiceover) => (selectedScene ? await sceneActions.updateVoiceover(selectedScene, voiceover) : false),
        onGenerateImage: generationActions.generateImage,
        onGenerateVideo: generationActions.generateVideo,
        models: state.models,
        imageModel: state.currentImageModel,
        videoModel: state.currentVideoModel,
        onImageModelChange: (model: string) => setState('currentImageModel', model),
        onVideoModelChange: (model: string) => setState('currentVideoModel', model),
        multimodalModel: state.currentMultimodalModel,
        onMultimodalModelChange: (model: string) => setState('currentMultimodalModel', model),
        textModel: state.textModel,
        onTextModelChange: (model: string) => setState('textModel', model),
        // 传递项目资源数据，避免 DirectorSpace 重复加载
        projectCharacters: state.projectCharacters,
        projectScenes: state.projectScenes,
        projectProps: state.projectProps,
      }}
    />
  );
};

export default PreviewEditorPlugin;
