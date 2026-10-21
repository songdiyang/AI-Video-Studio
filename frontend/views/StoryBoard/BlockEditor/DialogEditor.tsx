/** 对话框式编辑器：独立入口保留左右布局，底部入口复用同一套草稿和工具。 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@heroui/react';
import { Save, Trash2, MessageCircle, Mic, History, RotateCcw, GitCompare, Sparkles, Undo2, Loader2, Plus, X as XIcon, ImageIcon, Film } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { BLOCK_OPTIONS } from './utils/blockRegistry';
import SketchFramesPanel from './SketchFramesPanel';
import { getAuthToken } from '../../../services/auth';
import { startWorkflow, getWorkflowStatus } from '../../../hooks/useWorkflow';
import { filterModelsForTaskSlot } from '../../../utils/modelCapabilities';
import type { EditorSaveStatus, EditorSessionHandle } from '../../../components/ContentEditorPanel';

interface PromptVersion {
  id: number; storyboard_id: number; prompt_text: string; version_number: number;
  is_current: boolean; source: 'manual' | 'ai'; created_by_name?: string; created_at: string;
}
interface DialogueLine { character: string; line: string }
export type PromptField = 'content' | 'first' | 'last' | 'video';
export interface DialogEditorProps {
  storyboardId: number;
  initialPrompt?: string;
  onChange?: (prompt: string) => void;
  onSave?: (prompt: string) => Promise<boolean> | void;
  projectId?: number;
  scriptId?: number;
  availableFrames?: { startFrame?: string; endFrame?: string };
  dialogue?: string;
  dialogues?: DialogueLine[];
  sceneCharacters?: string[] | { id: number; name: string }[];
  onUpdateDialogues?: (dialogues: DialogueLine[]) => Promise<boolean>;
  voiceover?: string;
  onUpdateVoiceover?: (voiceover: string) => Promise<boolean>;
  negativePrompt?: string;
  onUpdateNegativePrompt?: (negativePrompt: string) => Promise<boolean>;
  promptMode?: 'image' | 'video';
  basePrompt?: string;
  models?: { name: string; type?: string; category?: string; description?: string; priceSummary?: string }[];
  imageModel?: string;
  videoModel?: string;
  onImageModelChange?: (model: string) => void;
  onVideoModelChange?: (model: string) => void;
  onGenerateImage?: (id: number, prompt: string, regenerateTarget?: 'first' | 'last' | 'both', forceRegenerate?: boolean) => Promise<{ success: boolean; error?: string }>;
  onGenerateVideo?: (id: number) => Promise<{ success: boolean; error?: string }>;
  hasAction?: boolean;
  imageFrameTab?: 'first' | 'last';
  textModel?: string;
  onTextModelChange?: (model: string) => void;
  multimodalModel?: string;
  onMultimodalModelChange?: (model: string) => void;
  /** 不传 panel 时保留独立编辑器布局和原回调。 */
  panel?: {
    tab: 'content' | 'prompts' | 'dialogue';
    activeField: PromptField;
    fields: Record<PromptField, { value: string; save?: (value: string) => Promise<boolean> }>;
    actionsTarget: HTMLElement | null;
  };
  onRegisterEditor?: (handle: EditorSessionHandle | null) => void;
  onStatusChange?: (status: EditorSaveStatus) => void;
}

/** 本编辑器专用的串行草稿队列。保存快照只确认对应修订，不回写/覆盖后续输入。 */
export function createStoryboardDraftSession<T extends object>(
  initial: T,
  save: (key: keyof T, value: T[keyof T]) => Promise<boolean>,
  notify: () => void,
) {
  let values = { ...initial };
  const seen = { ...initial };
  const revisions = new Map<keyof T, number>();
  const dirty = new Set<keyof T>();
  let status: EditorSaveStatus = 'idle';
  let editRevision = 0;
  let pending: Promise<boolean> | null = null;
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const session = {
    get values() { return values; },
    get status() { return status; },
    get editRevision() { return editRevision; },
    get isDirty() { return dirty.size > 0; },
    revision(key: keyof T) { return revisions.get(key) || 0; },
    update<K extends keyof T>(key: K, value: T[K]) {
      if (equal(values[key], value)) return;
      values = { ...values, [key]: value };
      revisions.set(key, session.revision(key) + 1);
      dirty.add(key);
      editRevision++;
      status = pending ? 'saving' : 'dirty';
      notify();
    },
    sync(next: T) {
      let changed = false;
      for (const key of Object.keys(next) as (keyof T)[]) {
        if (equal(seen[key], next[key])) continue;
        seen[key] = next[key];
        if (dirty.has(key)) continue; // 旧请求的 props 回填不能覆盖在途的新草稿。
        if (!equal(values[key], next[key])) {
          values = { ...values, [key]: next[key] };
          revisions.set(key, session.revision(key) + 1);
          changed = true;
        }
      }
      if (changed) notify();
    },
    flush(): Promise<boolean> {
      if (pending) return pending;
      if (!dirty.size) return Promise.resolve(true);
      status = 'saving';
      notify();
      pending = Promise.resolve().then(async () => {
        try {
          while (dirty.size) {
            const key = dirty.values().next().value as keyof T;
            const revision = session.revision(key);
            const value = values[key];
            if (await save(key, value) === false) throw new Error('保存失败');
            if (session.revision(key) === revision) dirty.delete(key);
          }
          status = 'saved';
          return true;
        } catch {
          status = 'error';
          return false;
        }
      }).finally(() => { pending = null; notify(); });
      return pending;
    },
  };
  return session;
}

