/**
 * 预览编辑插件
 * 原 PreviewEditor 组件的插件化包装
 */

import React, { useCallback } from 'react';
import PreviewEditor from '../../../../components/PreviewEditor';
import { useStoryboardContext } from '../../core/StoryboardContext';
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
      // 确定目标项目ID（优先用 payload 中的 projectId，回退到当前项目）
      const targetProjectId = payload.projectId || state.currentProjectId;
      const targetEpisode = payload.episodeNumber || payload.episode_number || 1;

      console.log('[PreviewEditorPlugin] 剧本生成成功，目标项目:', targetProjectId, '目标集数:', targetEpisode, '当前集数:', state.currentEpisode);
      console.log('[PreviewEditorPlugin] payload 内容长度:', payload.content?.length || 0, 'payload.scriptId:', payload.scriptId);

      // 1. 从项目级别接口刷新剧本列表（仅当前项目的剧本，保持集数绑定）
      const token = getAuthToken();
      const projectRes = await fetch(`/api/scripts/project/${targetProjectId}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
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

      // 2. 如果生成的是当前项目+集数，刷新剧本内容
      if (targetProjectId && state.currentProjectId === targetProjectId) {
        // 3. 如果当前不在目标集数，先切换到目标集数（切换会触发剧本内容自动加载）
        if (state.currentEpisode !== targetEpisode) {
          console.log('[PreviewEditorPlugin] 当前集数与目标集数不一致，切换到目标集数:', targetEpisode);
          const targetScript = formattedScripts.find((s: any) => s.episode_number === targetEpisode);
          if (targetScript) {
            handleEpisodeSelect(targetScript);
          }
        } else {
          // 当前已在目标集数，优先使用 payload 中的内容（避免请求时序问题）
          console.log('[PreviewEditorPlugin] 当前已在目标集数，直接刷新剧本内容');
          if (payload.content) {
            console.log('[PreviewEditorPlugin] 使用 payload.content 直接设置, 长度:', payload.content.length);
            setState('scriptContent', payload.content);
            setState('scriptTitle', payload.title || `第${targetEpisode}集`);
          } else {
            // payload 无内容时回退到接口请求
            console.log('[PreviewEditorPlugin] payload 无内容，回退到接口请求');
            const refreshRes = await fetch(`/api/scripts/project/${targetProjectId}/episode/${targetEpisode}`, {
              headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            });
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              const refreshedScript = refreshData?.script;
              console.log('[PreviewEditorPlugin] 接口刷新结果:', refreshedScript ? { id: refreshedScript.id, contentLength: refreshedScript.content?.length } : '无剧本');
              if (refreshedScript) {
                setState('scriptContent', refreshedScript.content || null);
                setState('scriptTitle', refreshedScript.title || `第${targetEpisode}集`);
              }
            }
          }
        }
      } else {
        console.log('[PreviewEditorPlugin] 项目不匹配，跳过内容刷新。targetProjectId:', targetProjectId, 'currentProjectId:', state.currentProjectId);
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
