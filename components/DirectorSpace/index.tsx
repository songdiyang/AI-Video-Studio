import React, { useState, useMemo, useEffect } from 'react';
import { Blocks, Sparkles, Network } from 'lucide-react';
import { Button, Select, SelectItem } from '@heroui/react';
import { StoryboardScene } from '../../views/StoryBoard/useSceneManager';
import BlockEditor from '../../views/StoryBoard/BlockEditor';
import { BlockEditorState } from '../../views/StoryBoard/BlockEditor/types/blockTypes';
import { getAuthToken } from '../../services/auth';
import { startWorkflow, getWorkflowStatus } from '../../hooks/useWorkflow';
import { useToast } from '../../contexts/ToastContext';
// import { NodeModeFeature, NodeCanvasState } from '../../features/NodeMode';
import { fetchCharactersByProject, fetchScenesByProject } from '../../services/assets';
import { listEnvironments } from '../../services/environments';
import { listBuildings } from '../../services/buildings';
import { fetchCostumes } from '../../services/costumes';
import type { Environment } from '../../services/environments';
import type { Building } from '../../services/buildings';
import type { Costume } from '../../services/costumes';

interface AIModel {
  name: string;
  type?: string;
  category?: string;
  description?: string;
  priceSummary?: string;
}

interface DirectorSpaceProps {
  scene: StoryboardScene;
  projectId: number | null;
  scriptId: number | null;
  onUpdateDescription?: (description: string) => Promise<boolean>;
  onUpdateBaseDescription?: (description: string) => Promise<boolean>;
  onUpdateVideoPrompt?: (prompt: string) => Promise<boolean>;
  onUpdateFirstFramePrompt?: (prompt: string) => Promise<boolean>;
  onUpdateLastFramePrompt?: (prompt: string) => Promise<boolean>;
  onUpdateDialogues?: (dialogues: any[]) => Promise<boolean>;
  onUpdateVoiceover?: (voiceover: any) => Promise<boolean>;
  onGenerateImage?: (id: number, prompt: string, regenerateTarget?: 'first' | 'last' | 'both', forceRegenerate?: boolean) => Promise<{ success: boolean; error?: string }>;
  models?: AIModel[];
  imageModel?: string;
  onImageModelChange?: (model: string) => void;
  multimodalModel?: string;
  onMultimodalModelChange?: (model: string) => void;
  // 项目资源（从外部传入，避免重复加载）
  projectCharacters?: {
    id: number;
    name: string;
    image_url?: string;
    active_state_image_url?: string;
    has_base_model_views?: boolean;
    base_appearance?: string;
    outfit_appearance?: string;
    active_state_name?: string;
    active_state_outfit?: string;
    states?: {
      id: number;
      name: string;
      image_url?: string;
      front_view_url?: string;
      outfit?: string;
      is_base_model?: boolean;
      costume_id?: number | null;
      costume_name?: string;
      appearance?: string;
    }[];
  }[];
  projectScenes?: { id: number; name: string; image_url?: string }[];
  projectProps?: { id: number; name: string; image_url?: string; description?: string }[];
  projectEnvironments?: { id: number; name: string; image_url?: string; description?: string }[];
  projectBuildings?: { id: number; name: string; image_url?: string; description?: string }[];
  projectCostumes?: { id: number; name: string; image_url?: string; description?: string }[];
}