type DraftValues = Record<PromptField | 'prompt' | 'voiceover' | 'negative', string> & {
  dialogues: DialogueLine[];
  videoFrames: { video_start_prompt?: string; video_end_prompt?: string };
};
interface ReferenceImage { id: string; url: string; source: 'frame' | 'scene'; label: string }

// 保留原富文本胶囊、参考图拖拽和光标工具。所有动态文本/属性进入 HTML 前均转义。
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function buildCapsuleHtml(refId: string, url: string, label: string): string {
  const imgHtml = url
    ? `<img src="${escapeHtml(url)}" style="width:20px;height:20px;border-radius:4px;object-fit:cover;flex-shrink:0" draggable="false"/>`
    : `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:rgba(168,85,247,0.15);color:rgb(168,85,247);font-size:12px;flex-shrink:0">📷</span>`;
  return `<span contenteditable="false" data-ref-id="${escapeHtml(refId)}" style="display:inline-flex;align-items:center;gap:4px;margin:0 2px;padding:2px 8px 2px 4px;border-radius:999px;background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.3);vertical-align:middle;cursor:default;user-select:none;font-size:12px;line-height:1.4">${imgHtml}<span style="color:var(--text-primary);white-space:nowrap">${escapeHtml(label)}</span><span data-delete-ref="${escapeHtml(refId)}" style="margin-left:2px;color:rgba(168,85,247,0.5);cursor:pointer;font-size:14px;line-height:1;flex-shrink:0">×</span></span>`;
}
function refTextToHtml(text: string, images: ReferenceImage[]): string {
  if (!text && images.length === 0) return '<br>';
  const imgMap = new Map(images.map(img => [img.id, img]));
  return text.split(/(\[参考图:ref-\d+\])/g).map(part => {
    const m = part.match(/^\[参考图:(ref-\d+)\]$/);
    if (!m) return escapeHtml(part).replace(/\n/g, '<br>');
    const img = imgMap.get(m[1]);
    return buildCapsuleHtml(m[1], img?.url || '', img?.label || '参考图');
  }).join('') || '<br>';
}
function createCapsuleDom(img: ReferenceImage): HTMLSpanElement {
  const temp = document.createElement('div');
  temp.innerHTML = buildCapsuleHtml(img.id, img.url, img.label);
  return temp.firstChild as HTMLSpanElement;
}
function extractTextFromEditor(editor: HTMLDivElement): string {
  let result = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) result += node.textContent || '';
    else if (node instanceof HTMLElement) {
      if (node.tagName === 'BR') result += '\n';
      else if (node.dataset?.refId) result += `[参考图:${node.dataset.refId}]`;
      else {
        if (node.tagName === 'DIV' && result.length > 0 && !result.endsWith('\n')) result += '\n';
        node.childNodes.forEach(walk);
      }
    }
  };
  editor.childNodes.forEach(walk);
  return result.endsWith('\n') ? result.slice(0, -1) : result;
}
function getRangeFromPoint(x: number, y: number): Range | null {
  if ((document as any).caretRangeFromPoint) return (document as any).caretRangeFromPoint(x, y);
  const pos = (document as any).caretPositionFromPoint?.(x, y);
  if (!pos) return null;
  const range = document.createRange();
  range.setStart(pos.offsetNode, pos.offset); range.collapse(true);
  return range;
}
const COMPONENT_CATEGORIES = [
  { key: 'dialogue', label: '台词', icon: MessageCircle },
  { key: 'voiceover', label: '画外音', icon: Mic },
];

