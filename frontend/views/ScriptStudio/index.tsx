import React, { useEffect } from 'react';
import { useProjectInit } from './hooks/useProjectInit';
import { useScriptManagement } from './hooks/useScriptManagement';
import LoadingScreen from './LoadingScreen';
import StoryBoard from '../StoryBoard';
import { useAIModels } from '../../hooks/useAIModels';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useWorkbench } from '../../contexts/WorkbenchContext';

const ScriptStudio: React.FC = () => {
  const { showToast } = useToast();
  const { currentProject, setCurrentProject } = useWorkbench();

  // 使用自定义 hooks
  const { selectedProject, setSelectedProject, initLoading } = useProjectInit();
  
  const {
    scripts,
    currentEpisode,
    scriptId,
    setTitle,
    setContent,
    setCurrentEpisode,
    setScriptId,
    loadProjectScript,
    handleCreateDraft,
  } = useScriptManagement({
    onSuccess: () => {},
    onError: (msg) => showToast(msg, 'error')
  });
  
  // 全局 AI 模型管理
  const aiModels = useAIModels(selectedProject?.id);

  // 工程切换后同步：WorkbenchContext 是侧栏 switchProject 的入口，
  // 已挂载的 ScriptStudio 需跟随换入新工程，立即重新加载分镜工作台
  useEffect(() => {
    if (currentProject && currentProject.id !== selectedProject?.id) {
      setSelectedProject(currentProject);
    }
  }, [currentProject, selectedProject, setSelectedProject]);

  // 同步项目到 WorkbenchContext（id 一致时跳过，避免旧初始化结果覆盖刚切换的工程），并加载项目剧本
  useEffect(() => {
    if (selectedProject) {
      if (selectedProject.id !== currentProject?.id) {
        setCurrentProject(selectedProject);
      }
      loadProjectScript(selectedProject.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, setCurrentProject]);

  if (initLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="h-full bg-[var(--bg-app)] overflow-hidden flex flex-col">
      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden">
        <StoryBoard 
          scriptId={scriptId}
          projectId={selectedProject?.id || null}
          episodeNumber={currentEpisode}
          scripts={scripts}
          models={aiModels.models}
          textModel={aiModels.selected.text}
          imageModel={aiModels.selected.image}
          videoModel={aiModels.selected.video}
          onEpisodeChange={(ep, sid) => {
            setCurrentEpisode(ep);
            const targetScript = scripts.find(s => s.id === sid);
            if (targetScript) {
              setScriptId(sid);
              setContent(targetScript.content);
              setTitle(targetScript.title);
            }
          }}
          onCreateNextEpisode={async () => {
            if (!selectedProject) {
              showToast('请先选择项目', 'warning');
              return;
            }
            const maxEp = scripts.reduce((m, s: any) => Math.max(m, s.episode_number || 0), 0);
            const nextEp = maxEp + 1;
            const result = await handleCreateDraft(selectedProject.id, nextEp);
            if (result.success) {
              setCurrentEpisode(nextEp);
              setScriptId(result.scriptId || null);
              setContent('');
              setTitle(`第${nextEp}集`);
              showToast(`已新建第${nextEp}集`, 'success');
            } else {
              showToast(result.message || '新建下一集失败', 'error');
            }
          }}
          projectSettings={(() => {
            try {
              const s = selectedProject?.settings_json ? JSON.parse(selectedProject.settings_json) : {};
              return {
                imageAspectRatio: s.imageAspectRatio || undefined,
                imageResolution: s.imageResolution || undefined,
                videoAspectRatio: s.videoAspectRatio || undefined,
                videoResolution: s.videoResolution || undefined,
              };
            } catch { return undefined; }
          })()}
        />
      </div>
    </div>
  );
};

export default ScriptStudio;
