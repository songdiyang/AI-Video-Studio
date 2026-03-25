import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, Tab, Button, useDisclosure, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { FileText, Film, Bot, Clapperboard } from 'lucide-react';
import { PanelGroup } from '../../components/PanelGroup';
import ResizablePanel from '../../components/ResizablePanel';
import { useProjectInit } from './hooks/useProjectInit';
import { useScriptManagement } from './hooks/useScriptManagement';
import { useScriptGeneration } from './hooks/useScriptGeneration';
import ProjectInfo from './ProjectInfo';
import ScriptActions from './ScriptActions';
import ScriptGeneratorForm from './ScriptGeneratorForm';
import ScriptPreview from './ScriptPreview';
import EpisodeSelectModal from './EpisodeSelectModal';
import EpisodeSelector from './EpisodeSelector';
import LoadingScreen from './LoadingScreen';
import StoryBoard from '../StoryBoard';
import SimpleStoryBoard from '../SimpleStoryBoard';
import VideoComposition from '../VideoComposition';
import AIModelConfigModal from '../../components/AIModelConfigModal';
import { useAIModels } from '../../hooks/useAIModels';
import { useToast } from '../../contexts/ToastContext';
import { getAuthToken, isAdminUser } from '../../services/auth';
import { RecapData } from './PreviousEpisodesRecap';

const LAST_TAB_KEY = 'nanostory_last_tab';