const DescriptionEditor: React.FC<{
  scene: StoryboardScene;
  projectId: number | null;
  onUpdateBaseDescription?: (description: string) => Promise<boolean>;
  onGenerateImage?: (id: number, prompt: string, regenerateTarget?: 'first' | 'last' | 'both', forceRegenerate?: boolean) => Promise<{ success: boolean; error?: string }>;
  imageModels?: AIModel[];
  imageModel?: string;
  onImageModelChange?: (model: string) => void;
  multimodalModels?: AIModel[];
  multimodalModel?: string;
  onMultimodalModelChange?: (model: string) => void;
}> = ({ scene, projectId, onUpdateBaseDescription, onGenerateImage, imageModels, imageModel, onImageModelChange, multimodalModels, multimodalModel, onMultimodalModelChange }) => {
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const { showToast } = useToast();

  // 生成图片提示词（基于分镜描述调用AI优化）
  const handleGeneratePrompt = async () => {
    const text = (scene.baseDescription || scene.description || '').trim();
    if (!text || isGeneratingPrompt) return;
    if (!projectId) {
      showToast('缺少项目信息', 'warning');
      return;
    }

    setIsGeneratingPrompt(true);
    try {
      const { jobId } = await startWorkflow('single_image_prompt_optimization', projectId, {
        storyboardId: scene.id,
        prompt: text,
        multimodalModel: multimodalModel || undefined
      });

      // 轮询等待结果
      const pollStatus = async (): Promise<void> => {
        const job = await getWorkflowStatus(jobId);
        if (job.status === 'completed') {
          const lastTask = job.tasks?.[job.tasks.length - 1];
          const resultData = lastTask?.result_data;
          const optimized = resultData?.optimized || '';
          const negativePrompt = resultData?.negativePrompt || '';

          if (optimized) {
            // 保存到数据库
            const token = getAuthToken();
            const body: any = { prompt_template: optimized };
            if (negativePrompt) body.negative_prompt = negativePrompt;
            await fetch(`/api/storyboards/${scene.id}/content`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
              },
              body: JSON.stringify(body)
            });
            showToast('图片提示词生成成功', 'success');
          }
          setIsGeneratingPrompt(false);
        } else if (job.status === 'failed') {
          showToast('提示词生成失败', 'error');
          setIsGeneratingPrompt(false);
        } else {
          setTimeout(pollStatus, 2000);
        }
      };
      pollStatus();
    } catch (error: any) {
      showToast(error.message || '提示词生成失败', 'error');
      setIsGeneratingPrompt(false);
    }
  };

  // 复用ScenePreviewPanel中的DescriptionEditor逻辑
  return (
    <div className="h-full flex flex-col relative">
      <textarea
        className="flex-1 w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded p-3 pb-10 text-xs text-[var(--text-secondary)] resize-none focus:outline-none focus:border-[var(--accent)]/50 overflow-y-auto"
        value={scene.baseDescription || ''}
        onChange={(e) => onUpdateBaseDescription?.(e.target.value)}
        placeholder="输入分镜描述..."
      />
      <div className="absolute bottom-2 right-2 flex items-center gap-2">
        {multimodalModels && multimodalModels.length > 0 && onMultimodalModelChange && (
          <Select
            size="sm"
            selectedKeys={multimodalModel ? [multimodalModel] : []}
            onChange={(e) => onMultimodalModelChange(e.target.value)}
            classNames={{
              trigger: "h-7 min-w-[120px] bg-white border border-blue-200 text-blue-600 hover:border-blue-300 rounded text-xs",
              value: "text-xs",
              selectorIcon: "text-blue-400",
              popoverContent: "bg-[var(--bg-elevated)] border border-[var(--border-color)]"
            }}
            aria-label="多模态模型"
          >
            {multimodalModels.map((m) => (
              <SelectItem key={m.name} textValue={m.name}>
                <span className="text-xs">{m.name}</span>
              </SelectItem>
            ))}
          </Select>
        )}
        <Button
          size="sm"
          className="bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
          startContent={<Sparkles className="w-4 h-4" />}
          isLoading={isGeneratingPrompt}
          isDisabled={isGeneratingPrompt}
          onPress={handleGeneratePrompt}
        >
          {isGeneratingPrompt ? '生成中...' : '生成提示词'}
        </Button>
      </div>
    </div>
  );
};

