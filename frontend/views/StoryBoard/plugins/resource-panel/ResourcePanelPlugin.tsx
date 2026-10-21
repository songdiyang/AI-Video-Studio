/**
 * 资源面板插件
 * 原 ResourcePanel 组件的插件化包装
 */

import React, { useMemo } from 'react';
import ResourcePanel from '../../ResourcePanel';
import { useStoryboardContext } from '../../core/StoryboardContext';

const ResourcePanelPlugin: React.FC = () => {
  const {
    scenes,
    state,
    selectedScene,
    sceneActions,
    resourceActions,
  } = useStoryboardContext();

  // 收集资源面板数据
  const allCharacters = useMemo(() => 
    [...new Set(scenes.flatMap(s => s.characters))], [scenes]);
  const allLocations = useMemo(() => 
    [...new Set(scenes.map(s => s.location).filter(Boolean))], [scenes]);
  const allPropNames = useMemo(() => 
    [...new Set(scenes.flatMap(s => s.props || []))], [scenes]);
  const allProps = useMemo(() => {
    const dbNames = new Set(state.projectProps.map((p: any) => p.name));
    const extraNames = allPropNames.filter(n => !dbNames.has(n));
    const extraProps = extraNames.map(name => ({ id: 0, name }));
    return [...state.projectProps, ...extraProps];
  }, [state.projectProps, allPropNames]);

  // 分镜级角色状态覆写
  const selectedSceneObj = scenes.find(s => s.id === selectedScene);
  const storyboardStates = selectedSceneObj?.characterStates || {};

  const handleStoryboardStateChange = async (characterId: number, newState: any) => {
    if (!selectedScene) return;
    const currentStates = { ...(selectedSceneObj?.characterStates || {}) };
    if (newState) {
      currentStates[characterId] = newState;
    } else {
      delete currentStates[characterId];
    }
    await sceneActions.updateCharacterStates(selectedScene, currentStates);
  };

  return (
    <ResourcePanel
      characters={allCharacters}
      locations={allLocations}
      props={allProps}
      projectId={state.currentProjectId}
      scriptId={state.currentScriptId}
      scenes={scenes}
      imageModel={state.currentImageModel}
      imageAspectRatio={state.imageAspectRatio}
      textModel={state.textModel || ''}
      models={state.models}
      storyboardStates={storyboardStates}
      onStoryboardStateChange={handleStoryboardStateChange}
      onRefreshProps={resourceActions.fetchProjectProps}
    />
  );
};

export default ResourcePanelPlugin;
