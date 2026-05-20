/**
 * 剧本大纲插件
 * 原 ScriptOutlinePanel 组件的插件化包装
 */

import React from 'react';
import ScriptOutlinePanel from '../../ScriptOutlinePanel';
import { useStoryboardContext } from '../../core/StoryboardContext';
import { getAuthToken } from '../../../../services/auth';

const ScriptOutlinePlugin: React.FC = () => {
  const {
    state,
    handleEpisodeSelect,
    showToast,
  } = useStoryboardContext();

  // 强绑定：通过项目+集数关联的剧本（state.scriptContent 来自后端加载）
  // 弱绑定：用户手动选择的参考剧本（state.referenceScriptContent）
  const hasStrongBinding = !!state.scriptContent && !!state.currentScriptId;

  // 优先展示强绑定剧本内容，其次展示弱绑定参考剧本内容
  const effectiveContent = state.scriptContent || state.referenceScriptContent;
  const effectiveTitle = state.scriptContent ? state.scriptTitle : (state.referenceScriptTitle || '');

  const handleOpenScript = async (script: { id: number; episode_number: number; title: string }) => {
    // 点击剧本卡片时，切换到该集（强绑定逻辑）
    // 从 state.scripts 中找到完整的 Script 对象（包含 status）
    const fullScript = state.scripts.find(s => s.id === script.id);
    if (fullScript) {
      handleEpisodeSelect(fullScript);
    }

    const token = getAuthToken();
    try {
      const res = await fetch(`/api/scripts/project/${state.currentProjectId}/episode/${script.episode_number}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      
      if (data?.script) {
        // 打开统一的剧本创作中心标签页，传入剧本数据进入编辑模式
        window.dispatchEvent(new CustomEvent('openScriptGenerateTab', {
          detail: {
            episodeNumber: script.episode_number,
            scriptId: script.id,
            scriptTitle: script.title || '',
            scriptContent: data.script.content || '',
          }
        }));
      }
    } catch (err) {
      console.error('[ScriptOutlinePlugin] 加载剧本内容失败:', err);
      showToast('加载剧本内容失败', 'error');
    }
  };

  return (
    <ScriptOutlinePanel
      scriptContent={effectiveContent}
      scriptTitle={effectiveTitle}
      isLoading={state.isLoadingScript}
      projectId={state.currentProjectId}
      episodeNumber={state.currentEpisode}
      scriptId={state.currentScriptId}
      scripts={state.scripts}
      onSelectScript={(script) => {
        handleOpenScript(script);
      }}
      canPick={false}
      isBoundViaEpisode={hasStrongBinding}
      onPickScript={undefined}
      onCreateNewScript={() => {
        // 发送自定义事件打开剧本生成标签页
        window.dispatchEvent(new CustomEvent('openScriptGenerateTab', {
          detail: { episodeNumber: state.currentEpisode }
        }));
      }}
    />
  );
};

export default ScriptOutlinePlugin;