const DirectorSpace: React.FC<DirectorSpaceProps> = ({
  scene,
  projectId,
  scriptId,
  onUpdateDescription,
  onUpdateBaseDescription,
  onUpdateVideoPrompt,
  onUpdateFirstFramePrompt,
  onUpdateLastFramePrompt,
  onUpdateDialogues,
  onUpdateVoiceover,
  onGenerateImage,
  models = [],
  imageModel,
  onImageModelChange,
  multimodalModel,
  onMultimodalModelChange,
  // 项目资源（优先使用外部传入的，避免重复加载）
  projectCharacters: externalProjectCharacters,
  projectScenes: externalProjectScenes,
  projectProps: externalProjectProps,
  projectEnvironments: externalProjectEnvironments,
  projectBuildings: externalProjectBuildings,
  projectCostumes: externalProjectCostumes,
}) => {
  const [promptMode, setPromptMode] = useState<'description' | 'image' | 'video'>('description');
  // const [directorMode, setDirectorMode] = useState<'editor' | 'node'>('editor');
  const [imageFrameTab, setImageFrameTab] = useState<'first' | 'last'>('first');

  // 从 localStorage 恢复导演空间状态（按场景隔离）
  useEffect(() => {
    const saved = localStorage.getItem(`director_space_state_${scene.id}`);
    if (saved) {
      try {
        const state = JSON.parse(saved);
        // if (state.directorMode === 'editor' || state.directorMode === 'node') {
        //   setDirectorMode(state.directorMode);
        // }
        if (state.promptMode === 'description' || state.promptMode === 'image' || state.promptMode === 'video') {
          setPromptMode(state.promptMode);
        }
        if (state.imageFrameTab === 'first' || state.imageFrameTab === 'last') {
          setImageFrameTab(state.imageFrameTab);
        }
      } catch {
        // ignore
      }
    }
  }, [scene.id]);

  // 保存导演空间状态到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`director_space_state_${scene.id}`, JSON.stringify({
        // directorMode,
        promptMode,
        imageFrameTab,
      }));
    } catch {
      // ignore
    }
  }, [scene.id, /* directorMode, */ promptMode, imageFrameTab]);
  const [currentEditorText, setCurrentEditorText] = useState('');

  // 项目资源数据（优先使用外部传入的，避免重复加载）
  const [projectCharacters, setProjectCharacters] = useState<{
    id: number;
    name: string;
    image_url?: string;
    active_state_image_url?: string;
    has_base_model_views?: boolean;
    base_appearance?: string;
    outfit_appearance?: string;
    active_state_name?: string;
    active_state_outfit?: string;
    states?: {
      id: number;
      name: string;
      image_url?: string;
      front_view_url?: string;
      outfit?: string;
      is_base_model?: boolean;
      costume_id?: number | null;
      costume_name?: string;
      appearance?: string;
    }[];
  }[]>([]);
  const [projectScenes, setProjectScenes] = useState<{ id: number; name: string; image_url?: string }[]>([]);
  const [projectProps, setProjectProps] = useState<{ id: number; name: string; image_url?: string; description?: string }[]>([]);
  const [projectEnvironments, setProjectEnvironments] = useState<{ id: number; name: string; image_url?: string; description?: string }[]>([]);
  const [projectBuildings, setProjectBuildings] = useState<{ id: number; name: string; image_url?: string; description?: string }[]>([]);
  const [projectCostumes, setProjectCostumes] = useState<{ id: number; name: string; image_url?: string; description?: string }[]>([]);

  // 加载项目资源（仅当外部未传入时自行加载）
  useEffect(() => {
    if (!projectId) return;

    // 如果外部已传入角色数据，直接使用
    if (externalProjectCharacters && externalProjectCharacters.length > 0) {
      setProjectCharacters(externalProjectCharacters);
    } else {
      fetchCharactersByProject(projectId)
        .then(async (chars) => {
          // 为每个角色加载其状态列表
          const charsWithStates = await Promise.all(
            chars.map(async (c: any) => {
              let states: any[] = [];
              try {
                const { fetchCharacterStates } = await import('../../services/assets');
                states = await fetchCharacterStates(c.id);
                // 过滤并格式化状态数据：只保留非白膜状态（白膜是底层，不作为独立状态展示）
                states = states
                  .filter((s: any) => !s.is_base_model)
                  .map((s: any) => ({
                    id: s.id,
                    name: s.name,
                    image_url: s.image_url,
                    front_view_url: s.front_view_url,
                    outfit: s.outfit,
                    is_base_model: s.is_base_model,
                    is_active: s.is_active,
                    costume_id: s.costume_id,
                    costume_name: s.costume_name,
                    appearance: s.appearance,
                  }));
              } catch {
                // 如果加载状态失败，仍然显示角色
              }
              return {
                id: c.id,
                name: c.name,
                image_url: c.image_url,
                active_state_image_url: c.active_state_image_url,
                has_base_model_views: c.has_base_model_views,
                base_appearance: c.base_appearance,
                outfit_appearance: c.outfit_appearance,
                active_state_name: c.active_state_name,
                active_state_outfit: c.active_state_outfit,
                states,
              };
            })
          );
          setProjectCharacters(charsWithStates);
        })
        .catch(() => { /* ignore */ });
    }

    // 场景
    if (externalProjectScenes && externalProjectScenes.length > 0) {
      setProjectScenes(externalProjectScenes);
    } else {
      fetchScenesByProject(projectId, scriptId || undefined)
        .then(scenes => setProjectScenes(scenes.map(s => ({
          id: s.id,
          name: s.name,
          image_url: s.image_url,
        }))))
        .catch(() => { /* ignore */ });
    }

    // 环境
    if (externalProjectEnvironments && externalProjectEnvironments.length > 0) {
      setProjectEnvironments(externalProjectEnvironments);
    } else {
      listEnvironments(projectId)
        .then(data => setProjectEnvironments(data.map((e: Environment) => ({
          id: e.id,
          name: e.name,
          image_url: e.image_url,
          description: e.description,
        }))))
        .catch(() => { /* ignore */ });
    }

    // 建筑
    if (externalProjectBuildings && externalProjectBuildings.length > 0) {
      setProjectBuildings(externalProjectBuildings);
    } else {
      listBuildings(projectId)
        .then(data => setProjectBuildings(data.map((b: Building) => ({
          id: b.id,
          name: b.name,
          image_url: b.image_url,
          description: b.description,
        }))))
        .catch(() => { /* ignore */ });
    }

    // 服装
    if (externalProjectCostumes && externalProjectCostumes.length > 0) {
      setProjectCostumes(externalProjectCostumes);
    } else {
      fetchCostumes(projectId)
        .then(data => setProjectCostumes(data.map((c: Costume) => ({
          id: c.id,
          name: c.name,
          image_url: c.image_url,
          description: c.description,
        }))))
        .catch(() => { /* ignore */ });
    }

    // 道具
    if (externalProjectProps && externalProjectProps.length > 0) {
      setProjectProps(externalProjectProps);
    } else {
      const token = getAuthToken();
      fetch(`/api/props/project/${projectId}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => setProjectProps((data?.props || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          image_url: p.image_url,
          description: p.description,
        }))))
        .catch(() => setProjectProps([]));
    }
  }, [projectId, scriptId, externalProjectCharacters, externalProjectScenes, externalProjectProps, externalProjectEnvironments, externalProjectBuildings, externalProjectCostumes]);

  const imageModels = useMemo(() => {
    const uniqueMap = new Map<string, AIModel>();
    models.filter(m => (m.type || m.category)?.toUpperCase() === 'IMAGE').forEach(m => {
      if (!uniqueMap.has(m.name)) uniqueMap.set(m.name, m);
    });
    return Array.from(uniqueMap.values());
  }, [models]);

  const multimodalModels = useMemo(() => {
    const uniqueMap = new Map<string, AIModel>();
    models.filter(m => (m.type || m.category)?.toUpperCase() === 'MULTIMODAL').forEach(m => {
      if (!uniqueMap.has(m.name)) uniqueMap.set(m.name, m);
    });
    return Array.from(uniqueMap.values());
  }, [models]);

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 - 仅显示信息，不可折叠 */}
      <div
        className="flex items-center justify-between px-3 py-2 hover:bg-[var(--bg-card-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          {/* 导演模式 / 节点模式 一级切换 - 已注释掉节点模式 */}
          {/*
          <div className="flex items-center gap-0.5 p-0.5 bg-[var(--bg-input)] rounded-lg">
            <button
              onClick={(e) => { e.stopPropagation(); setDirectorMode('editor'); }}
              className={`px-3 py-1 rounded-md text-[10px] font-medium transition-colors ${
                directorMode === 'editor'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              导演模式
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setDirectorMode('node'); }}
              className={`px-3 py-1 rounded-md text-[10px] font-medium transition-colors ${
                directorMode === 'node'
                  ? 'bg-purple-500/20 text-purple-400 shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              节点模式
            </button>
          </div>
          */}
          {/* 导演模式下的二级切换 - 节点模式已注释掉，直接显示 */}
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={(e) => { e.stopPropagation(); setPromptMode('description'); }}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  promptMode === 'description'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                分镜描述
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setPromptMode('image'); }}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  promptMode === 'image'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                图片提示词
              </button>
              {/* 运动模式才显示首帧/尾帧子标签 */}
              {scene.hasAction && promptMode === 'image' && (
                <div className="flex items-center gap-0.5 ml-1 p-0.5 bg-[var(--bg-input)] rounded">
                  <button
                    onClick={(e) => { e.stopPropagation(); setImageFrameTab('first'); }}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      imageFrameTab === 'first' ? 'bg-blue-500/30 text-blue-300' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    首帧
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setImageFrameTab('last'); }}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      imageFrameTab === 'last' ? 'bg-blue-500/30 text-blue-300' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    尾帧
                  </button>
                </div>
              )}
              {/* 静止模式：图片提示词直接保存到 first_frame_prompt */}
              {!scene.hasAction && promptMode === 'image' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400/60 ml-1">
                  单图
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setPromptMode('video'); }}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  promptMode === 'video'
                    ? 'bg-rose-500/20 text-rose-400'
                    : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                视频提示词
              </button>
            </div>
        </div>
        {/* 右侧：阶段状态标签 */}
        <div>
          {scene.startFrame && scene.endFrame ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/20 text-rose-400">
              生成阶段
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/20 text-blue-400">
              图片阶段
            </span>
          )}
        </div>
      </div>

      {/* 内容区 - 始终展开 */}
      <div className="flex-1 overflow-auto px-3 pb-3 flex flex-col">
        <div className="flex-1 min-h-0">
          {/* 节点模式已注释掉 - 如需恢复，取消注释以下代码 */}
          {/* {directorMode === 'node' ? ( */}
          {/*   <NodeModeFeature */}
          {/*     sceneId={scene.id} */}
          {/*     projectId={projectId || undefined} */}
          {/*     scriptId={scriptId || undefined} */}
          {/*     availableFrames={{ */}
          {/*       startFrame: scene.startFrame, */}
          {/*       endFrame: scene.endFrame */}
          {/*     }} */}
          {/*     sceneCharacters={scene.linkedCharacters || []} */}
          {/*     sceneLocation={scene.location} */}
          {/*     characterStates={scene.characterStates} */}
          {/*     projectCharacters={projectCharacters} */}
          {/*     projectScenes={projectScenes} */}
          {/*     projectProps={projectProps} */}
          {/*     projectEnvironments={projectEnvironments} */}
          {/*     projectBuildings={projectBuildings} */}
          {/*     projectCostumes={projectCostumes} */}
          {/*     onSetMainFrame={(frameType, imageUrl) => { */}
          {/*       const token = getAuthToken(); */}
          {/*       const body = frameType === 'first' */}
          {/*         ? { start_frame: imageUrl } */}
          {/*         : { end_frame: imageUrl }; */}
          {/*       fetch(`/api/storyboards/${scene.id}/content`, { */}
          {/*         method: 'PATCH', */}
          {/*         headers: { */}
          {/*           'Content-Type': 'application/json', */}
          {/*           ...(token ? { Authorization: `Bearer ${token}` } : {}) */}
          {/*         }, */}
          {/*         body: JSON.stringify(body) */}
          {/*       }).catch(() => {}); */}
          {/*     }} */}
          {/*     onSave={async (state: NodeCanvasState) => { */}
          {/*       try { */}
          {/*         const token = getAuthToken(); */}
          {/*         const res = await fetch(`/api/storyboards/${scene.id}/content`, { */}
          {/*           method: 'PATCH', */}
          {/*           headers: { */}
          {/*             'Content-Type': 'application/json', */}
          {/*             ...(token ? { Authorization: `Bearer ${token}` } : {}) */}
          {/*           }, */}
          {/*           body: JSON.stringify({ node_canvas: state }) */}
          {/*         }); */}
          {/*         return res.ok; */}
          {/*       } catch { */}
          {/*         return false; */}
          {/*       } */}
          {/*     }} */}
          {/*   /> */}
          {/* ) : ( */}
          {/* 节点模式已注释掉，直接显示 BlockEditor */}
          <BlockEditor
              key={`${scene.id}-${promptMode}-${promptMode === 'image' ? (scene.hasAction ? imageFrameTab : 'single') : ''}`}
              storyboardId={scene.id}
              projectId={projectId || undefined}
              scriptId={scriptId || undefined}
              promptMode={promptMode === 'description' ? 'image' : promptMode}
              basePrompt={scene.baseDescription || ''}
              initialBlocks={(() => {
                const text = promptMode === 'video'
                  ? scene.videoPrompt
                  : promptMode === 'image'
                    ? (scene.hasAction
                        ? (imageFrameTab === 'first'
                            ? (scene.firstFramePrompt || scene.description)
                            : (scene.lastFramePrompt || scene.description))
                        : (scene.firstFramePrompt || scene.description))
                    : scene.description;
                return text
                  ? [{ id: 'init-text', type: 'text' as const, category: 'text' as const, data: { text }, position: { x: 0, y: 0 } }]
                  : [];
              })()}
              availableFrames={{
                startFrame: scene.startFrame,
                endFrame: scene.endFrame
              }}
              dialogue={scene.dialogue}
              dialogues={scene.dialogues}
              characters={scene.characters}
              onUpdateDialogues={onUpdateDialogues}
              voiceover={scene.voiceover}
              onUpdateVoiceover={onUpdateVoiceover}
              negativePrompt={scene.negativePrompt}
              onUpdateNegativePrompt={async (negativePrompt: string) => {
                const token = getAuthToken();
                const res = await fetch(`/api/storyboards/${scene.id}/content`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                  },
                  body: JSON.stringify({ negative_prompt: negativePrompt })
                });
                if (!res.ok) throw new Error('保存反向提示词失败');
                return true;
              }}
              onChange={(state: BlockEditorState) => {
                if (state.generatedPrompt !== undefined) {
                  setCurrentEditorText(state.generatedPrompt);
                }
              }}
              onSave={async (state: BlockEditorState) => {
                if (promptMode === 'video' && onUpdateVideoPrompt) {
                  return await onUpdateVideoPrompt(state.generatedPrompt);
                }
                if (promptMode === 'image') {
                  if (scene.hasAction) {
                    // 运动模式：首帧/尾帧分开保存
                    if (imageFrameTab === 'first' && onUpdateFirstFramePrompt) {
                      return await onUpdateFirstFramePrompt(state.generatedPrompt);
                    }
                    if (imageFrameTab === 'last' && onUpdateLastFramePrompt) {
                      return await onUpdateLastFramePrompt(state.generatedPrompt);
                    }
                  } else {
                    // 静止模式：图片提示词统一保存到 first_frame_prompt
                    if (onUpdateFirstFramePrompt) {
                      return await onUpdateFirstFramePrompt(state.generatedPrompt);
                    }
                  }
                }
                const success = await onUpdateDescription?.(state.generatedPrompt);
                return success || false;
              }}
            />
        </div>

      </div>
    </div>
  );
};

export default DirectorSpace;