const ScriptStudio: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // 面板引用
  const containerRef = useRef<HTMLDivElement>(null);

  // 使用自定义 hooks
  const { selectedProject, setSelectedProject, initLoading } = useProjectInit();
  
  const {
    scripts,
    currentEpisode,
    nextEpisode,
    scriptId,
    title,
    content,
    loadingScript,
    loading: scriptLoading,
    setTitle,
    setContent,
    setCurrentEpisode,
    setScriptId,
    loadProjectScript,
    handleEpisodeChange,
    handleSaveScript,
    handleCreateScript,
    handleCreateDraft,
    handleSaveDraft,
    handleDeleteDraft,
    handleDeleteScript,
    handleCleanOrphans
  } = useScriptManagement({
    onSuccess: () => {},
    onError: (msg) => showToast(msg, 'error')
  });
  
  const {
    loading: generationLoading,
    showEpisodeModal,
    setShowEpisodeModal,
    handleGenerateClick,
    handleGenerate,
    generationProgress
  } = useScriptGeneration({
    selectedProject,
    setSelectedProject,
    loadProjectScript,
    onSuccess: () => {},
    onError: (msg) => showToast(msg, 'error')
  });
  
  // 表单状态
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState('');
  const [length, setLength] = useState('短篇');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // 自动保存定时器引用
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 用 useRef 缓存最新的 saveDraft 函数，解决闭包问题
  const saveDraftRef = useRef<(silent?: boolean) => Promise<void>>(undefined);
  
  // 从 scripts 列表中查找草稿集数（数据库持久化）
  const draftScript = scripts.find(s => s.status === 'draft');
  const draftEpisode = draftScript?.episode_number || null;

  // 删除确认弹窗
  const { isOpen: isDeleteModalOpen, onOpen: openDeleteModal, onClose: closeDeleteModal } = useDisclosure();
  const [deleteResult, setDeleteResult] = useState<{ type: 'confirm' | 'success' | 'orphans' | 'error'; message: string }>({ type: 'confirm', message: '' });
  const [orphanCharacters, setOrphanCharacters] = useState<{ id: number; name: string; image_url?: string }[]>([]);
  const [orphanScenes, setOrphanScenes] = useState<{ id: number; name: string; image_url?: string }[]>([]);

  // 全局 AI 模型管理
  const aiModels = useAIModels(selectedProject?.id);
  const { isOpen: isModelConfigOpen, onOpen: openModelConfig, onOpenChange: onModelConfigChange } = useDisclosure();
  
  // 子标签页状态
  const [activeTab, setActiveTab] = useState<'script' | 'storyboard' | 'composition'>(() => {
    const savedTab = localStorage.getItem(LAST_TAB_KEY);
    if (savedTab === 'storyboard' || savedTab === 'composition') return savedTab;
    return 'script';
  });

  // 前情回顾状态
  const [recapData, setRecapData] = useState<RecapData | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  
  const loading = scriptLoading || generationLoading;



  // 切换标签页时保存
  const handleTabChange = (key: 'script' | 'storyboard' | 'composition') => {
    setActiveTab(key);
    localStorage.setItem(LAST_TAB_KEY, key);
  };

  // 保存草稿内容（故事走向就是草稿）
  const saveDraft = async (silent = false) => {
    // 先检查是否正在保存中
    if (isSaving) {
      console.warn('[saveDraft] Already saving, skip');
      return;
    }
    
    // 检查 draftScript 是否存在
    if (!draftScript) {
      if (!silent) {
        showToast('无法保存：草稿未找到', 'error');
      }
      console.warn('[saveDraft] draftScript is null, cannot save. scripts:', scripts.map(s => ({ id: s.id, status: s.status, ep: s.episode_number })));
      return;
    }
    
    // 清除自动保存定时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    
    setIsSaving(true);
    try {
      console.log('[saveDraft] Saving draft:', { id: draftScript.id, title, description: description?.substring(0, 50), length });
      const result = await handleSaveDraft(
        draftScript.id,
        title,
        description, // 故事走向就是草稿内容
        description,
        length
      );
      
      if (result.success) {
        setLastSavedAt(result.savedAt || new Date().toISOString());
        setHasUnsavedChanges(false);
        console.log('[saveDraft] Draft saved successfully at', result.savedAt);
      } else {
        console.error('[saveDraft] Save failed:', result.message);
      }
    } catch (error) {
      console.error('[saveDraft] Unexpected error:', error);
      if (!silent) {
        showToast('保存失败', 'error');
      }
    } finally {
      setIsSaving(false);  // 确保在 finally 中重置
    }
  };
  
  // 每次 saveDraft 变化时更新 ref
  saveDraftRef.current = saveDraft;

  // Ctrl+S 快捷键保存草稿
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        // 使用 ref 获取最新的 saveDraft 函数，避免闭包问题
        if (saveDraftRef.current) {
          saveDraftRef.current();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // 依赖数组为空，因为我们使用 ref 获取最新函数

  // 自动保存防抖（3秒）
  useEffect(() => {
    // 仅对草稿状态生效
    if (!draftScript) {
      console.log('[autoSave] No draft script, skip auto-save setup');
      return;
    }
    // 仅在有内容时触发
    if (!description.trim()) {
      console.log('[autoSave] No description content, skip auto-save setup');
      return;
    }
    
    setHasUnsavedChanges(true);
    console.log('[autoSave] Content changed, scheduling auto-save in 3s');
    
    // 清理之前的定时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    // 设置新的 3 秒防抖
    autoSaveTimerRef.current = setTimeout(async () => {
      // 使用 ref 获取最新的 saveDraft 函数，解决闭包问题
      console.log('[autoSave] Timer fired, calling saveDraftRef.current');
      if (saveDraftRef.current) {
        await saveDraftRef.current(true); // silent mode
      }
    }, 3000);
    
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [description, title, length, draftScript?.id]); // 依赖 description, title, length 和 draftScript.id

  // 页面关闭/刷新时提醒未保存更改
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // 加载项目剧本
  useEffect(() => {
    if (selectedProject) {
      loadProjectScript(selectedProject.id);
    }
  }, [selectedProject]);

  // 获取前情回顾数据
  const fetchRecapData = async (projectId: number, targetEpisode: number) => {
    if (targetEpisode <= 1) {
      setRecapData(null);
      return;
    }
    
    setRecapLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/scripts/project/${projectId}/recap?targetEpisode=${targetEpisode}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setRecapData(data);
      } else {
        setRecapData(null);
      }
    } catch (error) {
      console.error('获取前情回顾失败:', error);
      setRecapData(null);
    } finally {
      setRecapLoading(false);
    }
  };

  // 当需要创建新剧集时，加载前情回顾
  useEffect(() => {
    if (selectedProject && !scriptId && nextEpisode > 1) {
      const targetEp = draftEpisode || nextEpisode;
      fetchRecapData(selectedProject.id, targetEp);
    } else {
      setRecapData(null);
    }
  }, [selectedProject, scriptId, nextEpisode, draftEpisode]);

  const handleBackToProjects = () => {
    navigate('/projects');
  };
  
  const handleSave = async () => {
    const success = await handleSaveScript();
    if (success) {
      setIsEditing(false);
    }
  };
  
  const handleDelete = async () => {
    // 打开确认弹窗
    setDeleteResult({ type: 'confirm', message: '' });
    openDeleteModal();
  };

  const confirmDelete = async () => {
    const result = await handleDeleteScript();
    if (result.success) {
      setIsEditing(false);
      const hasOrphans = (result.orphanCharacters?.length || 0) + (result.orphanScenes?.length || 0) > 0;
      if (hasOrphans) {
        setOrphanCharacters(result.orphanCharacters || []);
        setOrphanScenes(result.orphanScenes || []);
        setDeleteResult({ type: 'orphans', message: result.message });
      } else {
        setDeleteResult({ type: 'success', message: result.message });
        if (selectedProject) loadProjectScript(selectedProject.id);
      }
    } else {
      setDeleteResult({ type: 'error', message: result.message });
    }
  };

  const confirmCleanOrphans = async () => {
    const charIds = orphanCharacters.map(c => c.id);
    const sceneIds = orphanScenes.map(s => s.id);
    await handleCleanOrphans(charIds, sceneIds);
    setDeleteResult({ type: 'success', message: '剧本及多余资源已清理完毕' });
    setOrphanCharacters([]);
    setOrphanScenes([]);
    if (selectedProject) loadProjectScript(selectedProject.id);
  };

  const skipCleanOrphans = () => {
    setDeleteResult({ type: 'success', message: '剧本已删除，角色和场景已保留' });
    setOrphanCharacters([]);
    setOrphanScenes([]);
    if (selectedProject) loadProjectScript(selectedProject.id);
  };

  if (initLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="h-full bg-[var(--bg-app)] overflow-hidden flex flex-col">
      {/* 项目信息和子标签页 */}
      <div className="bg-[var(--bg-nav)] backdrop-blur-xl border-b border-[var(--border-color)]">
        <div className="px-8 pt-4">
          {selectedProject && (
            <ProjectInfo 
              project={selectedProject} 
              onBackToProjects={handleBackToProjects} 
            />
          )}
        </div>
        
        {/* 子标签页 + AI 模型按钮 */}
        <div className="px-8 flex items-center">
          <div className="flex-1">
            <Tabs
              selectedKey={activeTab}
              onSelectionChange={(key) => handleTabChange(key as 'script' | 'storyboard' | 'composition')}
              variant="underlined"
              classNames={{
                tabList: "gap-8 w-full relative p-0 border-b-0",
                cursor: "w-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] h-0.5 shadow-[0_0_10px_var(--accent-glow)]",
                tab: "max-w-fit px-0 h-12 data-[hover-unselected=true]:opacity-80",
                tabContent: "group-data-[selected=true]:text-[var(--accent-light)] group-data-[selected=false]:text-[var(--text-muted)] font-semibold transition-colors"
              }}
            >
              <Tab
                key="script"
                title={
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span>剧本生成</span>
                  </div>
                }
              />
              <Tab
                key="storyboard"
                title={
                  <div className="flex items-center gap-2">
                    <Film className="w-4 h-4" />
                    <span>分镜</span>
                  </div>
                }
              />
              {/* <Tab
                key="composition"
                title={
                  <div className="flex items-center gap-2">
                    <Clapperboard className="w-4 h-4" />
                    <span>合成</span>
                  </div>
                }
              /> */}
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
        ) : activeTab === 'script' ? (
          <PanelGroup direction="horizontal" storageKey="script-studio">
            <ResizablePanel defaultSize={50} minSize={35} title="剧本创作">
              <div className="p-6 space-y-6 overflow-auto h-full">
                {/* 集数选择器 */}
                <EpisodeSelector
                  scripts={scripts}
                  currentEpisode={currentEpisode}
                  nextEpisode={nextEpisode}
                  loading={loading}
                  onEpisodeChange={async (episode) => {
                    // 切换集数前自动保存当前草稿（如果有未保存的更改）
                    if (draftScript && currentEpisode === draftEpisode && description.trim()) {
                      // 先清除自动保存定时器
                      if (autoSaveTimerRef.current) {
                        clearTimeout(autoSaveTimerRef.current);
                        autoSaveTimerRef.current = null;
                      }
                      await saveDraft(true); // 静默保存
                    }
                    
                    // 如果点击的是草稿集数，切换到草稿编辑界面
                    if (draftScript && episode === draftEpisode) {
                      setCurrentEpisode(episode);
                      setScriptId(null);
                      setContent('');
                      setTitle(draftScript.title || '');
                      setDescription(draftScript.draft_description || draftScript.content || '');
                      setLength(draftScript.draft_length || '短篇');
                      setLastSavedAt(null);
                      setIsEditing(false);
                      setHasUnsavedChanges(false);
                    } else {
                      // 切换到已有集数
                      handleEpisodeChange(episode);
                    }
                  }}
                  onNewEpisode={async () => {
                    // 创建新集前自动保存当前草稿
                    if (draftScript) {
                      await saveDraft(true);
                    }
                    setShowEpisodeModal(true);
                  }}
                  draftEpisode={draftEpisode}
                />

                <ScriptActions
                  scriptId={scriptId}
                  isEditing={isEditing}
                  loading={loading}
                  loadingScript={loadingScript}
                  onEdit={() => setIsEditing(true)}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  onGenerateVideo={() => {}}
                />

                {!scriptId && !loadingScript && (
                  <ScriptGeneratorForm
                    title={title}
                    description={description}
                    length={length}
                    loading={loading}
                    nextEpisode={draftEpisode || nextEpisode}
                    onTitleChange={setTitle}
                    onDescriptionChange={setDescription}
                    onLengthChange={setLength}
                    generationProgress={generationProgress}
                    recapData={recapData}
                    recapLoading={recapLoading}
                    onSaveDraft={saveDraft}
                    isSaving={isSaving}
                    lastSavedAt={lastSavedAt}
                    isDraft={!!draftScript}
                    hasUnsavedChanges={hasUnsavedChanges}
                    onGenerate={async () => {
                      if (!aiModels.selected.text) {
                        showToast('请先点击右上角「AI 模型」按钮选择文本模型', 'warning');
                        return;
                      }
                      // 生成前自动保存草稿
                      if (draftScript) {
                        // 先清除自动保存定时器
                        if (autoSaveTimerRef.current) {
                          clearTimeout(autoSaveTimerRef.current);
                          autoSaveTimerRef.current = null;
                        }
                        await saveDraft(true);
                      }
                      const episodeToGenerate = draftEpisode || nextEpisode;
                      handleGenerate(episodeToGenerate, title, description, length, nextEpisode, aiModels.selected.text);
                      // 生成后不需要手动清除草稿，因为 generateScript API 会将草稿转为 generating 状态
                    }}
                    onManualSave={async (manualTitle, manualContent) => {
                      if (!selectedProject) {
                        showToast('请先选择一个项目', 'warning');
                        return;
                      }
                      const ep = draftEpisode || nextEpisode;
                      const result = await handleCreateScript(selectedProject.id, manualTitle, manualContent, ep);
                      if (!result.success) {
                        showToast('保存失败，请稍后重试', 'error');
                      }
                    }}
                  />
                )}
              </div>
            </ResizablePanel>
            <ResizablePanel defaultSize={50} minSize={30} title="预览">
              <ScriptPreview
                content={content}
                isEditing={isEditing}
                loadingScript={loadingScript}
                onContentChange={setContent}
              />
            </ResizablePanel>
          </PanelGroup>
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
          />
        )}
      </div>

      {/* 集数选择对话框 */}
      <EpisodeSelectModal
        isOpen={showEpisodeModal}
        onClose={() => setShowEpisodeModal(false)}
        scripts={scripts as any}
        nextEpisode={nextEpisode}
        onConfirm={async (episodeNumber) => {
          // 选择集数后，创建草稿记录到数据库
          setShowEpisodeModal(false);
          if (selectedProject) {
            const result = await handleCreateDraft(selectedProject.id, episodeNumber);
            if (result.success) {
              // 草稿创建成功，切换到草稿界面
              setCurrentEpisode(episodeNumber);
              setScriptId(null);
              setContent('');
              setIsEditing(false);
            } else {
              showToast('创建草稿失败，请稍后重试', 'error');
            }
          }
        }}
      />

      {/* AI 模型配置弹窗 */}
      <AIModelConfigModal
        isOpen={isModelConfigOpen}
        onOpenChange={onModelConfigChange}
        models={aiModels.models}
        selected={aiModels.selected}
        onSelect={aiModels.setSelected}
      />

      {/* 删除确认弹窗 */}
      <Modal 
        isOpen={isDeleteModalOpen} 
        onClose={closeDeleteModal} 
        size="md"
        classNames={{
          backdrop: 'bg-black/60 backdrop-blur-sm',
          base: 'bg-[var(--bg-card)] border border-[var(--border-color)] shadow-2xl',
          header: 'border-b border-[var(--border-color)]',
          body: 'py-4',
          footer: 'border-t border-[var(--border-color)]',
          closeButton: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/10'
        }}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span className="text-[var(--text-primary)] font-bold">
              {deleteResult.type === 'confirm' && '删除确认'}
              {deleteResult.type === 'orphans' && '发现多余资源'}
              {deleteResult.type === 'success' && '删除成功'}
              {deleteResult.type === 'error' && '删除失败'}
            </span>
          </ModalHeader>
          <ModalBody>
            {deleteResult.type === 'confirm' && (
              <p className="text-[var(--text-secondary)]">确定要删除该集剧本吗？将同时删除该集的所有分镜、帧图片和视频，此操作无法恢复。</p>
            )}
            {deleteResult.type === 'orphans' && (
              <div className="space-y-3">
                <p className="text-[var(--text-secondary)] text-sm">{deleteResult.message}。以下角色/场景仅在该集中出现，是否一并删除？</p>
                {orphanCharacters.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-[var(--warning)] mb-1">多余角色：</p>
                    <div className="flex flex-wrap gap-2">
                      {orphanCharacters.map(c => (
                        <span key={c.id} className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--warning)]/10 border border-[var(--warning)]/30 rounded-lg text-sm text-[var(--warning)]">
                          {c.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {orphanScenes.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-[var(--accent-primary)] mb-1">多余场景：</p>
                    <div className="flex flex-wrap gap-2">
                      {orphanScenes.map(s => (
                        <span key={s.id} className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30 rounded-lg text-sm text-[var(--accent-primary)]">
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {deleteResult.type === 'success' && (
              <p className="text-emerald-400">{deleteResult.message}</p>
            )}
            {deleteResult.type === 'error' && (
              <p className="text-red-400">{deleteResult.message}</p>
            )}
          </ModalBody>
          <ModalFooter className="gap-2">
            {deleteResult.type === 'confirm' && (
              <>
                <Button variant="flat" className="pro-btn cursor-pointer" onPress={closeDeleteModal}>取消</Button>
                <Button className="bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30 cursor-pointer" onPress={confirmDelete} isLoading={scriptLoading}>确认删除</Button>
              </>
            )}
            {deleteResult.type === 'orphans' && (
              <>
                <Button variant="flat" className="pro-btn cursor-pointer" onPress={skipCleanOrphans}>保留资源</Button>
                <Button className="bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30 cursor-pointer" onPress={confirmCleanOrphans}>一并删除</Button>
              </>
            )}
            {(deleteResult.type === 'success' || deleteResult.type === 'error') && (
              <Button className="pro-btn-primary cursor-pointer" onPress={closeDeleteModal}>确定</Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default ScriptStudio;
