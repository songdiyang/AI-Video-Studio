import React, { useState, useEffect } from 'react';
import { Tabs, Tab, Button, useDisclosure } from '@heroui/react';
import { Film, Bot } from 'lucide-react';
import { useProjectInit } from './hooks/useProjectInit';
import { useScriptManagement } from './hooks/useScriptManagement';
import LoadingScreen from './LoadingScreen';
import StoryBoard from '../StoryBoard';
import VideoComposition from '../VideoComposition';
import AIModelConfigModal from '../../components/AIModelConfigModal';
import { useAIModels } from '../../hooks/useAIModels';
import { useToast } from '../../contexts/ToastContext';

const LAST_TAB_KEY = 'nanostory_last_tab';

const ScriptStudio: React.FC = () => {
  const { showToast } = useToast();

  // 使用自定义 hooks
  const { selectedProject, initLoading } = useProjectInit();
  
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
  const { isOpen: isModelConfigOpen, onOpen: openModelConfig, onOpenChange: onModelConfigChange } = useDisclosure();
  
  // 子标签页状态（剧本 Tab 已迁至"我的资产 > 剧本"，此处只留分镜 + 合成）
  const [activeTab, setActiveTab] = useState<'storyboard' | 'composition'>(() => {
    const savedTab = localStorage.getItem(LAST_TAB_KEY);
    if (savedTab === 'composition') return 'composition';
    return 'storyboard';
  });

  // 切换标签页时保存
  const handleTabChange = (key: 'storyboard' | 'composition') => {
    setActiveTab(key);
    localStorage.setItem(LAST_TAB_KEY, key);
  };

  // 加载项目剧本
  useEffect(() => {
    if (selectedProject) {
      loadProjectScript(selectedProject.id);
    }
  }, [selectedProject]);

  if (initLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="h-full bg-[var(--bg-app)] overflow-hidden flex flex-col">
      {/* 子标签页 */}
      <div className="bg-[var(--bg-nav)] backdrop-blur-xl border-b border-[var(--border-color)]">
        
        {/* 子标签页 + AI 模型按钮 */}
        <div className="px-8 flex items-center">
          <div className="flex-1">
            <Tabs
              selectedKey={activeTab}
              onSelectionChange={(key) => handleTabChange(key as 'storyboard' | 'composition')}
              variant="underlined"
              classNames={{
                tabList: "gap-8 w-full relative p-0 border-b-0",
                cursor: "w-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] h-0.5 shadow-[0_0_10px_var(--accent-glow)]",
                tab: "max-w-fit px-0 h-12 data-[hover-unselected=true]:opacity-80",
                tabContent: "group-data-[selected=true]:text-[var(--accent-light)] group-data-[selected=false]:text-[var(--text-muted)] font-semibold transition-colors"
              }}
            >
              {/* 剧本生成已迁至"我的资产 > 剧本"，此处只保留分镜工作台 */}
              <Tab
                key="storyboard"
                title={
                  <div className="flex items-center gap-2">
                    <Film className="w-4 h-4" />
                    <span>分镜</span>
                  </div>
                }
              />
            </Tabs>
          </div>
          <Button
            size="sm"
            variant="flat"
            className="pro-btn cursor-pointer"
            startContent={<Bot className="w-4 h-4" />}
            onPress={openModelConfig}
          >
            模型选择
          </Button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'composition' ? (
          <VideoComposition projectId={selectedProject?.id || null} projectName={selectedProject?.name || ''} />
        ) : (
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
        )}
      </div>

      {/* AI 模型配置弹窗 */}
      <AIModelConfigModal
        isOpen={isModelConfigOpen}
        onOpenChange={onModelConfigChange}
        models={aiModels.models}
        selected={aiModels.selected}
        onSelect={aiModels.setSelected}
      />
    </div>
  );
};

export default ScriptStudio;