const DialogEditorSession: React.FC<DialogEditorProps> = (props) => {
  const { storyboardId, projectId, panel, availableFrames, sceneCharacters = [], models = [] } = props;
  const { showToast } = useToast();
  const latest = useRef(props);
  latest.current = props;
  const alive = useRef(true);
  const [, render] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const lastRenderedRef = useRef('');
  const composing = useRef(false);
  const [activeTab, setActiveTab] = useState('dialogue');
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [showVersionPanel, setShowVersionPanel] = useState(false);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersion, setCompareVersion] = useState<PromptVersion | null>(null);
  const [busy, setBusy] = useState<'generate' | 'optimize' | 'media' | 'restore' | null>(null);
  const busyRef = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelWait = useRef<(() => void) | null>(null);
  const [preOptimizeText, setPreOptimizeText] = useState<{ field: keyof DraftValues; text: string } | null>(null);
  const getCharacterNames = () => sceneCharacters.map(c => typeof c === 'string' ? c : c.name);
  const names = getCharacterNames();
  const incoming: DraftValues = {
    content: panel?.fields.content.value ?? '', first: panel?.fields.first.value ?? '',
    last: panel?.fields.last.value ?? '', video: panel?.fields.video.value ?? '',
    prompt: props.initialPrompt ?? '',
    dialogues: props.dialogues?.length ? props.dialogues : props.dialogue ? [{ character: names.length === 1 ? names[0] : '', line: props.dialogue }] : [],
    voiceover: props.voiceover ?? '', negative: props.negativePrompt ?? '', videoFrames: {},
  };
  const patchContent = async (body: object) => {
    const token = getAuthToken();
    const res = await fetch(`/api/storyboards/${storyboardId}/content`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return res.ok;
  };
  const sessionRef = useRef<ReturnType<typeof createStoryboardDraftSession<DraftValues>> | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = createStoryboardDraftSession(incoming, async (key, value) => {
      const p = latest.current; // 每次请求捕获最新、绑定当前对象的回调。
      if (key === 'dialogues') return p.onUpdateDialogues ? p.onUpdateDialogues((value as DialogueLine[]).filter(d => d.line.trim())) : false;
      if (key === 'voiceover') return p.onUpdateVoiceover ? p.onUpdateVoiceover(value as string) : false;
      if (key === 'negative') return p.onUpdateNegativePrompt ? p.onUpdateNegativePrompt(value as string) : !p.panel && patchContent({ negative_prompt: value });
      if (key === 'videoFrames') return patchContent(value as DraftValues['videoFrames']);
      if (key === 'prompt') return p.onSave ? (await p.onSave(value as string)) !== false : false;
      const save = p.panel?.fields[key].save;
      return save ? save(value as string) : false;
    }, () => { if (alive.current) render(n => n + 1); });
  }
  const session = sessionRef.current;
  const values = session.values;
  const field: PromptField | 'prompt' = panel?.activeField ?? 'prompt';
  const promptText = values[field];
  const isVideo = panel ? field === 'video' : props.promptMode === 'video';
  const isContent = panel?.tab === 'content';
  const showText = !panel || panel.tab !== 'dialogue';
  const showDialogue = !panel || panel.tab === 'dialogue';
  const isSaving = session.status === 'saving';

  useEffect(() => { session.sync(incoming); }, [JSON.stringify(incoming)]);
  useEffect(() => { props.onStatusChange?.(session.status); }, [session.status, props.onStatusChange]);
  const flush = useCallback(async () => {
    if (composing.current) { showToast('请先完成当前文字输入', 'warning'); return false; }
    const success = await session.flush();
    if (!success && alive.current) showToast('保存失败，草稿已保留，请重试', 'error');
    return success;
  }, [session, showToast]);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  const handle = useRef<EditorSessionHandle>({ flush: () => flushRef.current() });
  useEffect(() => {
    props.onRegisterEditor?.(handle.current);
    return () => props.onRegisterEditor?.(null);
  }, [props.onRegisterEditor]);
  useEffect(() => {
    if (!session.isDirty) return;
    const timer = setTimeout(() => { if (!composing.current) void flushRef.current(); }, 800);
    return () => clearTimeout(timer);
  }, [session.editRevision]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      cancelWait.current?.();
    };
  }, []);
  // 外部同步和切字段才重绘 DOM；本地输入不重绘，避免光标跳动及中文输入中断。
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && (lastRenderedRef.current !== `${field}:${promptText}` || !editor.innerHTML)) {
      editor.innerHTML = refTextToHtml(promptText, referenceImages);
      lastRenderedRef.current = `${field}:${promptText}`;
    }
  }, [field, promptText, showText]);

  const updatePrompt = (text: string, target = field) => {
    session.update(target, text);
    latest.current.onChange?.(text);
  };
  const syncEditor = () => {
    if (!editorRef.current) return;
    const text = extractTextFromEditor(editorRef.current);
    lastRenderedRef.current = `${field}:${text}`;
    updatePrompt(text);
  };
  const insertComponent = (text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.contains(selection.getRangeAt(0).startContainer)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode); range.setStartAfter(textNode); range.collapse(true);
      selection.removeAllRanges(); selection.addRange(range);
    } else editor.appendChild(document.createTextNode(text));
    syncEditor();
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setIsDraggingOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDraggingOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'reference-image') {
        const newImage: ReferenceImage = {
          id: `ref-${Date.now()}`, url: data.imageUrl, source: data.source,
          label: data.sceneName ? `场景:${data.sceneName}` : data.frameType === 'start' ? '首帧' : data.frameType === 'end' ? '尾帧' : '参考',
        };
        setReferenceImages(prev => [...prev, newImage]);
        const editor = editorRef.current;
        if (editor) {
          const capsule = createCapsuleDom(newImage);
          const range = getRangeFromPoint(e.clientX, e.clientY);
          if (range && editor.contains(range.startContainer)) {
            range.insertNode(capsule);
            const sel = window.getSelection();
            range.setStartAfter(capsule); range.collapse(true);
            sel?.removeAllRanges(); sel?.addRange(range);
          } else editor.appendChild(capsule);
          syncEditor();
        }
      } else if (data.componentType) {
        const range = getRangeFromPoint(e.clientX, e.clientY);
        if (range && editorRef.current?.contains(range.startContainer)) {
          const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
        }
        insertComponent(data.template);
      }
    } catch (error) { console.error('[DialogEditor] Drop error:', error); }
  };
  const removeReferenceImage = (id: string) => {
    const capsule = Array.from(editorRef.current?.querySelectorAll<HTMLElement>('[data-ref-id]') || []).find(el => el.dataset.refId === id);
    capsule?.remove(); syncEditor();
    setReferenceImages(prev => prev.filter(img => img.id !== id));
  };
  const handleClear = () => { updatePrompt(''); showToast('已清空', 'info'); };
  const handleSave = async () => { if (await flush()) showToast('分镜已保存', 'success'); };

  const uniqueModels = (type: string) => Array.from(new Map(models.filter(m => (m.type || m.category)?.toUpperCase() === type).map(m => [m.name, m])).values());
  const imageModels = uniqueModels('IMAGE');
  const videoModels = uniqueModels('VIDEO');
  // 文本槽位兼容多模态模型（多模态大模型同样能执行分镜拆分/提示词优化等纯文本任务）
  const textModels = filterModelsForTaskSlot(models, 'TEXT');
  const multimodalModels = uniqueModels('MULTIMODAL');
  const useMultimodal = !isContent && !isVideo;
  const workflowModel = useMultimodal
    ? props.multimodalModel || multimodalModels[0]?.name || props.textModel || textModels[0]?.name
    : props.textModel || textModels[0]?.name;
  const begin = (kind: NonNullable<typeof busy>) => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(kind); return true;
  };
  const finish = () => { busyRef.current = false; if (alive.current) setBusy(null); };
  const waitForPoll = () => new Promise<void>(resolve => {
    cancelWait.current = resolve;
    pollTimer.current = setTimeout(() => { cancelWait.current = null; resolve(); }, 1500);
  });

  // 生成与优化共用原工作流，结果只更新请求对应的字段，不写旧 prompt_template。
  const runPromptWorkflow = async (optimize: boolean) => {
    if (!projectId) { showToast('缺少项目信息', 'warning'); return; }
    if (!workflowModel) { showToast(useMultimodal ? '请先选择多模态模型' : '请先选择文本模型', 'warning'); return; }
    if (!begin(optimize ? 'optimize' : 'generate')) return;
    const target = field;
    try {
      if (!await flush() || !alive.current) return;
      const p = latest.current;
      const text = (session.values[target] || (panel ? session.values.content : p.basePrompt) || '').trim();
      if (!text) { showToast('请先输入内容再生成提示词', 'warning'); return; }
      const revision = session.revision(target);
      const negativeRevision = session.revision('negative');
      const framesRevision = session.revision('videoFrames');
      const workflowType = isVideo ? 'single_video_prompt_optimization' : isContent ? 'single_prompt_optimization' : 'single_image_prompt_optimization';
      const { jobId } = await startWorkflow(workflowType, projectId, {
        storyboardId, prompt: text,
        // 图片工作流现有协议读取 multimodalModel，不能只传会被忽略的 textModel。
        ...(useMultimodal ? { multimodalModel: workflowModel } : { textModel: workflowModel }),
      });
      while (alive.current) {
        const job = await getWorkflowStatus(jobId);
        if (!alive.current) return;
        if (job.status === 'failed') throw new Error(job.error_message || '提示词生成失败');
        if (job.status === 'cancelled') { showToast('任务已取消', 'info'); return; }
        if (job.status !== 'completed') { await waitForPoll(); continue; }
        const result = job.tasks?.[job.tasks.length - 1]?.result_data;
        const resultText = isVideo
          ? result?.videoStartPrompt || result?.videoPrompt || result?.optimized || (typeof result === 'string' ? result : '')
          : result?.optimized || (typeof result === 'string' ? result : '');
        if (!resultText) throw new Error('工作流未返回提示词');
        if (session.revision(target) !== revision) {
          showToast('生成期间内容已修改，已保留最新草稿；请重新生成', 'warning'); return;
        }
        setPreOptimizeText({ field: target, text: session.values[target] });
        updatePrompt(resultText, target);
        if (!isContent && result?.negativePrompt && session.revision('negative') === negativeRevision) session.update('negative', result.negativePrompt);
        // 保留原视频工作流的分离首尾提示词存储能力，纳入同一失败可重试队列。
        if (isVideo && result?.actionAnalysis?.useEndFrame === true && session.revision('videoFrames') === framesRevision) {
          const frames: DraftValues['videoFrames'] = {};
          if (result.videoStartPrompt) frames.video_start_prompt = result.videoStartPrompt;
          if (result.videoEndPrompt) frames.video_end_prompt = result.videoEndPrompt;
          if (Object.keys(frames).length) session.update('videoFrames', frames);
        }
        if (await flush() && alive.current) showToast(optimize ? 'AI 优化完成并已保存' : '提示词已生成并保存', 'success');
        return;
      }
    } catch (error: any) { if (alive.current) showToast(error.message || '提示词生成失败', 'error'); }
    finally { finish(); }
  };
  const handleGeneratePrompt = () => runPromptWorkflow(false);
  const handleOptimize = () => runPromptWorkflow(true);
  const handleUndoOptimize = () => {
    if (!preOptimizeText) return;
    session.update(preOptimizeText.field as PromptField | 'prompt', preOptimizeText.text);
    props.onChange?.(preOptimizeText.text); setPreOptimizeText(null);
    showToast('已撤回优化', 'info');
  };
  const generateMedia = async (video: boolean) => {
    const p = latest.current;
    if (!(video ? p.onGenerateVideo : p.onGenerateImage) || !begin('media')) return;
    try {
      if (!await flush() || !alive.current) return;
      if (video) {
        const token = getAuthToken();
        const res = await fetch(`/api/storyboards/${storyboardId}/validate?type=video`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
        if (!res.ok) throw new Error('视频预检失败，请重试');
        const data = await res.json();
        if (!data.ready) throw new Error(`无法生成视频：${(data.issues || []).map((i: any) => i.message).join('\n')}`);
        if (!await flush() || !alive.current) return;
      }
      const text = session.values[field].trim();
      if (!text) { showToast('提示词为空，无法生成', 'warning'); return; }
      const target = panel ? (field === 'last' ? 'last' : 'first') : p.hasAction ? (p.imageFrameTab || 'first') : 'both';
      const result = video ? await p.onGenerateVideo!(storyboardId) : await p.onGenerateImage!(storyboardId, text, target, false);
      if (alive.current) showToast(result.success ? (video ? '视频生成任务已提交' : '图片生成任务已提交') : result.error || '生成失败', result.success ? 'success' : 'error');
    } catch (error: any) { if (alive.current) showToast(error.message || '生成失败', 'error'); }
    finally { finish(); }
  };
  const handleGenerateImage = () => generateMedia(false);
  const handleGenerateVideo = () => generateMedia(true);

  const loadVersions = async () => {
    setLoadingVersions(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${storyboardId}/prompt-history`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      if (!res.ok) throw new Error('加载版本历史失败');
      const data = await res.json();
      if (alive.current) setVersions(data.history || []);
    } catch (error: any) { if (alive.current) showToast(error.message, 'error'); }
    finally { if (alive.current) setLoadingVersions(false); }
  };
  const handleOpenVersionPanel = () => {
    setShowVersionPanel(true); setSelectedVersion(null); setCompareMode(false); setCompareVersion(null); void loadVersions();
  };
  const handleRestoreVersion = async (version: PromptVersion) => {
    if (!begin('restore')) return;
    try {
      if (!await flush() || !alive.current) return;
      const revision = session.revision(field);
      // 历史是旧提示词历史；面板只把文本应用到明确字段，不调用会改 prompt_template 的 restore。
      if (!panel) {
        const token = getAuthToken();
        const res = await fetch(`/api/storyboards/${storyboardId}/prompt-history/${version.id}/restore`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        if (!res.ok) throw new Error('恢复失败');
      }
      if (!alive.current) return;
      if (session.revision(field) !== revision) { showToast('恢复期间内容已修改，已保留最新草稿', 'warning'); return; }
      updatePrompt(version.prompt_text);
      if (await flush() && alive.current) { showToast(`已恢复到版本 v${version.version_number}`, 'success'); setShowVersionPanel(false); }
    } catch (error: any) { if (alive.current) showToast(error.message || '恢复失败', 'error'); }
    finally { finish(); }
  };
  const computeDiff = (textA: string, textB: string) => {
    const linesA = textA.split('\n'), linesB = textB.split('\n');
    const result: { text: string; type: 'same' | 'added' | 'removed' }[] = [];
    for (let i = 0; i < Math.max(linesA.length, linesB.length); i++) {
      const a = linesA[i], b = linesB[i];
      if (a === b) result.push({ text: a, type: 'same' });
      else { if (a !== undefined) result.push({ text: a, type: 'removed' }); if (b !== undefined) result.push({ text: b, type: 'added' }); }
    }
    return result;
  };
  const formatVersionTime = (date: string) => new Date(date).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const handleAddDialogueLine = (character = names[0] || '') => session.update('dialogues', [...session.values.dialogues, { character, line: '' }]);
  const handleUpdateDialogueLine = (index: number, key: 'character' | 'line', value: string) => session.update('dialogues', session.values.dialogues.map((d, i) => i === index ? { ...d, [key]: value } : d));
  const handleRemoveDialogueLine = (index: number) => session.update('dialogues', session.values.dialogues.filter((_, i) => i !== index));
  const inputClass = 'w-full min-w-0 text-xs px-2 py-1.5 rounded bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]';
  const buttonClass = 'inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed';
  const renderComponentButtons = () => {
    switch (activeTab) {
      case 'shot':
      case 'action': {
        const groups = activeTab === 'shot' ? [BLOCK_OPTIONS.shotSize, BLOCK_OPTIONS.cameraAngle, BLOCK_OPTIONS.movement, BLOCK_OPTIONS.lensType] : [BLOCK_OPTIONS.actionType];
        return <div className="space-y-3">{groups.map((options, index) => <div key={index} className="flex flex-wrap gap-1.5">{options.map(opt => {
          const text = activeTab === 'action' ? `${opt.label}，` : index === 1 ? `${opt.label}视角，` : index === 2 ? (opt.value === 'static' ? '镜头固定，' : `镜头${opt.label}，`) : `${opt.label}镜头，`;
          return <button key={opt.value} className={buttonClass} title={opt.description} onClick={() => insertComponent(text)} draggable onDragStart={e => e.dataTransfer.setData('application/json', JSON.stringify({ componentType: activeTab, template: text }))}>{opt.icon} {opt.label}</button>;
        })}</div>)}</div>;
      }
      case 'dialogue':
        return <div className="content-editor-field space-y-2">
          <div className="flex items-center justify-between"><span>角色台词</span>{!panel && <button className={buttonClass} disabled={isSaving} onClick={() => void handleSave()}><Save size={12} />保存台词</button>}</div>
          {values.dialogues.length === 0 && <div className="text-[var(--text-muted)] py-3 text-center">暂无台词</div>}
          {values.dialogues.map((dl, idx) => <div key={idx} className="space-y-1.5">
            <div className="flex gap-2 min-w-0">
              {names.length ? <select aria-label={`第${idx + 1}行角色`} value={dl.character} onChange={e => handleUpdateDialogueLine(idx, 'character', e.target.value)} className={inputClass}>
                <option value="">选择角色</option>{dl.character && !names.includes(dl.character) && <option value={dl.character}>{dl.character}</option>}{names.map(name => <option key={name} value={name}>{name}</option>)}
              </select> : <input aria-label={`第${idx + 1}行角色`} value={dl.character} onChange={e => handleUpdateDialogueLine(idx, 'character', e.target.value)} placeholder="角色名" className={inputClass} />}
              <button className="text-red-400" onClick={() => handleRemoveDialogueLine(idx)} title="删除此行台词"><XIcon size={14} /></button>
            </div>
            <textarea aria-label={`第${idx + 1}行台词`} value={dl.line} onChange={e => handleUpdateDialogueLine(idx, 'line', e.target.value)} placeholder="输入台词内容..." rows={2} className={inputClass} />
          </div>)}
          <button className={`${buttonClass} justify-center border border-dashed border-[var(--border-color)]`} onClick={() => handleAddDialogueLine()}><Plus size={13} />添加台词</button>
          {!values.dialogues.length && names.length > 0 && <div className="flex flex-wrap gap-1">{names.map(name => <button key={name} className={buttonClass} onClick={() => handleAddDialogueLine(name)}>+ {name}</button>)}</div>}
        </div>;
      case 'voiceover':
        return <label className="content-editor-field"><span>画外音说明</span><span>旁白/解说声音，生成视频时作为音频提示注入。</span>
          <textarea aria-label="旁白" value={values.voiceover} onChange={e => session.update('voiceover', e.target.value)} placeholder="例如：时光轮转，三年过去了……" rows={4} className={inputClass} />
          {!panel && <button type="button" className={buttonClass} disabled={isSaving} onClick={() => void handleSave()}><Save size={12} />保存旁白</button>}
        </label>;
      case 'text': return <div>{['角色', '场景', '动作', '表情', '服装', '道具'].map(text => <button key={text} className={buttonClass} onClick={() => insertComponent(`${text}：`)}>{text}：</button>)}</div>;
      default: return null;
    }
  };
  const frameReferences = (availableFrames?.startFrame || availableFrames?.endFrame) && <div className="flex flex-wrap items-center gap-2 py-2">
    <span className="text-[var(--text-muted)] text-xs">拖拽参考图</span>
    {(['startFrame', 'endFrame'] as const).map(key => availableFrames[key] && <div key={key} className="relative w-14 h-10 rounded overflow-hidden cursor-grab" draggable
      onDragStart={e => e.dataTransfer.setData('application/json', JSON.stringify({ type: 'reference-image', imageUrl: availableFrames[key], source: 'frame', frameType: key === 'startFrame' ? 'start' : 'end' }))}
      onClick={() => setPreviewImage({ url: availableFrames[key]!, title: key === 'startFrame' ? '首帧预览' : '尾帧预览' })} title="点击预览，拖拽插入">
      <img src={availableFrames[key]} alt={key === 'startFrame' ? '首帧' : '尾帧'} className="w-full h-full object-cover" />
    </div>)}
  </div>;
  const modelSelect = (label: string, options: typeof models, value: string | undefined, change: ((value: string) => void) | undefined) => options.length > 0 && change && <select aria-label={label} title={label} disabled={!!busy} value={value || ''} onChange={e => change(e.target.value)} className={`${inputClass} max-w-[200px]`}>
    <option value="" disabled>选择{label}</option>{options.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
  </select>;
  const actions = <>
    {showText && <>
      {useMultimodal && multimodalModels.length
        ? modelSelect('多模态模型', multimodalModels, props.multimodalModel, props.onMultimodalModelChange)
        : modelSelect('文本模型', textModels, props.textModel, props.onTextModelChange)}
      <button className={buttonClass} onClick={() => void handleGeneratePrompt()} disabled={!!busy} title={isContent ? '生成分镜描述' : isVideo ? '生成视频提示词' : '生成图片提示词'}>{busy === 'generate' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{isContent ? '生成描述' : '生成提示词'}</button>
      <button className={buttonClass} onClick={() => void handleOptimize()} disabled={!!busy || !promptText.trim()}>{busy === 'optimize' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}优化</button>
      {preOptimizeText?.field === field && <button className={buttonClass} disabled={!!busy} onClick={handleUndoOptimize}><Undo2 size={13} />撤回优化</button>}
      <button className={buttonClass} disabled={!!busy} onClick={handleClear} title="清空"><Trash2 size={13} /></button>
      {!isContent && <button className={buttonClass} disabled={!!busy} onClick={handleOpenVersionPanel} title="旧提示词版本历史"><History size={13} />历史</button>}
      {!isContent && !isVideo && props.onGenerateImage && <>
        {modelSelect('图片模型', imageModels, props.imageModel, props.onImageModelChange)}
        <button className={buttonClass} onClick={() => void handleGenerateImage()} disabled={!!busy || !promptText.trim()}>{busy === 'media' ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}{(panel ? field === 'last' : props.hasAction && props.imageFrameTab === 'last') ? '生成尾帧' : '生成首帧'}</button>
      </>}
      {!isContent && isVideo && props.onGenerateVideo && <>
        {modelSelect('视频模型', videoModels, props.videoModel, props.onVideoModelChange)}
        <button className={buttonClass} onClick={() => void handleGenerateVideo()} disabled={!!busy || !promptText.trim()}>{busy === 'media' ? <Loader2 size={13} className="animate-spin" /> : <Film size={13} />}生成视频</button>
      </>}
    </>}
    {!panel && <><span role="status">{{ idle: '就绪', dirty: '未保存', saving: '保存中', saved: '已保存', error: '保存失败' }[session.status]}</span><button className={buttonClass} onClick={() => void handleSave()} disabled={isSaving}><Save size={13} />保存</button></>}
  </>;

  return <div className={panel ? 'relative min-w-0' : 'relative flex flex-col h-full bg-[var(--bg-body)] rounded-lg border border-[var(--border-color)] overflow-hidden'}>
    <div className={panel ? 'min-w-0' : 'flex flex-1 overflow-hidden min-h-0'}>
      {showDialogue && <div className={panel ? 'content-editor-full-width' : 'w-56 shrink-0 bg-[var(--bg-card)] border-r border-[var(--border-color)] flex flex-col'}>
        <div className="flex flex-wrap gap-1 pb-2">
          {COMPONENT_CATEGORIES.map(cat => <button key={cat.key} type="button" aria-pressed={activeTab === cat.key} className={`${buttonClass} ${activeTab === cat.key ? 'text-[var(--accent)]' : ''}`} onClick={async () => { if (await flush()) setActiveTab(cat.key); }}><cat.icon size={13} />{cat.label}</button>)}
        </div>
        {activeTab === 'sketches' ? <SketchFramesPanel storyboardId={storyboardId} /> : <div className="flex-1 min-w-0 overflow-y-auto p-1">{renderComponentButtons()}</div>}
        {!panel && frameReferences}
      </div>}
      {showText && <div className={panel ? 'content-editor-fields' : 'flex-1 flex flex-col p-4 min-h-0 min-w-0 overflow-auto'}>
        <div className="content-editor-field content-editor-full-width">
          <span>{isContent ? '原始描述' : isVideo ? '视频提示词' : (panel ? field === 'last' : props.imageFrameTab === 'last') ? '尾帧提示词' : '首帧提示词'}</span>
          <div className={`relative ${isDraggingOver ? 'ring-2 ring-[var(--accent)]' : ''}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            <div ref={editorRef} role="textbox" aria-multiline="true" aria-label={isContent ? '原始描述' : isVideo ? '视频提示词' : (panel ? field === 'last' : props.imageFrameTab === 'last') ? '尾帧提示词' : '首帧提示词'} contentEditable suppressContentEditableWarning
              onInput={syncEditor} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; syncEditor(); if (session.isDirty) void flush(); }}
              onPaste={e => { e.preventDefault(); insertComponent(e.clipboardData.getData('text/plain')); }}
              onClick={e => { const id = (e.target as HTMLElement).dataset?.deleteRef; if (id) { e.preventDefault(); e.stopPropagation(); removeReferenceImage(id); } }}
              data-placeholder={isContent ? '输入分镜原始描述...' : '输入提示词，或拖拽参考图到此处...'}
              className={`${inputClass} overflow-y-auto empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--text-muted)]`}
              style={{ minHeight: 100, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} />
            {isDraggingOver && <div className="absolute inset-0 flex items-center justify-center bg-[var(--accent)]/10 pointer-events-none">释放以插入</div>}
          </div>
        </div>
        {panel && !isContent && <div className="content-editor-full-width">{frameReferences}</div>}
        {!isContent && <details className="content-editor-field content-editor-full-width" open={!panel || undefined}>
          <summary className="cursor-pointer text-[var(--text-muted)]">高级：负向提示词</summary>
          <label className="content-editor-field"><span>排除不希望出现的内容</span><textarea aria-label="负向提示词" value={values.negative} onChange={e => session.update('negative', e.target.value)} placeholder="例如：low quality, blurry, extra limbs, watermark..." rows={2} className={inputClass} /></label>
        </details>}
      </div>}
    </div>
    {panel ? (panel.actionsTarget && createPortal(actions, panel.actionsTarget)) : <div className="flex flex-wrap items-center gap-2 p-2 border-t border-[var(--border-color)] shrink-0">{actions}</div>}

    {showVersionPanel && <div className="absolute inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={() => setShowVersionPanel(false)} />
      <div className="w-[420px] max-w-full bg-[var(--bg-card)] border-l border-[var(--border-color)] flex flex-col shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border-color)]">
          <span className="flex items-center gap-1"><History size={14} />版本历史 ({versions.length})</span>
          <Button size="sm" variant="flat" startContent={<GitCompare size={13} />} isDisabled={versions.length < 2} onPress={() => { setCompareMode(!compareMode); setSelectedVersion(null); setCompareVersion(null); }}>{compareMode ? '取消对比' : '对比'}</Button>
          <button onClick={() => setShowVersionPanel(false)} aria-label="关闭版本历史"><XIcon size={15} /></button>
        </div>
        {panel && <p className="p-2 text-[var(--text-muted)]">旧图片提示词历史；恢复仅应用到当前编辑字段。</p>}
        {compareMode && <p className="p-2">{!selectedVersion ? '请选择第一个版本（旧版本）' : !compareVersion ? `已选 v${selectedVersion.version_number}，请选择第二个版本` : `对比 v${selectedVersion.version_number} → v${compareVersion.version_number}`}</p>}
        <div className="flex-1 overflow-y-auto">
          {loadingVersions ? <div className="p-4">加载中...</div> : !versions.length ? <div className="p-4">暂无版本历史</div> : compareMode && selectedVersion && compareVersion ? <div className="p-3">
            {computeDiff(selectedVersion.prompt_text, compareVersion.prompt_text).map((line, i) => <div key={i} className={`px-2 py-1 whitespace-pre-wrap ${line.type === 'removed' ? 'bg-red-500/10 text-red-600' : line.type === 'added' ? 'bg-green-500/10 text-green-600' : ''}`}><span>{line.type === 'removed' ? '- ' : line.type === 'added' ? '+ ' : '  '}</span>{line.text || ' '}</div>)}
            <Button size="sm" onPress={() => { setSelectedVersion(null); setCompareVersion(null); }}>重新选择</Button>
          </div> : versions.map(ver => <div key={ver.id} className={`p-3 border-b border-[var(--border-color)] cursor-pointer ${selectedVersion?.id === ver.id || compareVersion?.id === ver.id ? 'bg-[var(--accent)]/10' : ''}`} onClick={() => {
            if (compareMode) { if (!selectedVersion) setSelectedVersion(ver); else if (!compareVersion && ver.id !== selectedVersion.id) setCompareVersion(ver); }
            else setSelectedVersion(selectedVersion?.id === ver.id ? null : ver);
          }}>
            <div className="flex justify-between gap-2"><span>v{ver.version_number} {ver.is_current && '当前'} {ver.source === 'ai' && 'AI'}</span><span>{formatVersionTime(ver.created_at)}</span></div>
            <p className="line-clamp-2 break-all">{ver.prompt_text.slice(0, 80)}{ver.prompt_text.length > 80 ? '...' : ''}</p>
            {!compareMode && selectedVersion?.id === ver.id && <div className="space-y-2 mt-2"><div className="max-h-32 overflow-y-auto whitespace-pre-wrap break-all">{ver.prompt_text}</div>{(!ver.is_current || panel) && <Button size="sm" startContent={<RotateCcw size={13} />} isDisabled={!!busy} onPress={() => { void handleRestoreVersion(ver); }}>恢复此版本</Button>}</div>}
          </div>)}
        </div>
      </div>
    </div>}
    {previewImage && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setPreviewImage(null)}>
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <span className="absolute -top-8 left-0 text-white">{previewImage.title}</span><button className="absolute -top-8 right-0 text-white" onClick={() => setPreviewImage(null)} aria-label="关闭图片预览">✕</button>
        <img src={previewImage.url} alt={previewImage.title} className="max-w-full max-h-[85vh] object-contain rounded-lg" />
      </div>
    </div>}
  </div>;
};

const DialogEditor: React.FC<DialogEditorProps> = props => <DialogEditorSession key={`${props.projectId}:${props.storyboardId}`} {...props} />;
export default DialogEditor;
