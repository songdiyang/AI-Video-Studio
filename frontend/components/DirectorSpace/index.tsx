import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, MessageCircle, Sparkles } from 'lucide-react';
import type { StoryboardScene } from '../../views/StoryBoard/useSceneManager';
import BlockEditor from '../../views/StoryBoard/BlockEditor';
import type { PromptField } from '../../views/StoryBoard/BlockEditor/DialogEditor';
import ContentEditorPanel, { type EditorSaveStatus, type EditorSessionHandle } from '../ContentEditorPanel';
import { useToast } from '../../contexts/ToastContext';

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
  onRegisterEditor?: (handle: EditorSessionHandle | null) => void;
  onUpdateDescription?: (description: string) => Promise<boolean>;
  onUpdateBaseDescription?: (description: string) => Promise<boolean>;
  onUpdateVideoPrompt?: (prompt: string) => Promise<boolean>;
  onUpdateFirstFramePrompt?: (prompt: string) => Promise<boolean>;
  onUpdateLastFramePrompt?: (prompt: string) => Promise<boolean>;
  onUpdateDialogues?: (dialogues: any[]) => Promise<boolean>;
  onUpdateVoiceover?: (voiceover: any) => Promise<boolean>;
  onUpdateNegativePrompt?: (value: string) => Promise<boolean>;
  onGenerateImage?: (id: number, prompt: string, regenerateTarget?: 'first' | 'last' | 'both', forceRegenerate?: boolean) => Promise<{ success: boolean; error?: string }>;
  onGenerateVideo?: (id: number) => Promise<{ success: boolean; error?: string }>;
  models?: AIModel[];
  imageModel?: string;
  onImageModelChange?: (model: string) => void;
  videoModel?: string;
  onVideoModelChange?: (model: string) => void;
  multimodalModel?: string;
  onMultimodalModelChange?: (model: string) => void;
  textModel?: string;
  onTextModelChange?: (model: string) => void;
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

const TABS = [
  { id: 'content', label: '内容', icon: <FileText size={13} /> },
  { id: 'prompts', label: '提示词', icon: <Sparkles size={13} /> },
  { id: 'dialogue', label: '台词与旁白', icon: <MessageCircle size={13} /> },
];

const DirectorSpaceSession: React.FC<DirectorSpaceProps> = (props) => {
  const { scene, onRegisterEditor } = props;
  const { showToast } = useToast();
  const [tab, setTab] = useState<'content' | 'prompts' | 'dialogue'>('content');
  const [promptField, setPromptField] = useState<PromptField>('first');
  const [status, setStatus] = useState<EditorSaveStatus>('idle');
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(null);
  const child = useRef<EditorSessionHandle | null>(null);
  const switching = useRef(false);
  const registerChild = useCallback((handle: EditorSessionHandle | null) => { child.current = handle; }, []);
  // 注册对象不随输入/标签重建；flush 始终读取当前子草稿。
  const handle = useRef<EditorSessionHandle>({ flush: async () => child.current ? child.current.flush() : false });
  useEffect(() => {
    onRegisterEditor?.(handle.current);
    return () => onRegisterEditor?.(null);
  }, [onRegisterEditor]);

  const switchTo = async (change: () => void) => {
    if (switching.current) return;
    switching.current = true;
    try { if (await handle.current.flush()) change(); }
    finally { switching.current = false; }
  };
  const activeField: PromptField = tab === 'content' ? 'content' : (!scene.hasAction && promptField === 'last' ? 'first' : promptField);
  const saveNegative = props.onUpdateNegativePrompt ?? (async (value: string) => {
    // 独立 DirectorSpace 入口的兼容路径；父宿主传入回调时不走此请求。
    const res = await fetch(`/api/storyboards/${scene.id}/content`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ negative_prompt: value }),
    });
    return res.ok;
  });

  return (
    <ContentEditorPanel
      title={`分镜 ${scene.order || scene.id}${scene.location ? ` · ${scene.location}` : ''}`}
      kind={scene.hasAction ? '运动分镜' : '静止分镜'}
      tabs={TABS}
      activeTab={tab}
      onTabChange={id => { void switchTo(() => setTab(id as typeof tab)); }}
      status={status}
      onSave={async () => { if (await handle.current.flush()) showToast('分镜已保存', 'success'); }}
      actions={<div ref={setActionsTarget} className="flex flex-wrap items-center gap-2 min-w-0" />}
    >
      {tab === 'prompts' && (
        <div className="flex gap-2 overflow-x-auto pb-2" aria-label="提示词类型">
          {(['first', ...(scene.hasAction ? ['last'] : []), 'video'] as PromptField[]).map(field => (
            <button key={field} type="button" aria-pressed={activeField === field}
              className={`px-2 py-1 rounded whitespace-nowrap ${activeField === field ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--text-muted)] bg-[var(--bg-input)]'}`}
              onClick={() => { void switchTo(() => setPromptField(field)); }}>
              {field === 'first' ? '图片首帧' : field === 'last' ? '图片尾帧' : '视频'}
            </button>
          ))}
        </div>
      )}
      <BlockEditor
        storyboardId={scene.id}
        projectId={props.projectId || undefined}
        scriptId={props.scriptId || undefined}
        panel={{
          tab, activeField, actionsTarget,
          fields: {
            // description 是旧 prompt_template，仅用于提示词回退，绝不写回/迁移。
            content: { value: scene.baseDescription ?? '', save: props.onUpdateBaseDescription },
            first: { value: scene.firstFramePrompt ?? scene.description ?? '', save: props.onUpdateFirstFramePrompt },
            last: { value: scene.lastFramePrompt ?? scene.description ?? '', save: props.onUpdateLastFramePrompt },
            video: { value: scene.videoPrompt ?? '', save: props.onUpdateVideoPrompt },
          },
        }}
        onRegisterEditor={registerChild}
        onStatusChange={setStatus}
        dialogue={scene.dialogue} dialogues={scene.dialogues} characters={scene.characters}
        onUpdateDialogues={props.onUpdateDialogues}
        voiceover={scene.voiceover} onUpdateVoiceover={props.onUpdateVoiceover}
        negativePrompt={scene.negativePrompt} onUpdateNegativePrompt={saveNegative}
        availableFrames={{ startFrame: scene.startFrame, endFrame: scene.endFrame }}
        models={props.models} imageModel={props.imageModel} videoModel={props.videoModel}
        onImageModelChange={props.onImageModelChange} onVideoModelChange={props.onVideoModelChange}
        textModel={props.textModel} onTextModelChange={props.onTextModelChange}
        multimodalModel={props.multimodalModel} onMultimodalModelChange={props.onMultimodalModelChange}
        onGenerateImage={props.onGenerateImage} onGenerateVideo={props.onGenerateVideo}
        hasAction={scene.hasAction}
      />
    </ContentEditorPanel>
  );
};

// 对象切换由宿主先 flush；内部标签切换不改变这个 key，不卸载草稿。
const DirectorSpace: React.FC<DirectorSpaceProps> = props => (
  <DirectorSpaceSession key={`${props.projectId}:${props.scene.id}`} {...props} />
);
export default DirectorSpace;
