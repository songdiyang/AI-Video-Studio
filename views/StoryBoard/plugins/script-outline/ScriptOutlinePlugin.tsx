/**
 * 剧本大纲插件
 * 原 ScriptOutlinePanel 组件的插件化包装
 */

import React from 'react';
import ScriptOutlinePanel from '../../ScriptOutlinePanel';
import { useStoryboardContext } from '../../core/StoryboardContext';

const ScriptOutlinePlugin: React.FC = () => {
  const {
    state,
    setState,
  } = useStoryboardContext();

  return (
    <ScriptOutlinePanel
      scriptContent={state.scriptContent || state.referenceScriptContent}
      scriptTitle={state.scriptContent ? state.scriptTitle : state.referenceScriptTitle}
      isLoading={state.isLoadingScript}
      projectId={state.currentProjectId}
      canPick={true}
      isBoundViaEpisode={!!state.scriptContent && !!state.currentScriptId}
      onPickScript={(_id, item) => {
        setState('referenceScriptContent', item?.content || null);
        setState('referenceScriptTitle', item?.title || (item ? `剧本 #${item.id}` : ''));
      }}
      onCreateNewScript={() => setState('isGenerateScriptOpen', true)}
    />
  );
};

export default ScriptOutlinePlugin;
